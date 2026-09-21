import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { harvestSections } from '../pageSections.js'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, '..', 'jobs', 'extractProduct.ts'), 'utf8')
const SECTIONS = readFileSync(join(__dirname, '..', 'pageSections.ts'), 'utf8')

/**
 * ⚠️⚠️ `page_section` COULD NEVER BE FILLED BY ANYONE.
 *
 * Measured 2026-09-21: across all 24 production product entities it is present
 * on ZERO — including three pages re-read that same day, which returned 23, 22
 * and 26 other facts each. The extraction worked; the field was unobtainable.
 *
 * `fetchPageText` reduces the page with `.replace(/<[^>]+>/g, ' ')`, so the
 * model receives a flat wall of prose. Its instruction says "name only what you
 * SAW" and "never report a section because a product of this kind usually has
 * one" — both correct — and a model shown no structure has correctly seen no
 * sections. A strict instruction plus a lossy fetch guaranteed a permanent
 * blank, which is the same class as the NOT OBSERVED rows deleted in #955.
 *
 * ⚖️ A HEADING IS EVIDENCE. `<h2>Pricing</h2>` is the page naming its own
 * section in its own words. Inferring "SaaS, therefore dashboard" is the
 * invention the instruction forbids — and nothing here does that.
 */
describe('the page gets to name its own sections', () => {
  it('harvests headings and labelled regions before the prose is flattened', () => {
    expect(SECTIONS).toMatch(/export function harvestSections\(html: string\): string\[\]/)
    expect(SECTIONS).toMatch(/<h\(\[1-3\]\)/)
    expect(SECTIONS).toMatch(/aria-label=/)
  })

  // ⚠️ ORDER IS LOAD BEARING. `prose` is capped at 24,000 characters; sections
  // appended after it could be truncated away on a long page.
  it('puts the section line ahead of the prose', () => {
    const sections = SRC.indexOf('...sectionLine')
    const line = SRC.slice(SRC.indexOf('const combined = ['), SRC.indexOf('const combined = [') + 120)
    expect(sections).toBeGreaterThan(-1)
    expect(line.indexOf('sectionLine')).toBeLessThan(line.indexOf('prose'))
  })

  // ⚖️ ABSENT IS NOT EMPTY. A page with no headings must add no line at all,
  // rather than a header promising sections followed by nothing.
  it('adds no line when the page named nothing', () => {
    expect(SRC).toMatch(/sections\.length > 0\s*\?/)
    expect(SRC).toMatch(/:\s*\[\]/)
  })

  it('caps and dedupes, so one long page cannot crowd out the offer', () => {
    expect(SECTIONS).toMatch(/\.slice\(0, 25\)/)
    expect(SECTIONS).toMatch(/seen\.has\(key\)/)
  })

  // ⚠️ A HEADING WITH INNER MARKUP IS NOT A NAME A CREATOR CAN BE SENT TO.
  it('strips markup inside a heading before using it as a name', () => {
    const fn = SECTIONS
    expect(fn).toMatch(/replace\(\/<\[\^>\]\+>\/g, ' '\)/)
    expect(fn).toMatch(/name\.length > 60/)
  })

  // ⚖️ THE INSTRUCTION MUST STAY STRICT. Widening the fetch is the fix; loosening
  // "name only what you SAW" would trade a blank for an invention.
  it('leaves the refusal to invent a section intact', () => {
    expect(SRC).toMatch(/name only what you SAW/)
    expect(SRC).toMatch(/never report a section because a product/i)
  })
})

/**
 * ⚠️⚠️ MEASURED AFTER DEPLOY, AND IT IS NARROWER THAN THE FIRST COMMIT CLAIMED.
 * Two products were re-extracted on the shipped code and returned 20 and 23
 * facts — with `page_section` still ZERO. Both point at `acquisition.com`, a
 * client-side-rendered site whose headings do not exist in the HTML at all.
 * `harvestSections` found nothing and correctly added no line.
 *
 * ⚖️ SO THE FIX IS REAL AND PARTIAL, and saying which is the point of these
 * tests. A server-rendered page — Shopify, WordPress, most of what a candle,
 * leather or bakery creator actually links — ships its headings and now yields
 * section names. A React landing page ships an empty shell, and for those
 * `harvestHead`'s JSON-LD and meta remain the only readable evidence, which is
 * exactly why that function was written.
 *
 * ⚠️ NOT PAPERED OVER WITH A HEADLESS BROWSER. Rendering JS to read a marketing
 * page is a different order of cost and failure, and nothing here needs it:
 * `page_section` exists to name a section a creator can point a camera at, and
 * a page that ships no structure has given us no such name to report.
 */
describe('what the harvest actually does with real page shapes', () => {
  it('names the sections a server-rendered page ships', () => {
    const shopify = `<html><body>
      <h1>Hand Poured Soy Candles</h1>
      <section><h2>Pricing</h2><p>From 24.00</p></section>
      <h2>Burn time &amp; care</h2>
      <h3>Customer reviews</h3>
    </body></html>`
    expect(harvestSections(shopify)).toEqual([
      'Hand Poured Soy Candles', 'Pricing', 'Burn time & care', 'Customer reviews',
    ])
  })

  // ⚠️ THE CASE THAT PRODUCED ZERO IN PRODUCTION.
  it('returns nothing for a client-side-rendered shell, rather than guessing', () => {
    const react = '<html><head><title>Acquisition</title></head><body><div id="root"></div>'
      + '<script src="/app.js"></script></body></html>'
    expect(harvestSections(react)).toEqual([])
  })

  it('reads a labelled region when a component ships no heading', () => {
    const labelled = '<main aria-label="Pricing plans"><div>...</div></main>'
    expect(harvestSections(labelled)).toEqual(['Pricing plans'])
  })

  it('strips inner markup and drops a heading too long to be a name', () => {
    const messy = `<h2>Simple <em>pricing</em></h2><h2>${'x'.repeat(80)}</h2>`
    expect(harvestSections(messy)).toEqual(['Simple pricing'])
  })

  it('dedupes a name repeated down the page', () => {
    expect(harvestSections('<h2>Pricing</h2><h3>pricing</h3><h2>Reviews</h2>'))
      .toEqual(['Pricing', 'Reviews'])
  })

  it('caps a page that shouts', () => {
    const many = Array.from({ length: 60 }, (_, i) => `<h2>Section ${i}</h2>`).join('')
    expect(harvestSections(many)).toHaveLength(25)
  })
})
