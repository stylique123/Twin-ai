// READ THE TRANSCRIPTS WE ALREADY PAID FOR, WITH THE EXTRACTOR WE HAVE NOW.
//
// ⚠️ THE CEILING THIS LIFTS, MEASURED. 42 voices hold 1,339 knowledge rows, of
// which 611 are substance; 2 voices have months of usable runway and the median
// voice has 10 items. Meanwhile `public.transcripts` holds 331 rows of the
// creators' OWN speech — 504,180 characters, already transcribed and already
// paid for — at a yield of 1.63 knowledge rows per transcript. Every improvement
// to the extraction prompt so far has reached only creators who signed up after
// it, because the only caller of the extractor is `build_voice`, which runs once
// at onboarding and never again.
//
// ⚖️ SO THIS IS THE SECOND CALLER, AND IT COSTS NO SCRAPE. 0135 made the own
// speech durable; this job is what makes that store worth having. A re-mine is
// model calls over text already on disk — no download, no Apify, no proxy, and
// none of the 100%-failing Instagram media path.
//
// ⚠️ IT IS NOT A TIMER, AND THAT IS DELIBERATE. "Re-extract after two weeks"
// spends money on the calendar rather than on a change: a creator whose
// transcripts and extractor are both unchanged has nothing new to find, and
// running anyway would add a paraphrase of what is already stored. The trigger is
// `extractor_version` (0214) — a NEW PROMPT is the only thing that makes old
// transcripts worth re-reading. `enqueue_stale_knowledge_remine` picks the
// cohort; this handler does one voice of it.
//
// ⚖️ AND IT IS ADDITIVE ONLY. Nothing here deletes, downgrades or replaces a
// stored row. The merge (0123/0178/0214) increments `times_seen`, strengthens
// `basis`, never erases a recorded `cost`, and raises the version stamp on a fact
// the new prompt re-derived. A re-mine can only add material or confirm material.

import { db, type Job } from '../db.js'
import { insertKnowledge, KNOWLEDGE_ROWS_PER_SCAN } from '../knowledgeInsert.js'
import { knowledgeRowsFrom } from '../knowledgeRows.js'
import { EXTRACTOR_VERSION, voiceNeedsRemine } from '../extractorVersion.js'
import { extractKnowledgeFromAudio, extractTargetedKnowledge } from '../voice.js'
import { questionsFor } from '../targetedQuestions.js'
import { mineTranscripts } from '../transcriptMining.js'
import { ownerHasLiveProduct } from '../ownerProducts.js'

/** How many stored transcripts one re-mine may read.
 *
 *  ⚠️ IT EXISTS BECAUSE THE EXTRACTOR'S OWN BOUND IS SMALLER AND SILENT ABOUT
 *  IT. `EXTRACT_WINDOW_CHARS * EXTRACT_MAX_BATCHES` is a 60,000-character
 *  ceiling, and one owner already holds 162,668 characters — roughly 100,000 of
 *  which no extraction has ever read. Naming the count here means the gap is
 *  reported by this job rather than absorbed by a `.slice` nobody can see, which
 *  is the fourth instance of that defect this repo has written down.
 *
 *  ⚖️ 40 IS ABOVE THE CURRENT MAXIMUM PER OWNER, on purpose: the bound is here to
 *  stop a pathological row count, not to ration material. The extractor's batch
 *  cap is what actually decides spend. */
export const REMINE_TRANSCRIPTS_MAX = 40

/** One page of a PostgREST read, and never confused with the whole answer.
 *
 *  ⚠️ A `limit` IS A REQUEST, NOT A PROMISE — PostgREST caps responses
 *  server-side, so a short page is indistinguishable from a complete answer
 *  unless you page until one comes back short. */
const PAGE = 20

interface StoredTranscript { text: string; url: string | null }

