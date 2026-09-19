import { db, type Job } from '../db.js'
import { insertKnowledge, KNOWLEDGE_ROWS_PER_SCAN } from '../knowledgeInsert.js'
import { knowledgeRowsFrom } from '../knowledgeRows.js'
import { EXTRACTOR_VERSION } from '../extractorVersion.js'
import { transcribeFromUrl } from '../media.js'
import { mapWithConcurrency, TRANSCRIBE_CONCURRENCY } from '../boundedMap.js'
import { transcriptBudgetFor } from '../transcriptSelection.js'
import { synthesizeVoiceFromAudio, extractKnowledgeFromAudio, extractKnowledgeFromCaptions, extractTargetedKnowledge } from '../voice.js'
import { questionsFor } from '../targetedQuestions.js'
import { mineTranscripts } from '../transcriptMining.js'
import { ownerHasLiveProduct } from '../ownerProducts.js'

// ⚖️ THE SAME NORMALISATION `transcribe.ts` USES, and it must stay the same: the
// key is what lets one video pasted by several people hit one cached row, so two
// spellings of it would quietly split the cache in half.
function ownUrlKey(raw: string): string {
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const v = u.searchParams.get('v')
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    return host + path + (v ? `?v=${v.toLowerCase()}` : '')
  } catch {
    return raw.toLowerCase().trim()
  }
}

// Handles `build_voice` jobs — the audio upgrade for a brand voice.
// payload: { brand_voice_id, handle, platform, urls: string[] }
// Transcribes the creator's top videos and re-synthesizes the voice from their
// actual spoken audio, then updates the (already-ready) brand_voices.profile.
/** Where the first cohort ends. Five is not arbitrary: it is the budget this
 *  scan used to carry, so "did positions 6-10 pay for themselves" is asked
 *  against exactly the old behaviour. */
export const TRANSCRIPT_COHORT_SIZE = 5

/** Kinds that can carry a beat. `covered` and `topic` prove a subject was
 *  mentioned, which is breadth; these are the depth the raise was bought for. */
const SUBSTANTIVE_KINDS = ['experience', 'opinion', 'claim', 'framework', 'fact', 'example']

/**
 * How much NEW canonical substance each cohort of videos bought.
 *
 * ⚠️ MEASURED AFTER THE MERGE, WHICH IS THE WHOLE POINT. Counting extracted rows
 * would count ten paraphrases of "AI is useful" as ten items; `times_seen`
 * increments on a repeat and creates no row. Only a row that did not exist
 * before is knowledge this scan added.
 *
 * ⚖️ ATTRIBUTED BY `source_url`, THE VIDEO THE ITEM WAS READ OUT OF — already
 * stored so a creator disputing an item can watch it. An item whose source the
 * extractor did not name lands in `unattributed` rather than being assigned to a
 * cohort it might not belong to.
 *
 * ⚖️ AND IT NEVER FAILS THE SCAN. A measurement that can break the thing it
 * measures is worse than no measurement.
 */
export async function measureCohortYield(
  ownerId: string,
  urls: string[],
  since: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await db
      .from('creator_knowledge')
      .select('kind, source_url')
      .eq('owner_id', ownerId)
      .gte('created_at', since)
    const rows = (data ?? []) as Array<{ kind?: string; source_url?: string | null }>
    const first = new Set(urls.slice(0, TRANSCRIPT_COHORT_SIZE))
    const second = new Set(urls.slice(TRANSCRIPT_COHORT_SIZE))
    const tally = { first_5: 0, positions_6_plus: 0, unattributed: 0 }
    const substantive = { first_5: 0, positions_6_plus: 0, unattributed: 0 }
    for (const r of rows) {
      const bucket = r.source_url && first.has(r.source_url) ? 'first_5'
        : r.source_url && second.has(r.source_url) ? 'positions_6_plus'
        : 'unattributed'
      tally[bucket] += 1
      if (SUBSTANTIVE_KINDS.includes(String(r.kind))) substantive[bucket] += 1
    }
    return {
      cohort_size: TRANSCRIPT_COHORT_SIZE,
      videos_offered: urls.length,
      new_rows: tally,
      new_substantive: substantive,
    }
  } catch {
    return null
  }
}

