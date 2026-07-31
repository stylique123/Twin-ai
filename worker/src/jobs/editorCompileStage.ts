// Editor v2 — Phase 8 Batch 8.5: the REAL compiling stage.
//
// Reads the pinned evidence and the persisted decision, assembles a
// `CompileInput` (`editorCompileInput.ts`), compiles it (`editorCompile.ts`),
// and records the plan through the fenced RPC (`editorComplete.ts`). Gated by
// `EDITOR_RENDER_ENABLED`; production with the flag unset keeps compiling
// SIMULATED, exactly as directing did before Phase 7 landed.
//
// WHY THE EVIDENCE IS RE-READ RATHER THAN PASSED IN
//
// The analyze stage returns component DIGESTS, not payloads
// (`editorAnalyze.ts`), so there is no in-memory evidence to hand over even if
// that were desirable. It is not: the compiler must consume the IMMUTABLE
// evidence identified by the boot manifest, because a crash-resume re-enters
// this stage with no in-process state and must produce the identical plan. A
// compiler fed from memory would be deterministic only within one process,
// which is not what "deterministic" is protecting.
//
// A missing pinned component is an INTEGRITY FAILURE, not a reason to compile
// with less. Same rule the director already applies.
import { PermanentJobError } from '../errors.js'
import { db, type Job } from '../db.js'
import { loadEligibleSource } from './editorInspect.js'
import { loadComponentStrict } from './editorSpeech.js'
import { lookupCached } from './editorAnalyze.js'
import { compileEditPlan } from './editorCompile.js'
import { buildCompileInput, assertNoCentisecondLeak } from './editorCompileInput.js'
import { recordEditPlan, type Fence } from './editorComplete.js'
import { EditPlanError, editPlanSha256, type EditPlanV1 } from './editPlanContract.js'
import type { DirectorDecision } from './directorContract.js'
import { watchCancellation } from './editorCancel.js'
import { env } from '../env.js'

export interface CompileOutcome {
  planId: string
  planSha256: string
  reused: boolean
  segments: number
  outputDurationMs: number
  warnings: number
}

export class CompileCancelledError extends Error {
  constructor(point: string) {
    super(`compiling cancelled at ${point}`)
    this.name = 'CompileCancelledError'
  }
}

/** The pinned manifest/snapshot PAIR the stage loop already holds. Typed
 *  structurally so this module does not import the director's private shape.
 *
 *  THE SNAPSHOT IS A SEPARATE OBJECT FROM THE MANIFEST, and the first version of
 *  this interface did not say so — it declared an optional `scriptSnapshotSha`
 *  on the manifest, where no such field exists. Optional plus `?? ''` meant the
 *  absence read as an empty string, and staging refused it four stages later:
 *
 *    edit_plan_invalid: identity.scriptSnapshotSha: expected a sha256 hex digest
 *
 *  Declared REQUIRED here, so the next caller that has only a manifest fails to
 *  compile instead of quietly compiling a plan whose identity cites nothing. */
export interface PinnedLike {
  manifest: {
    manifest: unknown
    componentDigests: { visual: string; audio: string; hook: string }
    manifestSha: string
  }
  snapshot: { snapshotSha: string }
}

/**
 * The decision document AND its digest.
 *
 * `decision_sha256` is a COLUMN on `edit_director_decisions`, not a field
 * inside the `decision` JSON. The first version of this file selected only the
 * document and then went looking for the digest inside it — and I had written a
 * comment two lines below saying the row carries it alongside. Staging found it
 * the first time compiling was ever reached:
 *
 *   edit_plan_identity_mismatch: the decision carries no sha256 to pin
 *
 * It failed CLOSED, which is the one good thing about it: the plan identity is
 * what makes "this plan came from that decision" checkable, so refusing beat
 * inventing a digest. But it refused every real run.
 */
async function loadDecision(projectId: string): Promise<{ decision: DirectorDecision; decisionSha256: string }> {
  const { data, error } = await db.from('edit_director_decisions')
    .select('decision, decision_sha256').eq('edit_project_id', projectId).maybeSingle()
  if (error) throw new Error(`compiling: reading the decision failed: ${error.message}`)
  if (!data?.decision) {
    // Reaching `compiling` without a decision means directing did not really
    // run — under the simulated path, or after a resume that skipped it. There
    // is nothing to compile FROM, and inventing a default decision would be the
    // editor deciding the edit.
    throw new PermanentJobError(
      'compiling: no director decision for this project — nothing to compile from',
      'edit_plan_invalid',
    )
  }
  const sha = (data as { decision_sha256?: string }).decision_sha256
  if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) {
    // 0088 declares the column NOT NULL with a sha256 CHECK, so this is
    // unreachable through the fenced RPC. It stays because "unreachable" is a
    // claim about today's writers, and the plan identity is not worth taking on
    // trust.
    throw new PermanentJobError(
      'compiling: the decision row carries no valid sha256 to pin into the plan identity',
      'edit_plan_identity_mismatch',
    )
  }
  return { decision: data.decision as DirectorDecision, decisionSha256: sha }
}

