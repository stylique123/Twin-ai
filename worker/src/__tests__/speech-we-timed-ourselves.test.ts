// THE FIFTH TIER 0 NUMBER, AND THE ONE ROUTE ALLOWED TO PRODUCE IT.
//
// ⚠️ I TOLD THE OWNER THIS NEEDED THE TRANSCRIPT AND VISUAL PASSES MERGED.
// It did not. `Transcript` already carries `segments: {start,end,text}[]`;
// `assessReference` has the transcript in scope when the visual pass runs;
// `tierZeroProfile` already accepted `speechMs`; migration 0180 already had the
// column. The reader existed end to end and the number was simply never handed
// over. Recorded here because overstating the size of a job is how work gets
// deferred that should have shipped.
import { describe, it, expect } from 'vitest'
import { speechActiveMs, tierZeroProfile } from '../referenceTierZero.js'

describe('speech we timed ourselves', () => {
  it('MERGES overlapping segments instead of summing them', () => {
    // ⚠️ THE BUG THIS EXISTS TO PREVENT. Whisper overlaps segment boundaries and
    // captions frequently do; summing raw durations reports more speech than the
    // video has runtime, and pct() would hand back a percentage above 100.
    const overlapping = [
      { start: 0, end: 10 },
      { start: 5, end: 15 },   // 5s of overlap
      { start: 14, end: 20 },  // 1s of overlap
    ]
    expect(speechActiveMs(overlapping)).toBe(20_000)         // 0..20, not 10+10+6
    const naiveSum = 10_000 + 10_000 + 6_000
    expect(speechActiveMs(overlapping)).toBeLessThan(naiveSum)
  })

  it('a fully overlapped segment adds nothing', () => {
    expect(speechActiveMs([{ start: 0, end: 30 }, { start: 5, end: 10 }])).toBe(30_000)
  })

  it('sums disjoint segments and keeps the silence out', () => {
    // 0-5 speech, 5-20 silence, 20-25 speech → 10s of speech in a 25s video.
    expect(speechActiveMs([{ start: 0, end: 5 }, { start: 20, end: 25 }])).toBe(10_000)
  })

  it('never lets a percentage exceed 100 on real overlapping input', () => {
    const p = tierZeroProfile({
      durationMs: 20_000,
      speechMs: speechActiveMs([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 14, end: 20 }]),
    })
    expect(p.speechPct).not.toBeNull()
    expect(p.speechPct!).toBeLessThanOrEqual(100)
    expect(p.speechPct).toBe(100)
  })

  it('backwards and zero-length segments contribute nothing, never a negative', () => {
    expect(speechActiveMs([{ start: 10, end: 4 }, { start: 3, end: 3 }])).toBeNull()
    expect(speechActiveMs([{ start: 0, end: 5 }, { start: 10, end: 2 }])).toBe(5_000)
  })

  it('ABSENT IS NOT SILENT — no segments returns null, never zero', () => {
    // ⚠️ 0 would mean "we measured, and nobody spoke". null means "not measured".
    for (const input of [undefined, null, [], 'nonsense', {}, [{ text: 'no timings' }]]) {
      expect(speechActiveMs(input), `input ${JSON.stringify(input)}`).toBeNull()
    }
    expect(tierZeroProfile({ durationMs: 30_000, speechMs: speechActiveMs([]) }).speechPct).toBeNull()
  })

  it('ignores unusable timings inside an otherwise good list', () => {
    expect(speechActiveMs([
      { start: 0, end: 4 }, { start: 'x', end: 9 }, { start: 6, end: null }, { start: 10, end: 12 },
    ])).toBe(6_000)
  })
})

describe('only the route we recognised ourselves may produce it', () => {
  it('the gate names local_whisper and nothing else', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(import.meta.dirname, '..', 'jobs', 'assessReference.ts'), 'utf8')
    // ⚠️ CAPTION TIMINGS ARE AUTHORED, NOT MEASURED. Tier 0's other four numbers
    // come off the pixels; a publisher's caption track is an editorial decision.
    expect(src).toMatch(/ASR_ROUTES[^\n]*=\s*new Set\(\['local_whisper'\]\)/)
    expect(src).not.toMatch(/ASR_ROUTES[^\n]*youtube/)
    expect(src).not.toMatch(/ASR_ROUTES[^\n]*instagram/)
  })

  it('BOTH visual-pass call sites hand the number over', async () => {
    // A field computed at one call site and dropped at the other is the same
    // defect as not computing it at all, on half the runs.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(import.meta.dirname, '..', 'jobs', 'assessReference.ts'), 'utf8')
    const passes = [...src.matchAll(/runVisualPass\(/g)].length
    const handed = [...src.matchAll(/speechMs: ownSpeechMs\(transcript\)/g)].length
    expect(handed).toBe(passes)
  })
})
