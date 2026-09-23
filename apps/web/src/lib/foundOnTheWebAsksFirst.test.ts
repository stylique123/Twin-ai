// A PRODUCT WITH NO LINK AND NO BRAND WEBSITE IS SEARCHED FOR ON THE WEB —
// AND WHAT COMES BACK IS A QUESTION, NOT AN ANSWER.
//
// Source anchors on ProductLibrary.tsx: the panel says Twin will search the web,
// the auto-read effect sends the job with no URL, and a found page is shown as
// "Found on <domain> — is this your product?" with "Not mine" clearing it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { webFoundHost } from '@twinai/shared'

const src = readFileSync(join(__dirname, '..', 'pages', 'ProductLibrary.tsx'), 'utf8')

describe('Product Library — web search for a product with nothing to read', () => {
  it('says Twin will search the web when there is no link and no brand website', () => {
    expect(src).toContain('Twin will search the web for it.')
  })
  it('the auto-read effect sends the extraction with no URL and the web-search flag', () => {
    expect(src).toMatch(/if \(!site\) \{[\s\S]{0,400}void learnFromWeb\(e\.id\)/)
    expect(src).toContain("requestProductExtraction(id, '', [], { webSearch: true })")
  })
  it('asks "Found on <domain> — is this your product?" with confirm and "Not mine"', () => {
    expect(src).toContain('Found on {host} — is this your product?')
    expect(src).toContain('answerWebFound(e.id, true)')
    expect(src).toContain('answerWebFound(e.id, false)')
    expect(src).toMatch(/mine \? await confirmWebFoundProduct\(id\) : await rejectWebFoundProduct\(id\)/)
  })
  it('webFoundHost only fires for facts read from the current link by web search', () => {
    const f = { field: 'name', value: 'X', source: 'web_search', sourceUrl: 'https://www.etsy.com/listing/1', trust: 'usable', extractedAt: '' }
    expect(webFoundHost({ productUrl: 'https://www.etsy.com/listing/1', knowledge: [f] } as never)).toBe('etsy.com')
    expect(webFoundHost({ productUrl: 'https://other.com/p', knowledge: [f] } as never)).toBeNull()
    expect(webFoundHost({ productUrl: null, knowledge: [f] } as never)).toBeNull()
    expect(webFoundHost({ productUrl: 'https://www.etsy.com/listing/1', knowledge: [{ ...f, source: 'listing' }] } as never)).toBeNull()
  })
})