export async function runCompilingStage(
  job: Job, projectId: string, pinned: PinnedLike,
): Promise<CompileOutcome> {
  const { proj, asset } = await loadEligibleSource(projectId, 'compiler')
  const watch = watchCancellation(projectId)
  try {
    if (proj.cancel_requested_at) throw new CompileCancelledError('before_compiling')

    const versions = (pinned.manifest.manifest as { componentVersions: Record<string, string> }).componentVersions
    const speech = await loadComponentStrict(asset.id, asset.content_sha256, 'speech', versions.speech)
    const digests = pinned.manifest.componentDigests
    const [visual, audio] = await Promise.all([
      lookupCached(asset.id, asset.content_sha256, 'visual', digests.visual),
      lookupCached(asset.id, asset.content_sha256, 'audio', digests.audio),
    ])
    for (const [name, comp] of [['visual', visual], ['audio', audio]] as const) {
      if (!comp) {
        throw new PermanentJobError(
          `compiling: pinned ${name} component missing at its digest`,
          'edit_plan_invalid',
        )
      }
    }
    if (watch.cancelled()) throw new CompileCancelledError('after_evidence')

    const { decision, decisionSha256 } = await loadDecision(projectId)

    // The generation is read from the PROJECT, not from the asset.
    // `media_assets.generation_id` is nullable and incidental; the authority is
    // `edit_projects.generation_id`, which 0078 makes NOT NULL and immutable —
    // it is the generation this edit belongs to by definition. Using the
    // asset's would compile a plan whose identity cites a generation the
    // project does not claim, and would need a null fallback that could only be
    // wrong.
    const generationId = await loadProjectGeneration(projectId)

    // The source's allowed domain, read from the CAPTURE MANIFEST — which is a
    // different object from the boot manifest. The boot manifest carries only
    // `captureManifestSha`, a digest REFERENCE; the accepted windows themselves
    // live in `source_capture_manifests`. An earlier version of this file read
    // them off `pinned.manifest.manifest` and would have found nothing there.
    const durationMs = Number(asset.duration_ms ?? 0)
    if (!Number.isInteger(durationMs) || durationMs <= 0) {
      throw new PermanentJobError('compiling: the source has no usable duration', 'edit_plan_invalid')
    }
    const capture = await loadCaptureManifest(asset.id)
    const origin = capture?.origin ?? 'upload'
    const acceptedWindows = sourceAcceptedWindows(origin, capture)

    const input = buildCompileInput({
      identity: {
        projectId,
        generationId,
        sourceAssetId: asset.id,
        sourceChecksum: asset.content_sha256,
        bootManifestSha: pinned.manifest.manifestSha,
        scriptSnapshotSha: requireSha(pinned.snapshot.snapshotSha, 'the pinned script snapshot'),
        decisionSha256,
      },
      source: { origin, durationMs, acceptedWindows },
      speech,
      visual,
      audio,
      decision,
      // The SAME pinned brandSnapshot the Director's envelope was built from
      // (editorDirector.ts) — read off the boot manifest here rather than
      // re-resolved, so a caption color can never disagree with the brand the
      // Director actually saw for this project.
      brand: (pinned.manifest.manifest as { brandSnapshot?: Record<string, unknown> }).brandSnapshot ?? null,
    })

    // The units tripwire, run on the REAL assembled input rather than only in
    // tests. It costs nothing and it is the one defect class here that produces
    // a plausible video instead of an error.
    assertNoCentisecondLeak(input, decision)

    if (watch.cancelled()) throw new CompileCancelledError('before_compile')
    const result = compileEditPlan(input)
    if (watch.cancelled()) throw new CompileCancelledError('after_compile')

    const fence: Fence = { projectId, jobId: job.id, worker: env.workerId, attempt: job.attempts }
    const planId = await recordEditPlan(fence, result.plan)

    return {
      planId,
      planSha256: result.planSha256,
      // `editor_record_edit_plan` is idempotent on an identical recompile and
      // raises `edit_plan_divergent` otherwise, so reaching here with a plan
      // already stored means the compiler reproduced itself exactly.
      reused: false,
      segments: result.plan.timeline.segments.length,
      outputDurationMs: result.plan.output.durationMs,
      warnings: result.warnings.length,
    }
  } finally {
    watch.stop()
  }
}

