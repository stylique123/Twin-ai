// A PRODUCT WITH NO LINK, FOUND ON THE WEB — BUT ONLY ON A PAGE GOOGLE RETURNED
// AND ONLY WHEN THAT PAGE NAMES EVERY WORD OF HER PRODUCT.
//
// Fixtures are shaped like Gemini's documented grounding response
// (candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}); the build
// container cannot reach the live API, and this says so rather than pretending.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProductOnWeb, urlInSources, webNameMatch, readSearchAnswer, MIN_WEB_NAME_MATCH } from '../productWebSearch.js'
import { readGroundedResponse, type GroundedAnswer } from '../productWebSearch.js'

const PAGE = (title: string) => `TITLE: ${title}\nDESCRIPTION: ${'A soft cotton bandana that slips over the collar. '.repeat(3)}`
const SOURCES = [
  { uri: 'https://thedogdaysco.com/products/reversible-scrunchie-bandana', title: 'thedogdaysco.com' },
  { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'etsy.com' },
]
const answer = (text: string, sources = SOURCES): GroundedAnswer => ({ text, sources })
const search = (a: GroundedAnswer) => async () => a
const pages = (map: Record<string, string>) => async (u: string) => map[u] ?? null

describe('URL acceptance', () => {
  it('accepts a URL that is one of the grounding sources', () => {
    expect(urlInSources('https://thedogdaysco.com/products/reversible-scrunchie-bandana/', SOURCES)).toBe(true)
  })
  it('accepts a URL whose host is a source domain (Google redirects carry the domain as title)', () => {
    expect(urlInSources('https://www.etsy.com/listing/123/reversible-scrunchie-bandana', SOURCES)).toBe(true)
  })
  it('refuses a model-invented URL that Google never returned', () => {
    expect(urlInSources('https://made-up-shop.com/products/reversible-scrunchie-bandana', SOURCES)).toBe(false)
  })
  it('refuses non-https', () => {
    expect(urlInSources('http://thedogdaysco.com/products/reversible-scrunchie-bandana', SOURCES)).toBe(false)
  })
  it('requires every word of the name in the page title', () => {
    expect(MIN_WEB_NAME_MATCH).toBe(1)
    expect(webNameMatch('Reversible Scrunchie Bandana', 'Reversible Scrunchie Bandanas – Plaid | Dog Days')).toBe(1)
    expect(webNameMatch('Reversible Scrunchie Bandana', 'Scrunchie Bandana Mystery Packs')).toBeLessThan(1)
  })
  it('reads the answer JSON out of prose, and nothing out of garbage', () => {
    expect(readSearchAnswer('Here: ```json\n{"url":"https://a.com/p","confidence":"High"}\n```')).toEqual({ url: 'https://a.com/p', confidence: 'high' })
    expect(readSearchAnswer('no idea')).toBeNull()
    expect(readSearchAnswer('{"url":"","confidence":"low"}')).toBeNull()
  })
  it('reads grounding sources off a generateContent response', () => {
    const r = readGroundedResponse({ candidates: [{ content: { parts: [{ text: '{"url":"x"}' }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a.com/p', title: 'a.com' } }, { retrievedContext: {} }] } }] })
    // 2026-09-24: the search queries are now read too (tells no-search from no-result).
    expect(r).toEqual({ text: '{"url":"x"}', sources: [{ uri: 'https://a.com/p', title: 'a.com' }], queries: [] })
    expect(readGroundedResponse(null)).toEqual({ text: '', sources: [], queries: [] })
  })
})

describe('findProductOnWeb', () => {
  const url = 'https://thedogdaysco.com/products/reversible-scrunchie-bandana'

  it('matches: in the sources, and the page names every word', async () => {
    const out = await findProductOnWeb({
      productName: 'Reversible Scrunchie Bandana', brandName: 'Dog Days',
      search: search(answer(`{"url":"${url}","confidence":"high"}`)),
      fetchPage: pages({ [url]: PAGE('Reversible Scrunchie Bandana – Dog Days') }),
    })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.match).toMatchObject({ url, host: 'thedogdaysco.com', confidence: 'high' })
  })

  it('puts the brand in the query', async () => {
    let asked = ''
    await findProductOnWeb({ productName: 'Scrunchie', brandName: 'Dog Days',
      search: async (_s, p) => { asked = p; return answer('') }, fetchPage: pages({}) })
    expect(asked).toBe('Product: Scrunchie Dog Days')
  })

  // ── NO MATCH → the caller keeps the old fallback ─────────────────────────
  it.each([
    ['not_in_sources', answer('{"url":"https://invented.com/products/reversible-scrunchie-bandana","confidence":"high"}'), PAGE('Reversible Scrunchie Bandana')],
    ['name_mismatch', answer(`{"url":"${url}","confidence":"high"}`), PAGE('Scrunchie Bandana Mystery Packs')],
    ['low_confidence', answer(`{"url":"${url}","confidence":"low"}`), PAGE('Reversible Scrunchie Bandana')],
    ['no_answer', answer('I could not find it.'), PAGE('Reversible Scrunchie Bandana')],
    ['unreadable', answer(`{"url":"${url}","confidence":"medium"}`), ''],
  ])('refuses: %s', async (reason, a, page) => {
    const out = await findProductOnWeb({
      productName: 'Reversible Scrunchie Bandana', search: search(a),
      fetchPage: async (u) => (page === '' ? null : (u.startsWith('https://') ? page : null)),
    })
    expect(out).toMatchObject({ ok: false, reason })
  })

  it('a failed search (quota, timeout) degrades to no match, never throws', async () => {
    const out = await findProductOnWeb({ productName: 'Bandana',
      search: async () => { throw new Error('Gemini quota daily — stop') }, fetchPage: pages({}) })
    expect(out).toMatchObject({ ok: false, reason: 'search_failed' })
  })

  it('no name, no search', async () => {
    let called = false
    const out = await findProductOnWeb({ productName: '  ', search: async () => { called = true; return answer('') }, fetchPage: pages({}) })
    expect(out).toMatchObject({ ok: false, reason: 'no_name' })
    expect(called).toBe(false)
  })
})

describe('extractProduct wiring (source anchors)', () => {
  const src = readFileSync(join(__dirname, '..', 'jobs', 'extractProduct.ts'), 'utf8')
  it('runs only with no url and no images (or after a shop miss), and marks facts web_search', () => {
    expect(src).toMatch(/imagePaths\.length === 0 && \(\(!url && webSearchAsked\) \|\| shopMissed\)/)
    expect(src).toMatch(/webMatch \? 'web_search' : sourceFor/)
  })
  it('logs both outcomes and never rethrows from the search', () => {
    expect(src).toContain("event: 'product_found_on_web'")
    expect(src).toContain("event: 'product_web_search_no_match'")
    expect(src).toMatch(/async function searchWebForProduct[\s\S]*catch \(e\)[\s\S]*return null/)
  })
  it('uses the grounded Google Search tool, not a model-only guess', () => {
    const g = readFileSync(join(__dirname, '..', 'gemini.ts'), 'utf8')
    expect(g).toContain('tools: [{ google_search: {} }]')
  })
})
