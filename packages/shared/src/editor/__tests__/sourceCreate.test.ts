import { describe, it, expect } from 'vitest'
import {
  normalizeSourceMime, safeSizeBytes, buildCreateInput, createErrorStatus, mapCreateError,
} from '../sourceCreate'

const GEN = '11111111-1111-1111-1111-111111111111'
const ATTEMPT = '33333333-3333-3333-3333-333333333333'
const DSHA = 'b'.repeat(64)
const ctx = { generationId: GEN, clientAttemptId: ATTEMPT }

describe('sourceCreate: MIME normalization (edge boundary)', () => {
  it('normalizes codec-suffixed / MP4 / MOV and rejects unsupported', () => {
    expect(normalizeSourceMime('video/webm;codecs=vp9,opus')).toEqual({ baseMime: 'video/webm', ext: 'webm' })
    expect(normalizeSourceMime('video/webm;codecs="vp8,opus"')).toEqual({ baseMime: 'video/webm', ext: 'webm' })
    expect(normalizeSourceMime('video/mp4')).toEqual({ baseMime: 'video/mp4', ext: 'mp4' })
    expect(normalizeSourceMime('video/quicktime')).toEqual({ baseMime: 'video/quicktime', ext: 'mp4' })
    expect(normalizeSourceMime('image/png')).toBeNull()
    expect(normalizeSourceMime(null)).toBeNull()
  })
})

describe('sourceCreate: safe size parsing (wire hygiene, DB owns policy)', () => {
  it('accepts finite safe non-negative integers', () => {
    expect(safeSizeBytes(1048576)).toBe(1048576)
    expect(safeSizeBytes('1048576')).toBe(1048576)
    expect(safeSizeBytes(0)).toBe(0)
  })
  it('rejects malformed / fractional / exponent-fraction / unsafe / NaN', () => {
    expect(safeSizeBytes(1.5)).toBeNull()
    expect(safeSizeBytes('1e3.5')).toBeNull()
    expect(safeSizeBytes(-1)).toBeNull()
    expect(safeSizeBytes(9007199254740992)).toBeNull() // 2^53
    expect(safeSizeBytes('abc')).toBeNull()
    expect(safeSizeBytes(undefined)).toBeNull()
    expect(safeSizeBytes(null)).toBeNull()
    expect(safeSizeBytes(NaN)).toBeNull()
    expect(safeSizeBytes(Infinity)).toBeNull()
    expect(safeSizeBytes('')).toBeNull()
  })
})

describe('sourceCreate: snake→camel input (missing vs null key)', () => {
  it('maps teleprompter segments exactly (snake→camel)', () => {
    const input = buildCreateInput({
      origin: 'teleprompter', recording_script_sha256: 'a'.repeat(64), recorder_clock: 'mediarecorder-active-time-ms',
      accepted_segments: [{ scene_number: 1, start_ms: 0, end_ms: 2000, intended_dialogue_sha256: DSHA }],
    }, ctx)
    expect(input).toEqual({
      schemaVersion: 1, origin: 'teleprompter', generationId: GEN, clientAttemptId: ATTEMPT,
      recorderClock: 'mediarecorder-active-time-ms', recordingScriptSha256: 'a'.repeat(64),
      acceptedSegments: [{ sceneNumber: 1, startMs: 0, endMs: 2000, intendedDialogueSha256: DSHA }],
    })
  })
  it('EXPLICIT null is preserved', () => {
    const input = buildCreateInput({ origin: 'upload', recording_script_sha256: null, recorder_clock: 'none', accepted_segments: [] }, ctx)
    expect(Object.prototype.hasOwnProperty.call(input, 'recordingScriptSha256')).toBe(true)
    expect(input.recordingScriptSha256).toBeNull()
  })
  it('MISSING key stays MISSING (never manufactured to null)', () => {
    const input = buildCreateInput({ origin: 'upload', recorder_clock: 'none', accepted_segments: [] }, ctx)
    expect(Object.prototype.hasOwnProperty.call(input, 'recordingScriptSha256')).toBe(false)
  })
  it('does not copy unknown top-level keys into the input', () => {
    const input = buildCreateInput({ origin: 'upload', recording_script_sha256: null, recorder_clock: 'none', accepted_segments: [], evil: 1 }, ctx)
    expect(Object.prototype.hasOwnProperty.call(input, 'evil')).toBe(false)
  })
})

describe('sourceCreate: RPC error mapping (stable status + message)', () => {
  it('maps every stable code, incl. rejected → 409 (not generic 500)', () => {
    expect(createErrorStatus('source_generation_not_owned: x')).toBe(404)
    expect(createErrorStatus('source_too_many_open')).toBe(429)
    expect(createErrorStatus('source_quota_exceeded')).toBe(413)
    expect(createErrorStatus('source_asset_rejected: x')).toBe(409)
    expect(createErrorStatus('source_attempt_conflict: x')).toBe(409)
    expect(createErrorStatus('capture_intent_conflict: x')).toBe(409)
    expect(createErrorStatus('source_policy_mime')).toBe(400)
    expect(createErrorStatus('capture_intent_bad_time')).toBe(400)
    expect(createErrorStatus('some_unexpected_sql_error')).toBe(500)
    expect(mapCreateError('source_asset_rejected: x')).toMatch(/rejected/i)
    // never leaks the raw SQL for a generic error
    expect(mapCreateError('null value in column "x" violates not-null')).toBe('Could not start the upload — try again.')
  })
})
