// Pure editor_v2 pipeline logic — no I/O, unit-tested.
//
// The stage order here MUST match the pipeline array in the
// edit_projects_guard_stage trigger (0080): the database rejects any
// transition this module would not produce, and vice versa.

export const EDITOR_STAGES = [
  'inspecting',
  'transcribing',
  'analyzing',
  'directing',
  'compiling',
  'rendering',
  'validating',
] as const

export type EditorStage = (typeof EDITOR_STAGES)[number]

export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const

/**
 * THE ONE STATUS THAT IS NOT A STAGE AND NOT TERMINAL.
 *
 * A project waiting for its creator to review the transcript is not working and
 * not finished — it is resting, and the thing it waits on is a person rather
 * than a worker. That distinction has to exist in exactly three places or the
 * project dies here:
 *
 *   * `stagesFrom` returns NOTHING for it, and the handler must return without
 *     finishing. An empty stage list otherwise falls through to
 *     `finishProject('completed')`, so a duplicate or stale claim would mark a
 *     project complete that has not been compiled, rendered or validated.
 *   * the lost-project reconciler must not sweep it. Every other non-terminal
 *     project with no live job is a project whose job died; this one is a
 *     project whose job finished ON PURPOSE.
 *   * the stage guard must admit `directing -> awaiting_review -> compiling`
 *     WITHOUT removing `directing -> compiling`, so turning the gate off does
 *     not strand every project already past directing.
 */
export const REVIEW_PAUSE_STATUS = 'awaiting_review'

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

/** True while the project is waiting on the creator, not on a worker. */
export function isAwaitingReview(status: string): boolean {
  return status === REVIEW_PAUSE_STATUS
}

// Which stages still need to run for a project observed in `status`?
//  * 'queued'      → the whole pipeline
//  * a mid-pipeline stage (crash-resume) → THAT stage again, then the rest.
//    Re-running the interrupted stage is the durable-resume contract: stage
//    handlers must be idempotent (the simulated ones trivially are).
//  * terminal      → nothing
export function stagesFrom(status: string): EditorStage[] {
  if (status === 'queued') return [...EDITOR_STAGES]
  if (isTerminal(status)) return []
  // Waiting on the creator. Returning [] is the same value an unknown status
  // returns, which is why the CALLER must distinguish them — see
  // REVIEW_PAUSE_STATUS. A resume enters at `compiling`, because submitting the
  // review is what moves the project there.
  if (isAwaitingReview(status)) return []
  const i = (EDITOR_STAGES as readonly string[]).indexOf(status)
  if (i < 0) return [] // unknown status: let the caller fail loudly
  return [...EDITOR_STAGES.slice(i)]
}

// Coarse progress per stage for edit_events.pct (completed = 100 is written
// by editor_finish_project).
export function stagePct(stage: EditorStage): number {
  const i = (EDITOR_STAGES as readonly string[]).indexOf(stage)
  return Math.round(((i + 1) / (EDITOR_STAGES.length + 1)) * 100)
}
