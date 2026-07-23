// Boot recording-script snapshot POLICY (Constitution §5.1) — PURE + injectable, so
// it has no db/env import and can be unit-tested directly. editorV2 supplies the real
// DB readers as deps. There is ONE explicit marker × origin policy: a new-era source
// NEVER falls back to the live generation, and every contradiction/drift fails closed.
import { PermanentJobError } from '../errors.js'
import {
  buildScriptSnapshot, buildNoCapturedScriptSnapshot, reCanonicalizeBoundSnapshot, type BuiltSnapshot,
} from './editorManifest.js'

// marker + capture-intent provenance, read TOGETHER (never one in isolation).
export interface SourceProvenanceState {
  marker: number | null           // media_assets.capture_contract_version
  assetOwner: string | null
  assetGeneration: string | null
  origin: string | null           // source_capture_intents.origin (null if no intent)
  intentScriptSha: string | null  // the asserted recordingScriptSha256 (immutable)
}
export interface BootSnapshotDeps {
  readState: (sourceAssetId: string) => Promise<SourceProvenanceState>
  readRow: (sourceAssetId: string) => Promise<{ snapshot: unknown; snapshotSha: string; ownerId: string; generationId: string } | null>
}

//   * marker NULL (true pre-0091 legacy)  → documented fallback to the live script.
//   * marker=1 + teleprompter             → a valid SOURCE-BOUND snapshot is REQUIRED:
//       linkage (owner/generation) + re-canonicalized content SHA must equal the stored
//       SHA AND the immutable capture-intent SHA; any miss = permanent fail.
//   * marker=1 + upload                   → explicit no-captured-script form; no row
//       read, no live-generation fallback, no fake bound snapshot.
//   * any other marker / state contradiction → fail closed.
export async function resolveBootScriptSnapshot(
  sourceAssetId: string, generationId: string, ownerId: string,
  gen: { id: string; selected_hook: string | null; scene_timeline: unknown },
  deps: BootSnapshotDeps,
): Promise<BuiltSnapshot> {
  const st = await deps.readState(sourceAssetId)
  if (st.marker === null) return buildScriptSnapshot(gen) // true legacy fallback
  if (st.marker !== 1) {
    throw new PermanentJobError(`pin: unsupported capture_contract_version ${st.marker} on ${sourceAssetId}`, 'source_marker_unsupported')
  }
  if (st.origin === null) {
    throw new PermanentJobError(`pin: marked source ${sourceAssetId} has no capture intent`, 'source_state_contradiction')
  }
  if (st.origin === 'upload') return buildNoCapturedScriptSnapshot(generationId)
  if (st.origin !== 'teleprompter') {
    throw new PermanentJobError(`pin: unknown capture origin ${st.origin} for ${sourceAssetId}`, 'source_state_contradiction')
  }
  const row = await deps.readRow(sourceAssetId)
  if (!row) throw new PermanentJobError(`pin: teleprompter source ${sourceAssetId} missing script binding`, 'script_binding_missing')
  if (row.ownerId !== ownerId || row.generationId !== generationId) {
    throw new PermanentJobError(`pin: script binding linkage mismatch for ${sourceAssetId}`, 'script_binding_linkage')
  }
  const rebuilt = reCanonicalizeBoundSnapshot(row.snapshot) // throws script_binding_shape on bad content
  if (rebuilt.snapshotSha !== row.snapshotSha) {
    throw new PermanentJobError(`pin: script binding content/SHA drift for ${sourceAssetId}`, 'script_binding_drift')
  }
  if (!st.intentScriptSha || rebuilt.snapshotSha !== st.intentScriptSha) {
    throw new PermanentJobError(`pin: script binding does not match capture intent SHA for ${sourceAssetId}`, 'script_binding_intent_mismatch')
  }
  return rebuilt
}
