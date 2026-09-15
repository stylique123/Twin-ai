// WHICH IDEA SHE GOT, OUT OF THE ONES SHE GAVE US.
//
// ⚠️ A CREATOR PASTES A PARAGRAPH AND WE RETURN ONE SCRIPT. Nothing has ever
// recorded whether that paragraph held one idea or five, or which one survived.
// So "the writer used her input" has never been a measurable claim — only a
// hope. Measured 2026-09-14: zero of 134 generations carry any decomposition.
//
// ⚖️ THE WRITER'S OWN STRUCTURED OUTPUT, NEVER A SECOND MODEL CALL. A separate
// call would be a DIFFERENT reader's opinion of the paragraph, and comparing it
// to what the writer wrote would measure the disagreement between two models
// rather than what the writer did with the input. It also costs a call per
// generation to answer a question the writer already answered implicitly.
//
// ⚖️ IDEA RETENTION, NOT WORD RETENTION. Counting shared words would score a
// script that parrots her phrasing above one that keeps her point and says it
// better. The unit is a candidate idea, named by the writer in its own words.
//
// ⚠️ AND NULL IS THE ANSWER WHENEVER IT DID NOT DECOMPOSE — WHICH IS NOT THE
// SAME AS FINDING ONE. "One" means there was one idea in the paragraph. "Null"
// means nobody looked for more. An honest unknown beats a confident 1, because
// a confident 1 is indistinguishable from a writer that never read past the
// first sentence, and a rate built on those is a measurement of nothing.

/** ⚠️ CAPS, BECAUSE THIS LANDS IN A ROW AND NOT A LOG. A model asked for short
 *  labels can still return a paragraph each; unbounded, that is an audit column
 *  that grows without limit. Truncation is RECORDED rather than silent — a
 *  dropped list that was cut is a different fact from one that was short. */
export const MAX_LABEL_CHARS = 200
export const MAX_DROPPED = 12

export interface ParagraphUsed {
  /** How many distinct ideas the writer says it found. Always >= 1 here: a 0 or
   *  an unreadable count means it did not decompose, and that is `null`, not a
   *  row claiming zero ideas produced a script. */
  candidatesFound: number
  /** The one it wrote, in the writer's words. */
  candidateChosen: string
  /** The ones it did not write. Empty is a real answer when found is 1. */
  candidatesDropped: readonly string[]
  /** ⚠️ RECORDED, NEVER RECONCILED. `found` should equal 1 + dropped.length. It
   *  will sometimes not, and quietly fixing either number would destroy the
   *  only evidence that the writer's own two answers disagreed. */
  countDisagreesWithList: boolean
  /** Whether `candidatesDropped` was cut at MAX_DROPPED. */
  droppedTruncated: boolean
}

function readCount(v: unknown): number | null {
  // The response schema carries every scalar as a STRING (see `mechanism.count`
  // beside it), so a number and "3" must both read.
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t === '') return null
  // ⚠️ A WHOLE NUMBER OR NOTHING. "unknown", "a few", "3-4" and "several" are
  // all real things a model returns, and every one of them means it did not
  // give a count. Coercing "3-4" to 3 would invent precision.
  if (!/^\d{1,3}$/.test(t)) return null
  const n = Number(t)
  return n >= 1 ? n : null
}

function readLabel(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_LABEL_CHARS) : ''
}

/**
 * The decomposition, or null when the writer did not give one.
 *
 * ⚠️ EVERY NULL PATH IS A DELIBERATE REFUSAL, NOT A FALLBACK:
 *  - not an object, or absent            → it did not answer
 *  - a count that is not a whole number  → it did not count ("a few", "3-4")
 *  - a count below 1                     → a script came from something
 *  - no named choice                     → idea retention is unmeasurable
 *    without knowing WHICH idea survived, so a count alone is not a row
 */
export function paragraphUsed(raw: unknown): ParagraphUsed | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const found = readCount(r.candidates_found)
  if (found === null) return null
  const chosen = readLabel(r.candidate_chosen)
  if (chosen === '') return null
  const all = Array.isArray(r.candidates_dropped) ? r.candidates_dropped : []
  const labels = all.map(readLabel).filter((s) => s !== '')
  const dropped = labels.slice(0, MAX_DROPPED)
  return {
    candidatesFound: found,
    candidateChosen: chosen,
    candidatesDropped: dropped,
    countDisagreesWithList: found !== 1 + labels.length,
    droppedTruncated: labels.length > MAX_DROPPED,
  }
}

/** The audit row's shape, snake_cased to match every other `beat_audit` key.
 *  Null in, null out — the column stores "nobody looked" as null and never as
 *  an object full of zeroes. */
export function paragraphUsedRow(used: ParagraphUsed | null): Record<string, unknown> | null {
  if (used === null) return null
  return {
    candidates_found: used.candidatesFound,
    candidate_chosen: used.candidateChosen,
    candidates_dropped: used.candidatesDropped,
    count_disagrees_with_list: used.countDisagreesWithList,
    dropped_truncated: used.droppedTruncated,
  }
}
