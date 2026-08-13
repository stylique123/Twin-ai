// THE SAME BELIEF, RE-WORDED BY THE EXTRACTOR, STORED TWICE.
//
// ── THE DEFECT, AND WHY 0123 SAID IT WOULD REMAIN ─────────────────────────
//
// 0123 made exact repeats merge. Its own comment refused to claim more:
//
//     ⚠️ THIS DOES NOT SOLVE PARAPHRASE DRIFT… The extractor re-reads the
//     transcripts on every scan and writes the same fact in different words.
//     Those are different strings, so they take different keys and BOTH survive.
//
// ── MEASURED, ON TWO EXTRACTION RUNS OVER THE SAME SOURCE ─────────────────
//
// Two runs of the production extractor over identical input, 18 items in the
// second run:
//
//     merged today (exact match)                          6
//     THE SAME FACT IN DIFFERENT WORDS — accumulates      9
//     genuinely new                                       3
//
//     "Faster charging is not better for phone battery longevity."
//     "faster charging is not better for phone battery health"
//
//     "Tested phones with 200 megapixel sensors that produced worse photos
//      than a three-year-old iPhone."
//     "…than a three-year-old iPhone due to processing differences"
//
// ⚠️ SO A RE-SCAN ROUGHLY DOUBLES THE STORE WHILE ADDING ~17% NEW MATERIAL, and
// the cost is not disk. The prompt carries about ten items behind a floor of six
// substance slots: two phrasings of one opinion occupy two of those six, and the
// creator's second-best idea never reaches the writer.
//
// ── WHY THIS IS RESTRICTED TO SUBSTANCE KINDS ─────────────────────────────
//
// ⚖️ THE SCOPE IS A MEASUREMENT, NOT A PREFERENCE. Across 1,033 items from 17
// real creators, this rule merges NOTHING within a single scan — every pair it
// would have collapsed was a `topic` or `covered` row, and those were mostly not
// duplicates at all:
//
//     "starting AI dropshipping with Claude"  vs  "…with your phone"
//     "most unique Samsung phone"             vs  "unique Samsung phone capabilities"
//
// Different videos. Merging them would corrupt the coverage signal to save a
// slot in a list nobody speaks from. And the drift that costs a beat was ALL in
// the substance kinds. So thin kinds keep exact-match merging, which is what
// they have today, and this touches the six kinds a script is built out of.
//
// ── THE GUARD THAT MAKES 0.6 SAFE ─────────────────────────────────────────
//
// ⚠️ WORD OVERLAP ALONE MERGES THINGS THAT DIFFER IN THE ONLY WAY THAT MATTERS.
// Measured on the same corpus, at this exact threshold:
//
//     "top 10 dropshipping products for July 2026"   0.71   "…for May 2026"
//     "top 10 dropshipping products to sell now"     0.63   "top 7 dropshipping…"
//     "Google Pixel 1"                               0.67   "Google Pixel"
//
// Every one of those differs by a NUMBER or a MONTH and by almost nothing else,
// which is precisely what high overlap cannot see. So two texts are never merged
// when their numerals or month names disagree — the same principle the
// entailment check runs on: numbers do not paraphrase.

/** The kinds a script can be built out of.
 *
 *  ⚠️ MUST STAY EQUAL TO `SUBSTANCE_KINDS` in `knowledgeSelection.ts`. It is
 *  re-exported rather than redefined for exactly that reason. */
export { SUBSTANCE_KINDS } from './knowledgeSelection'
import { SUBSTANCE_KINDS } from './knowledgeSelection'

/** Overlap at which two texts of the same kind are one fact.
 *
 *  ⚖️ 0.6 IS THE CONSERVATIVE END OF A MEASURED RANGE. On the re-scan pair 0.5
 *  catches two more items; on the 1,033-item corpus 0.5 is also where thin-kind
 *  false merges begin. The two extra items are worth less than the margin. */
