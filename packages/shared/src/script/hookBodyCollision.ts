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

// ── AND NOW IT REORDERS, BECAUSE 26% IS A POPULATION ─────────────────────────
//
// ⚠️ THIS RULE WAS COUNTED AND NOT ENFORCED FOR A STATED REASON: the edge
// function's own comment deferred acting on it to "when this is worth acting
// on". MEASURED ON PRODUCTION 2026-09-14, over the 85 generations carrying
// `beat_audit.hook_body_collisions`:
//
//     runs with at least one collision ....... 22 of 85   (26%)
//     colliding beats in total ............... 24
//     worst single run ....................... 3 beats
//
// That is the population. A quarter of runs offer the creator a hook the script
// has already spent.
//
// ⚖️ WHAT A COLLISION MEANS FOR THE CREATOR, AND WHY DEMOTION IS THE FIX UNDER
// EITHER READING OF THE SYMPTOM. A hook option whose content a body beat
// already restates is NOT A DISTINCT CHOICE: pick it and the script says the
// same thing twice; leave it and the body has pre-empted the opener it was
// offered as. Sorting it behind the clean options is true in both cases. What
// this deliberately does NOT do is rewrite the body to suit a chosen hook —
// that is the opposite fix, it needs evidence about which beat is load-bearing,
// and guessing between two opposite fixes is how a rule gets built from a
// reconstruction of a symptom.

/** A reorder, never a drop, and never a rewrite. */
export interface HookDemotion {
  hooks: string[]
  /** How many options collided with a body beat. */
  found: number
  /** How many actually moved. Zero when the collided ones were already last. */
  demoted: number
}

/**
 * Sort every hook option the body already restates behind every one it does
 * not, preserving the writer's own order within each group.
 *
 * ⚖️ STABLE, SO THE WRITER'S RANKING SURVIVES. The writer ordered these by its
 * own judgement of strength; this rule knows one thing that judgement did not,
 * and it may not spend that as licence to reshuffle the rest.
 *
 * ⚖️ DEMOTED, NOT DROPPED. A collision is a redundancy, not a fabrication — the
 * creator may still prefer that opener and move the body line themselves, and
 * discarding it would decide that for them. `demoteUnsupportedHooks` draws the
 * same line for the same reason.
 *
 * ⚠️ AND THERE IS NO "ALL FIVE FLAGGED" FALLBACK HERE, BECAUSE THAT STATE
 * CANNOT ARISE. `hookBodyCollisions` starts at index 1, so `hookOptions[0]` is
 * never a collision and is always in the clean group — a stable partition
 * therefore always returns a list whose first element is the writer's own
 * recommended pick, and the degenerate "nothing is clean" case that
 * `demoteUnsupportedHooks` has to guard has no way to happen. Copying that
 * guard across would add a branch nothing can reach.
 */
export function demoteCollidedHooks(hookOptions: unknown, beats: unknown): HookDemotion {
  const hooks = Array.isArray(hookOptions)
    ? hookOptions.filter((h): h is string => typeof h === 'string')
    : []
  if (hooks.length === 0) return { hooks: [], found: 0, demoted: 0 }
  const collided = new Set(hookBodyCollisions(hooks, beats).map((c) => c.hookIndex))
  if (collided.size === 0) return { hooks: [...hooks], found: 0, demoted: 0 }
  const clean = hooks.filter((_, i) => !collided.has(i))
  const dirty = hooks.filter((_, i) => collided.has(i))
  const next = [...clean, ...dirty]
  // ⚖️ COUNTED BY WHAT MOVED, NOT BY WHAT WAS FOUND. A collided option already
  // sitting last is a real finding and a no-op reorder, and reporting it as a
  // demotion would overstate what the creator's screen actually changed.
  let demoted = 0
  for (let i = 0; i < hooks.length; i++) if (hooks[i] !== next[i]) demoted += 1
  return { hooks: next, found: collided.size, demoted }
}
