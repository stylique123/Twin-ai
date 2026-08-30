import { db, type Job } from '../db.js'
import { insertKnowledge, KNOWLEDGE_ROWS_PER_SCAN } from '../knowledgeInsert.js'
import { transcribeFromUrl } from '../media.js'
import { transcriptBudgetFor } from '../transcriptSelection.js'
import { synthesizeVoiceFromAudio, extractKnowledgeFromAudio, extractKnowledgeFromCaptions } from '../voice.js'

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
  const transcripts: string[] = []
  // ⚠️ THE ROUTE EACH TRANSCRIPT CAME BY, COUNTED WHERE IT IS STILL KNOWN.
  // `transcribeFromUrl` is the only place both YouTube branches are visible, and
  // it returns a transcript, not a receipt — so unless this loop tallies the
  // stamp, the fact that a video cost money survives exactly as long as a stderr
  // line. That is why "how often do YouTube captions exist" was unanswerable:
  // not missing data, discarded data.
  const routes: Record<string, number> = {}
  const bump = (k: string) => { routes[k] = (routes[k] ?? 0) + 1 }
  for (const url of urls) {
    try {
      const t = await transcribeFromUrl(url)
      // ⚖️ UNSTAMPED IS ITS OWN BUCKET. Folding an absent source into the free
      // one would report a cost of zero for any route added later and never
      // stamped — the three-state rule this repo keeps relearning.
      bump(t.source ?? 'unrecorded')
      if (t.paidBecause) bump(`paid_because_${t.paidBecause}`)
      if (t.text && t.text.trim().length > 20) {
        const text = t.text.trim()
        transcripts.push(text)
        // ⚠️ PERSIST WHAT WAS ALREADY PAID FOR (0135). This loop is the ONLY
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
        try {
          await db.from('transcripts').insert({
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
          })
          bump('stored')
        } catch (err) {
          // Counted, not swallowed: a store that silently fails is how the
          // table stayed empty while the scans looked successful.
          bump('store_failed')
          console.error('build_voice: could not persist own transcript', url,
            err instanceof Error ? err.message : err)
        }
      }
    } catch (err) {
      // ⚖️ A FAILED TRANSCRIPT IS NOT A FREE ONE. It may already have spent an
      // Apify call before throwing, so it is counted apart rather than ignored.
      bump('failed')
      console.error('build_voice: transcript failed', url, err instanceof Error ? err.message : err)
    }
  }

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
    const [fromAudio, fromCaptions] = await Promise.all([
      extractKnowledgeFromAudio(handle, platform, transcripts),
      extractKnowledgeFromCaptions(handle, platform, captions),
    ])
    // Audio first: where both sources produced the same claim, the one somebody
    // was HEARD saying should win the dedup below.
    // ⚠️ TAG BY REAL ORIGIN, NOT BY GUESS. These two lists are merged here and
    // become indistinguishable one line later. `basis` correlates today only
    // because captions are clamped to `demonstrated`; recording the pipeline is
    // the fact, and the correlation is the coincidence.
    const raw = [
      ...fromAudio.map((r) => ({ ...r, __source: 'transcript' as const })),
      ...fromCaptions.map((r) => ({ ...r, __source: 'caption' as const })),
    ]
    // A recorded optional line, or null. Blank and whitespace-only collapse to
    // null so an extractor that emits "" for a field it had nothing for cannot
    // be read as having recorded something.
    const shortOrNull = (v: unknown): string | null => {
      const t = String(v ?? '').trim().replace(/\s+/g, ' ')
      return t === '' ? null : t.slice(0, 240)
    }
    let rows = raw
      .filter((r) => typeof r?.text === 'string' && r.text.trim().length > 0)
      .slice(0, KNOWLEDGE_ROWS_PER_SCAN)
      .map((r) => ({
        owner_id: ownerId,
        voice_id: voiceId,
        kind: r.kind,
        text: r.text.trim().slice(0, 240),
        // An unreadable basis becomes `inferred` here rather than at the
        // database default, so the weakest reading is chosen where the value is
        // actually known to be junk.
        basis: ['stated', 'demonstrated', 'inferred'].includes(r.basis) ? r.basis : 'inferred',
        source: r.__source,
        times_seen: Math.max(1, Math.min(50, Number(r.times_seen) || 1)),
        // ⚖️ AN UNREADABLE CONFIDENCE IS 0.5, NEVER 1. Silence about how sure
        // the extractor was must not read as certainty — the same rule that
        // makes an unstated `basis` degrade to `inferred`.
        confidence: (() => {
          const n = Number(r.confidence)
          return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5
        })(),
        // The video it was actually read out of, so a creator disputing an item
        // can go and watch it. Out-of-range or unparseable yields null rather
        // than a wrong URL, because pointing at the wrong video is worse than
        // pointing at none.
        source_url: (() => {
          const i = Number(r.source_video)
          return Number.isInteger(i) && i >= 1 && i <= urls.length ? urls[i - 1] : null
        })(),
        last_observed_at: new Date().toISOString(),
        // ⚖️ THE TWO HALVES THE EXTRACTOR USED TO DROP. Both are OPTIONAL and
        // both normalise an absent/blank/whitespace value to null: "nobody
        // recorded a cost" and "it cost nothing" are different states, and only
        // null says the first. Capped at 240 like `text`, for the same reason.
        cost: shortOrNull(r.cost),
        consensus: shortOrNull(r.consensus),
      }))
    // ⚠️ THE TAXONOMY IS A CLOSED SET AND THE MODEL DOES NOT KNOW THAT.
    // `creator_knowledge_kind_valid` CHECKs this list, so an unlisted kind is a
    // failed INSERT for the whole batch — hence the filter. Duplicated from
    // `KNOWLEDGE_KINDS` in @twinai/shared on purpose: the worker has no runtime
    // dep on it (see directorContract.ts), and `knowledgeKindParity.test.ts`
    // fails if the two ever diverge.
    const KNOWLEDGE_KINDS_WORKER = ['fact', 'opinion', 'topic', 'example', 'experience', 'framework', 'claim', 'product', 'covered']
    // ⚖️ DROPPED, BUT NEVER SILENTLY. Measured on a real 501-caption corpus:
    // 10 of 489 extracted items came back as `action` or `tool` — categories the
    // model wanted and the taxonomy does not have. Filtering them is right;
    // discarding them without a word is how a systematic gap in the taxonomy
    // looks exactly like nothing happening.
    const dropped = rows.filter((r) => !KNOWLEDGE_KINDS_WORKER.includes(r.kind))
    if (dropped.length) {
      const kinds = [...new Set(dropped.map((r) => r.kind))].slice(0, 10)
      console.warn(JSON.stringify({ event: 'knowledge_kind_rejected', count: dropped.length, of: rows.length, kinds }))
    }
    rows = rows.filter((r) => KNOWLEDGE_KINDS_WORKER.includes(r.kind))
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
    // ⚠️ STORED, NOT LOGGED — the counter-durability rule. This is the number the
    // 5→10 decision is waiting on: how much NEW canonical substance positions
    // 6-10 bought, after the merge collapsed repeats. A console line would
    // expire; the job result is a row.
    //
    // ⚖️ NULL MEANS NOT MEASURED, never zero. A scan that stored no knowledge, or
    // whose measurement query failed, must not read as "the extra videos added
    // nothing" — that is the answer this instrument exists to find honestly.
    cohort_yield: cohortYield,
    fields_from_audio: audioFields.size,
    fields_from_captions: Object.values(provenance).filter((v) => v === 'caption_synthesis').length,
  }
}
