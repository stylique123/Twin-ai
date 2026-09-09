import { describe, it, expect } from 'vitest'

/**
 * TAKE THE SUBSTANCE AWAY AND THE MODEL WRITES MORE, NOT LESS.
 *
 * ⚠️ RUN 2026-09-08 ON THE WORKER VPS, `scripts/qa/borrowing-rerun.mjs
 * --samples 3`: four fixtures, two arms, three samples each. The arms differ in
 * exactly one respect — WITH puts the reference transcript in the prompt,
 * WITHOUT describes only its shape — and the harness aborts before any model
 * call unless the two prompts differ nowhere else.
 *
 * ⚖️ THIS IS FROZEN EVIDENCE, NOT A TARGET, and it is recorded here because it
 * was found by a run designed to measure something else entirely. The numbers
 * below are what was observed; nothing regenerates them.
 *
 * ⚠️⚠️ WHY IT MATTERS MORE THAN THE THING IT WAS LOOKING FOR. The expansion ban
 * was a design preference: "a script may not exceed the substance budget",
 * argued from twelve runs whose ratios ranged from 6.5x compression to 1.6x
 * expansion. This is the mechanism caught directly. Remove the material and the
 * model does not write less — it writes 64% MORE, filling the gap from nowhere.
 * That is one behaviour, not three separate hallucinations: it is the same
 * pressure that produced "a five thousand dollar oven", "$1.50 in ingredients"
 * and "a four-loaf licence limit", showing up here as length instead of
 * invented figures.
 *
 * ⚖️ AND IT EXPLAINS I2. The creator had nothing on file about cottage food
 * law, so the model had nothing to say — and it produced licence limits and a
 * state. Under this observation that is not a separate hallucination bug; it is
 * this expansion, expressed as content rather than as sentence count.
 */

/** Sentences per generated script, by run and sample. */
const WITH: Readonly<Record<string, readonly number[]>> = Object.freeze({
  a: Object.freeze([15, 13, 14]),
  b: Object.freeze([8, 9, 11]),
  c: Object.freeze([17, 14, 18]),
  d: Object.freeze([12, 10, 9]),
})
const WITHOUT: Readonly<Record<string, readonly number[]>> = Object.freeze({
  a: Object.freeze([14, 20, 15]),
  b: Object.freeze([27, 25, 24]),
  c: Object.freeze([17, 27, 28]),
  d: Object.freeze([17, 17, 15]),
})
const RUNS = ['a', 'b', 'c', 'd'] as const

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const all = (m: Readonly<Record<string, readonly number[]>>) => RUNS.flatMap((r) => [...m[r]])

describe('removing the reference transcript makes the script longer', () => {
  it('every run writes more without the material than with it', () => {
    for (const r of RUNS) expect(mean(WITHOUT[r])).toBeGreaterThan(mean(WITH[r]))
  })

  it('the overall rise is 64%', () => {
    expect(mean(all(WITH))).toBeCloseTo(12.5, 2)
    expect(mean(all(WITHOUT))).toBeCloseTo(20.5, 2)
    expect(mean(all(WITHOUT)) / mean(all(WITH))).toBeCloseTo(1.64, 2)
  })

  // ⚠️⚠️ THE CLAIM I FIRST MADE WAS WRONG AND IS RECORDED HERE SO IT CANNOT BE
  // REPEATED. I reported this as "twelve of twelve sample pairs, directionally
  // unanimous". It is not. Pairwise it is 10 up, 1 EQUAL (c1: 17 -> 17) and 1
  // DOWN (a1: 15 -> 14). The effect is real and every RUN rises by mean, but
  // "unanimous across twelve pairs" overstated the strength of it, and that
  // phrasing was already being reasoned from before the arithmetic was checked.
  it('is unanimous BY RUN and 10 of 12 BY PAIR — not 12 of 12', () => {
    const pairs = RUNS.flatMap((r) => WITH[r].map((w, i) => WITHOUT[r][i] - w))
    expect(pairs.filter((d) => d > 0)).toHaveLength(10)
    expect(pairs.filter((d) => d === 0)).toHaveLength(1)
    expect(pairs.filter((d) => d < 0)).toHaveLength(1)
  })

  // ⚖️ RUN B IS THE STRONGEST SINGLE CASE and also the negative control for
  // borrowing, which is what makes it interesting: it has the least to copy, so
  // it has the most to invent.
  it('run b nearly triples', () => {
    expect(mean(WITHOUT.b) / mean(WITH.b)).toBeCloseTo(2.71, 2)
  })
})

