// Brand color resolution — pure, no catalog load, no I/O, no database import
// (see captionColours.ts's header for why it's its own file). Resolved at
// render time and not in the compiler because Gate-0 §7 keeps the compiler
// from ever reading the render catalog.
//
// THE FIXTURE COLORS CHANGED WITH THE CONTRAST GUARD, ON PURPOSE. The
// precedence tests below used to pin `&H00112233` — which is RGB(51,34,17), a
// near-black brown with a measured contrast of about 1.3:1 against the black
// outline every catalog preset draws. It was a fine placeholder for testing
// *which* color wins and a terrible one for a color that now has to be
// legible. The precedence assertions are unchanged in meaning; they are made
// with a color a real brand could actually use. The dark value is not
// discarded — it moves to the guard tests, where its illegibility is the point.
import { describe, it, expect } from 'vitest'
import {
  resolveCaptionColours, relativeLuminance, contrastRatioMilli, MIN_CONTRAST_RATIO_MILLI,
} from '../jobs/captionColours.js'

const BLACK = '&H00000000'
const WHITE = '&H00FFFFFF'
// &HAABBGGRR, so this is RGB(0x14, 0xB8, 0xA6) — the catalog's teal accent.
const PRESET = { primaryColourAss: WHITE, emphasisColourAss: '&H00A6B814', outlineColourAss: BLACK }

// Legible brand colors, in ASS's backwards BB GG RR order.
const BRAND_ORANGE = '&H001A6BF0' // RGB(240,107,26)
const BRAND_LIME = '&H0033CC99'   // RGB(153,204,51)
// RGB(51,34,17). Against a black outline this is black-on-black.
const TOO_DARK = '&H00112233'

describe('resolveCaptionColours', () => {
  it('with no brand colors pinned, both fall back to the catalog preset', () => {
    const r = resolveCaptionColours({ brandPrimaryColourAss: null, brandHighlightColourAss: null }, PRESET)
    expect(r).toEqual({ primaryColourAss: WHITE, emphasisColourAss: '&H00A6B814', rejected: [] })
  })

  it('a brand primary color overrides the catalog default for BOTH primary and emphasis when no highlight is pinned', () => {
    // Reusing brand primary for emphasis, rather than mixing a real brand color
    // with a generic catalog accent it was never designed to sit next to.
    const r = resolveCaptionColours({ brandPrimaryColourAss: BRAND_ORANGE, brandHighlightColourAss: null }, PRESET)
    expect(r).toEqual({ primaryColourAss: BRAND_ORANGE, emphasisColourAss: BRAND_ORANGE, rejected: [] })
  })

  it('a distinct brand highlight color wins over both the catalog default AND the brand primary', () => {
    const r = resolveCaptionColours(
      { brandPrimaryColourAss: BRAND_ORANGE, brandHighlightColourAss: BRAND_LIME }, PRESET,
    )
    expect(r).toEqual({ primaryColourAss: BRAND_ORANGE, emphasisColourAss: BRAND_LIME, rejected: [] })
  })

  it('MUTATION: a highlight color with no primary color still applies to emphasis only, primary stays the catalog default', () => {
    // An edge case a naive implementation could get backwards: highlight
    // present alone should not also silently become the primary text color.
    const r = resolveCaptionColours({ brandPrimaryColourAss: null, brandHighlightColourAss: BRAND_LIME }, PRESET)
    expect(r).toEqual({ primaryColourAss: WHITE, emphasisColourAss: BRAND_LIME, rejected: [] })
  })
})

describe('WCAG measurement', () => {
  it('anchors the scale: white is 1, black is 0', () => {
    // Everything else this file asserts is a ratio between these two.
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6)
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6)
  })

  it('white on black is the maximum 21:1', () => {
    expect(contrastRatioMilli(WHITE, BLACK)).toBe(21000)
  })

  it('is symmetric — the caller does not have to know which color is lighter', () => {
    expect(contrastRatioMilli(BLACK, WHITE)).toBe(contrastRatioMilli(WHITE, BLACK))
  })

  it('reads the ASS byte order as BB GG RR, not RR GG BB', () => {
    // Pure red and pure blue have very different luminances (0.2126 vs
    // 0.0722), so getting the byte order backwards is measurable here rather
    // than merely suspected. &H000000FF is RR=FF: red.
    const red = relativeLuminance('&H000000FF')
    const blue = relativeLuminance('&H00FF0000')
    expect(red).toBeCloseTo(0.2126, 4)
    expect(blue).toBeCloseTo(0.0722, 4)
  })

  it('truncates rather than rounds, so a color never passes on a rounding step', () => {
    // 0x808080 against black measures ~5.317:1. Truncation must not report
    // more contrast than was measured.
    const r = contrastRatioMilli('&H00808080', BLACK)
    expect(r).not.toBeNull()
    expect(r).toBe(Math.floor((r as number)))
    expect(r).toBeLessThan(5318)
  })

  it('returns null for anything that is not an ASS color', () => {
    expect(contrastRatioMilli('#112233', BLACK)).toBeNull()
    expect(relativeLuminance('&H0011223')).toBeNull()
  })
})

