/**
 * "X, Y, AND Z" — ONCE IS A SENTENCE, TWICE IS A TIC.
 *
 * ⚠️ VOICE CAUSE 2 — A STRUCTURAL AI TELL, NOT A WORD LIST. The audit's
 * anti-AI-diction work identified rhetorical PATTERNS, not just banned
 * phrases: a three-item parallel list ("fast, cheap, and reliable") is
 * ordinary language once. A model reaching for the same triadic cadence
 * repeatedly across one script is the templated rhythm that makes writing
 * read as machine-generated, independent of which words fill the slots.
 *
 * ⚖️ ADVISORY, NEVER A VERDICT. One triad proves nothing — real speech uses
 * them. This only speaks up once the SAME script does it more than once,
 * matching the discipline `hookVariety.ts` already uses for a different
 * repeated-shape defect: never say the shape is wrong, only that it repeated.
 *
 * ⚖️ SHORT ITEMS ONLY. "I built the company, I hired the team, and I raised
 * the round" is three real clauses, not the templated cadence this exists to
 * catch — capping each item at 4 words keeps this from flagging ordinary
 * compound sentences.
 */

const MAX_ITEM_WORDS = 4
const ITEM = `[a-z0-9'-]+(?:\\s+[a-z0-9'-]+){0,${MAX_ITEM_WORDS - 1}}`
const TRIAD_RE = new RegExp(`\\b(${ITEM}), (${ITEM}), and (${ITEM})\\b`, 'gi')

/** Below this a single instance is ordinary language, not a tic. */
export const REPEATS_TO_FLAG = 2

export interface ParallelTriadHit {
  /** The full matched phrase, exactly as written. */
  text: string
}

/** Find every "X, Y, and Z" parallel-list construction in one line. */
export function parallelTriadsIn(line: unknown): ParallelTriadHit[] {
  if (typeof line !== 'string' || line.trim() === '') return []
  const hits: ParallelTriadHit[] = []
  for (const m of line.matchAll(TRIAD_RE)) hits.push({ text: m[0] })
  return hits
}

/** ⚠️ THE WHOLE-SCRIPT COUNT IS WHAT DECIDES, NOT ANY ONE LINE. Pass every
 *  spoken line in the script; a single triad anywhere is silent, two or more
 *  across the whole thing is the tic. */
export function parallelTriadNote(allHits: readonly ParallelTriadHit[]): string | null {
  if (allHits.length < REPEATS_TO_FLAG) return null
  return `This script leans on the same "X, Y, and Z" list rhythm ${allHits.length} times. Vary the sentence shapes — not every point needs three items.`
}
