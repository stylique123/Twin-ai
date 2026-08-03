// HOW WIDE IS A CAPTION LINE, ACTUALLY — measured, not guessed.
//
// caption-safe-area.test.ts records what it deliberately did NOT assert: that
// each preset's `maxCharsPerLine` fits inside `maxWidthPx` in pixels, because
// "maxCharsPerLine is a CHARACTER proxy … and turning it into a pixel claim
// needs a glyph-advance constant nobody has measured. Inventing one to make
// this file look more thorough would be the same chosen-not-measured mistake
// the policy already records three times."
//
// This measures it instead of inventing it — from the SAME font bytes
// render_catalog_v1.json pins, so the number is the renderer's, not a
// plausible-looking constant.
//
// WHAT IT FOUND. Every preset overflows. On ordinary English caption text — no
// adversarial all-caps-W string — a full line runs 1.45x to 1.57x the width of
// the 680 px box. That is not a rounding gap that a tolerance absorbs.
//
// AND WHY THAT MATTERS MORE THAN IT LOOKS. `WrapStyle: 2` (assCaptions.ts) is
// "no word wrapping" — libass breaks only on the compiler's own `\N`. So an
// over-wide line is not re-wrapped into a taller block; it is DRAWN WIDER THAN
// THE BOX, straight through the rail inset that railInsetPx=200 exists to keep
// clear. The safe area is only as good as this proxy, and this proxy is 50%
// optimistic.
//
// THIS FILE DOES NOT FIX IT, ON PURPOSE. Which knob to turn — fewer chars per
// line, a smaller fontSizePx, fewer maxWordsPerCue, or a wider box at the cost
// of safe-area margin — changes what every caption looks like, and is a product
// call, not a call to make inside a test. What this file does is stop the
// number being invisible: the measured widths are PINNED, so any change to the
// policy, the presets, or the font metrics moves them and has to be looked at.
// `FITS` is the honest column, and it is false three times.
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { loadFontMetrics, measureLinePx } from './fixtures/ttfAdvance.js'
import { loadEditPolicy } from '../jobs/editorCompile.js'

const policy = loadEditPolicy() as unknown as {
  captions: {
    maxWidthPx: number
    presets: Record<string, { maxCharsPerLine: number, fontSizePx: number }>
  }
}
const captions = policy.captions

const catalog = JSON.parse(
  readFileSync(new URL('../../render_catalog_v1.json', import.meta.url), 'utf8'),
) as { fonts: Record<string, { sha256: string }> }

// The caption style is emitted with Bold `-1` (assCaptions.ts), so the bold face
// is the one that draws every caption. Measuring the regular face would measure
// a font the renderer never uses.
const FONT_BASENAME = 'DejaVuSans-Bold.ttf'
const FONT_PATH = `/usr/share/fonts/truetype/dejavu/${FONT_BASENAME}`

// THE SKIP IS ON THE PIN, NOT JUST ON PRESENCE. A bare dev box installs Ubuntu's
// DejaVu, whose bytes differ from the Debian bookworm build the worker ships and
// render_catalog_v1.json pins — the divergence pr-checks.yml documents at
// length, and the reason it copies the fonts out of node:22-bookworm-slim rather
// than apt-getting them on the runner. Measuring the wrong font's advances and
// pinning the result would bake a number that production never draws with. So
// the measurement runs where the pinned bytes are (the unit-tests job) and
// self-skips anywhere else, exactly as the live-ffmpeg fixture does.
const fontSha = existsSync(FONT_PATH)
  ? createHash('sha256').update(readFileSync(FONT_PATH)).digest('hex')
  : null
const isPinnedFont = fontSha !== null && fontSha === catalog.fonts[FONT_BASENAME]?.sha256

// Ordinary caption text: things a creator actually says, at the lengths captions
// actually reach. Deliberately NOT an adversarial worst case — a run of capital
// Ws would prove only that a pathological string is wide. The point is that
// normal text overflows.
const CORPUS = [
  'Everything changed when',
  'the algorithm rewards',
  'WATCH THIS BEFORE YOU',
  'MOST PEOPLE GET THIS WRONG',
  'internationalisation',
  'subscribe for more marketing',
  'This is the difference',
]

/**
 * MEASURED against the pinned font, then written down here.
 *
 * `widestPx` is the widest line any CORPUS entry can produce at that preset's
 * ceiling: the entry truncated to `maxCharsPerLine`, drawn at `fontSizePx`.
 * `fits` is that width against the frozen `maxWidthPx`. `fitsAtChars` is the
 * largest `maxCharsPerLine` at which the whole corpus would fit — the number a
 * chars-per-line fix would have to reach.
 */
