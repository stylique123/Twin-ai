// Parity: the worker-local capture contract (worker/src/jobs/captureContract.ts)
// must match the shared authority (packages/shared/src/editor/capture.ts) — same
// constants, same validation codes, byte-identical canonical manifest. Excluded
// from the worker tsc build, so it CAN import shared by relative path.
import { describe, it, expect } from 'vitest'
import * as W from '../jobs/captureContract.js'
import * as S from '../../../packages/shared/src/editor/capture'

const GEN = '11111111-1111-1111-1111-111111111111'
const ASSET = '22222222-2222-2222-2222-222222222222'
const ATTEMPT = '33333333-3333-3333-3333-333333333333'
const SHA = 'a'.repeat(64)
const DSHA = 'b'.repeat(64)

const intent: W.SourceCaptureIntentV1 = {
  schemaVersion: 1,
  origin: 'teleprompter',
  generationId: GEN,
  sourceAssetId: ASSET,
  recordingScriptSha256: SHA,
  clientAttemptId: ATTEMPT,
  recorderClock: 'mediarecorder-active-time-ms',
  acceptedSegments: [
    { sceneNumber: 1, startMs: 0, endMs: 2000, intendedDialogueSha256: DSHA },
    { sceneNumber: 2, startMs: 2000, endMs: 5000, intendedDialogueSha256: DSHA },
  ],
}

describe('capture-contract parity: constants', () => {
  it('frozen constants match the shared authority', () => {
    expect(W.CAPTURE_SCHEMA_VERSION).toBe(S.CAPTURE_SCHEMA_VERSION)
    expect(W.CAPTURE_NORMALIZATION_VERSION).toBe(S.CAPTURE_NORMALIZATION_VERSION)
    expect(W.CAPTURE_END_TOLERANCE_MS).toBe(S.CAPTURE_END_TOLERANCE_MS)
    expect(W.CAPTURE_MIN_SEGMENT_MS).toBe(S.CAPTURE_MIN_SEGMENT_MS)
    expect(W.CAPTURE_MAX_SEGMENTS).toBe(S.CAPTURE_MAX_SEGMENTS)
    expect(W.CAPTURE_INTENT_MAX_BYTES).toBe(S.CAPTURE_INTENT_MAX_BYTES)
    expect(W.CAPTURE_MANIFEST_MAX_BYTES).toBe(S.CAPTURE_MANIFEST_MAX_BYTES)
  })
})

describe('capture-contract parity: validation', () => {
  it('accepts an identical well-formed intent on both sides', () => {
    expect(() => W.validateCaptureIntent(intent)).not.toThrow()
    expect(() => S.validateCaptureIntent(intent)).not.toThrow()
  })
  it('rejects the same hostile shapes with the same code', () => {
    const bad = { ...intent, acceptedSegments: [
      { sceneNumber: 1, startMs: 0, endMs: 3000, intendedDialogueSha256: DSHA },
      { sceneNumber: 2, startMs: 1000, endMs: 4000, intendedDialogueSha256: DSHA },
    ] }
    const wc = grab(() => W.validateCaptureIntent(bad))
    const sc = grab(() => S.validateCaptureIntent(bad))
    expect(wc).toBe('capture_intent_overlap')
    expect(sc).toBe(wc)
  })
})

describe('capture-contract parity: normalization is byte-identical', () => {
  it('produces the same canonical manifest bytes on both sides', () => {
    const args = { intent, sourceSha256: SHA, sourceDurationMs: 5000, intentSha256: SHA }
    const wNorm = W.normalizeCaptureManifest(args)
    const sNorm = S.normalizeCaptureManifest(args)
    expect(W.canonicalManifestBytes(wNorm)).toBe(S.canonicalManifestBytes(sNorm))
  })
  it('both fail closed beyond the terminal tolerance with the same code', () => {
    const dur = 5000 - (W.CAPTURE_END_TOLERANCE_MS + 500)
    const args = { intent, sourceSha256: SHA, sourceDurationMs: dur, intentSha256: SHA }
    expect(grab(() => W.normalizeCaptureManifest(args))).toBe('capture_manifest_out_of_bounds')
    expect(grab(() => S.normalizeCaptureManifest(args))).toBe('capture_manifest_out_of_bounds')
  })
})

function grab(fn: () => unknown): string {
  try { fn(); return '<<no throw>>' } catch (e) { return (e as { code?: string }).code ?? '<<no code>>' }
}
