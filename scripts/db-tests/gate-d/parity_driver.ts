// Emits TS canonical + sha for stored-intent fixtures, for DB↔TS parity.
// Bundled by run.sh with esbuild (resolves the shared capture module).
import { buildStoredIntent, canonicalCaptureIntent, captureIntentSha256, type SourceCaptureIntentInputV1 } from '../../../packages/shared/src/editor/capture'

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
const fixtures = [
  buildStoredIntent(uploadInput, { sourceAssetId: ASSET, recordedAt: R }),
  buildStoredIntent(teleInput, { sourceAssetId: ASSET, recordedAt: R }),
]
;(async () => {
  const out = []
  for (const f of fixtures) out.push({ intent: f, canonical: canonicalCaptureIntent(f), sha: await captureIntentSha256(f) })
  process.stdout.write(JSON.stringify(out))
})()
