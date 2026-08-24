// THE WARNING IS ASKED BEFORE THE MONEY, OR IT IS AN APOLOGY.
//
// ⚠️ THE REQUIREMENT, IN THE OWNER'S WORDS: "make sure it doesn't analyse till
// 100 then say sorry". This page is the paid path, so the ordering here is not a
// nicety — a gate that fires after the spend has already failed at its only job.
//
// ⚖️ AND IT IS THE CREATOR'S DECISION, NOT TWIN'S. Unlike the `unusableRef`
// refusal alongside it, this one may only warn: Twin agreed with a human on 73%
// of the visual claims it was judged on, and something wrong about one video in
// four must not be able to stop anybody.
//
// Source-scraped rather than rendered, matching this directory's idiom.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

/** ⚠️ A GUARD THAT READS SOURCE CANNOT TELL CODE FROM A QUOTATION OF CODE. The
 *  comments in this page argue ABOUT spending and about `unsure`, so a raw scan
 *  would match the reasoning rather than the behaviour. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('the question is asked before anything is spent', () => {
  it('reads the early answer inside the poll, not after it', () => {
    const early = CODE.indexOf('job.result?.early_look')
    const spend = CODE.indexOf('startPacing()')
    expect(early).toBeGreaterThan(-1)
    expect(spend).toBeGreaterThan(-1)
    // ⚠️ THE ORDER IS THE ASSERTION. startPacing() is the point of no return —
    // everything after it is a build the creator will be charged for.
    expect(early).toBeLessThan(spend)
  })

  it('waits for the creator rather than racing past them', () => {
    expect(CODE).toContain('gateResolve.current = resolve')
    expect(CODE).toContain("await new Promise<'used_anyway' | 'picked_another'>")
  })

  it('taking the advice returns without spending', () => {
    const branch = CODE.indexOf("choice === 'picked_another'")
    expect(branch).toBeGreaterThan(-1)
    const after = CODE.slice(branch, branch + 260)
    expect(after).toContain('return')
    expect(after).not.toContain('startPacing')
  })
})

describe('Twin may warn, never refuse', () => {
  // ⚠️ THE CARD COMES FROM warningForPickedVideo, WHICH RETURNS null FOR
  // ANYTHING BUT does_not_fit. Branching on the verdict here instead would let a
  // future edit warn on `unsure` — Twin's own ignorance — which is the failure
  // mode that makes people stop reading warnings.
  it('shows the card only when the shared rules produce one', () => {
    expect(CODE).toContain('warningForPickedVideo(decision)')
    expect(CODE).toContain('if (warn) {')
    expect(CODE).not.toContain("decision.verdict === 'unsure'")
    expect(CODE).not.toContain("decision.verdict === 'does_not_fit'")
  })

  it('never halts or refuses on the gate’s account', () => {
    const branch = CODE.indexOf("choice === 'picked_another'")
    const after = CODE.slice(branch, branch + 260)
    // halt() and setUnusableRef() are the REFUSAL paths that belong to the other
    // check. The gate must reach neither.
    expect(after).not.toContain('halt(')
    expect(after).not.toContain('setUnusableRef')
  })
})

describe('one decision makes one row', () => {
  // ⚠️ THE POLL RUNS UP TO 60 TIMES AND THE ANSWER SITS ON THE JOB ROW FOR ALL
  // OF THEM. Without the latch the card reappears every tick after it has been
  // answered, and each press writes another row into the only evidence we have.
  it('asks once per build', () => {
    expect(CODE).toContain('!gateAsked.current')
    expect(CODE).toContain('gateAsked.current = true')
  })

  it('records the choice before letting the flow resume', () => {
    const record = CODE.indexOf('await recordTalkingHeadChoice(')
    const resolve = CODE.indexOf('resolve?.(choice)')
    expect(record).toBeGreaterThan(-1)
    expect(resolve).toBeGreaterThan(record)
  })

  it('ignores a second press while the first is being recorded', () => {
    expect(CODE).toContain('if (gateBusy) return')
  })

  // ⚖️ BOTH CHOICES ARE RECORDED. Overrides alone have no denominator.
  it('records taking the advice as well as overriding it', () => {
    expect(CODE).toContain("answerGate('picked_another')")
    expect(CODE).toContain("answerGate('used_anyway')")
  })
})
