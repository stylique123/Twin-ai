// ⚠️ 2026-09-23: the shop had no product titled "Reversible Scrunchie Bandana"
// (it names bandanas by print). Refusing to guess was right; the creator must
// then be asked to pick from the closest ones, and a pick must read that page.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const PAGE = readFileSync(new URL('../pages/ProductLibrary.tsx', import.meta.url), 'utf8')
const API = readFileSync(new URL('../../../../packages/shared/src/api.ts', import.meta.url), 'utf8')
const JOB = readFileSync(new URL('../../../../worker/src/jobs/extractProduct.ts', import.meta.url), 'utf8')

describe('no exact match on her shop: ask, never guess', () => {
  it('the worker keeps the closest shop products and clears them on any match', () => {
    expect(JOB).toMatch(/lookup_candidates: found \? null : \{ source: 'shop'/)
  })
  it('the library asks "is it one of these?" and a pick reads that page', () => {
    expect(PAGE).toMatch(/Is it one of these\?/)
    expect(PAGE).toMatch(/save\(e\.id, \{ productUrl: c\.url \}\)\.then\(\(\) => learn\(e\.id, c\.url\)\)/)
    expect(PAGE).toMatch(/None of these/)
  })
  it('candidates load separately, so an unapplied migration never breaks the library', () => {
    expect(API).toMatch(/export async function loadLookupCandidates[\s\S]*?catch \{ return \{\} \}/)
  })
})