/**
 * A digest the plan identity is about to cite, or a refusal.
 *
 * `?? ''` is the same defect as `?? 0`: it turns "there is no value" into a
 * value, and every check downstream then judges the substitute instead of the
 * absence. Here it produced an empty `scriptSnapshotSha` that travelled through
 * `buildCompileInput` and the whole compiler before the plan contract caught it,
 * four stages from where it was introduced.
 *
 * A source with no teleprompter script is NOT the case this guards. Every
 * project pins a script snapshot — a null `scene_timeline` yields the documented
 * empty-scenes snapshot, and `reuseStoredPin` raises `manifest_corrupt` if the
 * stored sha is missing — so an absent digest here means the pin is broken, not
 * that the recording had no script.
 */
export function requireSha(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new PermanentJobError(
      `compiling: ${what} has no sha256 to pin into the plan identity`,
      'edit_plan_identity_mismatch',
    )
  }
  return value
}

async function loadProjectGeneration(projectId: string): Promise<string> {
  const { data, error } = await db.from('edit_projects')
    .select('generation_id').eq('id', projectId).maybeSingle()
  if (error) throw new Error(`compiling: reading the project generation failed: ${error.message}`)
  const g = (data as { generation_id?: string } | null)?.generation_id
  if (typeof g !== 'string' || g === '') {
    throw new PermanentJobError('compiling: the project has no generation to pin', 'edit_plan_identity_mismatch')
  }
  return g
}

export interface CaptureManifestRow {
  origin: 'teleprompter' | 'upload'
  manifest: Record<string, unknown>
  manifest_sha256: string
}

async function loadCaptureManifest(sourceAssetId: string): Promise<CaptureManifestRow | null> {
  const { data, error } = await db.from('source_capture_manifests')
    .select('origin, manifest, manifest_sha256').eq('source_asset_id', sourceAssetId).maybeSingle()
  if (error) throw new Error(`compiling: reading the capture manifest failed: ${error.message}`)
  return (data as CaptureManifestRow | null) ?? null
}

/**
 * What the compiler is told about the source's accepted material.
 *
 * AN UPLOAD CARRIES NO WINDOWS AT ALL — not one window spanning the file.
 * `resolveAllowedDomain` derives the full-source domain itself and treats a
 * non-empty list on an upload as `edit_plan_divergent`, because a window list
 * means a creator accepted takes and an upload has no takes to accept. A
 * whole-file window supplied from here would be the STAGE asserting something
 * the capture never recorded.
 *
 * The first version of this stage synthesised exactly that window, and staging
 * found it the first time compiling got past the decision digest:
 *
 *   upload source carries accepted capture windows
 *
 * It is a separate function so the decision is testable without a database —
 * the defect was in a one-line choice that no unit test could reach.
 */
export function sourceAcceptedWindows(
  origin: 'teleprompter' | 'upload', capture: CaptureManifestRow | null,
): Array<{ startMs: number; endMs: number }> {
  return origin === 'teleprompter' ? readAcceptedWindows(capture) : []
}

/**
 * The capture manifest's accepted windows, in ms.
 *
 * The field names are `sourceStartMs`/`sourceEndMs` (ManifestAcceptedSegment),
 * NOT `startMs`/`endMs`. Getting that wrong yields `undefined`, which fails the
 * integer check below rather than silently producing a zero-length window —
 * which is why the check is on the values rather than on their presence.
 */
function readAcceptedWindows(capture: CaptureManifestRow | null): Array<{ startMs: number; endMs: number }> {
  const raw = capture?.manifest?.acceptedSegments
  if (!Array.isArray(raw) || raw.length === 0) {
    // A teleprompter source with no accepted windows has no usable material.
    // Falling back to "the whole file" would hand the editor exactly the takes
    // the creator rejected.
    throw new PermanentJobError(
      'compiling: the pinned capture manifest has no accepted windows',
      'edit_plan_no_kept_media',
    )
  }
  return (raw as Array<Record<string, unknown>>).map((s, i) => {
    const startMs = s.sourceStartMs
    const endMs = s.sourceEndMs
    if (typeof startMs !== 'number' || typeof endMs !== 'number'
      || !Number.isInteger(startMs) || !Number.isInteger(endMs) || endMs <= startMs) {
      throw new PermanentJobError(`compiling: accepted window ${i} is not a valid ms span`, 'edit_plan_invalid')
    }
    return { startMs, endMs }
  })
}

export function isCompileCancelled(err: unknown): err is CompileCancelledError {
  return err instanceof CompileCancelledError
}

export function compileFailureCode(err: unknown): string {
  if (err instanceof EditPlanError) return err.code
  if (err instanceof PermanentJobError) return err.code
  return 'edit_plan_invalid'
}

export type { EditPlanV1 }
export { editPlanSha256 }