describe('contrast guard', () => {
  it('refuses a brand color too dark to read inside the outline, and says so', () => {
    // THE DEFECT THIS GUARD EXISTS FOR: without it, this ships a video whose
    // captions are a dark brown fill inside a black stroke, invisible from
    // the first cue to the last, with nothing anywhere reporting a problem.
    const r = resolveCaptionColours({ brandPrimaryColourAss: TOO_DARK, brandHighlightColourAss: null }, PRESET)
    expect(r.primaryColourAss).toBe(WHITE)
    expect(r.emphasisColourAss).toBe('&H00A6B814')
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].role).toBe('primary')
    expect(r.rejected[0].colourAss).toBe(TOO_DARK)
    expect(r.rejected[0].contrastRatioMilli).toBeLessThan(MIN_CONTRAST_RATIO_MILLI)
  })

  it('CONTROL: the rejected color really is below threshold and the accepted one really is above', () => {
    // Without this, "the guard rejected it" could be true because the guard
    // rejects everything.
    expect(contrastRatioMilli(TOO_DARK, BLACK)).toBeLessThan(MIN_CONTRAST_RATIO_MILLI)
    expect(contrastRatioMilli(BRAND_ORANGE, BLACK)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO_MILLI)
  })

  it('a rejected primary does not drag down a legible highlight, and the reverse', () => {
    const a = resolveCaptionColours({ brandPrimaryColourAss: TOO_DARK, brandHighlightColourAss: BRAND_LIME }, PRESET)
    expect(a.primaryColourAss).toBe(WHITE)
    expect(a.emphasisColourAss).toBe(BRAND_LIME)
    expect(a.rejected.map((r) => r.role)).toEqual(['primary'])

    const b = resolveCaptionColours({ brandPrimaryColourAss: BRAND_ORANGE, brandHighlightColourAss: TOO_DARK }, PRESET)
    expect(b.primaryColourAss).toBe(BRAND_ORANGE)
    expect(b.emphasisColourAss).toBe(BRAND_ORANGE)
    expect(b.rejected.map((r) => r.role)).toEqual(['emphasis'])
  })

  it('one bad primary is filed ONCE, not twice, even though emphasis falls back through it', () => {
    // The emphasis slot falls back to the brand primary. Vetting that primary
    // a second time under the emphasis role would make one mistake look like
    // two to whoever reads the trail.
    const r = resolveCaptionColours({ brandPrimaryColourAss: TOO_DARK, brandHighlightColourAss: null }, PRESET)
    expect(r.rejected).toHaveLength(1)
  })

  it('a brand color identical to the outline is refused', () => {
    const r = resolveCaptionColours({ brandPrimaryColourAss: BLACK, brandHighlightColourAss: null }, PRESET)
    expect(r.primaryColourAss).toBe(WHITE)
    expect(r.rejected[0].contrastRatioMilli).toBe(1000)
  })

  it('an unparseable color is refused rather than spliced into the document', () => {
    const r = resolveCaptionColours({ brandPrimaryColourAss: 'not-a-colour', brandHighlightColourAss: null }, PRESET)
    expect(r.primaryColourAss).toBe(WHITE)
    expect(r.rejected[0].contrastRatioMilli).toBeNull()
  })

  it('the catalog presets themselves all pass their own guard', () => {
    // A preset that failed would mean the frozen defaults are illegible, and
    // no brand color would be needed to ship a broken video.
    for (const c of [WHITE, '&H00A6B814', '&H0000F0FF', '&H00616FFF', '&H000B9EF5']) {
      expect(contrastRatioMilli(c, BLACK)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO_MILLI)
    }
  })
})
