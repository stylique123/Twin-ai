// Brand color resolution — pure, no catalog load, no I/O, no database import
// (see captionColours.ts's header for why it's its own file). Resolved at
// render time and not in the compiler because Gate-0 §7 keeps the compiler
// from ever reading the render catalog.
import { describe, it, expect } from 'vitest'
import { resolveCaptionColours } from '../jobs/captionColours.js'

const PRESET = { primaryColourAss: '&H00FFFFFF', emphasisColourAss: '&H00A6B814' }

describe('resolveCaptionColours', () => {
  it('with no brand colors pinned, both fall back to the catalog preset', () => {
    const r = resolveCaptionColours({ brandPrimaryColourAss: null, brandHighlightColourAss: null }, PRESET)
    expect(r).toEqual({ primaryColourAss: '&H00FFFFFF', emphasisColourAss: '&H00A6B814' })
  })

  it('a brand primary color overrides the catalog default for BOTH primary and emphasis when no highlight is pinned', () => {
    // Reusing brand primary for emphasis, rather than mixing a real brand color
    // with a generic catalog accent it was never designed to sit next to.
    const r = resolveCaptionColours({ brandPrimaryColourAss: '&H00112233', brandHighlightColourAss: null }, PRESET)
    expect(r).toEqual({ primaryColourAss: '&H00112233', emphasisColourAss: '&H00112233' })
  })

  it('a distinct brand highlight color wins over both the catalog default AND the brand primary', () => {
    const r = resolveCaptionColours(
      { brandPrimaryColourAss: '&H00112233', brandHighlightColourAss: '&H00445566' }, PRESET,
    )
    expect(r).toEqual({ primaryColourAss: '&H00112233', emphasisColourAss: '&H00445566' })
  })

  it('MUTATION: a highlight color with no primary color still applies to emphasis only, primary stays the catalog default', () => {
    // An edge case a naive implementation could get backwards: highlight
    // present alone should not also silently become the primary text color.
    const r = resolveCaptionColours({ brandPrimaryColourAss: null, brandHighlightColourAss: '&H00445566' }, PRESET)
    expect(r).toEqual({ primaryColourAss: '&H00FFFFFF', emphasisColourAss: '&H00445566' })
  })
})
