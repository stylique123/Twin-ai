// Editor v2 — Phase 8 Batch 8.5: the REAL rendering and validating stages.
//
// The two stages that turn a recorded plan into a video the user can watch.
// Gated by EDITOR_RENDER_ENABLED; production with the flag unset keeps both
// SIMULATED.
//
// THE ORDER HERE IS THE WHOLE DESIGN, and it is not the obvious one.
//
//   reserve -> render -> validate -> upload -> mark ready -> mint asset -> complete
//
// The tempting order puts the upload right after the render, while the file is
// hot. That publishes bytes nobody has measured: a truncated encode, a stream
// the profile forbids, a video the wrong length — all reach storage first and
// are found afterwards, if at all. VALIDATION COMES BEFORE PUBLICATION, so the
// only artifact that ever reaches a durable path is one that has already been
// probed against the plan.
//
// The reservation comes FIRST, before any encoding, for a different reason: the
// output path must be server-derived, and a crash between render and upload has
// to resume onto the SAME path rather than mint a second one. Reserving early
// means the path exists before anything could want to invent it.
//
// WHAT THIS FILE MAY NOT DO. It never composes a storage path. It never inserts
// into media_assets. Both come from fenced RPCs — the first because a path that
// can be passed is a path that can be wrong, the second because 0094 shipped a
// completion that took an asset id with nothing able to create one, and the fix
// was an RPC rather than an unfenced insert.
import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PermanentJobError } from '../errors.js'
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { uploadObject } from '../storage.js'
import { loadEligibleSource } from './editorInspect.js'
import { VerifiedSourceSession, stageDownloadOpts } from './sourceSession.js'
import { watchCancellation, type CancelWatch } from './editorCancel.js'
import {
  renderEditPlan, extractCover, cleanupRenderWorkDir, loadRenderCatalog,
  RenderCancelledError, RenderTimeoutError, fileSha256,
} from './editorRender.js'
import { validateRenderedOutput } from './editorValidateOutput.js'
import { renderAssDocument, assertNoOverrideBlock, assDocumentSha256 } from './assCaptions.js'
import { resolveCaptionColours, type CaptionColourRejection } from './captionColours.js'
import {
  reserveOutput, markOutputReady, createOutputAsset, completeOutput, type Fence,
} from './editorComplete.js'
import { EditPlanError, validateEditPlan, type EditPlanV1 } from './editPlanContract.js'

export interface RenderStageOutcome {
  outputSha256: string
  outputBytes: number
  renderMs: number
  realtimeRatioMilli: number
  coverBytes: number
  storagePath: string
  graphSha256: string
  /** What the encoder actually delivered, in milli-units. Recorded rather than
   *  merely checked: the frozen ±1 LUFS / -1.0 dBTP target is NOT enforceable
   *  against single-pass loudnorm (see jobs/loudness.ts), so whether to invest
   *  in two-pass has to be decided from what real runs measure. */
  integratedLufsMilli: number | null
  truePeakDbtpMilli: number | null
  truePeakOvershootMilli: number | null
  /** Brand caption colours the contrast guard refused, with the measurement
   *  that refused them. Empty on the happy path and when there are no cues.
   *  Carried on the outcome for the same reason the loudness numbers are: a
   *  quality decision the user did not make must be visible to someone. */
  captionColourRejections: CaptionColourRejection[]
  /** How far the audio and video streams disagree, in ms. Positive means audio
   *  outlasts video, which is normal. Recorded rather than merely checked, for
   *  the same reason the loudness numbers are: the enforced band is much wider
   *  than the expected one, so only real measurements can narrow it. */
  audioMinusVideoDurationMs: number | null
  audioMinusVideoStartMs: number | null
}
export interface ValidateStageOutcome {
  outputAssetId: string
}

