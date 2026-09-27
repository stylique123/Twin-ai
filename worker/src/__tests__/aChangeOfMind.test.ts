import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseShifts, shiftKnowledge } from '../nicheBrain/shiftsParse'

const ops = [
  { id: 'a', text: 'Never discount handmade work.', at: '2025-01-10T00:00:00Z' },
  { id: 'b', text: 'Glaze tests are a waste of time.', at: '2025-02-01T00:00:00Z' },
  { id: 'c', text: 'A small launch discount is fine for first buyers.', at: '2025-06-01T00:00:00Z' },
]

describe('a change of mind across time (24-ideas #8)', () => {
  it('keeps only real pairs 60+ days apart, later really later', () => {
    const out = parseShifts({ pairs: [
      { earlier: 0, later: 2, summary: 'She used to refuse discounts, now allows a small launch one.' },
      { earlier: 0, later: 1, summary: 'too close in time' },
      { earlier: 2, later: 0, summary: 'backwards' },
      { earlier: 9, later: 0, summary: 'no such index' },
    ] }, ops)
    expect(out.map((s) => `${s.earlier.id}>${s.later.id}`)).toEqual(['a>c'])
    expect(parseShifts(null, ops)).toEqual([])
  })
  it('a confirmed change becomes one line of her knowledge', () => {
    expect(shiftKnowledge({ earlier_text: 'x', later_text: 'y', summary: 'she used to X, now Y' })).toBe('Changed her mind: she used to X, now Y')
  })
  it('dates come from the post id, and only her yes is filed', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    const sql = readFileSync(join(repo, 'supabase/migrations/0244_when_she_said_it.sql'), 'utf8')
    expect(sql).toMatch(/4294967296/)
    expect(sql).toMatch(/1314220021721/)
    expect(sql).toMatch(/check \(later_at >= earlier_at \+ interval '60 days'\)/)
    expect(readFileSync(join(repo, 'worker/src/nicheBrain/shifts.ts'), 'utf8')).toMatch(/\.eq\('status', 'confirmed'\)/)
  })
})
