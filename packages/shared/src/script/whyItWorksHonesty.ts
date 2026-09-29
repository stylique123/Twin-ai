// TWO PANELS ON ONE SCREEN, ASSERTING OPPOSITE THINGS ABOUT ONE HOOK.
//
// ⚠️⚠️ OBSERVED BY THE OWNER IN A SINGLE SCREENSHOT:
//
//   Honesty check:  "This video promises a number it does not deliver. The
//                    script promises 2 and delivers 0."
//   Why it works:   "Your hook names a number, so people know exactly how much
//                    you are promising them."
//
// The first correctly identifies a broken promise. The second praises that
// exact promise as a strength, with no acknowledgement of the conflict.
//
// ⚖️ THE SECOND IS THE ONE THAT MUST YIELD, AND NOT BECAUSE IT IS WRONG IN
// GENERAL. "A number in the hook is a size the viewer can hold" is true — it is
// why the claim exists. It stops being true the moment the script does not
// deliver that number, because then the number is a promise the video breaks.
// A panel that praises a broken promise teaches a creator to trust neither
// panel.
//
// ⚠️ SUPPRESSED, NOT REWRITTEN. Turning it into "your hook names a number but
// you do not deliver it" would be a second voice saying what the honesty check
// already says better, on the screen directly above. One statement per fact.

/** The claim `syncWhyItWorksToScript` emits for a number in the hook. Matched
 *  on its distinctive opening rather than in full, so a copy tweak upstream
 *  does not silently stop the suppression working. */
const NUMBER_CLAIM = /^your hook names a number/i

/**
 * The "Why it works" claims, minus any the honesty check has already
 * contradicted.
 *
 * ⚖️ A PURE FILTER OVER THE STORED CLAIMS, so it can run at render time on a
 * blueprint that was generated before this existed. The alternative — making
 * the writer emit the right claims — cannot repair the 154 generations already
 * stored, and those are the ones a creator is looking at.
 *
 * ⚠️ `countPromiseBroken === false` AND `undefined` ARE DIFFERENT. False means
 * the check ran and the promise holds; undefined means nobody checked. Only a
 * definite TRUE suppresses, so a caller that cannot compute the verdict shows
 * exactly what it shows today rather than hiding claims on a guess.
 */
export function honestWhyItWorks(
  claims: readonly unknown[] | null | undefined,
  countPromiseBroken?: boolean,
  shownHook?: string | null,
): string[] {
  let kept = (Array.isArray(claims) ? claims : [])
    .map((c) => (typeof c === 'string' ? c.trim() : ''))
    .filter((c) => c !== '')
  if (countPromiseBroken === true) kept = kept.filter((c) => !NUMBER_CLAIM.test(c))
  // ⚠️ COFFEE REPORT 1.5: "Your hook names a number" sat over an opening line
  // with no number. The claims were written about the script's first line; the
  // creator is shown (and films) the hook she picked. Hook claims are checked
  // against THAT hook: kept when true, recomputed when a count, dropped when not.
  const hook = typeof shownHook === 'string' ? shownHook.trim() : ''
  if (hook === '') return kept
  const words = hook.split(/\s+/).filter(Boolean).length
  return kept.flatMap((c) => {
    if (NUMBER_CLAIM.test(c)) return HOOK_NUMBER.test(hook) ? [c] : []
    if (QUESTION_CLAIM.test(c)) return hook.endsWith('?') ? [c] : []
    if (LENGTH_CLAIM.test(c)) {
      return words <= 12 ? [`Your opening line is ${words} words. It lands before anyone decides to scroll past.`] : []
    }
    return [c]
  })
}

const HOOK_NUMBER = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/i
const QUESTION_CLAIM = /^you open on a question/i
const LENGTH_CLAIM = /^your opening line is \d+ words/i

// ── ROUND 3, 2.7: FROM THE REAL TEST, NOT A TEMPLATE ─────────────────────────
// "It lands before anyone decides to scroll past" was shown on a script whose
// best hook stopped 4 of 10 viewers, and "your opening line is 10 words" was
// offered as proof of quality. When the viewers have scored the script, the
// panel leads with what they did; when the score is low it says so and shows
// what they flagged, instead of reciting structure as praise.
export const STRONG_HOOK_SCORE = 6

export interface TestOutcome {
  /** The best hook's stops out of `n`. */
  best: number
  n: number
  /** What the viewers flagged most, in their words, if anything. */
  flagged: string | null
}

const STRUCTURAL = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) words?\b|\bopening line is\b|\bsecond hook\b|\bre-?hook\b|\bpartway through\b|\bhalfway\b/i

export function whyItWorksFromTest(claims: readonly string[], test: TestOutcome | null): string[] {
  if (!test || test.n <= 0) return [...claims]
  const score = Math.round((test.best / test.n) * 10)
  const head = `Tested on ${test.n} viewers: the best hook stopped ${test.best} of ${test.n}.`
  if (score < STRONG_HOOK_SCORE) {
    return [
      `${head} That is not strong yet, so the claims below would be guesses.`,
      ...(test.flagged ? [`What they flagged most: ${test.flagged}`] : []),
    ]
  }
  return [head, ...claims.filter((c) => !STRUCTURAL.test(c))]
}