export class RenderStageCancelledError extends Error {
  constructor(point: string) {
    super(`rendering cancelled at ${point}`)
    this.name = 'RenderStageCancelledError'
  }
}
export function isRenderCancelled(err: unknown): err is RenderStageCancelledError | RenderCancelledError {
  return err instanceof RenderStageCancelledError || err instanceof RenderCancelledError
}
export function renderFailureCode(err: unknown): string {
  if (err instanceof EditPlanError) return err.code
  if (err instanceof PermanentJobError) return err.code
  if (err instanceof RenderTimeoutError) return 'render_graph_invalid'
  return 'render_graph_invalid'
}

/** The plan as STORED, re-validated on the way out of the database.
 *
 *  It was validated before it was written, so this looks redundant. It is not:
 *  the row is read back in a different process, possibly a different build, and
 *  `validateEditPlan` is what makes "the thing we render is a well-formed plan"
 *  true of THIS process rather than of the one that wrote it. */
async function loadPlan(projectId: string): Promise<EditPlanV1> {
  const { data, error } = await db.from('edit_plans')
    .select('plan, plan_hash').eq('edit_project_id', projectId).eq('version', 1).maybeSingle()
  if (error) throw new Error(`rendering: reading the plan failed: ${error.message}`)
  if (!data?.plan) {
    throw new PermanentJobError('rendering: no recorded plan for this project', 'edit_plan_invalid')
  }
  return validateEditPlan(data.plan)
}

/** Write the ASS document the graph burns in, and re-audit the finished bytes.
 *
 *  `assertNoOverrideBlock` runs on the DOCUMENT, independently of the escaper
 *  that produced it. Checking the escaper's output with the escaper's own logic
 *  would only prove it is self-consistent. */
function writeAssDocument(
  plan: EditPlanV1, workDir: string,
): { path: string | null; colourRejections: CaptionColourRejection[] } {
  if (plan.captions.cues.length === 0) return { path: null, colourRejections: [] }
  const catalog = loadRenderCatalog()
  const preset = catalog.captionPresets[plan.captions.presetId]
  if (!preset) {
    throw new PermanentJobError(
      `rendering: caption preset ${plan.captions.presetId} is not in the frozen catalog`,
      'render_output_profile_invalid',
    )
  }
  // A brand colour too dark to read inside the preset's outline is dropped
  // here, and the drop is carried back out rather than swallowed — see
  // captionColours.ts. Rendering continues either way; the catalog colour is
  // always legible.
  const { primaryColourAss, emphasisColourAss, rejected } = resolveCaptionColours(plan.captions, preset)
  const doc = renderAssDocument(plan, {
    playResX: plan.output.width,
    playResY: plan.output.height,
    fontName: preset.fontFamily,
    fontSizePx: plan.captions.fontSizePx,
    marginVerticalPx: plan.captions.marginVerticalPx,
    emphasisColourAss,
    primaryColourAss,
  })
  assertNoOverrideBlock(doc, plan.captions.cues.length, emphasisColourAss)
  const path = join(workDir, 'captions.ass')
  writeFileSync(path, doc, 'utf8')
  return { path, colourRejections: rejected }
}

