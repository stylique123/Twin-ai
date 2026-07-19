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

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
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