/**
 * WHAT THE SAME RUN DID **NOT** ESTABLISH, RECORDED SO NOBODY CLAIMS IT LATER.
 *
 * ⚠️ MEASUREMENT 2 — "did the borrowing fix reduce borrowing?" — IS NOT
 * ANSWERED BY THIS RUN. Every one of the 24 rows returned `high: 0`, in BOTH
 * arms, with longest runs of 1-4 content words against a threshold of 6.
 *
 * ⚠️⚠️ AND A FLOOR IN BOTH ARMS ATTRIBUTES NOTHING. The WITH arm IS the pre-fix
 * condition — the transcript is in the prompt — so it should have reproduced
 * run-D's frozen 17-content-word run. It produced 1 to 2. When the arm that is
 * supposed to show the old behaviour does not show it, the experiment cannot
 * credit the variable it changed.
 *
 * ⚖️ THE TELL IS THE SENTENCE COUNT. The frozen fixtures are 5-8 sentences; the
 * new generations are 8-28. The harness is not reproducing the generation that
 * made the fixtures, so the frozen columns are context — exactly as the script
 * itself warns — and not a baseline this run may be measured against.
 *
 * ⚖️ SETTLING IT PROPERLY means regenerating those four references through the
 * real `generate-blueprint` path and measuring that. DELIBERATELY DEFERRED: the
 * fix has held across twelve live runs including four cross-domain adaptations
 * with zero borrowing, which is stronger evidence than this harness would
 * produce, and the credits are better spent measuring the expansion ban once it
 * ships.
 */
describe('what the 2026-09-08 run did not establish', () => {
  it('records that both arms sat on the floor, which attributes nothing', () => {
    const HIGH_OVERLAP_ROWS = 0
    const TOTAL_ROWS = 24
    expect(HIGH_OVERLAP_ROWS).toBe(0)
    expect(TOTAL_ROWS).toBe(24)
  })

  // ⚠️ THE FROZEN FIXTURES AND THE NEW GENERATIONS ARE NOT THE SAME POPULATION.
  //
  // ⚠️⚠️ AND THIS ASSERTION WAS WRONG ON ITS FIRST RUN, WHICH IS WHY IT IS
  // WRITTEN THIS WAY. I claimed the ranges were cleanly separated — frozen max
  // BELOW the WITH minimum. They are not: frozen tops out at 8 (run c) and the
  // WITH arm bottoms out at 8 (run b, sample 1), so they touch. The population
  // difference is real but it is a difference of CENTRE, not of range, and
  // saying "the frozen scripts were 5-8 and these are 8-28" invited exactly the
  // stronger reading the arithmetic does not support.
  it('records the sentence-count gap that invalidates the comparison', () => {
    const FROZEN_SENTENCES = [7, 5, 8, 6]
    // Nearly double, even in the arm that is meant to reproduce them.
    expect(mean(all(WITH)) / mean(FROZEN_SENTENCES)).toBeCloseTo(1.92, 2)
    // The ranges OVERLAP at a single point. Recorded so nobody re-derives the
    // separation claim from the summary numbers.
    expect(Math.max(...FROZEN_SENTENCES)).toBe(Math.min(...all(WITH)))
  })
})

/**
 * THE SUCCESS CRITERION FOR THE EXPANSION BAN, STATED BEFORE IT IS BUILT.
 *
 * ⚖️ PRE-REGISTERED SO IT CANNOT BE CHOSEN AFTER THE FACT. Today, removing the
 * substance makes the script 64% LONGER. With the ban wired, the same paired
 * comparison must invert: the WITHOUT arm must come back SHORTER than the WITH
 * arm, or equal, and never longer.
 *
 * ⚠️ THIS IS DECIDABLE AND IT IS A MUTATION TEST. Re-run
 * `scripts/qa/borrowing-rerun.mjs --samples 3` after the ban ships and compare
 * `mean(WITHOUT) / mean(WITH)` against the 1.64 frozen above. A ratio at or
 * below 1.0 is the ban working. A ratio still above 1.0 means it is not wired
 * to the path that writes, whatever its unit tests say — which is the failure
 * this repo keeps finding and the one `check_symbol_readers` exists to catch.
 */
export const EXPANSION_RATIO_BEFORE_THE_BAN = 1.64
export const EXPANSION_RATIO_REQUIRED_AFTER = 1.0
