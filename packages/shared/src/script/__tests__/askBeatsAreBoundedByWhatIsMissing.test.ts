// ITEMS 30 + 31: asks are bounded by genuinely missing REQUIRED material, never
// by scene count; skipped optional fields never become asks.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boundAskBeats, MAX_ASK_BEATS, type BoundableBeat } from '../beatAsk'

const ask = (reason: string, i: number, scaffold?: string): BoundableBeat => ({
  line: '', substance: 'needs_user', ask_reason: reason,
  ask: `What happened the ${i}th time you tried the morning routine at home?`,
  ...(scaffold ? { line_scaffold: scaffold } : {}),
})
const said = (t: string): BoundableBeat => ({ line: t, substance: 'general' })

describe('item 31: the count does not scale with length', () => {
  for (const scenes of [3, 6, 9, 14]) {
    it(`${scenes} scenes, every one missing a personal fact → at most ${MAX_ASK_BEATS} asks`, () => {
      const beats = Array.from({ length: scenes }, (_, i) => ask('personal_fact', i + 1))
      const r = boundAskBeats(beats)
      expect(r.kept).toBe(Math.min(scenes, MAX_ASK_BEATS))
      expect(r.beats.filter((b) => b.substance === 'needs_user')).toHaveLength(Math.min(scenes, MAX_ASK_BEATS))
    })
  }
  it('a script with nothing missing carries no asks', () => {
    const r = boundAskBeats([said('a'), said('b'), said('c')])
    expect(r).toMatchObject({ kept: 0, writtenAround: 0, omitted: 0 })
  })
  it('asks beyond the cap are written around when the scaffold stands alone', () => {
    const beats = [ask('personal_fact', 1), ask('personal_fact', 2),
      ask('personal_fact', 3, 'The first week was {answer}, and that changed everything.')]
    const r = boundAskBeats(beats)
    expect(r.kept).toBe(2)
    expect(r.writtenAround + r.omitted).toBe(1)
    expect(r.beats.every((b) => !('ask_reason' in b))).toBe(true)
  })
})

describe('item 30: skipped optional material never becomes an ask', () => {
  it('product-detail asks are removed even under the cap', () => {
    const r = boundAskBeats([said('hook'), ask('product_detail', 1), said('cta')])
    expect(r.kept).toBe(0)
    expect(r.beats.some((b) => b.substance === 'needs_user')).toBe(false)
  })
  it('the writer wires every escalation site with a reason and bounds before shipping', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
    for (const r of ['personal_fact', 'reference_overlap', 'placeholder', 'product_detail']) {
      expect(src).toContain(`ask_reason = '${r}'`)
    }
    expect(src).toMatch(/const bound = boundAskBeats\(declared as never\)/)
    expect(src).toMatch(/AT MOST 2 beats in the whole script may be needs_user/)
  })
})
