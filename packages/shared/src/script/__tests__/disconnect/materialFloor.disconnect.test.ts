// DISCONNECT TEST, ledger row 5: MATERIAL_FLOOR (#1271).
// Fictional fixture only: ids and flags, made-up text. No model call.
import { describe, it, expect } from 'vitest'
import { applyMaterialFloor, materialFloorOn } from '../../materialFloor'
import { EDGE } from './edge'

const own = (id: string, text: string) => ({ id, text, source: 'asked', basis: 'stated', sensitive: false, creator_excluded_at: null, source_ref: `asked:x:${id}` })
// The purpose / ask filters left nothing; these are her own stated answers.
const candidates = [own('a1', 'I fold every Harbor Tote by hand.'), own('a2', 'The canvas is waxed twice.')]

/** The edge block (index.ts ~8085): the floor runs on the kept rows with the gate from MATERIAL_FLOOR_ENABLED. */
const knowledgeFor = (flag: string | undefined, trialOn = true) =>
  applyMaterialFloor([], candidates, new Set<string>(), materialFloorOn(trialOn, flag))

describe('MATERIAL_FLOOR disconnect', () => {
  it('on: her own answers come back to the writer; MATERIAL_FLOOR_ENABLED=false: the writer gets nothing', () => {
    const on = knowledgeFor(undefined)
    const off = knowledgeFor('false')
    expect(on).not.toEqual(off)
    expect(on.restored).toBe(2)
    expect(on.rows.map((r) => r.id)).toEqual(['a1', 'a2'])
    expect(off).toEqual({ rows: [], restored: 0 })
  })
  it('off for a real creator (no trial) even with the flag on', () => {
    expect(knowledgeFor('true', false)).toEqual({ rows: [], restored: 0 })
  })
  it('the edge still calls the floor with the kill switch', () => {
    expect(EDGE).toMatch(/const floor = applyMaterialFloor\([\s\S]{0,400}materialFloorOn\(trialOn, Deno\.env\.get\('MATERIAL_FLOOR_ENABLED'\)\)/)
    expect(EDGE).toContain('knowledgeRows.splice(0, knowledgeRows.length, ...floor.rows)')
  })
})
