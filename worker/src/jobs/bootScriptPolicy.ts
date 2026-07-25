// Boot recording-script snapshot POLICY (Constitution §5.1) — PURE + injectable, so
// it has no db/env import and can be unit-tested directly. editorV2 supplies the real
// DB readers as deps. There is ONE explicit policy: asset+intent linkage is enforced
// BEFORE any marker/origin branch; a new-era source NEVER falls back to the live
// generation; marker-NULL is true legacy ONLY when no new-era row exists; every
// contradiction/drift fails closed.
import { PermanentJobError } from '../errors.js'
import {
  buildScriptSnapshot, buildNoCapturedScriptSnapshot, reCanonicalizeBoundSnapshot, type BuiltSnapshot,
} from './editorManifest.js'

// marker + capture-intent provenance + presence flags, read TOGETHER (never one in
// isolation), so linkage and the legacy invariant can be proven.
export interface SourceProvenanceState {
  marker: number | null           // media_assets.capture_contract_version
  assetOwner: string | null       // media_assets.owner_id
  assetGeneration: string | null  // media_assets.generation_id
  origin: string | null           // source_capture_intents.origin (null if no intent)
  intentOwner: string | null
  intentGeneration: string | null
  intentSource: string | null     // source_capture_intents.source_asset_id
  intentScriptSha: string | null  // the asserted recordingScriptSha256 (immutable)
  hasManifest: boolean            // a source_capture_manifests row exists
  hasBinding: boolean             // a source_script_snapshots row exists
}
export interface BootSnapshotDeps {
  readState: (sourceAssetId: string) => Promise<SourceProvenanceState>
  readRow: (sourceAssetId: string) => Promise<{ snapshot: unknown; snapshotSha: string; ownerId: string; generationId: string } | null>
}

const fail = (code: string, msg: string): never => { throw new PermanentJobError(`pin: ${msg}`, code) }

export async function resolveBootScriptSnapshot(
  sourceAssetId: string, generationId: string, ownerId: string,
  gen: { id: string; selected_hook: string | null; scene_timeline: unknown },
  deps: BootSnapshotDeps,
): Promise<BuiltSnapshot> {
  const st = await deps.readState(sourceAssetId)

  // (0) ASSET LINKAGE — enforced BEFORE any marker/origin branch, for every path.
  if (st.assetOwner !== ownerId || st.assetGeneration !== generationId) {
    fail('source_state_contradiction', `asset linkage mismatch for ${sourceAssetId}`)
  }

  // (1) LEGACY (marker NULL) is real ONLY with NO new-era rows at all.
  if (st.marker === null) {
    if (st.origin !== null || st.hasManifest || st.hasBinding) {
      fail('source_state_contradiction', `marker-null source ${sourceAssetId} carries new-era rows`)
    }
    return buildScriptSnapshot(gen) // documented true-legacy fallback
  }
  if (st.marker !== 1) fail('source_marker_unsupported', `unsupported capture_contract_version ${st.marker} on ${sourceAssetId}`)

  // (1b) A MARKED (new-era) source MUST have a normalized capture manifest — enforced
  // BEFORE origin branching (the 0091 ready-guard invariant; a marked source cannot be
  // `ready` without one, so at Boot it must exist).
  if (!st.hasManifest) fail('capture_manifest_required', `marked source ${sourceAssetId} has no capture manifest`)

  // (2) A marked source MUST have a capture intent bound to THIS owner/generation/source.
  if (st.origin === null) fail('source_state_contradiction', `marked source ${sourceAssetId} has no capture intent`)
  if (st.intentOwner !== ownerId || st.intentGeneration !== generationId || st.intentSource !== sourceAssetId) {
    fail('source_state_contradiction', `capture-intent linkage mismatch for ${sourceAssetId}`)
  }

  // (3) UPLOAD: explicit no-captured-script form; must NOT carry a script binding.
  if (st.origin === 'upload') {
    if (st.hasBinding) fail('source_state_contradiction', `upload source ${sourceAssetId} carries a script binding`)
    return buildNoCapturedScriptSnapshot(generationId)
  }
  if (st.origin !== 'teleprompter') fail('source_state_contradiction', `unknown capture origin ${st.origin} for ${sourceAssetId}`)

  // (4) TELEPROMPTER: require + fully verify the source-bound snapshot.
  const row = await deps.readRow(sourceAssetId)
  if (!row) fail('script_binding_missing', `teleprompter source ${sourceAssetId} missing script binding`)
  if (row!.ownerId !== ownerId || row!.generationId !== generationId) {
    fail('script_binding_linkage', `script binding linkage mismatch for ${sourceAssetId}`)
  }
  const rebuilt = reCanonicalizeBoundSnapshot(row!.snapshot, generationId) // throws script_binding_shape on bad content
  if (rebuilt.snapshotSha !== row!.snapshotSha) fail('script_binding_drift', `script binding content/SHA drift for ${sourceAssetId}`)
  if (!st.intentScriptSha || rebuilt.snapshotSha !== st.intentScriptSha) {
    fail('script_binding_intent_mismatch', `script binding does not match capture intent SHA for ${sourceAssetId}`)
  }
  return rebuilt
}
