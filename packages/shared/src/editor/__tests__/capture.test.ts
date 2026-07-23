import { describe, it, expect } from 'vitest'
import {
  buildTeleprompterIntent,
  buildUploadIntent,
  buildStoredIntent,
  validateCaptureIntent,
  validateCaptureIntentInput,
  normalizeCaptureManifest,
  canonicalManifestBytes,
  canonicalCaptureIntent,
  captureIntentSha256,
  captureScriptSha256,
  canonicalCaptureScript,
  sha256Hex,
  normalizeDialogue,
  CaptureContractError,
  CAPTURE_MIN_SEGMENT_MS,
  CAPTURE_END_TOLERANCE_MS,
  type SourceCaptureIntentInputV1,
  type SourceCaptureIntentV1,
} from '../capture'

const GEN = '11111111-1111-1111-1111-111111111111'
const ASSET = '22222222-2222-2222-2222-222222222222'
const ATTEMPT = '33333333-3333-3333-3333-333333333333'
const SHA = 'a'.repeat(64)
const RECORDED = '2026-07-23T11:00:00.000Z'
const server = { sourceAssetId: ASSET, recordedAt: RECORDED }

function code(fn: () => unknown): string {
  try { fn(); return '<<no throw>>' } catch (e) { return (e as CaptureContractError).code }
}
async function acode(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return '<<no throw>>' } catch (e) { return (e as CaptureContractError).code }
}

describe('capture: teleprompter input intent', () => {
  it('builds and validates a well-formed teleprompter INPUT (no server fields)', async () => {
    const input = await buildTeleprompterIntent({
      generationId: GEN, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 2000, dialogue: 'hello world' },
        { sceneNumber: 2, startMs: 2000, endMs: 5000, dialogue: 'second scene' },
      ],
    })
    expect(input.origin).toBe('teleprompter')
    expect('sourceAssetId' in input).toBe(false)
    expect('recordedAt' in input).toBe(false)
    expect(input.acceptedSegments).toHaveLength(2)
    expect(input.acceptedSegments[0].intendedDialogueSha256).toBe(await sha256Hex(normalizeDialogue('hello world')))
    expect(() => validateCaptureIntentInput(input)).not.toThrow()
  })

  it('rounds active-seconds-derived ms and rejects sub-min segments', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [{ sceneNumber: 1, startMs: 0, endMs: CAPTURE_MIN_SEGMENT_MS - 1, dialogue: 'x' }],
    }))).toBe('capture_intent_short_segment')
  })

  it('rejects overlapping / out-of-order segments', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 3000, dialogue: 'a' },
        { sceneNumber: 2, startMs: 2000, endMs: 5000, dialogue: 'b' },
      ],
    }))).toBe('capture_intent_overlap')
  })

  it('rejects duplicate scene numbers', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 3000, dialogue: 'a' },
        { sceneNumber: 1, startMs: 3000, endMs: 6000, dialogue: 'b' },
      ],
    }))).toBe('capture_intent_dup_scene')
  })

  it('rejects empty teleprompter segments', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA, segments: [],
    }))).toBe('capture_intent_no_segments')
  })
})

describe('capture: upload input intent', () => {
  it('builds an explicit empty upload-origin INPUT', () => {
    const input = buildUploadIntent({ generationId: GEN, clientAttemptId: ATTEMPT })
    expect(input.origin).toBe('upload')
    expect(input.recordingScriptSha256).toBeNull()
    expect(input.recorderClock).toBe('none')
    expect(input.acceptedSegments).toEqual([])
    expect('sourceAssetId' in input).toBe(false)
  })

  it('rejects an upload input carrying segments', () => {
    const bad = { ...buildUploadIntent({ generationId: GEN, clientAttemptId: ATTEMPT }),
      acceptedSegments: [{ sceneNumber: 1, startMs: 0, endMs: 3000, intendedDialogueSha256: SHA }] }
    expect(code(() => validateCaptureIntentInput(bad))).toBe('capture_intent_upload_shape')
  })
})

describe('capture: stored intent (server-authority fields)', () => {
  const input = () => buildUploadIntent({ generationId: GEN, clientAttemptId: ATTEMPT })

  it('buildStoredIntent adds sourceAssetId + recordedAt and validates', () => {
    const stored = buildStoredIntent(input(), server)
    expect(stored.sourceAssetId).toBe(ASSET)
    expect(stored.recordedAt).toBe(RECORDED)
    expect(() => validateCaptureIntent(stored)).not.toThrow()
  })

  it('the stored validator REQUIRES sourceAssetId + a well-formed recordedAt', () => {
    // A bare input (no server fields) is not a valid STORED document.
    expect(code(() => validateCaptureIntent(input()))).toBe('capture_intent_bad_id')
    expect(code(() => validateCaptureIntent({ ...input(), sourceAssetId: ASSET }))).toBe('capture_intent_bad_recorded_at')
    expect(code(() => validateCaptureIntent({ ...input(), sourceAssetId: ASSET, recordedAt: '2026-07-23 11:00:00' })))
      .toBe('capture_intent_bad_recorded_at')
    expect(code(() => validateCaptureIntent({ ...input(), sourceAssetId: 'nope', recordedAt: RECORDED })))
      .toBe('capture_intent_bad_id')
  })

  it('intent_sha256 covers recordedAt + sourceAssetId (server fields change identity)', async () => {
    const a = await captureIntentSha256(buildStoredIntent(input(), server))
    const b = await captureIntentSha256(buildStoredIntent(input(), { ...server, recordedAt: '2026-07-23T11:00:00.001Z' }))
    const c = await captureIntentSha256(buildStoredIntent(input(), { ...server, sourceAssetId: '44444444-4444-4444-4444-444444444444' }))
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    // Re-deriving from the SAME server fields is stable (idempotent retry).
    expect(await captureIntentSha256(buildStoredIntent(input(), server))).toBe(a)
  })
})

