// THE NUMBER WE REMEMBER IS NOT EVIDENCE ABOUT THE TRANSCRIPT WE HAVE.
//
// ⚠️ THIS IS A MEASURED DEFECT, NOT A HYPOTHETICAL. In #66 a reference stored as
// 133 characters came back as 5, and one stored as "substantial" (>=400) also
// fell under the floor. 7 of 40 stratified references were chosen on stored
// metadata, paid for a download, and produced no data point at all.
import { describe, it, expect } from 'vitest'
import {
  decideRouting, normalizeTranscript, goesToFrames, SPEECH_FLOOR_CHARS,
} from '../transcriptRouting.js'

const base = { url: 'u', platform: 'tiktok', downloadRoute: 'local_impersonated', source: 'local_whisper' }

describe('the decision follows the transcript in hand', () => {
  it('routes to frames when the REAL transcript is short, however large the stored figure', () => {
    // The exact #66 case: stored 133, actually 5.
    const d = decideRouting({ ...base, transcriptText: 'uh...', storedChars: 133 })
    expect(d.actualChars).toBe(5)
    expect(d.routingDecision).toBe('visual_route')
    expect(goesToFrames(d)).toBe(true)
    expect(d.deltaChars).toBe(-128)
  })

  it('routes a stored-SUBSTANTIAL reference to frames too — the floor is not only a thin-stratum problem', () => {
    // A >=400-char reference also fell under the floor in run 1. Treating this
    // as "only the thin stratum drifts" was my own wrong framing, and it would
    // have left the substantial path unguarded.
    const d = decideRouting({ ...base, transcriptText: 'short', storedChars: 1049 })
    expect(d.routingDecision).toBe('visual_route')
  })

  it('extracts when the real transcript is long enough, even if nothing was stored', () => {
    const d = decideRouting({ ...base, transcriptText: 'x'.repeat(500), storedChars: null })
    expect(d.routingDecision).toBe('speech_extraction')
    expect(d.storedChars).toBeNull()
    // ⚖️ NO STORED COUNT MEANS NO DELTA, not a delta of 500. There is nothing to
    // disagree with.
    expect(d.deltaChars).toBeNull()
    expect(d.ratio).toBeNull()
  })
})

describe('the boundary itself', () => {
  it('exactly at the floor EXTRACTS — the threshold is inclusive', () => {
    const d = decideRouting({ ...base, transcriptText: 'x'.repeat(SPEECH_FLOOR_CHARS), storedChars: 120 })
    expect(d.actualChars).toBe(120)
    expect(d.routingDecision).toBe('speech_extraction')
  })

  it('one character below the floor goes to frames', () => {
    const d = decideRouting({ ...base, transcriptText: 'x'.repeat(SPEECH_FLOOR_CHARS - 1), storedChars: 120 })
    expect(d.routingDecision).toBe('visual_route')
  })

  it('records the threshold in force, so a later change cannot reinterpret old rows', () => {
    const d = decideRouting({ ...base, transcriptText: 'x'.repeat(50), storedChars: 50, thresholdChars: 40 })
    expect(d.thresholdChars).toBe(40)
    expect(d.routingDecision).toBe('speech_extraction')
  })
})

describe('the arithmetic refuses to invent things', () => {
  it('does not divide by a stored ZERO', () => {
    // Infinity in a numeric column is not "infinite drift", it is an undefined
    // question that every later aggregate would have to special-case. The delta
    // already says "we had nothing and now have something".
    const d = decideRouting({ ...base, transcriptText: 'x'.repeat(300), storedChars: 0 })
    expect(d.ratio).toBeNull()
    expect(d.deltaChars).toBe(300)
  })

  it('the delta IS the subtraction it claims to be', () => {
    const d = decideRouting({ ...base, transcriptText: 'x'.repeat(300), storedChars: 500 })
    expect(d.deltaChars).toBe(d.actualChars - 500)
    expect(d.ratio).toBeCloseTo(0.6, 4)
  })

  it('treats an absent transcript as zero characters, not as an error', () => {
    // A missing transcript is a real state on this path and must produce a
    // decision rather than a throw — otherwise the reference has no recorded
    // destination at all.
    for (const t of [null, undefined, '']) {
      const d = decideRouting({ ...base, transcriptText: t, storedChars: 900 })
      expect(d.actualChars).toBe(0)
      expect(d.routingDecision).toBe('visual_route')
    }
  })
})

describe('normalisation is shared, not re-declared', () => {
  it('trims, so whitespace is never mistaken for speech', () => {
    expect(normalizeTranscript('   \n\t  ')).toBe('')
    expect(decideRouting({ ...base, transcriptText: ' '.repeat(500), storedChars: 500 }).actualChars).toBe(0)
  })

  it('is the SAME function the eligibility test uses', async () => {
    // ⚠️ ASSERTED ON THE SOURCE. If assessReference measured length its own way,
    // the recorded decision would describe a threshold nobody applies — the
    // measure-a-copy mistake this repo has already paid for once, when a
    // re-declared sentinel filed every honest refusal as malformed.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../jobs/assessReference.ts', import.meta.url), 'utf8')
    expect(src).toContain('decideRouting')
    expect(src).toContain('goesToFrames(routing)')
    // and it must no longer make the floor decision by hand
    expect(src).not.toMatch(/if \(full\.trim\(\)\.length < MIN_TRANSCRIPT_CHARS\)/)
  })
})

describe('the three axes stay three', () => {
  it('keeps platform, download_route and source separate', () => {
    // local_whisper spans every platform, so a merged bucket could not tell a
    // Whisper problem from a TikTok problem.
    const d = decideRouting({
      url: 'u', transcriptText: 'x'.repeat(200), storedChars: 200,
      platform: 'youtube', downloadRoute: 'apify_actor', source: 'youtube_captions_paid',
    })
    expect(d.platform).toBe('youtube')
    expect(d.downloadRoute).toBe('apify_actor')
    expect(d.source).toBe('youtube_captions_paid')
  })
})

describe('the stored figure is read BEFORE it is overwritten', () => {
  it('assessReference reads transcript_chars before its upsert', async () => {
    // ⚠️ THE DEFECT THIS PREVENTS IS A DIAGNOSTIC THAT ALWAYS AGREES. The upsert
    // replaces transcript_chars; reading it afterwards would compare the fresh
    // figure against itself and report zero drift on every row forever, which is
    // indistinguishable from having no drift.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../jobs/assessReference.ts', import.meta.url), 'utf8')
    const readAt = src.indexOf('storedCharsBefore =')
    const firstUpsert = src.indexOf('.upsert(')
    expect(readAt).toBeGreaterThan(-1)
    expect(firstUpsert).toBeGreaterThan(-1)
    expect(readAt).toBeLessThan(firstUpsert)
  })
})
