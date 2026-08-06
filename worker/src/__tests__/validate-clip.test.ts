// The CLIP bounds — where they differ from the source bounds, and why.
//
// A clip validator that was just the source validator with a different name
// would reject most legitimate screen captures, and the two places it must
// differ are exactly the two places that would be silently wrong.
// env.ts throws without Supabase creds, so stub them before the dynamic import
// — the same shape assess-probe.test.ts uses for the source rules.
import { describe, it, expect, beforeAll } from 'vitest'
import type { assessClipProbe as AssessClipProbe } from '../jobs/validateClip.js'
import type { ProbeResult } from '../jobs/validateSource.js'

let assessClipProbe: typeof AssessClipProbe
let LIMITS: { minDurationMs: number; maxDurationMs: number; maxPixels: number }

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  const mod = await import('../jobs/validateClip.js')
  assessClipProbe = mod.assessClipProbe
  LIMITS = { minDurationMs: mod.CLIP_MIN_DURATION_MS, maxDurationMs: 900_000, maxPixels: 8_294_400 }
})

function probe(over: Partial<ProbeResult> = {}, video: Record<string, unknown> = {}): ProbeResult {
  return {
    format: { duration: '4.000', size: '1048576', format_name: 'matroska,webm' },
    streams: [{ codec_type: 'video', codec_name: 'vp9', width: 1920, height: 1080, ...video }],
    ...over,
  } as ProbeResult
}

describe('a screen capture is not a take', () => {
  it('accepts a silent clip — no audio is the ORDINARY case', () => {
    // A source with no audio is not editor-eligible; a silent screen recording
    // is what a screen recording normally is, and the composition model
    // discards clip audio anyway.
    const verdict = assessClipProbe(probe(), LIMITS)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.hasAudio).toBe(false)
  })

  it('records audio as a fact when it is there, never as a verdict', () => {
    const verdict = assessClipProbe({
      ...probe(),
      streams: [...(probe().streams ?? []), { codec_type: 'audio', codec_name: 'opus' }],
    }, LIMITS)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.hasAudio).toBe(true)
  })

  it('accepts a clip far shorter than any usable take', () => {
    // A two-second look at a settings page is a legitimate cutaway. The source
    // floor exists because a two-second TAKE is not a video; that reasoning does
    // not transfer.
    const verdict = assessClipProbe(probe({ format: { duration: '2.000' } }), LIMITS)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.durationMs).toBe(2000)
  })

  it('still refuses one too short to be a window at all', () => {
    const verdict = assessClipProbe(probe({ format: { duration: '0.100' } }), LIMITS)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.code).toBe('too_short')
  })

  it('keeps the pixel cap — a 6K display decodes like a 6K camera', () => {
    const verdict = assessClipProbe(probe({}, { width: 6016, height: 3384 }), LIMITS)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.code).toBe('resolution_too_high')
  })
})

describe('an unmeasurable duration is never reported as a short one', () => {
  it('a MediaRecorder WebM with no Segment duration is `duration_unknown`', () => {
    // This matters MORE for a clip than for a phone take: a screen capture is
    // ALWAYS a MediaRecorder stream, never a file the OS finalized, so the
    // missing-duration case is the expected shape rather than an edge case.
    const verdict = assessClipProbe({ streams: [{ codec_type: 'video', width: 1280, height: 720 }] }, LIMITS)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.code).toBe('duration_unknown')
  })

  it('reads the per-track DURATION tag when the container states none', () => {
    const verdict = assessClipProbe({
      format: { format_name: 'matroska,webm' },
      streams: [{ codec_type: 'video', width: 1280, height: 720, tags: { DURATION: '00:00:06.120000000' } }],
    }, LIMITS)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.durationMs).toBe(6120)
  })

  it('refuses a file with no video stream', () => {
    const verdict = assessClipProbe({ format: { duration: '4.000' }, streams: [{ codec_type: 'audio' }] }, LIMITS)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.code).toBe('no_video_stream')
  })
})