describe('capture: validation hostile shapes', () => {
  const base = () => buildUploadIntent({ generationId: GEN, clientAttemptId: ATTEMPT })
  it('rejects non-objects and bad ids/versions (input validator)', () => {
    expect(code(() => validateCaptureIntentInput(null))).toBe('capture_intent_not_object')
    expect(code(() => validateCaptureIntentInput({ ...base(), schemaVersion: 2 }))).toBe('capture_intent_schema')
    expect(code(() => validateCaptureIntentInput({ ...base(), origin: 'nope' }))).toBe('capture_intent_bad_origin')
    expect(code(() => validateCaptureIntentInput({ ...base(), generationId: 'not-a-uuid' }))).toBe('capture_intent_bad_id')
  })
  it('rejects teleprompter without a 64-hex script sha', () => {
    const t: SourceCaptureIntentInputV1 = { ...base(), origin: 'teleprompter', recordingScriptSha256: 'short',
      recorderClock: 'mediarecorder-active-time-ms',
      acceptedSegments: [{ sceneNumber: 1, startMs: 0, endMs: 3000, intendedDialogueSha256: SHA }] }
    expect(code(() => validateCaptureIntentInput(t))).toBe('capture_intent_bad_script_sha')
  })
})

describe('capture: server normalization vs measured duration', () => {
  async function tele(): Promise<SourceCaptureIntentV1> {
    const input = await buildTeleprompterIntent({
      generationId: GEN, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 2000, dialogue: 'a' },
        { sceneNumber: 2, startMs: 2000, endMs: 5000, dialogue: 'b' },
      ],
    })
    return buildStoredIntent(input, server)
  }
  it('normalizes within-duration segments', async () => {
    const intent = await tele()
    const iSha = await captureIntentSha256(intent)
    const m = normalizeCaptureManifest({ intent, sourceSha256: SHA, sourceDurationMs: 5000, intentSha256: iSha })
    expect(m.acceptedSegments).toHaveLength(2)
    expect(m.acceptedSegments[1].sourceEndMs).toBe(5000)
    expect(m.sourceAssetId).toBe(ASSET)
    expect(m.origin).toBe('teleprompter')
    expect(() => canonicalManifestBytes(m)).not.toThrow()
  })
  it('clamps a terminal end within tolerance', async () => {
    const intent = await tele()
    const iSha = await captureIntentSha256(intent)
    const dur = 5000 - Math.floor(CAPTURE_END_TOLERANCE_MS / 2)
    const m = normalizeCaptureManifest({ intent, sourceSha256: SHA, sourceDurationMs: dur, intentSha256: iSha })
    expect(m.acceptedSegments[1].sourceEndMs).toBe(dur)
  })
  it('fails closed beyond tolerance (never silently clamps)', async () => {
    const intent = await tele()
    const iSha = await captureIntentSha256(intent)
    const dur = 5000 - (CAPTURE_END_TOLERANCE_MS + 500)
    let caught = ''
    try { normalizeCaptureManifest({ intent, sourceSha256: SHA, sourceDurationMs: dur, intentSha256: iSha }) }
    catch (e) { caught = (e as CaptureContractError).code }
    expect(caught).toBe('capture_manifest_out_of_bounds')
  })
  it('fails closed when a start is beyond measured duration', async () => {
    const intent = await tele()
    const iSha = await captureIntentSha256(intent)
    let caught = ''
    try { normalizeCaptureManifest({ intent, sourceSha256: SHA, sourceDurationMs: 1000, intentSha256: iSha }) }
    catch (e) { caught = (e as CaptureContractError).code }
    expect(caught).toBe('capture_manifest_out_of_bounds')
  })
})

describe('capture: canonical stored-intent bytes (DB parity anchor)', () => {
  it('serializes stored-intent keys in sorted order with the server fields present', () => {
    const stored = buildStoredIntent(buildUploadIntent({ generationId: GEN, clientAttemptId: ATTEMPT }), server)
    const canonical = canonicalCaptureIntent(stored)
    // Sorted top-level keys, no insignificant whitespace, recordedAt + sourceAssetId included.
    expect(canonical).toBe(
      `{"acceptedSegments":[],"clientAttemptId":"${ATTEMPT}","generationId":"${GEN}",`
      + `"origin":"upload","recordedAt":"${RECORDED}","recorderClock":"none",`
      + `"recordingScriptSha256":null,"schemaVersion":1,"sourceAssetId":"${ASSET}"}`,
    )
  })
})

describe('capture: script canonicalization', () => {
  it('is deterministic and independent of scene order fields', async () => {
    const s1 = canonicalCaptureScript({ generation_id: GEN, hook: 'hi', scenes: [
      { scene_number: 1, dialogue: 'one', show_in_teleprompter: true },
      { scene_number: 2, dialogue: null, show_in_teleprompter: false },
    ] })
    const s2 = canonicalCaptureScript({ generation_id: GEN, hook: 'hi', scenes: [
      { scene_number: 1, dialogue: 'one', show_in_teleprompter: true },
      { scene_number: 2, dialogue: null, show_in_teleprompter: false },
    ] })
    expect(s1).toBe(s2)
    expect(await captureScriptSha256({ generation_id: GEN, hook: 'hi', scenes: [
      { scene_number: 1, dialogue: 'one' },
    ] })).toMatch(/^[0-9a-f]{64}$/)
  })
})