/** The creator's own stored speech, oldest first, paged to the bound above. */
async function ownTranscripts(ownerId: string, voiceId: string, soleVoice: boolean): Promise<StoredTranscript[]> {
  const out: StoredTranscript[] = []
  let unscoped = false
  for (let from = 0; from < REMINE_TRANSCRIPTS_MAX; from += PAGE) {
    const to = Math.min(from + PAGE, REMINE_TRANSCRIPTS_MAX) - 1
    // ⚠️ AND `owner_id` IS NOT ONE CREATOR, WHICH THE COMMENT BELOW ALREADY
    // CONDEMNS WITHOUT KNOWING IT. One owner holds ten ready voices — ten
    // different people's accounts — so re-mining owner-wide files one
    // creator's opinions into another's store just as surely as an `ingest`
    // row would, and this path WRITES them (0220).
    //
    // ⚖️ NULL IS UNATTRIBUTED, NOT FOREIGN: admitted only for a sole-voice
    // owner, where nobody else can own it.
    const q = db
      .from('transcripts')
      .select('text, source_url')
      .eq('owner_id', ownerId)
      // ⚠️ `subject = 'own'` IS THE WHOLE FILTER THAT MATTERS. The same table
      // holds `ingest` rows — OTHER PEOPLE'S reference videos. Re-mining those
      // into a creator's knowledge store would file a stranger's opinions as
      // hers, which is worse than an empty store by a wide margin.
      .eq('subject', 'own')
    if (!unscoped) {
      if (soleVoice) q.or(`brand_voice_id.is.null,brand_voice_id.eq.${voiceId}`)
      else q.eq('brand_voice_id', voiceId)
    }
    let { data, error } = await q.order('created_at', { ascending: true }).range(from, to)
    // ⚠️ AN UNAPPLIED COLUMN MUST NOT EMPTY THE STORE. Before 0220 lands the
    // read degrades to the owner-wide behaviour it has always had, rather than
    // throwing and failing the re-mine outright.
    if (error && /brand_voice_id/i.test(`${error.message} ${error.details ?? ''}`)) {
      unscoped = true
      ;({ data, error } = await db
        .from('transcripts')
        .select('text, source_url')
        .eq('owner_id', ownerId)
        .eq('subject', 'own')
        .order('created_at', { ascending: true })
        .range(from, to))
    }
    if (error) throw new Error(`remine_knowledge: could not read own transcripts: ${error.message}`)
    const page = (data ?? []) as Array<{ text?: unknown; source_url?: unknown }>
    for (const r of page) {
      const text = typeof r.text === 'string' ? r.text.trim() : ''
      if (text.length > 20) out.push({ text, url: typeof r.source_url === 'string' ? r.source_url : null })
    }
    // A short page is the end of the data; a full one is not evidence of more,
    // so the loop simply continues to its own bound.
    if (page.length < to - from + 1) break
  }
  return out
}

/** The version stamps this voice's stored knowledge carries. */
async function storedVersions(voiceId: string): Promise<Array<number | null>> {
  const { data, error } = await db
    .from('creator_knowledge')
    .select('extractor_version')
    .eq('voice_id', voiceId)
  // ⚠️ AN ERROR IS NOT AN EMPTY STORE. Reading a failed query as "no rows" would
  // make this job re-mine every voice on every sweep the moment 0214 is
  // unapplied or PostgREST's schema cache is stale — spending real money on a
  // read that failed. Unknown must stop the job, not license the work.
  if (error) throw new Error(`remine_knowledge: could not read stored versions: ${error.message}`)
  return ((data ?? []) as Array<{ extractor_version?: unknown }>).map((r) => {
    const v = r.extractor_version
    return typeof v === 'number' ? v : null
  })
}

