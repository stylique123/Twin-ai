// THE NO-MODEL VISUAL LAYER, AND THE RUNG THAT IS HONESTLY MISSING.
//
// ⚠️ THE REASON THIS LAYER EXISTS IS MEASURED. Of 52 failed `assess_reference`
// jobs in 24h on 2026-09-01, 52 were RESOURCE_EXHAUSTED on Gemini's daily
// per-model quota — across BOTH TikTok and YouTube, while 239 other jobs on the
// same platforms finished fine. The only visual reader in the product is
// quota-bound, so when the budget runs out a creator learns nothing about their
// reference at all.
//
// These assertions are about STRUCTURE, not wording. Two refiner tiers in
// `whisper_transcribe.py` raised ImportError on every call for weeks while a
// docstring described them as a working ladder; correcting the prose was not
// enough, because a shape that reads as three live rungs is how the next reader
// concludes somebody wired it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  REFERENCE_VISUAL_CAPABILITIES, UNPROBED, referenceVisualSummary, tierZeroUsable,
  type ReferenceVisualCapabilities,
} from '../referenceVisualCapabilities.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const REQS = readFileSync(join(REPO, 'worker/requirements.txt'), 'utf8')
const OPENCV_REQS = readFileSync(join(REPO, 'worker/requirements-opencv.txt'), 'utf8')
const VISUAL_PY = readFileSync(join(REPO, 'worker/editor_visual.py'), 'utf8')
const VISUAL_PASS = readFileSync(join(REPO, 'worker/src/visualPass.ts'), 'utf8')

describe('three questions, never a ranked ladder', () => {
  it('names them separately', () => {
    // ⚠️ THE NAMING IS THE GUARD. A cut is not a silence. A talking-head video
    // with no cuts and a montage with no speech are OPPOSITE formats that a
    // collapsed "visual richness" score would rank identically.
    expect([...REFERENCE_VISUAL_CAPABILITIES])
      .toEqual(['speechActivity', 'sceneChange', 'faceFraming'])
  })

  it('starts as unknown, not as unavailable', () => {
    // One says "this image cannot do it", the other says "nobody asked".
    for (const c of REFERENCE_VISUAL_CAPABILITIES) expect(UNPROBED[c]).toBe('unknown')
  })
})

describe('the analyzers already exist — this item is wiring, not a build', () => {
  it('opencv is installed, hash-enforced, and this file says where', () => {
    // ⚠️ THIS ASSERTION EXISTS BECAUSE I GOT IT BACKWARDS FIRST. The module's
    // first draft declared faceFraming `unavailable` "because no vision library
    // is pinned" — read off a TRUNCATED view of requirements.txt, which names
    // opencv only in a comment pointing at requirements-opencv.txt. It is
    // installed there with `pip --require-hashes`, so the wheel SHA-256 is
    // ENFORCED, not merely recorded.
    expect(REQS).toContain('requirements-opencv.txt')
    expect(OPENCV_REQS).toMatch(/opencv-python-headless==/)
    expect(OPENCV_REQS).toContain('--hash=sha256:')
  })

  it('the YuNet face detector and the scene-cut pass are both already shipped', () => {
    // Not "should be possible" — the code that does it, today, for the
    // creator's own take. Item 6 is pointing this at a REFERENCE.
    expect(VISUAL_PY).toMatch(/FaceDetectorYN_create/)
    expect(VISUAL_PY).toMatch(/sceneCutThreshold/)
    expect(VISUAL_PY).toMatch(/"faces"/)
    expect(VISUAL_PY).toMatch(/"shotBoundaries"/)
    expect(VISUAL_PY).toMatch(/"faceCoverage"/)
  })

  it('and none of it has ever been aimed at the reference', () => {
    // ⚖️ THE ACTUAL GAP. The reference path asks Gemini, which is why a spent
    // daily quota takes the whole visual profile with it. If this ever fails,
    // the wiring landed and this test should become an assertion that it stays.
    expect(VISUAL_PASS).toMatch(/geminiJson/)
    expect(VISUAL_PASS).not.toMatch(/editor_visual|editorVisual/)
  })
})

describe('a capability nobody probed must never report itself working', () => {
  it('`unknown` does not count as a usable signal', () => {
    // ⚠️ THE `.every(Boolean)` TRAP. An empty module list makes `.every()`
    // return TRUE, which is exactly how an unprobed rung starts announcing
    // itself as available. `tierZeroUsable` must not be fooled by unknowns.
    expect(tierZeroUsable(UNPROBED)).toBe(false)
  })

  it('any ONE available signal is enough', () => {
    // Requiring all three would rebuild the all-or-nothing failure this layer
    // exists to fix: a creator whose reference could not be read should still
    // learn something true about it.
    const only: ReferenceVisualCapabilities = {
      ...UNPROBED, sceneChange: 'available',
    }
    expect(tierZeroUsable(only)).toBe(true)
  })

  it('unavailable is not usable either', () => {
    const none: ReferenceVisualCapabilities = {
      speechActivity: 'unavailable', sceneChange: 'unavailable', faceFraming: 'unavailable',
    }
    expect(tierZeroUsable(none)).toBe(false)
  })
})

describe('the summary names every capability, so a gap is visible', () => {
  it('reports all three and their status', () => {
    // A log line that omits the missing one is how "nobody mentioned it" turns
    // into "it must be fine".
    const s = referenceVisualSummary(UNPROBED)
    for (const c of REFERENCE_VISUAL_CAPABILITIES) expect(s).toContain(`${c}=unknown`)
  })
})