const MEASURED: Record<string, { widestPx: number, fits: boolean, fitsAtChars: number }> = {
  'caption-clean-keyword-v1': { widestPx: 1070, fits: false, fitsAtChars: 13 },
  'caption-punchy-word-v1': { widestPx: 984, fits: false, fitsAtChars: 10 },
  'caption-minimal-subtitle-v1': { widestPx: 1016, fits: false, fitsAtChars: 17 },
}

// The two DejaVu builds in circulation differ in BYTES; their advance widths are
// expected to be identical. This tolerance names that expectation instead of
// assuming it silently — a build that actually re-metricked the font moves the
// numbers well past 1% and fails here rather than quietly shifting every line.
const TOLERANCE = 0.01

describe('the advance reader itself — properties true of any real font', () => {
  // These run EVERYWHERE, including where the measurement skips. A parser that
  // returns zero for everything would make every width fit, and the skip would
  // hide it on precisely the machines that skip.
  const m = () => loadFontMetrics(FONT_PATH)

  it.skipIf(!existsSync(FONT_PATH))('an empty line is zero wide', () => {
    expect(measureLinePx('', m(), 72)).toBe(0)
  })

  it.skipIf(!existsSync(FONT_PATH))('width scales linearly with font size', () => {
    const f = m()
    expect(measureLinePx('hello', f, 144)).toBeCloseTo(measureLinePx('hello', f, 72) * 2, 6)
  })

  it.skipIf(!existsSync(FONT_PATH))('a wide glyph measures wider than a narrow one', () => {
    const f = m()
    expect(measureLinePx('W', f, 72)).toBeGreaterThan(measureLinePx('i', f, 72))
    expect(measureLinePx('i', f, 72)).toBeGreaterThan(0)
  })

  it.skipIf(!existsSync(FONT_PATH))('advances accumulate — a longer line is wider', () => {
    const f = m()
    expect(measureLinePx('aa', f, 72)).toBeCloseTo(measureLinePx('a', f, 72) * 2, 6)
  })

  it('a file that is not an sfnt is rejected rather than silently measured as zero', () => {
    expect(() => loadFontMetrics(new URL('../../edit_policy_v1.json', import.meta.url).pathname))
      .toThrow(/not a TrueType sfnt/)
  })
})

describe.skipIf(!isPinnedFont)('caption lines against the frozen box, measured', () => {
  const metrics = () => loadFontMetrics(FONT_PATH)

  const widestFor = (presetId: string) => {
    const p = captions.presets[presetId]
    const f = metrics()
    let widest = 0
    for (const s of CORPUS) {
      widest = Math.max(widest, measureLinePx(s.slice(0, p.maxCharsPerLine), f, p.fontSizePx))
    }
    return widest
  }

  it('the font under measurement IS the pinned one', () => {
    expect(fontSha).toBe(catalog.fonts[FONT_BASENAME].sha256)
  })

  it('every preset is covered — a preset added without a measurement fails here', () => {
    expect(Object.keys(MEASURED).sort()).toEqual(Object.keys(captions.presets).sort())
  })

  for (const presetId of Object.keys(MEASURED)) {
    it(`${presetId}: the measured width is what is written down`, () => {
      const widest = widestFor(presetId)
      const expected = MEASURED[presetId].widestPx
      expect(Math.abs(widest - expected) / expected).toBeLessThan(TOLERANCE)
    })

    it(`${presetId}: FITS is recorded honestly against maxWidthPx`, () => {
      // Asserting the CURRENT answer, including when it is "no". This is a
      // characterisation of a known gap, not an endorsement of it: fixing the
      // policy flips this to true and fails here, which is the point — the fix
      // must come with its number, in the diff, where a reviewer sees it.
      expect(widestFor(presetId) <= captions.maxWidthPx).toBe(MEASURED[presetId].fits)
    })

    it(`${presetId}: fitsAtChars is the chars-per-line that would actually fit`, () => {
      const p = captions.presets[presetId]
      const f = metrics()
      const fitsAt = (n: number) =>
        CORPUS.every((s) => measureLinePx(s.slice(0, n), f, p.fontSizePx) <= captions.maxWidthPx)
      const n = MEASURED[presetId].fitsAtChars
      expect(fitsAt(n)).toBe(true)
      // And it is the LARGEST such n — otherwise the recorded fix understates
      // what the presets could keep.
      expect(fitsAt(n + 1)).toBe(false)
    })
  }

  it('the overflow is not a rounding gap — it is at least 40%', () => {
    // Guards against the reading that this is a tolerance problem someone could
    // close by nudging a margin. If this ever stops holding, the gap has been
    // genuinely worked on and the numbers above are stale.
    for (const presetId of Object.keys(MEASURED)) {
      if (MEASURED[presetId].fits) continue
      expect(widestFor(presetId) / captions.maxWidthPx).toBeGreaterThan(1.4)
    }
  })
})
