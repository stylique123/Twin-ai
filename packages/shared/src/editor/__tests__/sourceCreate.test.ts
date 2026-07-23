import { describe, it, expect, vi } from 'vitest'
import {
  normalizeSourceMime, safeSizeBytes, buildCreateInput, createErrorStatus, mapCreateError,
  buildCreatePlan, runSourceCreate, type CreateDeps,
} from '../sourceCreate'

const GEN = '11111111-1111-1111-1111-111111111111'
const ATTEMPT = '33333333-3333-3333-3333-333333333333'
const DSHA = 'b'.repeat(64)
const ctx = { generationId: GEN, clientAttemptId: ATTEMPT }

// A minimal valid create body (upload origin).
function body(over: Record<string, unknown> = {}, cap: Record<string, unknown> = {}) {
  return {
    action: 'create', generation_id: GEN, recording_attempt_id: ATTEMPT,
    content_type: 'video/webm', size_bytes: 1048576,
    capture: { origin: 'upload', recording_script_sha256: null, recorder_clock: 'none', accepted_segments: [], ...cap },
    ...over,
  }
}

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
  it('EXPLICIT null is preserved; MISSING key stays MISSING', () => {
    const withNull = buildCreateInput({ origin: 'upload', recording_script_sha256: null, recorder_clock: 'none', accepted_segments: [] }, ctx)
    expect(Object.prototype.hasOwnProperty.call(withNull, 'recordingScriptSha256')).toBe(true)
    expect(withNull.recordingScriptSha256).toBeNull()
    const missing = buildCreateInput({ origin: 'upload', recorder_clock: 'none', accepted_segments: [] }, ctx)
    expect(Object.prototype.hasOwnProperty.call(missing, 'recordingScriptSha256')).toBe(false)
  })
})

describe('sourceCreate: buildCreatePlan rejects hostile keysets BEFORE mapping', () => {
  it('accepts a valid body and produces exact RPC args', () => {
    const plan = buildCreatePlan(body())
    expect('rpcArgs' in plan).toBe(true)
    if ('rpcArgs' in plan) {
      expect(plan.rpcArgs.p_generation).toBe(GEN)
      expect(plan.rpcArgs.p_bucket).toBe('takes')
      expect(plan.rpcArgs.p_mime).toBe('video/webm')
      expect(plan.rpcArgs.p_size_bytes).toBe(1048576)
    }
  })
  it('rejects an unknown TOP-LEVEL body key (never sanitized away)', () => {
    const plan = buildCreatePlan(body({ evil: 1 }))
    expect(plan).toEqual({ error: { status: 400, message: 'Unexpected field: evil' } })
  })
  it('rejects an unknown CAPTURE key', () => {
    const plan = buildCreatePlan(body({}, { evil: 1 }))
    expect(plan).toEqual({ error: { status: 400, message: 'Unexpected capture field: evil' } })
  })
  it('rejects an unknown SEGMENT key', () => {
    const plan = buildCreatePlan(body({}, {
      origin: 'teleprompter', recording_script_sha256: 'a'.repeat(64), recorder_clock: 'mediarecorder-active-time-ms',
      accepted_segments: [{ scene_number: 1, start_ms: 0, end_ms: 2000, intended_dialogue_sha256: DSHA, evil: 1 }],
    }))
    expect(plan).toEqual({ error: { status: 400, message: 'Unexpected segment field: evil' } })
  })
  it('rejects bad uuids / size / mime / missing capture', () => {
    expect(buildCreatePlan(body({ generation_id: 'nope' }))).toEqual({ error: { status: 400, message: 'generation_id (uuid) is required' } })
    expect(buildCreatePlan(body({ recording_attempt_id: 'nope' }))).toEqual({ error: { status: 400, message: 'recording_attempt_id (uuid) is required' } })
    expect(buildCreatePlan(body({ size_bytes: 1.5 })).hasOwnProperty('error')).toBe(true)
    expect(buildCreatePlan(body({ content_type: 'image/png' })).hasOwnProperty('error')).toBe(true)
    const noCap = body(); delete (noCap as Record<string, unknown>).capture
    expect(buildCreatePlan(noCap).hasOwnProperty('error')).toBe(true)
  })
})

