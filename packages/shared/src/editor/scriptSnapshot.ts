// Editor v2 — the SINGLE canonical Recording-Script snapshot authority
// (Constitution §5.1 / Boot Manifest). There is exactly ONE canonical form of "the
// script the creator was prompted to speak", used in places that MUST agree
// byte-for-byte:
//   1. Capture (browser): V2Capture computes recordingScriptSha256 from the FULL,
//      unfiltered RecordingScript via captureScriptSha256 (which hashes the canonical
//      produced here).
//   2. Server (create RPC, teleprompter only): editor_create_source_asset recomputes
//      the same snapshot SHA from generations.scene_timeline, REJECTS a mismatch, and
//      persists the immutable capture-time snapshot bound to the source asset.
//   3. Boot (worker): re-canonicalizes + re-hashes the SOURCE-BOUND snapshot and
//      cross-checks it against the immutable capture intent — never the live
//      generation for a new-era source.
// Uploads are NOT recorded against a script: they carry the explicit
// NO-CAPTURED-SCRIPT form (buildNoCapturedScriptSnapshot), never a script snapshot.
//
// This module is PURE (no crypto): it produces canonical strings; callers hash them
// (WebCrypto in the browser, node:crypto in the worker, pgcrypto in the DB). It never
// exposes a hash field so no caller can mistake a placeholder for an authoritative SHA.

import { canonicalJson, utf8ByteLength } from './director'
import { SCRIPT_SNAPSHOT_MAX_BYTES, type RecordingScriptSnapshot } from './contracts'

// SCRIPT_SNAPSHOT_MAX_BYTES + the RecordingScriptSnapshot shape live in ./contracts;
// this module is the builder/validator for that ONE canonical form. (Tests import the
// cap from ./contracts — re-exporting it here would collide in the editor barrel.)
export const SCRIPT_SNAPSHOT_SCHEMA_VERSION = 1

// String normalization for the snapshot: Unicode NFC, then collapse every run of
// WhiteSpace ∪ LineTerminator (JS `\s`, i.e. all Unicode Zs plus TAB/LF/VT/FF/CR and
// U+FEFF) to a single space, then trim. The DB replicates this exact set explicitly
// so `normalize(...,NFC)` + the same collapse produce identical bytes.
export function normalizeSnapshotString(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim()
}

function tooLarge(canonical: string): void {
  const bytes = utf8ByteLength(canonical)
  if (bytes > SCRIPT_SNAPSHOT_MAX_BYTES) {
    const err = new Error(`script snapshot canonical form is ${bytes} bytes (cap ${SCRIPT_SNAPSHOT_MAX_BYTES})`)
    ;(err as { code?: string }).code = 'script_snapshot_too_large'
    throw err
  }
}
function reject(code: string, msg: string): never {
  const err = new Error(`${code}: ${msg}`)
  ;(err as { code?: string }).code = code
  throw err
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
  canonicalBytes: number
}

// Deterministic snapshot of the FULL, UNFILTERED recording script (teleprompter
// origin). Every scene (number, type, dialogue, teleprompter flag) is kept — hidden
// b-roll is part of the recorded-script identity. hook = scene_timeline.hook if a
// non-empty string, else selectedHook, else null. Fails closed on the byte cap.
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
  tooLarge(canonical)
  return { snapshot, canonical, canonicalBytes: utf8ByteLength(canonical) }
}

// The explicit NO-CAPTURED-SCRIPT provenance form for UPLOAD sources. An uploaded
// file was not recorded against the generation's script, so it gets a distinct,
// deterministic snapshot (discriminated by capturedScript:false) — NEVER a script
// snapshot and NEVER derived from the live generation.
export interface NoCapturedScriptSnapshot {
  schemaVersion: number
  capturedScript: false
  generationId: string
}
export interface BuiltNoCapturedScript {
  snapshot: NoCapturedScriptSnapshot
  canonical: string
}
export function buildNoCapturedScriptSnapshot(generationId: string): BuiltNoCapturedScript {
  const snapshot: NoCapturedScriptSnapshot = { schemaVersion: SCRIPT_SNAPSHOT_SCHEMA_VERSION, capturedScript: false, generationId }
  return { snapshot, canonical: canonicalJson(snapshot) }
}

// Strictly re-validate + re-canonicalize a SOURCE-BOUND recording-script snapshot read
// back at Boot (Constitution §5.1). Trusts NOTHING about the stored jsonb: it checks
// the exact keyset/types/bounds and re-serializes canonically so Boot can recompute
// the SHA from CONTENT and compare to the stored SHA and the capture intent. jsonb key
// ordering is not proof; only the re-canonicalized bytes are. Throws a stable code on
// any shape/type/bounds violation.
export function reCanonicalizeBoundSnapshot(raw: unknown): { canonical: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) reject('script_binding_shape', 'bound snapshot is not an object')
  const o = raw as Record<string, unknown>
  const keys = Object.keys(o).sort()
  if (keys.join(',') !== 'generationId,hook,scenes,schemaVersion') reject('script_binding_shape', `unexpected keys: ${keys.join(',')}`)
  if (o.schemaVersion !== SCRIPT_SNAPSHOT_SCHEMA_VERSION) reject('script_binding_shape', 'bad schemaVersion')
  if (typeof o.generationId !== 'string' || o.generationId === '') reject('script_binding_shape', 'bad generationId')
  if (!(o.hook === null || typeof o.hook === 'string')) reject('script_binding_shape', 'bad hook')
  if (!Array.isArray(o.scenes)) reject('script_binding_shape', 'scenes not an array')
  const scenes = (o.scenes as unknown[]).map((s) => {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) reject('script_binding_shape', 'scene not an object')
    const sc = s as Record<string, unknown>
    const sk = Object.keys(sc).sort()
    if (sk.join(',') !== 'dialogue,sceneNumber,sceneType,showInTeleprompter') reject('script_binding_shape', `bad scene keys: ${sk.join(',')}`)
    if (!Number.isInteger(sc.sceneNumber)) reject('script_binding_shape', 'bad sceneNumber')
    if (typeof sc.sceneType !== 'string') reject('script_binding_shape', 'bad sceneType')
    if (!(sc.dialogue === null || typeof sc.dialogue === 'string')) reject('script_binding_shape', 'bad dialogue')
    if (typeof sc.showInTeleprompter !== 'boolean') reject('script_binding_shape', 'bad showInTeleprompter')
    return { sceneNumber: sc.sceneNumber, sceneType: sc.sceneType, dialogue: sc.dialogue, showInTeleprompter: sc.showInTeleprompter }
  })
  const canonical = canonicalJson({ schemaVersion: o.schemaVersion, generationId: o.generationId, hook: o.hook, scenes })
  tooLarge(canonical)
  return { canonical }
}
