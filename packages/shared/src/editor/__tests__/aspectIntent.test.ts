// ⚠️ THE DEFECT: the teleprompter framed a creator in portrait 9:16 while
// getUserMedia asked for it with `ideal` — a preference. The browser returned a
// landscape stream, getUserMedia resolved successfully, nothing read back the
// actual geometry, and the creator's recorded file was a different shape from
// the canvas they composed in.
import { describe, it, expect } from 'vitest'
import {
  ratioOf, matchesIntent, captureConstraints, fallbackConstraints, verifyCapture,
  verifyAspectChain, INTENT_RATIO, RATIO_TOLERANCE, DEFAULT_CAPTURE_INTENT,
} from '../aspectIntent'

describe('the project owns the shape', () => {
  it('the mobile teleprompter flow is portrait, stated not inferred', () => {
    expect(DEFAULT_CAPTURE_INTENT).toBe('portrait_9_16')
  })
  it('a ratio needs two real positive numbers', () => {
    expect(ratioOf(1080, 1920)).toBeCloseTo(0.5625, 4)
    for (const [w, h] of [[0, 100], [100, 0], [-1, 10], [NaN, 10], ['a', 10], [null, 10]]) {
      expect(ratioOf(w, h)).toBeNull()
    }
  })
})

describe('capture geometry is checked against the intent', () => {
  it('the exact portrait raster passes', () => {
    expect(matchesIntent(1080, 1920, 'portrait_9_16')).toBe(true)
  })
  // ⚠️ THE CASE THAT SHIPPED. 1280x720 is what a browser hands back when it
  // cannot meet an `ideal` portrait request.
  it('a 1280x720 landscape stream is REFUSED for a portrait project', () => {
    expect(matchesIntent(1280, 720, 'portrait_9_16')).toBe(false)
  })
  it('a real phone sensor that is not exactly 9:16 still counts as portrait', () => {
    expect(matchesIntent(1170, 2532, 'portrait_9_16')).toBe(true)
  })
  // ⚖️ THE TOLERANCE MUST NEVER GROW ENOUGH TO ADMIT AN ORIENTATION FLIP.
  it('the tolerance cannot span the gap between the two orientations', () => {
    expect(RATIO_TOLERANCE).toBeLessThan(Math.abs(INTENT_RATIO.landscape_16_9 - INTENT_RATIO.portrait_9_16) / 2)
  })
  it('a landscape project refuses a portrait stream, symmetrically', () => {
    expect(matchesIntent(1920, 1080, 'landscape_16_9')).toBe(true)
    expect(matchesIntent(1080, 1920, 'landscape_16_9')).toBe(false)
  })
})

describe('the camera is asked exactly, not preferably', () => {
  // ⚠️ `ideal` IS THE BUG. An unmet `ideal` succeeds with the wrong shape; an
  // unmet `exact` rejects, which is something we can tell the creator.
  it('the primary request pins the ratio exactly', () => {
    const c = captureConstraints('portrait_9_16', 'user') as Record<string, { exact?: number }>
    expect(c.aspectRatio?.exact).toBeCloseTo(0.5625, 4)
    expect(c.width?.exact).toBe(1080)
    expect(c.height?.exact).toBe(1920)
  })
  // ⚖️ LOOSENING THE RESOLUTION IS FINE. LOOSENING THE SHAPE IS THE DEFECT.
  it('the fallback relaxes resolution but NEVER the ratio', () => {
    const f = fallbackConstraints('portrait_9_16', 'user') as Record<string, { exact?: number; ideal?: number }>
    expect(f.width?.ideal).toBe(1080)
    expect(f.width?.exact).toBeUndefined()
    expect(f.aspectRatio?.exact).toBeCloseTo(0.5625, 4)
  })
})

describe('recording does not start on the wrong shape', () => {
  it('a portrait stream is accepted and its real size reported', () => {
    const v = verifyCapture(1080, 1920, 'portrait_9_16')
    expect(v.ok).toBe(true)
    if (v.ok) { expect(v.width).toBe(1080); expect(v.height).toBe(1920) }
  })
  it('a landscape stream is refused BEFORE recording', () => {
    const v = verifyCapture(1280, 720, 'portrait_9_16')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('wrong_shape')
  })
  it('and tells the creator what to physically do about it', () => {
    const v = verifyCapture(1280, 720, 'portrait_9_16')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message.toLowerCase()).toContain('turn your phone upright')
  })
  it('an unreadable geometry is refused rather than assumed fine', () => {
    const v = verifyCapture(0, 0, 'portrait_9_16')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('unreadable')
  })
  it('no refusal message leaks internals at the creator', () => {
    for (const [w, h] of [[1280, 720], [0, 0]]) {
      const v = verifyCapture(w, h, 'portrait_9_16')
      if (!v.ok) {
        const m = v.message.toLowerCase()
        for (const word of ['aspect', 'ratio', 'getusermedia', 'constraint', '9:16', 'raster', 'stream']) {
          expect(m).not.toContain(word)
        }
      }
    }
  })
})

describe('the whole chain must agree with the intent', () => {
  const portrait = { width: 1080, height: 1920 }
  it('an all-portrait chain has no problems', () => {
    expect(verifyAspectChain({
      intent: 'portrait_9_16', capture: portrait, preview: portrait, plan: portrait, rendered: portrait,
    })).toEqual([])
  })
  it('a landscape capture is caught', () => {
    const p = verifyAspectChain({ intent: 'portrait_9_16', capture: { width: 1280, height: 720 } })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('the recording')
  })
  it('a preview that disagrees with the plan is caught', () => {
    const p = verifyAspectChain({
      intent: 'portrait_9_16', preview: { width: 1920, height: 1080 }, plan: portrait,
    })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('the preview')
  })
  it('a rendered raster that disagrees is caught', () => {
    const p = verifyAspectChain({ intent: 'portrait_9_16', plan: portrait, rendered: { width: 1920, height: 1080 } })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('the finished video')
  })
  // ⚠️ EVERY STAGE IS COMPARED TO THE INTENT, NOT TO ITS NEIGHBOUR. Otherwise a
  // landscape capture teaches the plan that landscape was the plan.
  it('a chain that agrees with ITSELF but not the intent still fails, every stage', () => {
    const land = { width: 1920, height: 1080 }
    const p = verifyAspectChain({ intent: 'portrait_9_16', capture: land, preview: land, plan: land, rendered: land })
    expect(p).toHaveLength(4)
  })
  // ⚠️ ABSENT IS NOT WRONG.
  it('stages that have not happened yet are not mismatches', () => {
    expect(verifyAspectChain({ intent: 'portrait_9_16', capture: portrait })).toEqual([])
    expect(verifyAspectChain({ intent: 'portrait_9_16', plan: null, rendered: undefined })).toEqual([])
  })
})
