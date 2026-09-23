// ⚠️ OWNER REPORT: "bandanas, collars, bows, and mystery packs" was one guess with
// only accept/deny. It must be splittable into one entry per item.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitProductList } from '../productSplit'

describe('splitProductList', () => {
  it('splits the reported guess into four products', () => {
    expect(splitProductList('bandanas, collars, bows, and mystery packs'))
      .toEqual(['bandanas', 'collars', 'bows', 'mystery packs'])
  })

  it.each(['candles & wax melts', 'Presets + LUTs', 'courses / templates'])('splits %s', (t) => {
    expect(splitProductList(t)).toHaveLength(2)
  })

  it.each([
    'Fresh artisan sourdough loaves baked daily and shipped via link in bio',
    'Online coaching',
    '',
    null,
    'Postpartum & pregnancy-safe workout programs that we build for moms',
  ])('does not split prose or a single item: %s', (t) => {
    expect(splitProductList(t)).toEqual([])
  })
})

describe('the onboarding guess offers the split and saves one entry per item', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const ONB = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')
  it('offers "These are separate products" beside accept/deny', () => {
    expect(ONB).toContain('These are separate products')
    expect(ONB).toMatch(/setSplitItems\(splitProductList\(product\)\)/)
  })
  it('mints the first item and claims each remaining item', () => {
    expect(ONB).toMatch(/name: items \? items\[0\]/)
    expect(ONB).toMatch(/for \(const name of items\.slice\(1\)\)[\s\S]{0,120}claimProductEntity\(/)
  })
})
