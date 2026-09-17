// WHICH EXTRACTOR WROTE THIS ROW, AND THEREFORE WHAT IT COULD NOT HAVE ASKED.
//
// ⚠️ THE DEFECT THIS CLOSES IS NOT ABOUT ANY ONE FIELD. `creator_knowledge` has
// been written by at least four materially different extractors: the original
// nine-kind pass, the caption pass (0122), the `cost`/`consensus` pass (0178),
// and the surface-form recorder (0133). Nothing on a row says which of them
// produced it. So every improvement to the extraction prompt has only ever
// helped creators scanned AFTERWARDS, and the creators already in the store
// stayed at whatever the extractor could ask on the day they were scanned —
// permanently, and invisibly.
//
// ⚖️ A VERSION IS NOT A TIMESTAMP, AND `updated_at` CANNOT STAND IN FOR IT. A
// row's `updated_at` moves every time a merge bumps `times_seen`, including a
// merge performed by an OLD extractor. A row touched yesterday by the pass that
// cannot ask what a thing cost is still a row with no cost, and a date-based
// cohort would call it current. The only honest question is "which prompt
// produced this", and only the prompt can answer it.
//
// ⚖️ AND THE COLUMN IS NULLABLE WITH NO BACKFILL. NULL means "written before
// anything recorded this", which is a real and different fact from "written by
// version 1" — the same rule that keeps `cost` NULL rather than zero and
// `last_observed_at` NULL rather than old. `remineCohort` below treats NULL as
// the oldest possible version, because it is, but it never rewrites it.

/**
 * The extractor that is running today.
 *
 * ⚠️ BUMP THIS WHENEVER THE EXTRACTION PROMPT OR SCHEMA CHANGES WHAT CAN BE
 * FOUND. Not for a typo, not for a re-word that asks the same question — for a
 * change that would have produced a different row from the same transcript. The
 * test in `__tests__/knowledgeExtractorVersion.test.ts` pins this number against
 * the worker's mirror, so a bump is one edit in two files and a failing test
 * until both agree.
 *
 * CHANGELOG — the reason each version exists, because a bare integer is
 * unauditable and the cohort query below is only as meaningful as this list.
 *
 *   1  The nine-kind pass as it stood on 2026-09-17, including `cost` and
 *      `consensus` (0178) and the caption basis clamp. Every row written before
 *      the stamp existed is NULL, not 1 — see above.
 *   2  Track A: seven targeted questions asked of every transcript alongside the
 *      general pass, each carrying the sentence it was read out of (`evidence`).
 */
export const KNOWLEDGE_EXTRACTOR_VERSION = 1

/** A row as the cohort query needs to see it. Deliberately the smallest shape
 *  that answers the question, so a caller can pass a `select` of two columns. */
export interface ExtractorStampedRow {
  voiceId: string | null
  extractorVersion: number | null
}

export interface RemineCohort {
  /** Voices with at least one row below the current version. Sorted oldest
   *  first, so a budget-limited re-mine spends on the creators who have been
   *  stuck the longest. */
  voices: Array<{ voiceId: string; oldestVersion: number | null; rows: number }>
  /** Rows below the current version, across every voice. */
  staleRows: number
  /** Rows at the current version. */
  currentRows: number
}

/**
 * Which creators are still carrying an older extractor's output.
 *
 * ⚖️ PER VOICE, NOT PER ROW, BECAUSE RE-MINING IS PER VOICE. The unit of work is
 * one scan of one creator's transcripts; a count of stale rows tells the owner
 * how much material is stale and nothing about what it would cost to fix, and
 * cost is the number that decides whether it happens. Both are returned.
 *
 * ⚖️ A VOICE IS STALE IF ANY ROW IS. Mixed voices are the normal case — a
 * creator scanned twice across a version bump — and calling such a voice current
 * because its newest rows are current is how the old half stays old forever.
 *
 * ⚠️ NULL SORTS OLDEST AND IS NEVER COERCED TO A NUMBER. `oldestVersion` is
 * returned as NULL when that is what the store holds, so an owner-facing line
 * can say "never stamped" rather than inventing a version 0 that no extractor
 * ever was.
 */
export function remineCohort(
  rows: readonly ExtractorStampedRow[],
  current: number = KNOWLEDGE_EXTRACTOR_VERSION,
): RemineCohort {
  const byVoice = new Map<string, { oldestVersion: number | null; rows: number; sawNull: boolean }>()
  let staleRows = 0
  let currentRows = 0
  for (const r of rows) {
    const v = typeof r?.extractorVersion === 'number' && Number.isFinite(r.extractorVersion)
      ? r.extractorVersion
      : null
    // ⚖️ AT OR ABOVE `current` IS CURRENT, not "equal to". A row written by a
    // worker deployed ahead of this constant is not stale, and re-mining it
    // would spend a model call to make material worse.
    if (v !== null && v >= current) { currentRows++; continue }
    staleRows++
    // A row with no voice cannot be re-mined — the scan is keyed on the voice —
    // so it counts toward the stale total and names no work.
    if (!r?.voiceId) continue
    const e = byVoice.get(r.voiceId) ?? { oldestVersion: null, rows: 0, sawNull: false }
    e.rows++
    if (v === null) e.sawNull = true
    else e.oldestVersion = e.oldestVersion === null ? v : Math.min(e.oldestVersion, v)
    byVoice.set(r.voiceId, e)
  }
  const voices = [...byVoice.entries()]
    .map(([voiceId, e]) => ({
      voiceId,
      // An unstamped row is older than any stamped one, so a voice that has any
      // reports NULL regardless of what else it carries.
      oldestVersion: e.sawNull ? null : e.oldestVersion,
      rows: e.rows,
    }))
    .sort((a, b) => {
      if (a.oldestVersion === b.oldestVersion) return b.rows - a.rows
      if (a.oldestVersion === null) return -1
      if (b.oldestVersion === null) return 1
      return a.oldestVersion - b.oldestVersion
    })
  return { voices, staleRows, currentRows }
}
