// Editor v2 Phase 1 — validate_source accept/reject rules, unit-tested on the
// pure assessment (no ffmpeg/network needed). env.ts throws without Supabase
// creds, so stub them before the dynamic import.
import { describe, it, expect, beforeAll } from 'vitest'
import type { assessProbe as AssessProbe } from '../jobs/validateSource.js'

let assessProbe: typeof AssessProbe

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
  ;({ assessProbe } = await import('../jobs/validateSource.js'))
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
