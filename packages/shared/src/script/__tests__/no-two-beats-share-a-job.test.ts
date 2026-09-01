import { describe, it, expect } from 'vitest'
import { syncRetentionMapToScript } from '../retentionMapSync.js'

/**
 * ⚠️ REPORTED ACROSS PRODUCTION RUNS H, I AND J. Every middle beat read
 * 'Add a reason to keep watching before attention drifts.' — one sentence,
 * repeated, because the old rule returned it for the whole first 60% of the
 * script. A creator reading row three learned nothing they had not read in
 * row two.
 */
const beats = (n: number, section = 'Body') =>
  Array.from({ length: n }, (_, i) => ({ section: `${section} ${i + 1}`, line: `Line ${i + 1}` }))

describe('no two adjacent beats are given the same job', () => {
  for (const n of [4, 5, 6, 7, 8, 9, 12]) {
    it(`holds for a ${n}-beat script`, () => {
      const rows = syncRetentionMapToScript([], beats(n)).retentionMap
      expect(rows).toHaveLength(n)
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.goal).not.toBe(rows[i - 1]!.goal)
      }
    })
  }

  it('the repeated sentence is gone entirely', () => {
    const rows = syncRetentionMapToScript([], beats(7)).retentionMap
    const goals = rows.map((r) => r.goal)
    expect(goals.join(' | ')).not.toMatch(/Add a reason to keep watching before attention drifts/)
  })

  it('the first and last beats still name their own jobs', () => {
    const rows = syncRetentionMapToScript([], beats(6)).retentionMap
    expect(rows[0]!.goal).toMatch(/Earn the next three seconds/)
    expect(rows[5]!.goal).toMatch(/Land the ask/)
  })

  it('a re-hook reads its job from the beat, not from its position', () => {
    const script = [
      { section: 'Hook', line: 'a' },
      { section: 'Body', line: 'b' },
      { section: 'Re-hook', line: 'c' },
      { section: 'CTA', line: 'd' },
    ]
    const rows = syncRetentionMapToScript([], script).retentionMap
    expect(rows[2]!.goal).toMatch(/Reset attention/)
  })

  it('a one-beat script is not given a middle', () => {
    const rows = syncRetentionMapToScript([], beats(1)).retentionMap
    expect(rows[0]!.goal).toMatch(/Carry the whole idea in one beat/)
  })
})
