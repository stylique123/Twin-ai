import { describe, expect, it } from 'vitest'
import { applyMaterialFloor, floorEligible, materialFloorOn } from '../script/materialFloor'

// Fictional fixtures only: ids and flags, no creator text.
const own = (id: string, extra: Record<string, unknown> = {}) => ({ id, source: 'asked', basis: 'stated', sensitive: false, creator_excluded_at: null, source_ref: `asked:x:${id}`, ...extra })
const none = new Set<string>()

describe('materialFloorOn', () => {
  it('needs the trial and the kill switch', () => {
    expect(materialFloorOn(true, 'true')).toBe(true)
    expect(materialFloorOn(true, undefined)).toBe(false)
    expect(materialFloorOn(true, 'false')).toBe(false)
    expect(materialFloorOn(false, 'true')).toBe(false)
  })
})

describe('applyMaterialFloor', () => {
  it('off: changes nothing even when empty (real creators)', () => {
    expect(applyMaterialFloor([], [own('a')], none, false)).toEqual({ rows: [], restored: 0 })
  })
  it('on but the filters kept something: unchanged', () => {
    const kept = [own('a')]
    expect(applyMaterialFloor(kept, [own('a'), own('b')], none, true).rows).toEqual(kept)
  })
  it('on and empty: restores her own stated answers, deduped', () => {
    const r = applyMaterialFloor([], [own('a'), own('a'), own('b')], none, true)
    expect(r.restored).toBe(2)
    expect(r.rows.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('never restores a guarded row', () => {
    const rows = [
      own('s', { sensitive: true }),
      own('i', { basis: 'inferred' }),
      own('x', { creator_excluded_at: '2026-01-01' }),
      own('h', { source_ref: 'asked:hold:h' }),
      own('e'),
      own('c', { source: 'caption' }),
      own('t', { source: 'transcript' }),
    ]
    expect(applyMaterialFloor([], rows, new Set(['e']), true).rows).toEqual([])
  })
  it('accepts a reply', () => {
    expect(floorEligible(own('r', { source: 'reply' }), none)).toBe(true)
  })
})
