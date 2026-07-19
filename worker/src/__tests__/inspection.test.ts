import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

describe('inspection contract construction', () => {
  const asset = { id: 'a-1', content_sha256: 'deadbeef', validation_version: 1 }
  const baseFacts = {
    durationMs: 6120, width: 720, height: 1280, rotation: 0, hasAudio: true,
    container: 'matroska,webm', videoCodec: 'vp8', audioCodec: 'vorbis',
    probeFacts: {
      frame_rate: '30/1', avg_frame_rate: '30/1', pix_fmt: 'yuv420p', color_space: 'bt709',
      audio_sample_rate: 48000, audio_channels: 1, audio_channel_layout: 'mono',
    },
  }
  const flags = { reusedValidationFacts: true, fallbackProbePerformed: false }

  it('emits integer ms + rational frame rates, never float seconds', async () => {
    const { buildInspection } = await import('../jobs/editorInspect.js')
    const i = buildInspection(asset, baseFacts, flags) as Record<string, any>
    expect(i.durationMs).toBe(6120)
    expect(Number.isInteger(i.durationMs)).toBe(true)
    expect(i.video.frameRateNumerator).toBe(30)
    expect(i.video.frameRateDenominator).toBe(1)
    expect(i.video.variableFrameRate).toBe(false)
    expect(i.sourceChecksum).toBe('deadbeef')
    expect(i.audio).toMatchObject({ present: true, codec: 'vorbis', sampleRate: 48000, channels: 1 })
    expect(i.eligibility).toEqual({ editorEligible: true })
    expect(JSON.stringify(i)).not.toMatch(/duration_sec|durationSec/)
  })

  it('handles unusual rational rates and flags VFR when avg differs', async () => {
    const { buildInspection } = await import('../jobs/editorInspect.js')
    const f = { ...baseFacts, probeFacts: { ...baseFacts.probeFacts, frame_rate: '30000/1001', avg_frame_rate: '2997/100' } }
    const i = buildInspection(asset, f, flags) as Record<string, any>
    expect(i.video.frameRateNumerator).toBe(30000)
    expect(i.video.frameRateDenominator).toBe(1001)
    expect(i.video.variableFrameRate).toBe(true)
  })

  it('rotation 90/270 swaps display dimensions; storage dims unchanged', async () => {
    const { buildInspection } = await import('../jobs/editorInspect.js')
    for (const [rot, dw, dh] of [[90, 1280, 720], [270, 1280, 720], [180, 720, 1280], [0, 720, 1280]] as const) {
      const i = buildInspection(asset, { ...baseFacts, rotation: rot }, flags) as Record<string, any>
      expect(i.video.rotation).toBe(rot)
      expect(i.video.width).toBe(720)
      expect(i.video.displayWidth).toBe(dw)
      expect(i.video.displayHeight).toBe(dh)
    }
  })

  it('negative/odd rotation values normalize into the 0|90|180|270 domain', async () => {
    const { normalizeRotation } = await import('../jobs/editorInspect.js')
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(17)).toBe(0)
    expect(normalizeRotation(null)).toBe(0)
  })

  it('no-audio media builds an ineligible inspection with a rejection code', async () => {
    const { buildInspection } = await import('../jobs/editorInspect.js')
    const i = buildInspection(asset, { ...baseFacts, hasAudio: false, audioCodec: null }, flags) as Record<string, any>
    expect(i.audio).toEqual({ present: false })
    expect(i.eligibility).toEqual({ editorEligible: false, rejectionCode: 'source_not_editor_eligible' })
  })

  it('required-fact detection: missing frame rate forces the upgrade probe', async () => {
    const { hasRequiredFacts } = await import('../jobs/editorInspect.js')
    expect(hasRequiredFacts(baseFacts)).toBe(true)
    expect(hasRequiredFacts({ ...baseFacts, probeFacts: null })).toBe(false)
    expect(hasRequiredFacts({ ...baseFacts, probeFacts: { ...baseFacts.probeFacts, frame_rate: null } })).toBe(false)
    expect(hasRequiredFacts({ ...baseFacts, container: null })).toBe(false)
    expect(hasRequiredFacts({ ...baseFacts, durationMs: null })).toBe(false)
  })

  it('parseRational rejects malformed and degenerate inputs', async () => {
    const { parseRational } = await import('../jobs/editorInspect.js')
    expect(parseRational('30/1')).toEqual({ num: 30, den: 1 })
    expect(parseRational('0/0')).toBeNull()
    expect(parseRational('30')).toBeNull()
    expect(parseRational('abc/def')).toBeNull()
    expect(parseRational(null)).toBeNull()
  })
})

describe('error sanitization', () => {
  it('redacts URLs, tokens, paths, JWTs, DSNs; bounds length', async () => {
    const { redact } = await import('../sanitizeError.js')
    const dirty = [
      'download failed https://x.supabase.co/storage/v1/object/sign/a/b?token=eyJhbGciOiJIUzI1NiJ9.eyJzIjoxfQ.abcdefghij',
      'Authorization: Bearer sk-live-abcdef1234567890abcdef',
      'wrote /tmp/editor-v2/1234-a1/inspect-source',
      'postgres://user:pass@db.host:5432/postgres',
      'etag ' + 'a'.repeat(64),
    ].join(' | ')
    const safe = redact(dirty)
    expect(safe).not.toMatch(/supabase\.co|token=|Bearer sk|\/tmp\/|postgres:\/\/|a{40}/)
    expect(safe.length).toBeLessThanOrEqual(300)
  })

  it('classifies retry semantics into stable codes', async () => {
    const { sanitizeError } = await import('../sanitizeError.js')
    const { PermanentJobError } = await import('../errors.js')
    expect(sanitizeError(new PermanentJobError('bad media', 'probe_failed'), 'inspecting'))
      .toMatchObject({ code: 'probe_failed', retry: 'permanent', stage: 'inspecting' })
    expect(sanitizeError(new Error('stage_timeout: ffprobe exceeded 60000ms'), 'inspecting'))
      .toMatchObject({ code: 'stage_timeout', retry: 'retryable' })
    expect(sanitizeError(new Error('storage download 503: upstream'), 'inspecting'))
      .toMatchObject({ code: 'storage_download_failed', retry: 'retryable' })
  })
})
