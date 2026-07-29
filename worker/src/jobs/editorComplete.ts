// Editor v2 — Phase 8 Batch 8.4: fenced persistence and completion calls.
//
// SOLE RESPONSIBILITY (Gate-0 §7): the ONLY module that writes a plan, reserves
// an output path, marks an output ready, or completes a project. Every call
// here goes through a fenced RPC in migration 0094, which re-proves the lease,
// the attempt token and the stage before touching a row.
//
// WHY THE GUARDS ARE IN SQL AND THIS FILE IS THIN
//
// Nothing in this module is the enforcement. `completed` with a null or
// non-ready output is refused by a CHECK constraint and a trigger, not by the
// `if` statements below — because a guard in TypeScript protects against the
// callers that go through TypeScript, and the failure mode worth insuring
// against is the one that does not: a manual fix at 3am, a worker built from a
// branch nobody reviewed, a future caller written by someone who never read
// this file. The database is the only party present for all of those.
//
// So this file's job is to call the right RPC with the right arguments, and to
// TRANSLATE FAILURES HONESTLY. That second part is not clerical: a fenced RPC
// raising `lease_lost` means another worker owns this project now and this one
// must stop, while `output_completion_conflict` means the work is done and
// retrying will never help. Collapsing them into one "database error" is how a
// permanent failure becomes an infinite retry.
//
// NO PATH IS EVER SENT. `editor_reserve_output` takes no path argument — the
// database derives it. There is deliberately no parameter here through which
// one could be supplied, because a path that can be passed is a path that can
// be wrong.
import { db } from '../db.js'
import { PermanentJobError, LeaseLostError } from '../errors.js'
import { editPlanSha256, type EditPlanV1 } from './editPlanContract.js'

export interface Fence {
  projectId: string
  jobId: string
  worker: string
  attempt: number
}
const baseArgs = (f: Fence) => ({
  p_project: f.projectId, p_job: f.jobId, p_worker: f.worker, p_attempt: f.attempt,
})

export type OutputKind = 'video' | 'cover'

export interface ReservedOutput {
  id: string
  storage_bucket: string
  storage_path: string
  kind: OutputKind
  state: 'reserved' | 'ready' | 'abandoned'
  bytes: number | null
  sha256: string | null
}

/**
 * Turn a raised Postgres message into the right KIND of failure.
 *
 * The RPCs raise with a stable prefix (`lease_lost:`, `edit_plan_divergent:`,
 * …). Matching on that prefix is deliberate and is why the SQL raises in that
 * shape: matching on free text would break the first time someone improved a
 * message, and matching on SQLSTATE cannot distinguish two of our own
 * conditions that both surface as P0001.
 *
 * ANYTHING UNRECOGNISED IS RETRYABLE. That is the safe default here — a
 * transient connection failure misclassified as permanent abandons a render
 * that would have succeeded, while a genuine permanent failure misclassified as
 * transient is caught by the attempt ceiling. The two mistakes are not
 * symmetric, so the default follows the cheaper one.
 */
export function classifyCompletionError(message: string): Error {
  const code = (message.split(':')[0] || '').trim()
  if (code === 'lease_lost') return new LeaseLostError(message)
  const permanent = new Set([
    'edit_plan_divergent', 'edit_plan_invalid', 'edit_plan_wrong_stage',
    'render_wrong_stage', 'render_output_profile_invalid',
    'output_completion_conflict',
  ])
  if (permanent.has(code)) return new PermanentJobError(message, code)
  return new Error(message)
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw classifyCompletionError(error.message)
  return data as T
}

/**
 * Persist the compiled plan. Returns the plan row id.
 *
 * The digest is recomputed HERE from the plan document rather than accepted as
 * an argument. A caller-supplied digest could describe a different document
 * than the one being stored, and the whole value of the digest is that it
 * describes exactly what is in the row.
 */
export async function recordEditPlan(fence: Fence, plan: EditPlanV1): Promise<string> {
  const planSha256 = editPlanSha256(plan)
  return callRpc<string>('editor_record_edit_plan', {
    ...baseArgs(fence),
    p_plan_sha256: planSha256,
    p_decision_sha256: plan.identity.decisionSha256,
    p_boot_manifest_sha: plan.identity.bootManifestSha,
    p_script_snapshot_sha: plan.identity.scriptSnapshotSha,
    p_source_checksum: plan.identity.sourceChecksum,
    p_plan_version: plan.identity.planVersion,
    p_policy_version: plan.identity.policyVersion,
    p_compiler_version: plan.identity.compilerVersion,
    p_plan: plan as unknown as Record<string, unknown>,
    p_output_duration_ms: plan.output.durationMs,
  })
}

