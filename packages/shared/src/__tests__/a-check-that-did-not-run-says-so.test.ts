// A CHECK THAT VANISHED FROM A REPORT LOOKS EXACTLY LIKE ONE THAT PASSED.
//
// ⚠️ `generate-blueprint` HAS NO PER-SLOT RESOLUTIONS. It hands the container's
// beats to the model as prose and lets it fill them from a knowledge block, so
// there is no record of what was supplied for each beat. Two of the nine checks
// compare the script against exactly that record.
//
// ⚖️ THE TEMPTING SHORTCUT IS TO PASS AN EMPTY CONTENT LIST. It type-checks, it
// runs, and it reports "0 slots empty, no opinion asserted" — two confident
// passes on questions nobody asked. These tests exist to make that impossible to
// do by accident.
import { describe, it, expect } from 'vitest'
import {
  validateScript, validateWhatWeCan, SCRIPT_CHECKS, CHECKS_NEEDING_SLOTS, CHECK_STATES,
} from '../scriptValidator'
import { blankPlan } from '../creativeDecisionPlan'
import type { WriterInput } from '../writerInput'

const plan = () => ({ ...blankPlan('educate'), audienceLevel: null, cta: null })
const GOOD = 'Here is how it works. You open the app and pick a video. That is the whole step.'

describe('the partial report is honest about its own coverage', () => {
  it('reports every check, run or not', () => {
    const r = validateWhatWeCan(GOOD, plan())
    expect(r.checks.map((c) => c.code)).toEqual([...SCRIPT_CHECKS])
  })

  it('the two content checks come back not_run, never passed', () => {
    const r = validateWhatWeCan(GOOD, plan())
    for (const code of CHECKS_NEEDING_SLOTS) {
      const c = r.checks.find((x) => x.code === code)!
      expect(c.state).toBe('not_run')
      expect(c.state === 'not_run' && (c.needs ?? '').length).toBeGreaterThan(10)
    }
    expect([...r.notRun].sort()).toEqual([...CHECKS_NEEDING_SLOTS].sort())
  })

  // ⚠️ A PARTIAL REPORT MAY NEVER GATE. It cannot see the content half of the
  // contract, so reading its silence as approval is the exact mistake `not_run`
  // exists to prevent.
  it('never blocks, whatever it finds', () => {
    const bad = validateWhatWeCan('[Product Name] is great.', plan())
    expect(bad.failed.length).toBeGreaterThan(0)
    expect(bad.blocked).toBe(false)
  })

  it('there are exactly three states', () => {
    expect(CHECK_STATES).toEqual(['pass', 'fail', 'not_run'])
  })
})

describe('one implementation, two entry points', () => {
  // ⚖️ A SECOND COPY FOR THE PARTIAL CALLER WOULD BE FREE TO DRIFT, and two
  // implementations of the same question eventually disagree about the answer.
  const full = (extra: Partial<WriterInput> = {}) => ({
    creatorStyle: {} as never,
    audience: { segment: null, level: null, rules: [] },
    decisionPlan: plan(),
    content: [{ label: 'a', purpose: 'p', content: 'something real', classification: 'user_confirmed' as const, attribution: 'the library' }],
    referenceStructure: { container: 'listicle' as never, beats: [] },
    ...extra,
  })

  it('the seven shared checks agree between full and partial', () => {
    for (const script of [GOOD, '[Product Name] is great.', 'We built this to solve that.']) {
      const f = validateScript(script, full())
      const p = validateWhatWeCan(script, plan())
      for (const code of SCRIPT_CHECKS) {
        if (CHECKS_NEEDING_SLOTS.has(code)) continue
        const fc = f.checks.find((c) => c.code === code)!
        const pc = p.checks.find((c) => c.code === code)!
        expect(pc.state).toBe(fc.passed ? 'pass' : 'fail')
      }
    }
  })

  it('the full report still gates, because it can see everything', () => {
    const r = validateScript('[Product Name] is great.', full())
    expect(r.blocked).toBe(true)
  })

  it('and the full report still catches an unfilled slot', () => {
    const r = validateScript(GOOD, full({
      content: [{ label: 'a', purpose: 'p', content: '   ', classification: 'user_confirmed', attribution: null }],
    }))
    expect(r.failed.map((c) => c.code)).toContain('all_slots_filled')
  })
})
