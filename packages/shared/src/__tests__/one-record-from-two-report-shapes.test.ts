// A CALLER THAT BRANCHES ON REPORT SHAPE IS A CALLER ABOUT TO GET IT WRONG.
//
// ⚠️ THE PROPERTY THAT MATTERS IS THE `not_run` ONE. `generate-blueprint` now
// picks between `validateScript` and `validateWhatWeCan` depending on whether
// the resolver produced slots, and stores the result either way. If `outcomeOf`
// reported an empty `notRun` for BOTH shapes, the stored record could no longer
// distinguish "both checks ran and passed" from "both checks were never asked" —
// which is the exact confusion the `not_run` state was introduced to prevent.
import { describe, it, expect } from 'vitest'
import { outcomeOf, type ScriptReport, type PartialReport } from '../scriptValidator'

const full: ScriptReport = {
  checks: [
    { code: 'goal_visible', passed: true },
    { code: 'all_slots_filled', passed: false, detail: '2 part(s) were never filled in.' },
  ],
  failed: [{ code: 'all_slots_filled', passed: false, detail: '2 part(s) were never filled in.' }],
  blocked: true,
}

const partial: PartialReport = {
  checks: [
    { code: 'goal_visible', state: 'pass' },
    { code: 'all_slots_filled', state: 'not_run', needs: 'resolved slots' },
    { code: 'no_unsupported_claim', state: 'not_run', needs: 'resolved slots' },
  ],
  failed: [],
  notRun: ['all_slots_filled', 'no_unsupported_claim'],
  blocked: false,
}

describe('outcomeOf', () => {
  it('reports an EMPTY notRun for a full report — an assertion, not a default', () => {
    expect(outcomeOf(full).notRun).toEqual([])
  })

  it('carries the partial report’s notRun through unchanged', () => {
    expect(outcomeOf(partial).notRun).toEqual(['all_slots_filled', 'no_unsupported_claim'])
  })

  it('counts only passes, and does not count a not_run as one', () => {
    // ⚠️ Silence is not a pass. Three checks, one passed.
    expect(outcomeOf(partial).passed).toBe(1)
    expect(outcomeOf(full).passed).toBe(1)
  })

  it('preserves blocked from each shape — a partial report never blocks', () => {
    expect(outcomeOf(full).blocked).toBe(true)
    expect(outcomeOf(partial).blocked).toBe(false)
  })

  it('normalises a missing detail to null rather than dropping the code', () => {
    const r: ScriptReport = {
      checks: [{ code: 'goal_visible', passed: false }],
      failed: [{ code: 'goal_visible', passed: false }],
      blocked: true,
    }
    expect(outcomeOf(r).failed).toEqual([{ code: 'goal_visible', detail: null }])
  })

  it('renders both shapes into the SAME key set, so one store can hold either', () => {
    expect(Object.keys(outcomeOf(full)).sort()).toEqual(Object.keys(outcomeOf(partial)).sort())
  })
})
