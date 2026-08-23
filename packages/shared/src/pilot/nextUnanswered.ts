// LANDING ON CLAIM 1 OF 103 AFTER EVERY RELOAD IS A TAX ON THE ONE PERSON
// WHOSE TIME THIS EXPERIMENT CANNOT BUY MORE OF.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The labelling page opens at index 0. Three deploys shipped during one
// labelling session -- the focus fix, the evidence-scope line, the field notes --
// and each one asked the owner to reload and then arrow forward past everything
// they had already answered. At 36 answered that is 36 keypresses to get back to
// work, every time.
//
// ⚠️ NAVIGATION ONLY. THIS MUST NOT BECOME A SCORE. It reports WHERE the next
// unanswered claim is, never WHAT anyone answered. A control that surfaced the
// distribution of labels given so far would tell the reviewer what the answer
// "should" be, which is the same defect as a pre-highlighted button (#481) or a
// visible pass rate. The tests pin that this module cannot see label VALUES at
// all: it takes booleans.
//
// ⚖️ AND A SKIP IS STILL UNANSWERED. `s` deliberately leaves a claim unlabelled
// so the run cannot lock while one is outstanding. Jumping must therefore land
// on skipped claims too, or the reviewer is walked past exactly the ones they
// meant to come back to.

/** Only what this module is allowed to know: whether each claim has a label. */
export type AnsweredFlags = readonly boolean[]

/**
 * Index of the next unanswered claim at or after `from`, wrapping once.
 * Returns null when every claim is answered.
 *
 * ⚠️ WRAPS, BECAUSE THE GAPS ARE USUALLY BEHIND YOU. A reviewer who skipped
 * claim 7 and is now at 60 needs to get back to 7; a forward-only search would
 * report "nothing left" while the run still cannot lock.
 */
export function nextUnanswered(answered: AnsweredFlags, from: number): number | null {
  const n = answered?.length ?? 0
  if (n === 0) return null
  // Normalise a nonsense cursor rather than reading past the ends.
  const start = Number.isInteger(from) && from >= 0 && from < n ? from : 0
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    if (!answered[i]) return i
  }
  return null
}

/**
 * Index of the next unanswered claim STRICTLY after `from`, wrapping.
 * This is what a "jump" control wants: standing on an unanswered claim and
 * pressing jump should move, not sit still.
 */
export function jumpTarget(answered: AnsweredFlags, from: number): number | null {
  const n = answered?.length ?? 0
  if (n === 0) return null
  const start = Number.isInteger(from) && from >= 0 && from < n ? from : 0
  // ⚠️ k < n, NOT k <= n. Wrapping the full length lands back on `start`, so
  // standing on the LAST remaining gap returned that same index and the jump
  // control looked broken instead of finishing. Excluding self lets the caller
  // disable the button honestly.
  for (let k = 1; k < n; k++) {
    const i = (start + k) % n
    if (!answered[i]) return i
  }
  return null
}

/**
 * How many are still outstanding. Progress, not a score: it says how much work
 * remains, never how any of it was answered.
 */
export function outstandingCount(answered: AnsweredFlags): number {
  return (answered ?? []).filter((a) => !a).length
}
