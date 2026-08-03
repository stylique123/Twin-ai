// THE CAPTION SAFE AREA, PINNED TO THE FROZEN POLICY.
//
// Phase 9's last remaining item was never an engineering problem — it was a
// missing measurement. The plan recorded that plainly: picking a safe-area
// number from recollection is "precisely the mistake already made three times
// on this project" (a 50-minute CI cap against a real 77 minutes; a 25%
// hook-trim threshold against a real legitimate 28.7% case; an 80 ms caption
// tail guard against a real 93-120 ms shortfall).
//
// The measurement arrived: a safe-zone ruler, screenshotted in both feeds.
//
//   TikTok (17 Pro Max)   action rail ~200 px in from the right edge
//   Reels  (11 Pro Max)   action rail ~150-200 px in from the right edge
//
// And it overturned the assumption the item was written under. The collision
// is NOT the bottom caption/username block — that sits ~130-200 px up on
// TikTok and ~60-110 px on Reels, both far below the 600 px captions already
// clear. The collision is the ACTION RAIL, and the rail is HORIZONTAL. It
// cannot be escaped by raising the band: doing so means clearing the heart at
// ~600 px, which puts captions in the middle of the video.
//
// So the fix is WIDTH, and `marginVerticalPx` stays exactly where it is. These
// tests READ THE FROZEN POLICY rather than restating its numbers, which is the
// whole point — a future retune for nicer line length fails here instead of
// sliding a caption back under the bookmark button in a video somebody posts.
import { describe, expect, it } from 'vitest'
import { loadEditPolicy } from '../jobs/editorCompile.js'

describe('caption safe area — read from the frozen policy, not restated', () => {
  const policy = loadEditPolicy()
  const { captions, output } = policy
  const frameWidth = output.width

  it('the rail inset is the measured one, and captions are centred in what is left', () => {
    // Centring is why the arithmetic doubles: every extra pixel of width is
    // spent on BOTH sides, so a line only has to be half the excess too wide
    // for its right corner to sit under the rail.
    expect(captions.railInsetPx).toBeGreaterThan(0)
    expect(captions.maxWidthPx).toBeLessThanOrEqual(frameWidth - 2 * captions.railInsetPx)
  })

  it('the ASS margin box actually delivers the declared maximum width', () => {
    // marginHorizontalPx is what libass is given; maxWidthPx is what the rail
    // permits. If the margin ever drops below what the width claims, captions
    // get wider than the policy says they are — silently, and only in the
    // rendered video.
    expect(frameWidth - 2 * captions.marginHorizontalPx).toBeLessThanOrEqual(captions.maxWidthPx)
  })

  it('CONTROL: the pre-measurement 140 px margin would FAIL this, which is why it changed', () => {
    // Non-vacuity. 140 px was set from a TikTok screenshot that clocked the
    // rail at ~100 px; the ruler says ~200. At 140 the box is 800 px wide and
    // a centred line reaches x=940 — 60 px under a rail starting at x=880.
    const preMeasurement = 140
    expect(frameWidth - 2 * preMeasurement).toBeGreaterThan(frameWidth - 2 * captions.railInsetPx)
    expect(captions.marginHorizontalPx).toBeGreaterThan(preMeasurement)
  })

  it('a centred line at the maximum width clears the rail on BOTH sides', () => {
    const half = captions.maxWidthPx / 2
    const centre = frameWidth / 2
    const right = centre + half
    const left = centre - half
    expect(right).toBeLessThanOrEqual(frameWidth - captions.railInsetPx)
    expect(left).toBeGreaterThanOrEqual(captions.railInsetPx)
  })

  it('the vertical band is UNCHANGED — the rail is not a vertical problem', () => {
    // Pinned deliberately. The obvious reading of "captions collide with
    // platform UI" is "move them up", and the measurement says that is wrong:
    // the icons in the 320-360 band (TikTok bookmark ~340, Reels share ~370 /
    // send ~320) are beside the captions, not beneath them. Raising the band
    // trades a fixable width problem for an unfixable one.
    for (const id of captions.presetIds) {
      expect(captions.presets[id].marginVerticalPx).toBe(600)
    }
  })

  it('every preset is bound by the same width — none opts out', () => {
    // The width lives on `captions`, not per preset, so a new preset cannot
    // ship its own wider margin. This asserts the shape that guarantees it.
    for (const id of captions.presetIds) {
      const preset = captions.presets[id] as Record<string, unknown>
      expect(preset.marginHorizontalPx).toBeUndefined()
      expect(preset.maxWidthPx).toBeUndefined()
    }
  })

  it('the declared width is a real constraint, not a no-op wider than the frame', () => {
    expect(captions.maxWidthPx).toBeLessThan(frameWidth)
    expect(captions.maxWidthPx).toBeGreaterThan(0)
  })

  // NOT ASSERTED HERE — MEASURED NEXT DOOR. Whether each preset's
  // maxCharsPerLine fits inside maxWidthPx in pixels is a glyph question, and
  // this file declined to answer it by inventing a constant. caption-line-width
  // .test.ts answers it from the pinned font's own advance widths, and the
  // answer is no: ordinary caption text runs 1.45x-1.57x the box.
  //
  // Two things in the old note here were wrong and are worth correcting rather
  // than deleting. libass does NOT wrap inside the box — assCaptions emits
  // `WrapStyle: 2`, which is "no word wrapping", so the compiler's own `\N` is
  // the only break. An over-wide line is therefore not a line-COUNT mismatch;
  // it is drawn wider than the box, through the rail inset this file exists to
  // protect. The safe area asserted above is only as good as that proxy.
})
