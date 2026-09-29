// Audit 2026-09-29 batch 4: one decider per value on the "before I write this" screens.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const B = readFileSync(resolve(__dirname, 'V2Building.tsx'), 'utf8')

describe('#12 the purpose she picked does not revert', () => {
  it('her pick is kept by the idea itself, and wins over the guess', () => {
    expect(B).toMatch(/twin\.purposeFor\./)
    const at = B.indexOf('const hers = pickedFor(')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(B.indexOf("answer('video_goal', guess.value, true)"))
  })
  it("only her own change of objective drops the old objective's answers", () => {
    expect(B).toMatch(/const switched = !auto && field === 'video_goal'/)
    expect(B).toMatch(/answer\('video_goal', standingGoal, true\)/)
    expect(B).toMatch(/answer\('video_goal', state\.goal, true\)/)
  })
})

describe('#17 one clock decides "Twin stopped waiting"', () => {
  it('the hard timeout stands down while the rescue poll runs', () => {
    const at = B.indexOf('const t2 = setTimeout(')
    expect(B.slice(at, at + 600)).toMatch(/if \(rescuingRef\.current\) return/)
  })
})