export const DEDUPE_THRESHOLD = 0.6

/** Words that carry no meaning and would inflate every comparison. */
const STOP = new Set(('a an the and or of to in on for is are be it its that this you your'
  + ' they their with about not what how why as at by from more most than then so if do does'
  + ' can i my me we our').split(' '))

/** Content words, lower-cased, punctuation dropped. */
export function contentTokens(text: string): Set<string> {
  return new Set(String(text ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.has(w)))
}

/** Jaccard overlap: shared words over total distinct words. */
export function overlap(a: string, b: string): number {
  const x = contentTokens(a)
  const y = contentTokens(b)
  if (x.size === 0 || y.size === 0) return 0
  let both = 0
  for (const t of x) if (y.has(t)) both++
  return both / (x.size + y.size - both)
}

const MONTH = /january|february|march|april|may|june|july|august|september|october|november|december/g

/** The tokens two near-identical sentences are allowed to be DIFFERENT about.
 *
 *  ⚠️ A NUMBER OR A MONTH IS THE WHOLE DIFFERENCE OR IT IS NOTHING. "May 2026"
 *  and "July 2026" share every other word; word overlap cannot tell them apart,
 *  and merging them loses a video. */
export function distinctiveMarks(text: string): string {
  const t = String(text ?? '').toLowerCase()
  return [...new Set([...(t.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/, '')),
    ...(t.match(MONTH) ?? [])])].sort().join('|')
}

export interface KnowledgeRow { kind?: unknown; text?: unknown }

/**
 * Are these two rows the same thing said twice?
 *
 * ⚖️ SAME KIND IS REQUIRED, NOT INFERRED. An `opinion` and the `experience` that
 * grounds it can share almost every word and are different evidence — the
 * evidence ladder is the reason the kinds exist.
 */
export function nearDuplicate(a: KnowledgeRow, b: KnowledgeRow): boolean {
  const kind = typeof a?.kind === 'string' ? a.kind : ''
  if (kind === '' || kind !== b?.kind) return false
  if (!SUBSTANCE_KINDS.has(kind)) return false
  const at = typeof a?.text === 'string' ? a.text : ''
  const bt = typeof b?.text === 'string' ? b.text : ''
  if (at.trim() === '' || bt.trim() === '') return false
  if (distinctiveMarks(at) !== distinctiveMarks(bt)) return false
  return overlap(at, bt) >= DEDUPE_THRESHOLD
}

export interface CanonicalisedRows<T> {
  rows: T[]
  /** How many incoming rows were re-pointed at a phrasing already stored. */
  merged: number
}

/**
 * Rewrite incoming rows that restate something already stored, so the exact-match
 * merge 0123 built can see them.
 *
 * ⚠️ THE INCOMING TEXT IS REPLACED BY THE STORED ONE, NOT THE OTHER WAY ROUND.
 * The stored text is the key the unique index and `times_seen` already hang off;
 * rewriting it would orphan that history to gain a rephrasing. The newer wording
 * is often slightly richer, and that is a real if small loss — accepted, because
 * the alternative is churning the key on every scan.
 *
 * ⚖️ NOTHING IS DROPPED HERE. A row that matches nothing passes through
 * untouched, and a row that matches becomes a REPEAT rather than a deletion — so
 * it increments `times_seen`, which is the durability signal the selector ranks
 * on. Losing the second sighting would make a re-worded belief look LESS durable
 * than one the extractor happened to phrase identically.
 */
export function canonicaliseRepeats<T extends KnowledgeRow>(
  incoming: readonly T[],
  stored: readonly KnowledgeRow[],
): CanonicalisedRows<T> {
  let merged = 0
  const rows = incoming.map((row) => {
    const match = stored.find((s) => nearDuplicate(s, row))
    if (!match || typeof match.text !== 'string' || match.text === row.text) return row
    merged++
    return { ...row, text: match.text }
  })
  return { rows, merged }
}
