import { describe, expect, it } from 'vitest'
import { subpageLinks, wantsSubpages } from '../productSubpages.js'

describe("a digital product's other pages", () => {
  const html = `
    <a href="/pricing">Pricing</a> <a href="https://www.app.com/features/">Features</a>
    <a href="/blog/post">Blog</a> <a href="https://evil.com/pricing">x</a>
    <a href="http://app.com/plans">insecure</a> <a href="/pricing#top">dup</a> <a href="/demo">Demo</a>`
  it('finds same-site pricing/features pages the page links to, max 3, https only', () => {
    expect(subpageLinks(html, 'https://app.com/')).toEqual(['https://app.com/pricing', 'https://www.app.com/features', 'https://app.com/demo'])
    expect(subpageLinks(html, 'https://app.com/', 2)).toEqual(['https://app.com/pricing', 'https://www.app.com/features'])
  })
  it("owner blueprint 2026-10-03: an app's dashboard, a course's curriculum, a community's join page", () => {
    const h = '<a href="/dashboard">D</a> <a href="/curriculum">C</a> <a href="/join">J</a> <a href="/about">A</a>'
    expect(subpageLinks(h, 'https://x.com/')).toEqual(['https://x.com/dashboard', 'https://x.com/curriculum', 'https://x.com/join'])
    expect(wantsSubpages('APP')).toBe(true)
    expect(wantsSubpages('COURSE')).toBe(true)
    expect(wantsSubpages('COMMUNITY')).toBe(true)
  })
  it('never follows another site or guesses a url', () => {
    expect(subpageLinks('<a href="https://other.com/pricing">p</a>', 'https://app.com')).toEqual([])
    expect(subpageLinks('', 'https://app.com')).toEqual([])
  })
  it('only for things sold on a screen or as a plan', () => {
    expect(wantsSubpages('SAAS')).toBe(true)
    expect(wantsSubpages('DIGITAL_PRODUCT')).toBe(true)
    expect(wantsSubpages('PHYSICAL_PRODUCT')).toBe(false)
  })
})
