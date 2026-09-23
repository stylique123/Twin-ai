import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSiteButton, withoutSiteButtons, labelUnlabeledPrices } from '../pageFactHygiene.js'

describe('site buttons never become a spoken CTA (reported 2026-09-23)', () => {
  it.each(['View cart', 'View cart (0)', 'Check out', 'Check out now', 'Continue shopping', 'SHOP HERE', 'SHOP HERE →'])(
    '%s is a site button', (v) => expect(isSiteButton(v)).toBe(true))

  it.each(['Comment BANDANA and I will send the link', 'Link in bio', 'Pre-order before Friday'])(
    '%s is a real CTA and is kept', (v) => expect(isSiteButton(v)).toBe(false))

  it('a page with only cart buttons stores no cta at all', () => {
    const { kept, dropped } = withoutSiteButtons([
      { field: 'cta', value: 'View cart' }, { field: 'cta', value: 'Check out' },
      { field: 'name', value: 'Reversible Scrunchie Bandana' },
    ])
    expect(dropped).toBe(2)
    expect(kept.map((f) => f.field)).toEqual(['name'])
  })

  it('the worker list matches the shared classifier list (worker cannot import it)', () => {
    const shared = readFileSync(join(__dirname, '../../../packages/shared/src/factPlacement.ts'), 'utf8')
    const mine = readFileSync(join(__dirname, '../pageFactHygiene.ts'), 'utf8')
    const body = (s: string) => s.slice(s.indexOf("'^(?:'"), s.indexOf("  'i',", s.indexOf("'^(?:'")))
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(body(mine)).toBe(body(shared))
  })
})

describe('several bare prices are marked as unlabeled options', () => {
  it('labels each of three bare prices', () => {
    const out = labelUnlabeledPrices([
      { field: 'price', value: '$28' }, { field: 'price', value: '$13' }, { field: 'price', value: '$35.00' },
      { field: 'name', value: 'Bandana' },
    ])
    expect(out.filter((f) => f.field === 'price').every((f) => /one of 3 prices/.test(f.value))).toBe(true)
    expect(out[3].value).toBe('Bandana')
  })

  it('leaves a single price and labelled prices alone', () => {
    expect(labelUnlabeledPrices([{ field: 'price', value: '$28' }])[0].value).toBe('$28')
    const labelled = [{ field: 'price', value: 'Small — $28' }, { field: 'price', value: 'Large — $35' }]
    expect(labelUnlabeledPrices(labelled)).toEqual(labelled)
  })

  it('is wired into the extractor', () => {
    const src = readFileSync(join(__dirname, '../jobs/extractProduct.ts'), 'utf8')
    expect(src).toMatch(/labelUnlabeledPrices\(withoutSiteButtons\(/)
  })
})
