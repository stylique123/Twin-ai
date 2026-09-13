// A POOLED AVERAGE OVER A POPULATION OF SINGLETONS IS NOT EVIDENCE ABOUT A COLUMN.
//
// ⚠️ THE CLAIM THIS TEST PINS WAS WRONG IN THE CODE FOR THREE DAYS. `cohort.ts`
// concluded that `gallery_items.reach` is AUDIENCE SIZE rather than per-video
// views, from the statistic "40.6% of a creator's cards share one identical
// value". The statistic is real. The inference is not: it pools 3,309 creators
// who have exactly ONE card, and a single card is trivially its own modal value.
//
// Re-measured 2026-09-13, stratified by how many cards a creator actually has:
//
//     cards per creator   creators   % of cards at the modal value
//     1                      3,309      100.0   (true by definition)
//     2-4                      532       44.7
//     5-9                      100       19.0
//     10-29                     35       10.8
//     30+                        2        7.8
//
// The distinct-value ratio is 0.94-1.00 in EVERY band. If reach were audience
// size, one creator's cards would carry ONE value and that ratio would be ~1/n.
//
// ⚖️ AND `relativePerformance.ts` HAD SAID PER-VIDEO ALL ALONG. Two modules in
// one directory asserted opposite things about one column, and the wrong one was
// the justification for a product decision. The decision (no lift in the block)
// survives on a different and correct reason: the corpus is too shallow, not the
// column wrong.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'corpus')
const read = (f: string) => readFileSync(resolve(CORPUS, f), 'utf8')

describe('no module claims reach is audience size', () => {
  it('cohort.ts never ASSERTS it — every mention is a retraction', () => {
    // ⚠️ THE FIRST DRAFT OF THIS TEST FAILED ON THE CORRECTED FILE, and it was
    // the test that was wrong. It banned the phrase outright, which also bans
    // quoting the mistake in order to retract it — and a correction that cannot
    // name what it corrects leaves the next reader free to re-derive it. This
    // is the mention-versus-assertion hazard the repo already knows in its
    // grep-a-guard form.
    //
    // ⚖️ SO THE PROPERTY IS: the phrase may appear, but only inside a passage
    // that marks it as wrong.
    const c = read('cohort.ts')
    const mentions = [...c.matchAll(/AUDIENCE SIZE/gi)]
    expect(mentions.length).toBeGreaterThan(0) // the retraction is still there
    for (const m of mentions) {
      const before = c.slice(Math.max(0, m.index! - 400), m.index!)
      expect(before).toMatch(/WAS WRONG|was not|replaces|first explanation/i)
    }
    // And the asserting sentence form is gone outright.
    expect(c).not.toMatch(/So `reach` is AUDIENCE SIZE/)
    expect(c).not.toMatch(/only performance column available is audience size/i)
  })

  it('and the measurement that replaced it is written down, stratified', () => {
    // Without the strata the corrected claim is just a different bare
    // assertion, and the next reader has no way to tell which is right.
    const c = read('cohort.ts')
    expect(c).toMatch(/3,309/)
    expect(c).toMatch(/per-video views/)
    expect(c).toMatch(/48\.8%/)
  })

  it('relativePerformance.ts still states per-video, and records the disagreement', () => {
    const r = read('relativePerformance.ts')
    expect(r).toMatch(/genuinely PER-VIDEO/)
    expect(r).toMatch(/disagreed/i)
  })
})

describe('the decision did not move when its reason did', () => {
  it('the block still carries no lift, and the count gates are still there', () => {
    const c = read('cohort.ts')
    const code = c.split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')
        && !l.trim().startsWith('/*')).join('\n')
    // ⚠️ THE RISK OF CORRECTING THE REASON IS RE-ADDING THE THING IT JUSTIFIED.
    // "reach is fine after all" is one short step from "so put the lift back",
    // and the lift is still degenerate for a different reason.
    expect(code).not.toMatch(/MIN_MEDIAN_LIFT/)
    expect(code).not.toMatch(/top\.medianLift\s*[<>]/)
    expect(code).toMatch(/top\.n\s*<\s*MIN_COHORT/)
    expect(code).toMatch(/read\.decisive/)
  })

  it('and the new reason is corpus depth, stated as such', () => {
    expect(read('cohort.ts')).toMatch(/DEPTH problem|depth/i)
  })
})
