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
): string[] {
  const kept = (Array.isArray(claims) ? claims : [])
    .map((c) => (typeof c === 'string' ? c.trim() : ''))
    .filter((c) => c !== '')
  if (countPromiseBroken !== true) return kept
  return kept.filter((c) => !NUMBER_CLAIM.test(c))
}
