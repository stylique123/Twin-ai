// Emits TS canonical fixtures for DB↔TS parity: for each intent, the stored
// canonical + sha, and the browser input + its input-canonical. Also emits a
// numeric-normalization fixture (integral float on the wire) to prove the DB's
// trunc()-based number emission matches JSON.stringify of the integer.
// Bundled by run.sh with esbuild.
import {
  buildStoredIntent, canonicalCaptureIntent, canonicalCaptureIntentInput, captureIntentSha256,
  type SourceCaptureIntentInputV1,
} from '../../../packages/shared/src/editor/capture'

const GEN = '11111111-1111-1111-1111-111111111111'
const ASSET = '22222222-2222-2222-2222-222222222222'
const ATTEMPT = '33333333-3333-3333-3333-333333333333'
const SHA = 'a'.repeat(64); const DSHA = 'b'.repeat(64)
const R = '2026-07-23T11:00:00.000Z'

const uploadInput: SourceCaptureIntentInputV1 = {
  schemaVersion: 1, origin: 'upload', generationId: GEN, recordingScriptSha256: null,
  clientAttemptId: ATTEMPT, recorderClock: 'none', acceptedSegments: [],
}
const teleInput: SourceCaptureIntentInputV1 = {
  schemaVersion: 1, origin: 'teleprompter', generationId: GEN, recordingScriptSha256: SHA,
  clientAttemptId: ATTEMPT, recorderClock: 'mediarecorder-active-time-ms',
  acceptedSegments: [
    { sceneNumber: 1, startMs: 0, endMs: 2000, intendedDialogueSha256: DSHA },
    { sceneNumber: 2, startMs: 2000, endMs: 5000, intendedDialogueSha256: DSHA },
  ],
}
const inputs = [uploadInput, teleInput]
;(async () => {
  const out: unknown[] = []
  for (const input of inputs) {
    const stored = buildStoredIntent(input, { sourceAssetId: ASSET, recordedAt: R })
    out.push({
      input, inputCanonical: canonicalCaptureIntentInput(input),
      stored, canonical: canonicalCaptureIntent(stored), sha: await captureIntentSha256(stored),
    })
  }
  // Numeric-normalization fixture: the DB receives integral FLOATS on the wire
  // (0.0 / 2000.0) as a RAW json string; the shared reference is the integer
  // form. dbStoredRaw is fed verbatim to the DB canonical fn.
  const teleInts = buildStoredIntent(teleInput, { sourceAssetId: ASSET, recordedAt: R })
  const dbStoredRaw = JSON.stringify(teleInts).replace('"startMs":0,', '"startMs":0.0,').replace('"endMs":2000,', '"endMs":2000.0,')
  out.push({ numericNorm: true, dbStoredRaw, canonical: canonicalCaptureIntent(teleInts) })
  process.stdout.write(JSON.stringify(out))
})()