describe('sourceCreate: runSourceCreate injectable handler (behavioral)', () => {
  const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  function deps(row: unknown = { asset_id: 'asset1', storage_path: 'p/q/asset1.webm', status: 'uploading' }, err: string | null = null): CreateDeps & { calls: () => number } {
    const createSourceAsset = vi.fn(async () => ({ data: row, error: err ? { message: err } : null }))
    const signUpload = vi.fn(async () => ({ token: 'tok', signedUrl: 'https://x' }))
    return { createSourceAsset, signUpload, calls: () => (createSourceAsset as { mock: { calls: unknown[] } }).mock.calls.length }
  }

  it('unknown key → stable 400 and the RPC is NEVER called (no create, no writes)', async () => {
    const d = deps()
    const r = await runSourceCreate(body({ evil: 1 }), OWNER, d)
    expect(r.status).toBe(400)
    expect(d.calls()).toBe(0)
  })

  it('valid create → EXACTLY ONE editor_create_source_asset RPC + signed upload', async () => {
    const d = deps()
    const r = await runSourceCreate(body(), OWNER, d)
    expect(r.status).toBe(200)
    expect(d.calls()).toBe(1)
    expect(r.body).toMatchObject({ assetId: 'asset1', bucket: 'takes', path: 'p/q/asset1.webm', status: 'uploading', token: 'tok' })
    // deps expose ONLY the RPC + signer — no table-writer — so the handler cannot
    // write media_assets/source_capture_intents/source_script_snapshots directly.
    expect(Object.keys(d).filter((k) => k !== 'calls').sort()).toEqual(['createSourceAsset', 'signUpload'])
  })

  it('ready status skips signing (returns null token)', async () => {
    const d = deps({ asset_id: 'a', storage_path: 'p', status: 'ready' })
    const r = await runSourceCreate(body(), OWNER, d)
    expect(r.body.token).toBeNull()
    expect((d.signUpload as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0)
  })

  it('RPC error maps to a stable non-500 status via createErrorStatus', async () => {
    const d = deps(null, 'capture_script_sha_mismatch: x')
    const r = await runSourceCreate(body(), OWNER, d)
    expect(r.status).toBe(409)
    expect(d.calls()).toBe(1)
  })
})

describe('sourceCreate: RPC error mapping (stable status + message, incl. round-4 codes)', () => {
  it('maps every stable code; script/dialogue mismatches are 409, oversize 413, never 500', () => {
    expect(createErrorStatus('source_generation_not_owned: x')).toBe(404)
    expect(createErrorStatus('source_too_many_open')).toBe(429)
    expect(createErrorStatus('source_quota_exceeded')).toBe(413)
    expect(createErrorStatus('script_snapshot_too_large')).toBe(413)
    expect(createErrorStatus('source_asset_rejected: x')).toBe(409)
    expect(createErrorStatus('source_attempt_conflict: x')).toBe(409)
    expect(createErrorStatus('capture_intent_conflict: x')).toBe(409)
    expect(createErrorStatus('capture_script_sha_mismatch: x')).toBe(409)
    expect(createErrorStatus('capture_dialogue_sha_mismatch: x')).toBe(409)
    expect(createErrorStatus('capture_script_ambiguous_scene: x')).toBe(409)
    expect(createErrorStatus('capture_segment_not_teleprompter: x')).toBe(409)
    expect(createErrorStatus('capture_segment_order: x')).toBe(409)
    expect(createErrorStatus('source_policy_mime')).toBe(400)
    expect(createErrorStatus('capture_intent_bad_time')).toBe(400)
    expect(createErrorStatus('some_unexpected_sql_error')).toBe(500)
    expect(mapCreateError('capture_script_sha_mismatch: x')).toMatch(/match the current script/i)
    expect(mapCreateError('capture_dialogue_sha_mismatch: x')).toMatch(/words don't match/i)
    expect(mapCreateError('script_snapshot_too_large')).toMatch(/too long/i)
    // never leaks the raw SQL for a generic error
    expect(mapCreateError('null value in column "x" violates not-null')).toBe('Could not start the upload — try again.')
  })
})
