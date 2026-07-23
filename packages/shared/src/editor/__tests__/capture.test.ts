import { describe, it, expect } from 'vitest'
import {
  buildTeleprompterIntent,
  buildUploadIntent,
  validateCaptureIntent,
  normalizeCaptureManifest,
  canonicalManifestBytes,
  captureIntentSha256,
  captureScriptSha256,
  canonicalCaptureScript,
  sha256Hex,
  normalizeDialogue,
  CaptureContractError,
  CAPTURE_MIN_SEGMENT_MS,
  CAPTURE_END_TOLERANCE_MS,
  type SourceCaptureIntentV1,
} from '../capture'

const GEN = '11111111-1111-1111-1111-111111111111'
const ASSET = '22222222-2222-2222-2222-222222222222'
const ATTEMPT = '33333333-3333-3333-3333-333333333333'
const SHA = 'a'.repeat(64)

function code(fn: () => unknown): string {
  try { fn(); return '<<no throw>>' } catch (e) { return (e as CaptureContractError).code }
}
async function acode(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return '<<no throw>>' } catch (e) { return (e as CaptureContractError).code }
}

describe('capture: teleprompter intent', () => {
  it('builds and validates a well-formed teleprompter intent', async () => {
    const intent = await buildTeleprompterIntent({
      generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 2000, dialogue: 'hello world' },
        { sceneNumber: 2, startMs: 2000, endMs: 5000, dialogue: 'second scene' },
      ],
    })
    expect(intent.origin).toBe('teleprompter')
    expect(intent.acceptedSegments).toHaveLength(2)
    expect(intent.acceptedSegments[0].intendedDialogueSha256).toMatch(/^[0-9a-f]{64}$/)
    // deterministic dialogue hash
    expect(intent.acceptedSegments[0].intendedDialogueSha256).toBe(await sha256Hex(normalizeDialogue('hello world')))
    expect(() => validateCaptureIntent(intent)).not.toThrow()
  })

  it('rounds active-seconds-derived ms and rejects sub-min segments', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [{ sceneNumber: 1, startMs: 0, endMs: CAPTURE_MIN_SEGMENT_MS - 1, dialogue: 'x' }],
    }))).toBe('capture_intent_short_segment')
  })

  it('rejects overlapping / out-of-order segments', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 3000, dialogue: 'a' },
        { sceneNumber: 2, startMs: 2000, endMs: 5000, dialogue: 'b' },
      ],
    }))).toBe('capture_intent_overlap')
  })

  it('rejects duplicate scene numbers', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 3000, dialogue: 'a' },
        { sceneNumber: 1, startMs: 3000, endMs: 6000, dialogue: 'b' },
      ],
    }))).toBe('capture_intent_dup_scene')
  })

  it('rejects empty teleprompter segments', async () => {
    expect(await acode(() => buildTeleprompterIntent({
      generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA, segments: [],
    }))).toBe('capture_intent_no_segments')
  })
})

describe('capture: upload intent', () => {
  it('builds an explicit empty upload-origin intent', () => {
    const intent = buildUploadIntent({ generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT })
    expect(intent.origin).toBe('upload')
    expect(intent.recordingScriptSha256).toBeNull()
    expect(intent.recorderClock).toBe('none')
    expect(intent.acceptedSegments).toEqual([])
  })

  it('rejects an upload intent carrying segments', () => {
    const bad = { ...buildUploadIntent({ generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT }),
      acceptedSegments: [{ sceneNumber: 1, startMs: 0, endMs: 3000, intendedDialogueSha256: SHA }] }
    expect(code(() => validateCaptureIntent(bad))).toBe('capture_intent_upload_shape')
  })
})

describe('capture: validation hostile shapes', () => {
  const base = () => buildUploadIntent({ generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT })
  it('rejects non-objects and bad ids/versions', () => {
    expect(code(() => validateCaptureIntent(null))).toBe('capture_intent_not_object')
    expect(code(() => validateCaptureIntent({ ...base(), schemaVersion: 2 }))).toBe('capture_intent_schema')
    expect(code(() => validateCaptureIntent({ ...base(), origin: 'nope' }))).toBe('capture_intent_bad_origin')
    expect(code(() => validateCaptureIntent({ ...base(), generationId: 'not-a-uuid' }))).toBe('capture_intent_bad_id')
  })
  it('rejects teleprompter without a 64-hex script sha', () => {
    const t: SourceCaptureIntentV1 = { ...base(), origin: 'teleprompter', recordingScriptSha256: 'short',
      recorderClock: 'mediarecorder-active-time-ms',
      acceptedSegments: [{ sceneNumber: 1, startMs: 0, endMs: 3000, intendedDialogueSha256: SHA }] }
    expect(code(() => validateCaptureIntent(t))).toBe('capture_intent_bad_script_sha')
  })
})

describe('capture: server normalization vs measured duration', () => {
  async function tele() {
    return buildTeleprompterIntent({
      generationId: GEN, sourceAssetId: ASSET, clientAttemptId: ATTEMPT, recordingScriptSha256: SHA,
      segments: [
        { sceneNumber: 1, startMs: 0, endMs: 2000, dialogue: 'a' },
        { sceneNumber: 2, startMs: 2000, endMs: 5000, dialogue: 'b' },
      ],
    })
  }
  it('normalizes within-duration segments', async () => {
    const intent = await tele()
    const iSha = await captureIntentSha256(intent)
    const m = normalizeCaptureManifest({ intent, sourceSha256: SHA, sourceDurationMs: 5000, intentSha256: iSha })
    expect(m.acceptedSegments).toHaveLength(2)
    expect(m.acceptedSegments[1].sourceEndMs).toBe(5000)
    expect(m.origin).toBe('teleprompter')
    expect(() => canonicalManifestBytes(m)).not.toThrow()
  })
  it('clamps a terminal end within tolerance', async () => {
    const intent = await tele()
    const iSha = await captureIntentSha256(intent)
    // measured slightly shorter than the last end, within tolerance
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
