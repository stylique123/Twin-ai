// Emits TS canonical fixtures for DB↔TS parity: for each intent, the stored
// canonical + sha, and the browser input + its input-canonical. Also emits a
// numeric-normalization fixture (integral float on the wire) to prove the DB's
// trunc()-based number emission matches JSON.stringify of the integer.
// Bundled by run.sh with esbuild.
import {
  buildStoredIntent, canonicalCaptureIntent, canonicalCaptureIntentInput, captureIntentSha256,
  sha256Hex, type SourceCaptureIntentInputV1,
} from '../../../packages/shared/src/editor/capture'
import { buildRecordingScriptSnapshot } from '../../../packages/shared/src/editor/scriptSnapshot'

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

  // ---- ONE canonical recording-script snapshot: DB↔TS byte parity ----
  // Each fixture is a scene_timeline (jsonb) + selected_hook fed VERBATIM to the DB
  // editor_recording_script_canonical(gen, scene_timeline, selected_hook), and the
  // same inputs to shared buildRecordingScriptSnapshot. Hostile strings prove the
  // NFC + WhiteSpace-collapse (JS \s) normalization matches byte-for-byte.
  const NBSP = ' ', EMSP = ' ', IDSP = '　', BOM = '﻿'
  const scriptFixtures: Array<{ label: string; sceneTimeline: unknown; selectedHook: string | null }> = [
    { label: 'basic', selectedHook: 'col hook',
      sceneTimeline: { hook: 'Hello there', scenes: [
        { scene_number: 1, scene_type: 'talking_head', dialogue: 'Hello world', show_in_teleprompter: true },
      ] } },
    { label: 'hook-from-selected (no timeline hook)', selectedHook: 'Fallback   hook',
      sceneTimeline: { scenes: [
        { scene_number: 1, scene_type: 'talking_head', dialogue: 'one', show_in_teleprompter: true },
      ] } },
    { label: 'hostile whitespace + NFC + noncontiguous + hidden', selectedHook: null,
      sceneTimeline: { hook: `  Big${NBSP}${NBSP}news${EMSP}today\t\n `, scenes: [
        // NFC: e + combining acute (U+0301) must fold to é, matching normalize(...,NFC)
        { scene_number: 1, scene_type: 'talking_head', dialogue: `Café${IDSP}time${BOM}`, show_in_teleprompter: true },
        { scene_number: 3, scene_type: 'b_roll', dialogue: null, show_in_teleprompter: false },
        { scene_number: 7, scene_type: 'cta', dialogue: '  trailing\r\nspace  ', show_in_teleprompter: true },
      ] } },
    { label: 'empty timeline (null scene_timeline path)', selectedHook: null, sceneTimeline: null },
    { label: 'missing scene_number falls back to index', selectedHook: 'h',
      sceneTimeline: { hook: 'h', scenes: [
        { scene_type: 'talking_head', dialogue: 'a', show_in_teleprompter: true },
        { scene_number: 1.5, scene_type: 'talking_head', dialogue: 'b', show_in_teleprompter: true },
      ] } },
  ]
  for (const f of scriptFixtures) {
    const tl = (f.sceneTimeline && typeof f.sceneTimeline === 'object') ? f.sceneTimeline as { hook?: unknown; scenes?: unknown[] } : null
    const built = buildRecordingScriptSnapshot({
      generationId: GEN,
      hook: tl?.hook,
      selectedHook: f.selectedHook,
      scenes: (tl?.scenes ?? []) as { scene_number?: unknown; scene_type?: unknown; dialogue?: unknown; show_in_teleprompter?: unknown }[],
    })
    out.push({
      scriptSnap: true, label: f.label, generationId: GEN,
      sceneTimeline: f.sceneTimeline, selectedHook: f.selectedHook,
      canonical: built.canonical, sha: await sha256Hex(built.canonical),
    })
  }
  process.stdout.write(JSON.stringify(out))
})()
