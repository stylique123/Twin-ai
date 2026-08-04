// Editor v2 Phase 1 — validate_source accept/reject rules, unit-tested on the
// pure assessment (no ffmpeg/network needed). env.ts throws without Supabase
// creds, so stub them before the dynamic import.
import { describe, it, expect, beforeAll } from 'vitest'
import type { assessProbe as AssessProbe, probeDurationMs as ProbeDurationMs } from '../jobs/validateSource.js'

let assessProbe: typeof AssessProbe
let probeDurationMs: typeof ProbeDurationMs

const LIMITS = { minDurationMs: 500, maxDurationMs: 30 * 60 * 1000, maxPixels: 3840 * 2160 }

const goodProbe = (over: Record<string, unknown> = {}) => ({
  streams: [
    { codec_type: 'video', codec_name: 'vp9', width: 1080, height: 1920 },
    { codec_type: 'audio', codec_name: 'opus' },
  ],
  format: { duration: '12.480', size: '1048576', format_name: 'webm' },
  ...over,
})

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ assessProbe, probeDurationMs } = await import('../jobs/validateSource.js'))
})

describe('assessProbe — the ready/rejected decision', () => {
  it('accepts a normal portrait take with integer-ms duration and audio', () => {
    const v = assessProbe(goodProbe(), LIMITS)
    expect(v).toMatchObject({ ok: true, durationMs: 12480, width: 1080, height: 1920, hasAudio: true, rotation: 0 })
  })

  it('rejects a file with no video stream (e.g. bare audio, or garbage ffprobe still parsed)', () => {
    const v = assessProbe({ streams: [{ codec_type: 'audio' }], format: { duration: '10' } }, LIMITS)
    expect(v).toMatchObject({ ok: false, code: 'no_video_stream' })
  })

  it('rejects too-short and too-long durations at the configured bounds', () => {
    expect(assessProbe(goodProbe({ format: { duration: '0.2' } }), LIMITS)).toMatchObject({ ok: false, code: 'too_short' })
    expect(assessProbe(goodProbe({ format: { duration: '0' } }), LIMITS)).toMatchObject({ ok: false, code: 'too_short' })
    expect(assessProbe(goodProbe({ format: { duration: '1900.1' } }), LIMITS)).toMatchObject({ ok: false, code: 'too_long' })
  })

  it('rejects decode-bomb resolutions above the pixel cap (4K passes, 8K does not)', () => {
    const at = (w: number, h: number) =>
      assessProbe({ streams: [{ codec_type: 'video', width: w, height: h }], format: { duration: '10' } }, LIMITS)
    expect(at(3840, 2160)).toMatchObject({ ok: true })
    expect(at(7680, 4320)).toMatchObject({ ok: false, code: 'resolution_too_high' })
  })

  it('reads rotation from side_data_list and reports missing audio', () => {
    const v = assessProbe(
      {
        streams: [{ codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }],
        format: { duration: '10' },
      },
      LIMITS,
    )
    expect(v).toMatchObject({ ok: true, rotation: 90, hasAudio: false })
  })
})

// ── "NOT REPORTED" IS NOT "TOO SHORT" ──────────────────────────────────────
//
// assessProbe read `format.duration ?? '0'` and rejected anything below the
// minimum as `too_short`. A container that does not state a duration therefore
// told the creator their perfectly good sixty-second take was too short —
// `Number(undefined ?? '0')` is 0, and `Number('N/A')` is NaN, and both took
// that branch.
//
// THIS IS THE EXPECTED SHAPE OF A PHONE RECORDING. A MediaRecorder WebM is
// written as a live stream: the Segment duration is unknown when the header
// goes out and is frequently never patched in. The build plan calls checking
// that against a real device "the single cheapest thing left to check", and it
// still has not been checked — so what these tests fix is that when it IS
// checked, the failure will name its own cause instead of a false one.
describe('duration: reported, reported elsewhere, or not reported at all', () => {
  const probe = (over: Record<string, unknown>) => ({
    streams: [{ codec_type: 'video', width: 1080, height: 1920, ...(over.stream as object ?? {}) }],
    format: over.format as Record<string, string> | undefined,
  })

  it('format.duration still wins when present', () => {
    expect(probeDurationMs(probe({ format: { duration: '12.480' } }))).toBe(12480)
  })

  it('falls back to the video STREAM duration', () => {
    expect(probeDurationMs(probe({ format: {}, stream: { duration: '61.5' } }))).toBe(61500)
  })

  it('falls back to the Matroska/WebM per-track DURATION TAG', () => {
    // The only place many phone recordings state a real length.
    expect(probeDurationMs(probe({ format: {}, stream: { tags: { DURATION: '00:01:03.456000000' } } })))
      .toBe(63456)
    expect(probeDurationMs(probe({ format: {}, stream: { tags: { DURATION: '01:02:03' } } })))
      .toBe(3723000)
  })

  it('NULL, not zero, when nothing states a duration', () => {
    // The distinction the fix rests on: zero is a claim about the file, null is
    // the absence of one.
    expect(probeDurationMs(probe({ format: {} }))).toBeNull()
    expect(probeDurationMs(probe({}))).toBeNull()
  })

  it('"N/A" is not a duration — and was the value that read as zero', () => {
    expect(probeDurationMs(probe({ format: { duration: 'N/A' } }))).toBeNull()
  })

  it('a negative or malformed value is not a shorter video', () => {
    expect(probeDurationMs(probe({ format: { duration: '-5' } }))).toBeNull()
    expect(probeDurationMs(probe({ format: {}, stream: { tags: { DURATION: 'garbage' } } }))).toBeNull()
    expect(probeDurationMs(probe({ format: {}, stream: { tags: { DURATION: '00:99:00' } } }))).toBeNull()
  })

  it('an unstated duration is REJECTED as duration_unknown, never as too_short', () => {
    const v = assessProbe(probe({ format: { size: '1048576' } }) as never, LIMITS)
    expect(v).toMatchObject({ ok: false, code: 'duration_unknown' })
  })

  it('a genuinely short video is still too_short', () => {
    // The rejection this must not swallow: the old code was wrong about which
    // files were short, not about rejecting short ones.
    expect(assessProbe(probe({ format: { duration: '0.2' } }) as never, LIMITS))
      .toMatchObject({ ok: false, code: 'too_short' })
  })

  it('A PHONE TAKE WITH ONLY A TAG IS NOW ACCEPTED — the point of the change', () => {
    const v = assessProbe(
      probe({ format: { size: '1048576' }, stream: { tags: { DURATION: '00:01:00.000000000' } } }) as never,
      LIMITS)
    expect(v).toMatchObject({ ok: true, durationMs: 60000 })
  })
})
