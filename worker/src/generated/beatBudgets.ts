// GENERATED FROM packages/shared/src/script/beatBudgets.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// THE BEAT WORD BUDGETS: ONE CONSTANT, TWO READERS.
//
// Plan §33 gives the same numbers to two components: the beat-based writer
// (which writes each beat TO its budget) and the Quality Controller (which
// checks a finished script AGAINST it). If each kept its own copy, the writer
// could aim at one range while the QC graded against another and nobody would
// see it. Both import this file instead. Change a number here and both move.

export const BEAT_IDS = ['hook', 'problem', 'proof', 'method', 'cta'] as const
export type BeatId = (typeof BEAT_IDS)[number]

export interface BeatBudget {
  readonly min: number
  readonly max: number
  /** Plain-words name for reports and prompts. */
  readonly label: string
}

/** Words per beat, inclusive. hook 12-20, problem/reality 15-30, her proof 30-50, method/product facts 20-40, CTA 8-15. */
export const BEAT_WORD_BUDGETS: Readonly<Record<BeatId, BeatBudget>> = Object.freeze({
  hook: Object.freeze({ min: 12, max: 20, label: 'hook' }),
  problem: Object.freeze({ min: 15, max: 30, label: 'problem or reality' }),
  proof: Object.freeze({ min: 30, max: 50, label: 'her proof' }),
  method: Object.freeze({ min: 20, max: 40, label: 'method or product facts' }),
  cta: Object.freeze({ min: 8, max: 15, label: 'call to action' }),
})

export function wordsInBudget(beat: BeatId, words: number): boolean {
  const b = BEAT_WORD_BUDGETS[beat]
  return words >= b.min && words <= b.max
}
