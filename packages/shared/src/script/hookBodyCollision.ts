/**
 * FIX 8a — A BODY LINE THAT RESTATES A HOOK NOBODY PICKED.
 *
 * ⚠️ THE WRITER EMITS FIVE HOOKS AND A BODY SIMULTANEOUSLY, and nothing
 * forbids a body beat from restating a non-selected hook. Scene 4 in the
 * audited script reads almost word-for-word as hook option 2 — decidable,
 * because it is lexical repetition of a KNOWN STRING (the hook the model
 * itself wrote), not the open-ended semantic repetition FIX 8b exists for.
 *
 * ⚖️ ONLY HOOK_OPTIONS[1..] ARE CHECKED, NEVER HOOK_OPTIONS[0]. The first
 * hook is the one that opens the script — its own beat IS drawn from it, so
 * comparing it against the body would flag the hook beat against itself on
 * every single generation. The other four exist so the creator can choose a
 * different opener; a body line that already spent one of them is the
 * defect this module catches.
 *
 * ⚖️ CONTAINMENT, NOT JACCARD (the G16 length-mismatch lesson). A hook is
 * short and a body line can be long; asking what fraction of the SHORTER
 * side is present in the other answers "does this line restate that hook",
 * where a symmetric measure would undercount a long line that fully
 * contains a short one.
 */

/** ⚠️ A MODULE-LOCAL LIST, DELIBERATELY. `hookContract.ts` keeps its own for
 *  the same reason: sharing one set across unrelated checks is how a change
 *  meant for one silently reaches the other. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'you', 'your', 'i',
  'me', 'my', 'it', 'its', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or',
  'but', 'that', 'this', 'with', 'into', 'right', 'now', 'if', 'so', 'because',
])

function contentWords(text: unknown): string[] {
  if (typeof text !== 'string') return []
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9']/g, ''))
    .filter((w) => w !== '' && !STOPWORDS.has(w))
}

/** ⚠️ THE THRESHOLD THE SPEC NAMES. Below it, two lines sharing a handful of
 *  common-but-not-stop words (a niche noun, a number) is coincidence, not a
 *  restatement — the containment measure is deliberately generous ABOVE this
 *  line and deliberately silent below it. */
export const CONTAINMENT_THRESHOLD = 0.6

/**
 * What fraction of the SHORTER side's content words appear in the other.
 * `null` when either side has no content words to compare — an empty or
 * all-stopword line contains nothing, and reporting 0 would read as "checked
 * and clean" rather than "nothing to check".
 */
export function containment(a: unknown, b: unknown): number | null {
  const wordsA = new Set(contentWords(a))
  const wordsB = new Set(contentWords(b))
  if (wordsA.size === 0 || wordsB.size === 0) return null
  const [smaller, larger] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA]
  let shared = 0
  for (const w of smaller) if (larger.has(w)) shared += 1
  return shared / smaller.size
}

export interface HookBodyCollision {
  /** Index into `hook_options` (always >= 1). */
  hookIndex: number
  /** Index into the script beat array. */
  beatIndex: number
  containmentScore: number
}

/**
 * Every (non-selected hook, script line) pair whose containment clears the
 * threshold.
 *
 * ⚖️ HOOK_OPTIONS[0] IS SKIPPED BY CONSTRUCTION — the loop starts at 1, not
 * filtered afterward, so there is no "index 0" case for a future edit to
 * accidentally re-include.
 */
export function hookBodyCollisions(hookOptions: unknown, beats: unknown): HookBodyCollision[] {
  if (!Array.isArray(hookOptions) || !Array.isArray(beats)) return []
  const out: HookBodyCollision[] = []
  for (let h = 1; h < hookOptions.length; h++) {
    const hook = hookOptions[h]
    if (typeof hook !== 'string' || hook.trim() === '') continue
    beats.forEach((b, beatIndex) => {
      const line = (b as { line?: unknown } | null)?.line
      const score = containment(hook, line)
      if (score !== null && score >= CONTAINMENT_THRESHOLD) {
        out.push({ hookIndex: h, beatIndex, containmentScore: score })
      }
    })
  }
  return out
}

/** How many BEATS carry at least one collision — the `beat_audit` counter.
 *  A beat colliding with two different non-selected hooks still counts once:
 *  the question this answers is "how many lines need a rewrite", not "how
 *  many hook/line pairs matched". */
export function hookBodyCollisionBeatCount(hookOptions: unknown, beats: unknown): number {
  return new Set(hookBodyCollisions(hookOptions, beats).map((c) => c.beatIndex)).size
}
