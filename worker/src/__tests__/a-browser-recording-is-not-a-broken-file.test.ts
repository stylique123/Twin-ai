// THE PRE-MORTEM WAS RIGHT, AND IT HAPPENED TO A REAL PERSON.
//
// ⚠️ `assessProbe`'s comment used to end: "it has still not been checked against
// a real device; what this does is make sure that when it IS checked, the
// failure names its own cause." It was checked on 2026-08-09 by a creator who
// recorded twice in seven minutes — a 59MB take that stuck uploading, then a
// 5.8MB video/webm that reached validation and was REJECTED `duration_unknown`.
// Naming the cause was necessary and was not sufficient. Twin has never
// successfully accepted a take: three attempts, all `origin: teleprompter`, all
// failed.
//
// ⚖️ A `MediaRecorder` WEBM IS WRITTEN AS A LIVE STREAM. The Segment duration is
// not known when the header goes out and is frequently never patched in, so
// ffprobe reports `format.duration` absent. That is the EXPECTED shape of a
// browser recording, not a corrupt file — every frame is present and the length
// is measurable by decoding them.
// env.ts throws without Supabase creds, so stub them before the dynamic import
// — the same shape `assess-probe.test.ts` already uses.
import { describe, expect, it, beforeAll } from 'vitest'
import type {
  assessProbe as AssessProbe,
  probeDurationMs as ProbeDurationMs,
  durationFromPacketDump as DurationFromPacketDump,
} from '../jobs/validateSource.js'

let assessProbe: typeof AssessProbe
let probeDurationMs: typeof ProbeDurationMs
let durationFromPacketDump: typeof DurationFromPacketDump

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ assessProbe, probeDurationMs, durationFromPacketDump } =
    await import('../jobs/validateSource.js'))
})

const LIMITS = { minDurationMs: 500, maxDurationMs: 600_000, maxPixels: 8_294_400 }
const webm = (extra: Record<string, unknown> = {}) => ({
  format: { format_name: 'matroska,webm', ...(extra.format as object ?? {}) },
  streams: [
    { codec_type: 'video', codec_name: 'vp8', width: 1080, height: 1920 },
    { codec_type: 'audio', codec_name: 'opus' },
  ],
  ...extra,
}) as never

describe('a header with no duration is indeterminate, not a verdict', () => {
  it('marks the real production case indeterminate rather than simply refusing', () => {
    const v = assessProbe(webm(), LIMITS)
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('unreachable')
    expect(v.code).toBe('duration_unknown')
    // ⚠️ THE WHOLE FIX. Without this flag the caller has no way to tell "I could
    // not measure it" from "I measured it and it is bad", and a rule that cannot
    // see the answer announces one anyway.
    expect(v.indeterminate).toBe(true)
  })

  it('does NOT mark a real failure indeterminate', () => {
    // ⚖️ Loosening the unmeasurable case must not loosen the measured ones.
    const short = assessProbe(webm({ format: { duration: '0.2' } }), LIMITS)
    expect(short.ok).toBe(false)
    if (short.ok) throw new Error('unreachable')
    expect(short.code).toBe('too_short')
    expect(short.indeterminate).toBeUndefined()

    const long = assessProbe(webm({ format: { duration: '9999' } }), LIMITS)
    if (long.ok) throw new Error('unreachable')
    expect(long.code).toBe('too_long')
    expect(long.indeterminate).toBeUndefined()
  })

  it('still refuses a file with no video stream, which is genuinely unusable', () => {
    const v = assessProbe({ format: {}, streams: [{ codec_type: 'audio' }] } as never, LIMITS)
    if (v.ok) throw new Error('unreachable')
    expect(v.code).toBe('no_video_stream')
    expect(v.indeterminate).toBeUndefined()
  })

  it('accepts normally when the container DOES carry a duration', () => {
    const v = assessProbe(webm({ format: { duration: '42.5' } }), LIMITS)
    expect(v.ok).toBe(true)
    if (!v.ok) throw new Error('unreachable')
    expect(v.durationMs).toBe(42_500)
  })
})

describe('measuring a duration the container never wrote down', () => {
  it('takes the largest packet timestamp, not the last line', () => {
    // ⚠️ Packets are not strictly ordered by PTS when B-frames are present.
    expect(durationFromPacketDump('0.000\n1.500\n3.000\n2.500\n')).toBe(3000)
  })

  it('ignores N/A and blank lines rather than reading them as zero', () => {
    expect(durationFromPacketDump('N/A\n\n0.5\n\nN/A\n')).toBe(500)
  })

  it('returns null when there is nothing measurable, so the caller can say so', () => {
    // ⚖️ Null is "I could not measure it" and must stay distinct from 0, which
    // would sail straight into `too_short` and blame the creator again.
    expect(durationFromPacketDump('')).toBeNull()
    expect(durationFromPacketDump('N/A\nN/A\n')).toBeNull()
  })

  it('a decoded duration is re-assessed through the SAME bars, not waved through', () => {
    // ⚠️ Only the MEASUREMENT changed, never the bar. A genuinely two-frame
    // recording must still fail.
    const rescued = assessProbe(webm({ format: { duration: String(30_000 / 1000) } }), LIMITS)
    expect(rescued.ok).toBe(true)
    const stillBad = assessProbe(webm({ format: { duration: String(100 / 1000) } }), LIMITS)
    expect(stillBad.ok).toBe(false)
    if (stillBad.ok) throw new Error('unreachable')
    expect(stillBad.code).toBe('too_short')
  })
})

describe('the header reader itself', () => {
  it('reads a Matroska per-track DURATION tag when format.duration is absent', () => {
    expect(probeDurationMs({
      format: {}, streams: [{ codec_type: 'video', tags: { DURATION: '00:01:03.500000000' } }],
    } as never)).toBe(63_500)
  })

  it('returns null rather than NaN for the "N/A" ffprobe writes', () => {
    // ⚠️ `Number('N/A')` is NaN and once took the same branch as zero, which is
    // how "your video is too short" was shown for a good sixty-second take.
    expect(probeDurationMs({ format: { duration: 'N/A' }, streams: [{ codec_type: 'video' }] } as never))
      .toBeNull()
  })
})
