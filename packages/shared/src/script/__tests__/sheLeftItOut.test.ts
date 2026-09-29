// Audit 2026-09-29 #3: a fact she tapped off stays off in later videos (0253).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultExcluded, planUseItems } from '../planUse.js'

const read = (p: string) => readFileSync(new URL(`../../../../../${p}`, import.meta.url), 'utf8')
const EDGE = read('supabase/functions/generate-blueprint/index.ts')
const MIG = read('supabase/migrations/0253_she_left_it_out.sql')
const BUILDING = read('apps/web/src/pages/v2/V2Building.tsx')

describe('what she left out stays out', () => {
  const rows = [
    { id: 'a', kind: 'story', text: 'I started roasting coffee in my garage', source: 'asked' },
    { id: 'b', kind: 'story', text: 'My coffee roasting mentor taught me patience', source: 'asked', creator_excluded_at: '2026-09-29T00:00:00Z' },
  ]
  const items = planUseItems(rows, 'a video about roasting coffee in my garage')
  it('shows a remembered fact switched off, with the reason', () => {
    const b = items.find((i) => i.id === 'b')!
    expect(b.leftOut).toBe(true)
    expect(b.defaultOff).toBe(true)
    expect(b.reason).toMatch(/left this out before/)
    expect(defaultExcluded(items)).toContain('b')
  })
  it('the writer view leaves remembered facts out', () => {
    expect(MIG).toMatch(/where not sensitive and creator_excluded_at is null/)
  })
  it('only her own taps are remembered, and switching on un-remembers', () => {
    expect(BUILDING).toMatch(/\.filter\(\(id\) => !defaults\.has\(id\)\)/)
    expect(BUILDING).toMatch(/excluded_by_her_ids: ids/)
    expect(EDGE).toMatch(/update\(\{ creator_excluded_at: new Date\(\)\.toISOString\(\) \}\)/)
    expect(EDGE).toMatch(/update\(\{ creator_excluded_at: null \}\)/)
    expect(EDGE.indexOf('const herOff')).toBeLessThan(EDGE.indexOf("rankedRead = await readKnowledge"))
  })
  it('the final guard also blocks remembered facts', () => {
    expect(EDGE).toMatch(/sensitive\.eq\.true,creator_excluded_at\.not\.is\.null/)
  })
})
