// THE TIERS THAT COULD NOT RUN, AND THE SHAPE THAT LET THEM LOOK LIKE THEY DID.
//
// Two refiner tiers raised ImportError on every call for weeks while a docstring
// described them as a working ladder. The wording was corrected first; that was
// not enough, because a structure that reads as three live rungs is how the next
// reader concludes somebody wired it. These assertions are about the STRUCTURE.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ALIGNMENT_CAPABILITIES, UNPROBED, alignmentSummary, probeAlignment,
  type AlignmentCapabilities,
} from '../alignmentCapabilities.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const PY = readFileSync(join(REPO, 'worker/whisper_transcribe.py'), 'utf8')

describe('the three capabilities stay three questions', () => {
  it('names them separately, and never as ranked tiers of one thing', () => {
    // ⚠️ THE NAMING IS THE GUARD. VAD answers a question about SILENCE; word
    // alignment answers a question about WORDS. The day someone reads
    // "alignment already exists" and feeds silence boundaries into caption cue
    // times, captions start at the last pause instead of at the word — early by
    // exactly the length of that pause.
    expect([...ALIGNMENT_CAPABILITIES]).toEqual(['vadSnap', 'wordTiming', 'acousticAlignment'])
  })

  it('starts unknown, which is not unavailable', () => {
    // ⚖️ THREE STATES. "this image cannot do it" and "nobody asked" are
    // different facts, and collapsing them turns a broken probe into a
    // confident false negative.
    for (const cap of ALIGNMENT_CAPABILITIES) expect(UNPROBED[cap]).toBe('unknown')
  })

  it('reports every capability in the summary, so none can go unmentioned', () => {
    const caps: AlignmentCapabilities = {
      vadSnap: 'available', wordTiming: 'available', acousticAlignment: 'unavailable',
    }
    const line = alignmentSummary(caps)
    for (const cap of ALIGNMENT_CAPABILITIES) expect(line).toContain(cap)
    expect(line).toContain('acousticAlignment=unavailable')
  })
})

describe('the probe asks the interpreter rather than the manifest', () => {
  it('answers available/unavailable/unknown for each capability', async () => {
    // Runs for real: whatever this machine has is a legitimate answer. What is
    // asserted is that every capability gets a decided status and none is left
    // undefined — an undefined capability reads as falsy at every call site.
    const caps = await probeAlignment(20_000)
    for (const cap of ALIGNMENT_CAPABILITIES) {
      expect(['available', 'unavailable', 'unknown']).toContain(caps[cap])
    }
  }, 40_000)

  it('does not claim acoustic alignment without torch present', async () => {
    // ⚠️ THE SPECIFIC FALSE CLAIM THIS EXISTS TO PREVENT. torch is not in
    // requirements.txt; if this ever reports `available`, either somebody added
    // it (and this test should be updated deliberately) or the probe is lying.
    const caps = await probeAlignment(20_000)
    if (caps.acousticAlignment === 'available') {
      // Not a silent pass: torch appearing is a real event with a cost.
      expect(readFileSync(join(REPO, 'worker/requirements.txt'), 'utf8')).toMatch(/^torch/m)
    }
  }, 40_000)
})

describe('the python side skips rather than swallows', () => {
  it('checks importability before calling a refiner', () => {
    // ⚠️ ATTEMPT-AND-SWALLOW WAS THE BUG. An ImportError from an absent
    // dependency looked exactly like a refiner that ran and declined.
    expect(PY).toContain('REFINER_REQUIRES')
    expect(PY).toContain('_importable')
    expect(PY).toContain('"reason": "dependency_absent"')
  })

  it('distinguishes a missing dependency from a refiner that failed', () => {
    expect(PY).toContain('refiner_skipped')
    expect(PY).toContain('refiner_failed')
  })

  it('names the missing modules rather than reporting a bare unavailable', () => {
    expect(PY).toContain('"missing": missing')
  })

  it('stamps which tier produced the output', () => {
    // A ladder stuck on its bottom rung looks identical to one working as
    // designed unless the output says which rung answered.
    expect(PY).toContain('out["refiner"] = refiner')
  })

  it('no longer claims torchaudio is already in the image', () => {
    // The original false sentence, kept here so it cannot quietly return.
    expect(PY).not.toContain('already in the image for Silero-VAD')
    expect(PY).not.toContain('adds NO heavy new deps')
  })

  it('mirrors the TypeScript requirement table', () => {
    // Two copies of "what does this tier need" would drift; the python one is
    // what runs, the TS one is what the probe reports, and they must agree.
    expect(PY).toContain('"forced_align": ("torch", "torchaudio")')
    expect(PY).toContain('"stable_ts": ("stable_whisper",)')
  })
})