/** Reserve a server-derived output path. Idempotent across a crash-resume. */
export async function reserveOutput(
  fence: Fence, kind: OutputKind, bucket: string,
): Promise<ReservedOutput> {
  return callRpc<ReservedOutput>('editor_reserve_output', {
    ...baseArgs(fence), p_kind: kind, p_bucket: bucket,
  })
}

/**
 * Mark a reserved output ready, WITH the measurements that justify it.
 *
 * The measurements are required by the schema, not merely by this signature —
 * `edit_outputs_ready_is_measured` refuses a ready row without them. Passing
 * them here is how the call succeeds; it is not what makes the rule true.
 */
export async function markOutputReady(
  fence: Fence, kind: OutputKind,
  measured: { bytes: number; sha256: string; durationMs?: number },
): Promise<ReservedOutput> {
  if (!Number.isFinite(measured.bytes) || measured.bytes <= 0) {
    throw new PermanentJobError('output has no positive size to record', 'output_decode_failed')
  }
  if (!/^[0-9a-f]{64}$/.test(measured.sha256)) {
    throw new PermanentJobError('output digest is not a sha256', 'output_decode_failed')
  }
  if (kind === 'video' && (measured.durationMs === undefined || measured.durationMs < 0)) {
    throw new PermanentJobError('a video output cannot be ready without a measured duration', 'output_duration_mismatch')
  }
  return callRpc<ReservedOutput>('editor_mark_output_ready', {
    ...baseArgs(fence), p_kind: kind,
    p_bytes: measured.bytes, p_sha256: measured.sha256,
    p_measured_duration_ms: kind === 'video' ? measured.durationMs : null,
  })
}

export interface OutputAssetFacts {
  width: number
  height: number
  fpsNum: number
  fpsDen: number
  mime: string
}

/**
 * Mint the `media_assets` row for a rendered output.
 *
 * 0094 shipped `editor_complete_output` taking an asset id with NOTHING able to
 * create one — the completion path was unreachable, and the only way to reach
 * it would have been an unfenced `media_assets` insert from the worker. 0096
 * added this RPC; the wrapper exists so that remains the only route.
 *
 * The path, bucket, owner, digest AND DURATION are not sent. The database
 * derives them from the reserved `edit_outputs` row, so there is no argument
 * through which they could disagree with what was actually rendered.
 *
 * Duration in particular: it used to be a parameter, and the caller was passing
 * the plan's PROMISED length rather than the MEASURED one. The ±250 ms
 * tolerance exists because those differ, so the asset would have recorded a
 * claim. Width/height/fps stay parameters only because the validator refuses
 * any output whose raster or frame rate is not exactly the profile's — proven
 * equal, so no gap to disagree across.
 */
export async function createOutputAsset(fence: Fence, facts: OutputAssetFacts): Promise<string> {
  if (!Number.isInteger(facts.width) || !Number.isInteger(facts.height)
    || facts.width <= 0 || facts.height <= 0) {
    throw new PermanentJobError('the output asset needs a measured raster', 'output_stream_mismatch')
  }
  return callRpc<string>('editor_create_output_asset', {
    ...baseArgs(fence),
    p_width: facts.width, p_height: facts.height,
    p_fps_num: facts.fpsNum, p_fps_den: facts.fpsDen,
    p_mime: facts.mime,
  })
}

/**
 * THE ONLY PATH TO `completed`.
 *
 * There is no second function, no direct UPDATE, and no flag that skips this.
 * If a future stage needs to complete a project it calls this, and if this
 * refuses then the project is not completable — which is the point.
 */
export async function completeOutput(fence: Fence, outputAssetId: string): Promise<{ status: string; output_asset_id: string }> {
  if (!outputAssetId) {
    throw new PermanentJobError('completion requires an output asset', 'output_completion_conflict')
  }
  return callRpc<{ status: string; output_asset_id: string }>('editor_complete_output', {
    ...baseArgs(fence), p_output_asset: outputAssetId,
  })
}
