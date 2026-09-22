// `www.thedogdaysco.com` WAS REFUSED, AND THE MESSAGE DID NOT SAY WHY.
//
// ⚠️⚠️ REPORTED 2026-09-22. The field demanded a literal `https://` prefix and
// the error read only "Please paste a full https:// link." A creator who does
// not already know the fix has nowhere to go from there — the reporter got past
// it by happening to know.
//
// ⚖️ NOBODY TYPES A SCHEME INTO A BROWSER ANY MORE, so refusing the form
// everybody uses is asking the creator to do the machine's job. The protocol is
// supplied on the way out instead; every reader downstream — including the
// https-only guard inside `requestProductExtraction`, the edge function and the
// worker — still sees exactly what it always required.
//
// ⚠️ THE ACCEPTANCE IS DELIBERATELY NARROW. A host with a dot and no spaces,
// optionally with a path. Accepting a bare word would send the extractor at a
// name rather than a page, which fails later and less clearly.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { normalizeLink, looksLikeBareDomain } from '../productLink'

const API = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'api.ts'), 'utf8')

describe('the address a person types is accepted', () => {
  it('⚠️ the exact string that was refused', () => {
    expect(normalizeLink('www.thedogdaysco.com')).toBe('https://www.thedogdaysco.com')
  })

  it('with or without www, with or without a path', () => {
    expect(normalizeLink('thedogdaysco.com')).toBe('https://thedogdaysco.com')
    expect(normalizeLink('thedogdaysco.com/shop/bandanas')).toBe('https://thedogdaysco.com/shop/bandanas')
  })

  it('an https link is left exactly as it was', () => {
    expect(normalizeLink('https://thedogdaysco.com')).toBe('https://thedogdaysco.com')
  })

  it('⚖️ and http is upgraded rather than passed through', () => {
    // The downstream guard is https-only, so passing http through would turn a
    // typed address into a refusal further away from the field.
    expect(normalizeLink('http://thedogdaysco.com')).toBe('https://thedogdaysco.com')
  })

  it('empty stays empty — absent is not a link', () => {
    expect(normalizeLink('')).toBe('')
    expect(normalizeLink('   ')).toBe('')
  })

  it('⚠️ and a bare word is still NOT a link', () => {
    // Widening this far would send the extractor at a name, not a page.
    expect(looksLikeBareDomain('peakdesign')).toBe(false)
    expect(looksLikeBareDomain('not a link')).toBe(false)
    expect(looksLikeBareDomain('')).toBe(false)
    expect(looksLikeBareDomain('peakdesign.example')).toBe(true)
  })
})

describe('and when it truly is not a link, the message names the fix', () => {
  it('⚠️ shows an example instead of restating the rule that just failed', () => {
    const msg = API.slice(API.indexOf("That does not look like a web address"), API.indexOf("That does not look like a web address") + 200)
    expect(msg).toMatch(/for example/i)
    expect(msg).toMatch(/twinai\.com\/shop/)
  })

  it('⚖️ the https-only guard itself is unchanged', () => {
    // The point is that callers normalise BEFORE this, not that this softened.
    expect(API).toMatch(/if \(clean !== '' && !\/\^https:\\\/\\\/\/i\.test\(clean\)\)/)
  })
})
