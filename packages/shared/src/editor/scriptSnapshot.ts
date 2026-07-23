// Editor v2 — the SINGLE canonical Recording-Script snapshot + hash authority
// (Constitution §5.1 / Boot Manifest). There is exactly ONE canonical form of "the
// script the creator was prompted to speak", and it is used in THREE places that
// MUST agree byte-for-byte:
//   1. Capture (browser): V2Capture computes recordingScriptSha256 from the FULL,
//      unfiltered RecordingScript via captureScriptSha256 (which hashes the canonical
//      produced here).
//   2. Server (create RPC): editor_create_source_asset recomputes the same snapshot
//      SHA from generations.scene_timeline and REJECTS a mismatch, then persists the
//      immutable capture-time snapshot bound to the source asset.
//   3. Boot (worker): pins the SOURCE-BOUND snapshot (not the current generation).
// The worker keeps a byte-identical copy (it can't import shared at runtime); a
// parity test pins them together, and a DB↔TS parity fixture pins the plpgsql copy.
//
// This replaces the earlier split where the capture SHA used a DIFFERENT canonical
// from the worker snapshot and the two "need not be equal" — they MUST be equal, so
// a take's provenance binds to exactly the script it was recorded against.

import { canonicalJson, utf8ByteLength } from './director'
import { SCRIPT_SNAPSHOT_MAX_BYTES, type RecordingScriptSnapshot } from './contracts'

// SCRIPT_SNAPSHOT_MAX_BYTES + the RecordingScriptSnapshot shape live in ./contracts;
// this module is the builder/hasher for that ONE canonical form.
export const SCRIPT_SNAPSHOT_SCHEMA_VERSION = 1

// String normalization for the snapshot: Unicode NFC, then collapse every run of
// WhiteSpace ∪ LineTerminator (JS `\s`, i.e. all Unicode Zs plus TAB/LF/VT/FF/CR and
// U+FEFF) to a single space, then trim. The DB replicates this exact set explicitly
// so `normalize(...,NFC)` + the same collapse produce identical bytes.
export function normalizeSnapshotString(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim()
}

export interface SnapshotSceneInput {
  scene_number?: unknown
  scene_type?: unknown
  dialogue?: unknown
  show_in_teleprompter?: unknown
}
export interface RecordingScriptSnapshotInput {
  generationId: string
  // hook from the scene_timeline if present, else the generation's selected hook.
  hook?: unknown
  selectedHook?: string | null
  scenes: SnapshotSceneInput[]
}

export interface BuiltScriptSnapshot {
  snapshot: RecordingScriptSnapshot
  canonical: string
  snapshotSha: string
  canonicalBytes: number
}

// Deterministic snapshot of the FULL, UNFILTERED recording script:
//  * every scene (number, type, dialogue, teleprompter flag) — scenes are NEVER
//    dropped or filtered (hidden b-roll is part of the recorded-script identity).
//  * hook = scene_timeline.hook if a non-empty string, else selectedHook, else null.
// Fails closed (`script_snapshot_too_large`) when the canonical exceeds the bound.
export function buildRecordingScriptSnapshot(input: RecordingScriptSnapshotInput): BuiltScriptSnapshot {
  const rawHook = typeof input.hook === 'string' ? input.hook : input.selectedHook ?? null
  const hook = typeof rawHook === 'string' && normalizeSnapshotString(rawHook) !== ''
    ? normalizeSnapshotString(rawHook)
    : null
  const scenes = input.scenes.map((s, i) => ({
    sceneNumber: Number.isInteger(s.scene_number) ? (s.scene_number as number) : i + 1,
    sceneType: typeof s.scene_type === 'string' ? normalizeSnapshotString(s.scene_type) : 'talking_head',
    dialogue: typeof s.dialogue === 'string' ? normalizeSnapshotString(s.dialogue) : null,
    showInTeleprompter: s.show_in_teleprompter !== false,
  }))
  const snapshot: RecordingScriptSnapshot = { schemaVersion: SCRIPT_SNAPSHOT_SCHEMA_VERSION, generationId: input.generationId, hook, scenes }
  const canonical = canonicalJson(snapshot)
  const canonicalBytes = utf8ByteLength(canonical)
  if (canonicalBytes > SCRIPT_SNAPSHOT_MAX_BYTES) {
    const err = new Error(`script snapshot canonical form is ${canonicalBytes} bytes (cap ${SCRIPT_SNAPSHOT_MAX_BYTES})`)
    ;(err as { code?: string }).code = 'script_snapshot_too_large'
    throw err
  }
  return { snapshot, canonical, snapshotSha: '', canonicalBytes }
}