export async function handleBuildVoice(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { brand_voice_id?: string; handle?: string; platform?: string; urls?: string[]; captions?: string[] }
  const voiceId = String(p.brand_voice_id ?? '')
  const handle = String(p.handle ?? '')
  const platform = String(p.platform ?? 'tiktok')
  // ⚠️ THIS CONSUMER TRUNCATED TO FIVE AND MADE BOTH BUDGET RAISES INERT.
  // The selector picks up to the platform's budget — raised 5→10
  // in #366 and to 25 for TikTok in #377, each shipped with a rationale about
  // lifting the ceiling on the only input measured to change script quality.
  // Neither reached production: a hard `.slice(0, 5)` here threw the rest away,
  // so the selector was picking twenty-five videos and five were transcribed.
  //
  // ⚖️ THE CAP STAYS, BUT IT IS THE SAME RULE THE PRODUCER USED. A bare number
  // here is what caused this: two places deciding how many videos get
  // transcribed, one of them silent. The guard against runaway paid calls that
  // the original five was protecting is intact — an unknown platform still gets
  // the PAID budget, because `transcriptBudgetFor` is deliberately conservative
  // about platforms it does not recognise.
  //
  // ⚠️ READ THE RAW PAYLOAD VALUE, NOT `platform` ABOVE. That one defaults to
  // 'tiktok' for voice synthesis, and defaulting an unrecorded platform to the
  // FREE budget would hand 25 paid transcriptions to anything that arrives
  // without the field.
  const budget = transcriptBudgetFor(p.platform)
  const urls = Array.isArray(p.urls) ? p.urls.slice(0, budget) : []
  if (!voiceId || !urls.length) throw new Error('build_voice needs brand_voice_id and urls')

  // Best-effort: skip any video that fails (private / blocked / no speech).
  // ⚖️ FILLED IN INPUT ORDER from `mapWithConcurrency`'s indexed results, not in
  // completion order. See `boundedMap.ts`.
  const transcripts: string[] = []
  // ⚠️ THE ROUTE EACH TRANSCRIPT CAME BY, COUNTED WHERE IT IS STILL KNOWN.
  // `transcribeFromUrl` is the only place both YouTube branches are visible, and
  // it returns a transcript, not a receipt — so unless this tallies the
  // stamp, the fact that a video cost money survives exactly as long as a stderr
  // line. That is why "how often do YouTube captions exist" was unanswerable:
  // not missing data, discarded data.
  const routes: Record<string, number> = {}
  const bump = (k: string) => { routes[k] = (routes[k] ?? 0) + 1 }
  // ⚠️⚠️ THIS WAS A SERIAL LOOP AND IT IS WHAT THE CREATOR WAITS ON. `dna-poll`
  // reports ready from `brand_voices.status`, which this job sets, so every
  // second here is a second on the onboarding screen. Measured on the last
  // twelve `build_voice` jobs: 49, 91, 134, 199, 208, 266, 292, 340, 373, 380,
  // 538, 952 seconds — p50 279, p90 522. The 952 is not a slow model, it is the
  // full free TikTok budget of 25 videos run one after another at ~38s each.
  //
  // ⚖️ THE TRANSCRIPTIONS ARE INDEPENDENT — nothing in one informs the next — so
  // the serialisation bought nothing. `mapWithConcurrency` runs them
  // `TRANSCRIBE_CONCURRENCY` at a time and returns them IN INPUT ORDER, because
  // `synthesizeVoiceFromAudio` below reads that order and silently changing what
  // the model sees is not a latency fix.
  //
  // ⚠️ THE BOUND IS 3, NOT THE BUDGET. `SWEEP_BATCH` was 25 and starved a live
  // creator's asset on this same single worker loop; see `boundedMap.ts`.
  //
  // ⚠️ AND THIS FUNCTION MUST NEVER THROW. `mapWithConcurrency` propagates a
  // rejection, so a throw here would turn one bad video into a lost scan —
  // strictly worse than the loop it replaces, which tolerated a throw per item.
  // Every path returns; `a transcript failure is one video, never the scan`
  // pins it.
  const transcribeOne = async (url: string): Promise<string | null> => {
    try {
      const t = await transcribeFromUrl(url)
      // ⚖️ UNSTAMPED IS ITS OWN BUCKET. Folding an absent source into the free
      // one would report a cost of zero for any route added later and never
      // stamped — the three-state rule this repo keeps relearning.
      bump(t.source ?? 'unrecorded')
      if (t.paidBecause) bump(`paid_because_${t.paidBecause}`)
      if (!t.text || t.text.trim().length <= 20) return null
      {
        const text = t.text.trim()
        // ⚠️ PERSIST WHAT WAS ALREADY PAID FOR (0135). This is the ONLY
        // place a creator's own speech exists, and it used to live exactly as
        // long as this function ran: the profile and the knowledge were written,
        // the transcript itself was dropped. `public.transcripts` therefore held
        // nothing but `ingest` rows — other people's reference videos — so any
        // reader asking "how does this creator actually talk" found a table full
        // of strangers.
        //
        // ⚖️ AND IT IS STAMPED `own`, which is the whole point. The style
        // compiler in `generate-blueprint` filters on `subject = 'own'` before
        // compiling a voice, so an unstamped row is invisible to it and a
        // MIS-stamped one would teach the writer a stranger's cadence.
        //
        // ⚖️ BEST EFFORT, ALWAYS. A storage failure must never cost the voice
        // upgrade this job exists to perform — the transcript has already done
        // its primary work by the time we get here.
        // ⚠️ AND IT IS STAMPED WITH THE VOICE, BECAUSE `owner_id` IS NOT AN
        // IDENTITY. One owner holds ten voices in production — ten different
        // people's accounts — and the compiler's `subject='own'` read was
        // scoped to the owner alone, so all ten shared one pool of speech
        // (0220). An unstamped row is not wrong, it is UNATTRIBUTED, and the
        // reader's NULL rule is what makes that safe.
        const row = {
          owner_id: job.owner_id,
          source_url: url,
          url_key: ownUrlKey(url),
          platform: p.platform ?? null,
          language: t.language,
          duration_sec: t.duration_sec,
          text,
          words: t.words,
          segments: t.segments,
          subject: 'own',
        }
        try {
          // ⚠️ AN UNKNOWN COLUMN REJECTS THE WHOLE INSERT (PGRST204/42703), so
          // shipping this ahead of the apply would cost the creator their
          // speech entirely — the exact trade 0220 exists to prevent. The
          // narrow retry keeps the row; only its attribution waits.
          const { error } = await db.from('transcripts').insert({ ...row, brand_voice_id: voiceId || null })
          if (error && /brand_voice_id/i.test(`${error.message} ${error.details ?? ''}`)) {
            const { error: legacyErr } = await db.from('transcripts').insert(row)
            if (legacyErr) throw legacyErr
            bump('stored_unattributed')
          } else if (error) {
            throw error
          } else {
            bump('stored')
          }
        } catch (err) {
          // Counted, not swallowed: a store that silently fails is how the
          // table stayed empty while the scans looked successful.
          bump('store_failed')
          console.error('build_voice: could not persist own transcript', url,
            err instanceof Error ? err.message : err)
        }
        // ⚠️ RETURNED OUTSIDE THE STORE'S `try`, WHICH IS THE WHOLE POINT OF
        // THIS LINE'S POSITION. The voice upgrade must not become conditional
        // on persistence: a failed insert is counted in `routes` and the text
        // still reaches `synthesizeVoiceFromAudio`. `a storage failure cannot
        // lose the voice upgrade` pins it behaviourally.
        return text
      }
    } catch (err) {
      // ⚖️ A FAILED TRANSCRIPT IS NOT A FREE ONE. It may already have spent an
      // Apify call before throwing, so it is counted apart rather than ignored.
      bump('failed')
      console.error('build_voice: transcript failed', url, err instanceof Error ? err.message : err)
      return null
    }
  }

  const settled = await mapWithConcurrency(urls, TRANSCRIBE_CONCURRENCY, transcribeOne)
  for (const t of settled) if (t !== null) transcripts.push(t)

  if (!transcripts.length) {
    // Nothing usable — leave the caption voice in place. Not a hard failure.
    return { upgraded: false, reason: 'no usable spoken transcripts', attempted: urls.length, routes }
  }

  const profile = await synthesizeVoiceFromAudio(handle, platform, transcripts)

  // MERGE, don't replace: the audio re-synthesis refines the fields where SPOKEN
  // signal is strongest — tone/pacing/vocabulary/hooks and now the distinctive
  // pov/enemy/hook_patterns (a creator's real stance comes through on camera). It
  // does NOT produce the business-context fields (audience/audience_pain/
  // dream_outcome/offer/sub_niche/editing_style) — those come from captions + bio,
  // which audio lacks. Spreading audio over the existing profile keeps that
  // context and upgrades the voice itself.
  const { data: existing } = await db
    .from('brand_voices')
    .select('profile, owner_id')
    .eq('id', voiceId)
    .maybeSingle()
  const captionProfile = (existing?.profile as Record<string, unknown> | null) ?? {}
  const merged = { ...captionProfile, ...profile }

  // WHERE EACH FIELD CAME FROM. The merge above is a plain spread, so once it
  // has run nothing can tell a field derived from the creator actually
  // SPEAKING from one the caption synthesis produced — and those are not
  // remotely equal in authority.
  //
  // The caption model is INSTRUCTED never to return a blank ("COMPLETENESS IS
  // MANDATORY... a confident, specific inference is far more useful than a
  // blank", voice.ts's POSTS_SYSTEM). So when a creator's captions never say
  // what they sell, `offer` is filled with a plausible guess — and `offer` is
  // what writes the call to action on every video. Flat strings cannot carry
  // that distinction, so it was lost.
  //
  // Recorded as a SIBLING key rather than by reshaping `profile`: the flat
  // shape is read by generate-blueprint and by the frontend confirm card, and
  // breaking those to add metadata would be a poor trade.
  //
  // Three values, and the middle one is deliberately not "observed":
  //   observed_audio    — from spoken transcripts. The strongest signal there
  //                       is, and the only one here that is unambiguously an
  //                       observation.
  //   caption_synthesis — from the caption model, which is told to infer
  //                       rather than leave a gap. It MAY be observation and
  //                       it MAY be a guess, and we cannot tell which. Calling
  //                       it `observed` would grant authority it has not
  //                       earned, in exactly the fields where being wrong
  //                       costs the creator money or credibility.
  //   user_confirmed    — set elsewhere, when a human says yes.
  const audioFields = new Set(Object.keys(profile))
  const priorProvenance = (existing?.profile as { _provenance?: Record<string, string> } | null)?._provenance ?? {}
  const provenance: Record<string, string> = {}
  for (const key of Object.keys(merged)) {
    if (key.startsWith('_')) continue
    if (audioFields.has(key)) provenance[key] = 'observed_audio'
    else provenance[key] = priorProvenance[key] === 'user_confirmed' ? 'user_confirmed' : 'caption_synthesis'
  }

  // ── CREATOR KNOWLEDGE: EXTRACT IN FLIGHT, THEN LET THE SPEECH GO ─────────
  //
  // The transcripts are already in memory here and, until now, left it as
  // `audio_transcripts: <count>` — the richest substance in the system fetched,
  // read once for TONE, and dropped. That is the founding "voice-accurate,
  // content-empty" defect at its source.
  //
  // ⚖️ RETENTION IS NEVER-PERSIST. Nothing below writes a transcript anywhere.
  // The distillate is stored and the raw text goes out of scope when this
  // function returns, which is why `source_expiry` stays NULL — read downstream
  // as "never retained", the strongest state rather than a missing value.
  //
  // ⚖️ ENRICHMENT, NOT A GATE. Every failure path here leaves the voice upgrade
  // untouched. A creator whose knowledge extraction breaks must still get their
  // voice; trading a working feature for a new one is not an upgrade.
  let knowledgeStored = 0
  let cohortYield: Record<string, unknown> | null = null
  // ⚠️ STORED, NOT LOGGED, LIKE `cohort_yield` BESIDE IT. "Which of the seven
  // questions does this creator's speech never answer" is the number that says
  // whether the bank is right, and it is unrecoverable once the rows are merged
  // into a store of 1,339. A console line expires within days; the job result is
  // a row. NULL means the pass did not run, never "it found nothing".
  let targetedYield: Record<string, unknown> | null = null
  const ownerId = (existing as { owner_id?: string } | null)?.owner_id ?? null
  // No owner means no row can be attributed, and an unattributed claim about a
  // person is worse than none at all.
  if (ownerId) try {
    // ⚖️ TWO SOURCES, ONE STORE. Speech carries positions; captions carry NAMED
    // THINGS and what has already been covered, across the whole channel rather
    // than the five videos we could afford to transcribe. They are extracted
    // separately because the evidence is of a different kind — a title proves a
    // video was made, not what it concluded — and the caption prompt refuses to
    // file an opinion as `stated` for exactly that reason.
    const captions = Array.isArray(p.captions) ? p.captions : []
    // ⚠️⚠️ THREE PASSES, AND THE THIRD IS AN ADDITION RATHER THAN A REPLACEMENT.
    // The general pass asks "what does she know" and answers it well (84%
    // substance on transcript rows); what it cannot guarantee is that the seven
    // things a script actually needs — a number, an enemy, an episode, someone
    // else's words, a contrarian position, a mistake, her real CTA — are among
    // the answers. The targeted pass asks for them by name and keeps the EVIDENCE
    // sentence beside each conclusion. Both write through the same merge, so a
    // fact both find increments `times_seen` instead of duplicating.
    //
    // ⚠️ AND TRACK B DOES NOT RUN WITHOUT A PRODUCT ON RECORD. Not every creator
    // sells anything; asking "what does she charge" of a creator with no offer
    // produces an invented price, which is the exact failure this project has
    // spent months removing. `hasProduct` is a STORED ENTITY, never an inference
    // from the transcript.
    const hasProduct = await ownerHasLiveProduct(ownerId)
    const [fromAudio, fromCaptions, fromTargeted] = await Promise.all([
      extractKnowledgeFromAudio(handle, platform, transcripts),
      extractKnowledgeFromCaptions(handle, platform, captions),
      extractTargetedKnowledge(handle, platform, transcripts, questionsFor(hasProduct)),
    ])
    // Audio first: where both sources produced the same claim, the one somebody
    // was HEARD saying should win the dedup below.
    // ⚠️ TAG BY REAL ORIGIN, NOT BY GUESS. These two lists are merged here and
    // become indistinguishable one line later. `basis` correlates today only
    // because captions are clamped to `demonstrated`; recording the pipeline is
    // the fact, and the correlation is the coincidence.
    // ⚠️⚠️ AND TWO THINGS THAT NEED NO MODEL CALL AT ALL. "A lot of you have been
    // asking how I price these" is her audience's demand, in her words, already
    // transcribed — the only audience-demand signal in the system that does not
    // wait on comment ingestion, and the supply `audience_questions` was deleted
    // for lacking. "I'll do a whole video on that" is a backlog she announced and
    // forgot. Both are a cue phrase and the clause after it, so a regex either
    // finds her sentence or finds nothing; a model asked the same question would
    // paraphrase and occasionally invent.
    const mined = mineTranscripts(transcripts)
    if (mined.length) {
      console.log(JSON.stringify({
        event: 'transcript_lines_mined',
        lines: mined.length,
        asked: mined.filter((l) => l.text.startsWith('Audience keeps asking')).length,
        promised: mined.filter((l) => l.text.startsWith('Promised to cover')).length,
      }))
    }
    targetedYield = {
      asked: questionsFor(hasProduct).length,
      returned: fromTargeted.length,
      track_b_asked: hasProduct,
      mined_lines: mined.length,
      // Per question, because the SILENCE is the measurement.
      by_question: questionsFor(hasProduct).reduce<Record<string, number>>((acc, q) => {
        acc[q.id] = fromTargeted.filter((r) => String(r?.question_id ?? '') === q.id).length
        return acc
      }, {}),
    }
    const raw = [
      // ⚖️ THE TARGETED ANSWERS GO FIRST, AND THE REASON IS THE WRITE CAP. A scan
      // may store `KNOWLEDGE_ROWS_PER_SCAN` rows and the slice is taken from the
      // front, so the seven answers a script was measured to need must not be the
      // ones a hundred caption rows push over the edge.
      ...fromTargeted.map((r) => ({ ...r, __source: 'transcript' as const })),
      // ⚖️ MINED LINES ARE `stated` BY CONSTRUCTION AND CONFIDENT BY
      // CONSTRUCTION. She said the sentence — it is in the transcript, and the
      // evidence field carries it verbatim — so there is no model judgement to be
      // unsure about. `times_seen` is 1 because the dedupe above keeps the first
      // occurrence only; the merge increments it if a later scan finds it again.
      ...mined.map((l) => ({
        kind: l.kind,
        text: l.text,
        basis: 'stated',
        times_seen: '1',
        confidence: '0.9',
        source_video: l.source_video,
        evidence: l.evidence,
        __source: 'transcript' as const,
      })),
      ...fromAudio.map((r) => ({ ...r, __source: 'transcript' as const })),
      ...fromCaptions.map((r) => ({ ...r, __source: 'caption' as const })),
    ]
    // ⚖️ ONE NORMALISATION, TWO JOBS. Every rule that turns a model's answer
    // into a storable row now lives in `knowledgeRows.ts`, because
    // `remine_knowledge` re-reads stored transcripts with a newer extractor and
    // a second copy of these rules is how the two paths start disagreeing about
    // what a claim is. The taxonomy filter and its loud drop went with it.
    let rows = knowledgeRowsFrom({
      items: raw,
      ownerId,
      voiceId,
      urls,
      cap: KNOWLEDGE_ROWS_PER_SCAN,
      version: EXTRACTOR_VERSION,
    })
    if (rows.length) {
      // ⚠️ NOT AN UPSERT, AND THE REASON IS A BUG ALREADY FIXED ONCE HERE.
      // `saveMintedEntity` used `onConflict` against a PARTIAL index; Postgres
      // cannot infer an index whose predicate the statement does not repeat, and
      // PostgREST cannot express one, so every write raised 42P10 and failed
      // invisibly. `creator_knowledge_one_per_claim` is an EXPRESSION index
      // (coalesce, lower, btrim), which is uninferrable for exactly the same
      // reason. So the existing claims are read and the new ones filtered
      // against them; the index stays as the authority that makes a duplicate
      // impossible rather than merely unlikely.
      const { data: seen } = await db
        .from('creator_knowledge')
        .select('kind, text')
        .eq('owner_id', ownerId)
        .eq('voice_id', voiceId)
      const have = new Set((seen ?? []).map((r) => `${r.kind}\u0000${String(r.text).trim().toLowerCase()}`))
      const fresh = rows.filter((r) => !have.has(`${r.kind}\u0000${r.text.toLowerCase()}`))
      if (fresh.length) {
        // ⚠️ THE CLOCK IS READ BEFORE THE WRITE, not after. A row that merged
        // into an existing one keeps its original `created_at`, so "created
        // since this moment" is exactly "canonical row that did not exist
        // before" — which is the only definition of new knowledge worth paying
        // for. Reading it afterwards would race the insert.
        const before = new Date().toISOString()
        const { error: kErr } = (await insertKnowledge(db as never, fresh as never))
        // Enrichment never gates the scan, but a write that fails must still
        // say so — `knowledgeStored` staying 0 is indistinguishable from a
        // creator who genuinely said nothing.
        if (kErr) console.warn(JSON.stringify({ event: 'knowledge_insert_failed', rows: fresh.length, error: kErr.message }))
        else {
          knowledgeStored = fresh.length
          cohortYield = await measureCohortYield(ownerId, urls, before)
        }
      }
    }
  } catch {
    // Deliberately swallowed — see the enrichment note above.
  }

  const withProvenance = {
    ...merged,
    _provenance: provenance,
    _provenance_evidence: { audio_transcripts: transcripts.length, knowledge_items: knowledgeStored },
  }

  // Only upgrade a voice that's still ready (don't resurrect a deleted/failed one).
  const { error } = await db
    .from('brand_voices')
    .update({ profile: withProvenance })
    .eq('id', voiceId)
    .eq('status', 'ready')
  if (error) throw error

  return {
    upgraded: true,
    videos_used: transcripts.length,
    // ⚠️ THE DENOMINATOR TRAVELS WITH THE COUNT. `videos_used` alone cannot say
    // whether three transcripts came from three attempts or from twenty-five,
    // and the budget question is entirely about that ratio.
    attempted: urls.length,
    routes,
    knowledge_items: knowledgeStored,
    // ⚠️ THE DENOMINATOR FOR THE ONE NUMBER THIS WHOLE PROBLEM TURNS ON. Yield
    // was reconstructed after the fact as "1.63 rows per transcript", which
    // divides by VIDEOS and hides the cap that decides how much text the
    // extractor actually read. Characters is the honest denominator, it is free
    // to record here, and without it the loss is not written down anywhere.
    transcript_chars: transcripts.reduce((n, t) => n + t.length, 0),
    // ⚠️ STORED, NOT LOGGED — the counter-durability rule. This is the number the
    // 5→10 decision is waiting on: how much NEW canonical substance positions
    // 6-10 bought, after the merge collapsed repeats. A console line would
    // expire; the job result is a row.
    //
    // ⚖️ NULL MEANS NOT MEASURED, never zero. A scan that stored no knowledge, or
    // whose measurement query failed, must not read as "the extra videos added
    // nothing" — that is the answer this instrument exists to find honestly.
    cohort_yield: cohortYield,
    targeted_yield: targetedYield,
    fields_from_audio: audioFields.size,
    fields_from_captions: Object.values(provenance).filter((v) => v === 'caption_synthesis').length,
  }
}
