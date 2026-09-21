import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, '..', 'jobs', 'extractProduct.ts'), 'utf8')

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
    expect(SRC).toMatch(/function harvestSections\(html: string\): string\[\]/)
    expect(SRC).toMatch(/<h\(\[1-3\]\)/)
    expect(SRC).toMatch(/aria-label=/)
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
    expect(SRC).toMatch(/\.slice\(0, 25\)/)
    expect(SRC).toMatch(/seen\.has\(key\)/)
  })

  // ⚠️ A HEADING WITH INNER MARKUP IS NOT A NAME A CREATOR CAN BE SENT TO.
  it('strips markup inside a heading before using it as a name', () => {
    const fn = SRC.slice(SRC.indexOf('function harvestSections'), SRC.indexOf('/** Fetch the page'))
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
