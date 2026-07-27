// The ONE adapter from the persisted Phase-7 DirectorDecision to the compiler's
// input. Batch 8.1 previously declared a REDUCED `CompileDecision` that silently
// dropped schemaVersion, keptBoundaries, summary, pacing and music, and degraded
// the structured `selections` / `visualWasteSelections` to bare number arrays.
// Those drops were invisible: nothing named them, so nothing could notice them.
//
// EXHAUSTIVENESS IS ENFORCED BY THE TYPE CHECKER, NOT BY THIS COMMENT.
// `DISPOSITION` is `Record<keyof DirectorDecision, ...>`, so adding a field to the
// Director contract without deciding what happens to it FAILS THE BUILD. That is
// the only mechanism that keeps working when someone who has not read this file
// extends the Director six months from now.
//
// Every field is exactly one of:
//   consume  — read and carried into the plan
//   defer    — deliberately NOT implemented yet, with a stable reason code that is
//              recorded in the plan as a warning, so the artifact says what it did
//              not do rather than staying silent about it
//   reject   — structurally refused; the compile fails
import { EditPlanError } from './editPlanContract.js'
import type {
  DirectorDecision, DirectorSelection, DirectorVisualWasteSelection,
} from './directorContract.js'
import type { CompileDecision } from './editorCompile.js'

export type FieldDisposition = 'consume' | 'defer' | 'reject'

/** Stable codes. These reach the plan's warnings, so they are contract surface. */
export const DEFERRAL_REASONS = {
  summary: 'director_summary_not_a_render_input',
  pacing: 'director_pacing_not_implemented_batch_8_1',
  music: 'director_music_unsupported_no_licensed_catalog',
} as const

// The exhaustive map. Adding a DirectorDecision field without adding it here is a
// TYPE ERROR, which is the entire point.
export const DISPOSITION: Record<keyof DirectorDecision, FieldDisposition> = {
  schemaVersion: 'consume',
  selections: 'consume',
  keptBoundaries: 'consume',
  summary: 'defer',
  pacing: 'defer',
  music: 'defer',
  emphasisWordIndices: 'consume',
  hookTreatment: 'consume',
  hookStartWordIndex: 'consume',
  visualWasteSelections: 'consume',
  captionPresetId: 'consume',
  transitionPolicy: 'consume',
  zoomRequests: 'consume',
}

export interface AdaptedDecision {
  decision: CompileDecision
  /** Structured detail the compiler keeps, rather than the flattened indices. */
  structured: {
    selections: DirectorSelection[]
    visualWasteSelections: DirectorVisualWasteSelection[]
    keptBoundaries: number[]
  }
  /** Recorded in the plan so a deferral is visible in the artifact. */
  deferrals: Array<{ field: string; reasonCode: string }>
}

const EXPECTED_SCHEMA_VERSION = 1

export function adaptDirectorDecision(d: DirectorDecision): AdaptedDecision {
  // schemaVersion: CONSUMED as a gate. A decision from a future Director is not
  // "mostly compatible" — its fields may mean different things, and guessing is
  // exactly how a silent drop becomes a wrong edit.
  if (d.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new EditPlanError(
      `director decision schemaVersion ${d.schemaVersion} is not ${EXPECTED_SCHEMA_VERSION}`,
      'edit_plan_divergent')
  }

  // MUSIC. The plan's audio.music is structurally `null` — there is no licensed
  // catalog wired, so nothing can render music. A decision asking for it must not
  // be silently ignored, because the user would see a video with no music and no
  // explanation. It is deferred WITH A REASON, and the compiler is separately
  // responsible for refusing any plan whose audio implies music rendered.
  const deferrals: Array<{ field: string; reasonCode: string }> = []
  if (d.music !== 'none') deferrals.push({ field: 'music', reasonCode: DEFERRAL_REASONS.music })
  if (d.pacing !== 'balanced') deferrals.push({ field: 'pacing', reasonCode: DEFERRAL_REASONS.pacing })
  if (d.summary.length > 0) deferrals.push({ field: 'summary', reasonCode: DEFERRAL_REASONS.summary })

  // Structured selections are PRESERVED. The compiler still receives the flattened
  // indices it consumes today, but the typed originals travel alongside so the
  // kept-boundary and candidate-kind facts are not lost on the way in.
  const structured = {
    selections: [...d.selections],
    visualWasteSelections: [...d.visualWasteSelections],
    keptBoundaries: [...d.keptBoundaries],
  }

  const decision: CompileDecision = {
    selections: d.selections.map((s) => s.candidateIndex),
    visualWasteSelections: d.visualWasteSelections.map((v) => v.wasteIndex),
    emphasisWordIndices: [...d.emphasisWordIndices],
    hookTreatment: d.hookTreatment,
    hookStartWordIndex: d.hookStartWordIndex,
    captionPresetId: d.captionPresetId,
    transitionPolicy: d.transitionPolicy,
    zoomRequests: d.zoomRequests.map((z) => ({ ...z })),
  }

  return { decision, structured, deferrals }
}

/**
 * The honesty check the directive names explicitly: a plan must never imply that
 * music rendered. `audio.music` is `null` by contract; this refuses anything else
 * rather than trusting that it stayed null.
 */
export function assertMusicNotImplied(planAudioMusic: unknown): void {
  if (planAudioMusic !== null) {
    throw new EditPlanError(
      'plan implies music rendered, but no licensed catalog is wired', 'render_music_license_invalid')
  }
}