export async function runRenderingStage(
  job: Job, projectId: string, dir: string,
): Promise<RenderStageOutcome> {
  const { proj, asset, meta } = await loadEligibleSource(projectId, 'render')
  const watch: CancelWatch = watchCancellation(projectId)
  const session = new VerifiedSourceSession(asset, meta, dir)
  const workDir = join(dir, 'render')
  try {
    if (proj.cancel_requested_at) throw new RenderStageCancelledError('before_rendering')
    const plan = await loadPlan(projectId)
    const fence: Fence = { projectId, jobId: job.id, worker: env.workerId, attempt: job.attempts }

    // RESERVE FIRST. The path is server-derived and a crash after this point
    // resumes onto the same one instead of minting a second.
    const reserved = await reserveOutput(fence, 'video', env.editorOutputBucket)
    const coverReserved = await reserveOutput(fence, 'cover', env.editorOutputBucket)
    if (watch.cancelled()) throw new RenderStageCancelledError('after_reserve')

    await session.reconcileRemote('render')
    const sourcePath = await session.localPath(stageDownloadOpts(watch.signal, 'analyze'))
    if (watch.cancelled()) throw new RenderStageCancelledError('after_download')

    mkdirSync(workDir, { recursive: true })
    const { path: assPath, colourRejections } = writeAssDocument(plan, workDir)
    const fontsDir = assPath ? env.editorFontsDir : null

    const { outputPath, evidence } = await renderEditPlan({
      plan, sourcePath, assPath, fontsDir, workDir, watch,
      strictFontIntegrity: env.editorStrictFontIntegrity,
      assetsDir: env.editorAssetsDir,
    })
    if (watch.cancelled()) throw new RenderStageCancelledError('after_render')

    const { coverPath, bytes: coverBytes } = await extractCover(outputPath, plan, workDir, { watch })

    // VALIDATE BEFORE PUBLISHING. Nothing unmeasured reaches a durable path.
    const validation = await validateRenderedOutput({ outputPath, coverPath, plan, watch })
    if (watch.cancelled()) throw new RenderStageCancelledError('after_validate')

    // Only now does anything leave the machine. The paths come from the
    // reservation; this file never composes one.
    await uploadObject(reserved.storage_bucket, reserved.storage_path, outputPath, 'video/mp4')
    await uploadObject(coverReserved.storage_bucket, coverReserved.storage_path, coverPath, 'image/jpeg')

    await markOutputReady(fence, 'video', {
      bytes: evidence.outputBytes,
      sha256: evidence.outputSha256,
      durationMs: validation.measurements.durationMs,
    })
    await markOutputReady(fence, 'cover', {
      bytes: coverBytes,
      sha256: await fileSha256(coverPath),
    })

    return {
      outputSha256: evidence.outputSha256,
      outputBytes: evidence.outputBytes,
      renderMs: evidence.renderMs,
      realtimeRatioMilli: evidence.realtimeRatioMilli,
      coverBytes,
      storagePath: reserved.storage_path,
      graphSha256: evidence.graphSha256,
      integratedLufsMilli: validation.loudness.measurement.integratedLufsMilli,
      truePeakDbtpMilli: validation.loudness.measurement.truePeakDbtpMilli,
      truePeakOvershootMilli: validation.loudness.truePeakOvershootMilli,
      captionColourRejections: colourRejections,
      audioMinusVideoDurationMs: validation.measurements.audioMinusVideoDurationMs,
      audioMinusVideoStartMs: validation.measurements.audioMinusVideoStartMs,
    }
  } finally {
    watch.stop()
    session.dispose()
    // CANCELLATION IS NOT FAILURE, and its local half is this: the partial
    // files go, the immutable plan and the reservation stay, and no pointer was
    // ever published because nothing uploads before it validates.
    cleanupRenderWorkDir(workDir)
  }
}

export async function runValidatingStage(
  job: Job, projectId: string,
): Promise<ValidateStageOutcome> {
  const { proj } = await loadEligibleSource(projectId, 'validate')
  const watch = watchCancellation(projectId)
  try {
    if (proj.cancel_requested_at) throw new RenderStageCancelledError('before_validating')
    const plan = await loadPlan(projectId)
    const fence: Fence = { projectId, jobId: job.id, worker: env.workerId, attempt: job.attempts }

    // The video was validated in the rendering stage, against the local file,
    // BEFORE it was uploaded. Re-probing the remote copy here would be a
    // different and weaker check (it would prove the upload round-tripped, not
    // that the render matches the plan), so what this stage does is mint the
    // asset and complete — both fenced, both refusing unless the output row is
    // genuinely READY.
    const outputAssetId = await createOutputAsset(fence, {
      width: plan.output.width,
      height: plan.output.height,
      fpsNum: plan.output.fpsNum,
      fpsDen: plan.output.fpsDen,
      mime: 'video/mp4',
    })
    if (watch.cancelled()) throw new RenderStageCancelledError('after_asset')

    await completeOutput(fence, outputAssetId)
    return { outputAssetId }
  } finally {
    watch.stop()
  }
}

/** Bytes on disk, for evidence. Kept here so the stage does not import `fs`
 *  twice under two names. */
export function localSize(path: string): number {
  return statSync(path).size
}