export async function handleRemineKnowledge(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { brand_voice_id?: string; handle?: string; platform?: string; force?: boolean }
  const voiceId = String(p.brand_voice_id ?? '').trim()
  if (!voiceId) throw new Error('remine_knowledge needs brand_voice_id')

  const { data: voice, error: vErr } = await db
    .from('brand_voices')
    .select('owner_id, handle, platform')
    .eq('id', voiceId)
    .maybeSingle()
  if (vErr) throw new Error(`remine_knowledge: could not read the voice: ${vErr.message}`)
  if (!voice) throw new Error(`remine_knowledge: no such voice ${voiceId}`)
  const ownerId = String((voice as { owner_id?: string }).owner_id ?? '')
  if (!ownerId) throw new Error('remine_knowledge: the voice has no owner')
  const handle = String(p.handle ?? (voice as { handle?: string }).handle ?? '').replace(/^@/, '')
  const platform = String(p.platform ?? (voice as { platform?: string }).platform ?? 'tiktok')

  // ⚖️ THE STALENESS CHECK RUNS HERE AS WELL AS IN THE ENQUEUER, AND THAT IS NOT
  // BELT-AND-BRACES FOR ITS OWN SAKE. A sweep enqueued an hour ago can be drained
  // after a `build_voice` has already re-read the same creator with the current
  // prompt, and paying for a second identical extraction is the one failure mode
  // this whole mechanism exists to prevent. `force` exists for a re-mine somebody
  // wants anyway, and it is recorded in the result rather than assumed.
  const versions = await storedVersions(voiceId)
  const stale = voiceNeedsRemine(versions, EXTRACTOR_VERSION)
  if (!stale && p.force !== true) {
    return {
      skipped: 'already_current',
      extractor_version: EXTRACTOR_VERSION,
      stored_rows: versions.length,
    }
  }

  // The same sole-voice test the blueprint compiler makes, for the same reason.
  const { count: voiceCount } = await db
    .from('brand_voices')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
  // Every voice, not every ready one — see the blueprint compiler's note.
  const stored = await ownTranscripts(ownerId, voiceId, (voiceCount ?? 0) <= 1)
  // ⚠️ NO TRANSCRIPTS IS NOT AN ERROR, IT IS AN EMPTY RE-MINE. A voice whose own
  // speech was never retained is a fact about when they were onboarded, not a
  // fault in this run, and failing the job would put a red row in the queue for
  // every creator who predates 0135.
  if (stored.length === 0) {
    return { skipped: 'no_own_transcripts', extractor_version: EXTRACTOR_VERSION, forced: p.force === true }
  }

  // ⚠️⚠️ THE RE-MINE RUNS THE TARGETED PASS TOO, AND THAT IS THE ENTIRE REASON
  // VERSION 3 EXISTS. A sweep that re-ran only the general pass would re-read
  // 272 transcripts to produce paraphrases of what is already stored — spend with
  // no new material. The seven questions are what the old extractor never asked,
  // so they are what a re-mine is FOR.
  //
  // ⚖️ AND THE PRODUCT GATE IS THE SAME ONE, asked of the database. A re-mine
  // must not become the path where the pricing questions get asked of a creator
  // who sells nothing.
  const hasProduct = await ownerHasLiveProduct(ownerId)
  const texts = stored.map((t) => t.text)
  const [general, targeted] = await Promise.all([
    extractKnowledgeFromAudio(handle, platform, texts),
    extractTargetedKnowledge(handle, platform, texts, questionsFor(hasProduct)),
  ])
  // ⚖️ AND THE REGEX PASS, WHICH IS FREE. Mining 272 stored transcripts for what
  // her audience asked and what she promised costs no model call, so the re-mine
  // is where it reaches every creator who predates it.
  const mined = mineTranscripts(texts)
  const items = [
    ...mined.map((l) => ({
      kind: l.kind,
      text: l.text,
      basis: 'stated',
      times_seen: '1',
      confidence: '0.9',
      source_video: l.source_video,
      evidence: l.evidence,
    })),
    ...targeted,
    ...general,
  ]
  const rows = knowledgeRowsFrom({
    items: items.map((r) => ({ ...r, __source: 'transcript' as const })),
    ownerId,
    voiceId,
    urls: stored.map((t) => t.url ?? ''),
    cap: KNOWLEDGE_ROWS_PER_SCAN,
    version: EXTRACTOR_VERSION,
  })

  let storedRows = 0
  let mergeUsed = false
  if (rows.length) {
    const { error, merged } = await insertKnowledge(db as never, rows as never)
    if (error) throw new Error(`remine_knowledge: knowledge insert failed: ${error.message}`)
    storedRows = rows.length
    mergeUsed = merged
  }

  // ⚖️ THE INSTRUMENT, NOT JUST THE OUTCOME. `rows_offered` against
  // `transcripts_read` and `chars_read` is the yield-per-transcript figure the
  // whole depth question turns on, and it has only ever been reconstructed after
  // the fact from row counts. Stored on the job, because a console line expires.
  const chars = stored.reduce((n, t) => n + t.text.length, 0)
  return {
    extractor_version: EXTRACTOR_VERSION,
    forced: p.force === true,
    was_stale: stale,
    transcripts_read: stored.length,
    chars_read: chars,
    items_returned: items.length,
    // ⚖️ THE SPLIT, NOT JUST THE TOTAL. "Did the questions find anything the
    // general pass did not" is the question this whole sweep is answering, and a
    // single total cannot answer it.
    items_targeted: targeted.length,
    items_general: general.length,
    items_mined: mined.length,
    track_b_asked: hasProduct,
    rows_offered: rows.length,
    rows_written: storedRows,
    merge_used: mergeUsed,
    // Rows the store held BEFORE this run, so "what did the new prompt add" is
    // answerable without a second query against a moving table.
    rows_before: versions.length,
  }
}
