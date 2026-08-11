// THE DETECTOR, MEASURED AGAINST SPEECH IT DID NOT AUTHOR.
//
// ⚠️ `claimStrength` decides, in production, whether a beat needs
// experience-level evidence. Its original tests used sentences I wrote, in the
// shapes the pattern already matched — so it scored 17/37 on the first real
// transcripts, missing 20 first-person claims and zero of the honest lines.
// Every failure was under-detection, which in production means a fabricated
// personal history waved through on coverage-only evidence.
import { describe, expect, it } from 'vitest'
import { claimStrength } from '../claimEntitlement'
import { REAL_SPEECH } from './fixtures/realSpeech'

describe('claimStrength against 37 real, hand-labelled lines', () => {
  for (const l of REAL_SPEECH) {
    it(`${l.expect.padEnd(10)} ${l.text.slice(0, 62)}`, () => {
      expect(claimStrength(l.text), l.because ?? '').toBe(l.expect)
    })
  }

  it('never escalates a narration line — the expensive false positive', () => {
    // ⚖️ THE ASYMMETRY. A missed claim ships one fabrication. A false positive
    // escalates an honest beat into a question, and a script full of questions
    // is refunded — so a widening that catches narration costs more than the
    // gap it closes.
    const narration = REAL_SPEECH.filter((l) => l.expect === 'discussion')
    expect(narration.length).toBeGreaterThan(8)
    for (const l of narration) expect(claimStrength(l.text), l.text).toBe('discussion')
  })

  it('the fixture is real speech, not sentences written to pass', () => {
    // The failure this file exists for. If someone adds invented lines the
    // corpus stops being a ruler.
    for (const l of REAL_SPEECH) expect(['transcript', 'generated']).toContain(l.source)
    expect(REAL_SPEECH.filter((l) => l.source === 'transcript').length).toBeGreaterThan(15)
  })
})
