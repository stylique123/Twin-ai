// KEEPING THE NUMBER THE VALIDATOR ALREADY KNEW.
//
// ⚠️ BEST-EFFORT, AND THE WORD IS LOAD-BEARING. A failed write here costs one
// missing row in a trend table. A write that threw would cost a render that had
// already succeeded, or would rescue one that had already failed. Evidence must
// never decide the thing it is evidence of — the same rule `cuts_measured` and
// `audio_measured` follow, applied to the one measurement nobody kept.

import { db } from '../db.js'
import type { DurationObservation } from './editorValidateOutput.js'

export interface RenderAttemptContext {
  renderJobId: string
  editProjectId: string
  /** ⚠️ NULL MEANS UNRECORDED, NEVER ZERO. This is the compiling stage's own
   *  `cutStats.appliedCuts` — the number `cuts_measured` reports. A job resumed
   *  straight into rendering never ran that stage and genuinely does not know;
   *  writing 0 would invent a cut-free render and drag the correlation this
   *  table exists to measure toward zero. */
  appliedCuts: number | null
  segmentCount: number | null
}

/**
 * Record one duration observation.
 *
 * ⚖️ CALLED FOR PASSES AND FAILURES ALIKE, because the failing rows are the ones
 * anybody will want to read. The validator hands the observation over before it
 * decides, so "the render that was about to be rejected" is the row that lands.
 */
export async function recordRenderAttempt(
  ctx: RenderAttemptContext, o: DurationObservation,
): Promise<void> {
  try {
    await db.from('render_attempts').insert({
      render_job_id: ctx.renderJobId,
      edit_project_id: ctx.editProjectId,
      predicted_duration_ms: o.predictedMs,
      actual_duration_ms: o.actualMs,
      // Stored as its own column even though it is a subtraction, because the
      // database asserts it IS that subtraction — a row whose delta disagrees
      // with its operands would poison every later query.
      duration_delta_ms: o.deltaMs,
      duration_tolerance_ms: o.toleranceMs,
      output_fps_num: o.fpsNum,
      output_fps_den: o.fpsDen,
      applied_cuts: ctx.appliedCuts,
      segment_count: ctx.segmentCount,
      validator_outcome: o.withinTolerance ? 'within_tolerance' : 'duration_mismatch',
    })
  } catch (e) {
    console.error(JSON.stringify({
      event: 'render_attempt_not_recorded',
      project: ctx.editProjectId,
      error: e instanceof Error ? e.message : String(e),
    }))
  }
}
