// WHAT A FINISHED EDIT *IS*, IN ONE PLACE.
//
// C1 on the open-items ledger, and the largest single unlock on it. Today every
// surface that shows a finished video assembles the answer itself:
//
//   * `Result.tsx` reads the project row, calls `getEditorOutput` for signed
//     URLs, and separately mounts `<CraftChecks projectId>`.
//   * `CraftChecks.tsx` independently fetches the plan and the event log and
//     derives the facts from them.
//
// Three fetches, and — the part that matters — THREE INDEPENDENT JUDGEMENTS
// ABOUT WHETHER THERE IS A VIDEO. Each one re-derives readiness in its own
// spelling, and each is a place the derivation can be wrong. It already was:
// `CraftChecks` rendered §7c assessments on `status === 'completed'` alone, so
// a run that produced nothing got a panel of craft judgements about a render
// that never happened. That was fixed by naming the predicate
// (`editProducedVideo`), which stops the same MISTAKE — it does not stop the
// same SHAPE, because the next surface still has to remember to call it.
//
// ── THE DIFFERENCE THIS MAKES: STRUCTURAL, NOT DISCIPLINED ────────────────
//
// A predicate is a rule you must remember. A discriminated union is a rule the
// compiler applies. Only `state: 'ready'` carries `output`, so:
//
//     if (bundle.state === 'ready') <video src={bundle.output.videoUrl} />
//
// is the ONLY way to reach a URL. A consumer cannot render a player for a
// project that produced no video, because in every other variant the field it
// would read does not exist. The readiness question is not asked correctly —
// it is not asked at all, because the type already answered it.
//
// That is why the states are exhaustive over the terminal ones rather than
// collapsing to ready/not-ready. `empty` — completed with a NULL
// `output_asset_id` — is a REAL state the scaffold path produces on purpose,
// and it is the one a two-state model silently mishandles: not an error, not a
// video, and owed its own sentence rather than a spinner that never resolves.
//
// ── WHY THE CRAFT CHECKS RIDE ALONG, AND ONLY HERE ────────────────────────
//
// §7c's checks are statements about what the render DID. Attaching them to any
// state but `ready` would be reporting on a video that does not exist, so they
// hang off the one variant that has one. `CraftChecks.tsx` currently decides
// this for itself; with the bundle it cannot, because it is handed facts that
// only exist when there was a render to derive them from.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
//
// It does not cache. The signed URLs EXPIRE (`expiresInSeconds`), a signed URL
// cannot be revoked, and its TTL is the only revocation there is — so holding a
// bundle past that window hands out a link the server can no longer withdraw.
// Callers refetch; they do not stash.
//
// It does not poll. A bundle is one answer at one moment. The screen owns the
// cadence, because how often to ask is a UX decision and baking one in here
// would make every future surface inherit `Result.tsx`'s.
import type { EditProject } from './contracts'
import type { EditorOutput } from './contracts'
import type { CraftCheck } from './craftChecks'
import type { FailureExplanation } from './failureExplain'
import { editProducedVideo } from './contracts'
import { runCraftChecks } from './craftChecks'
import { craftFactsFromPlan } from './craftFacts'
import { explainFailure } from './failureExplain'
import { getEditProject, getEditPlanDocument, getEditEvents, getEditorOutput } from './api'

/** The states a project can be in from a consumer's point of view. */
export type OutputBundleState =
  | 'absent'    // no such project, or not yours — the API does not distinguish
  | 'running'   // a worker is on it
  | 'waiting'   // `awaiting_review`: waiting on the PERSON, not on a worker
  | 'failed'
  | 'cancelled'
  | 'empty'     // completed, and produced no video. Real, and not an error.
  | 'ready'

interface Base { projectId: string }

export type OutputBundle =
  | (Base & { state: 'absent'; project: null })
  | (Base & { state: 'running'; project: EditProject })
  // Separated from `running` because nothing is running. A spinner here tells
  // the creator to wait for a step only they can take.
  | (Base & { state: 'waiting'; project: EditProject })
  | (Base & { state: 'failed'; project: EditProject; failure: FailureExplanation })
  | (Base & { state: 'cancelled'; project: EditProject })
  | (Base & { state: 'empty'; project: EditProject })
  | (Base & {
      state: 'ready'
      project: EditProject
      /** Signed and EXPIRING. See the header: do not cache this. */
      output: EditorOutput
      /**
       * §7c's craft checks on the finished video. Present only here, because
       * they are statements about what the render did.
       *
       * An empty array means the plan could not be read — NOT that the video
       * passed. `runCraftChecks` yields `not_checked` for a fact it lacks, so a
       * caller rendering these shows "not checked" rather than a green tick,
       * which is the same three-state discipline preflight uses.
       */
      craft: readonly CraftCheck[]
    })

/** The terminal-state mapping, kept separate so it can be tested without I/O. */
export function bundleStateFor(project: EditProject | null | undefined): OutputBundleState {
  if (!project) return 'absent'
  switch (project.status) {
    case 'failed': return 'failed'
    case 'cancelled': return 'cancelled'
    case 'awaiting_review': return 'waiting'
    case 'completed':
      // The whole point, and the one line that must not become a status check:
      // `completed` says the pipeline stopped, not that anything was produced.
      return editProducedVideo(project) ? 'ready' : 'empty'
    default: return 'running'
  }
}

/**
 * One question — "what is this project, to someone who wants to watch it" — and
 * one answer.
 *
 * The expensive fetches (signed URLs, plan, events) happen ONLY on the path
 * that can use them. A running project costs one row read, which matters
 * because this is what a polling screen calls.
 */
export async function getOutputBundle(projectId: string): Promise<OutputBundle> {
  const project = await getEditProject(projectId)
  const state = bundleStateFor(project)

  if (!project || state === 'absent') return { projectId, state: 'absent', project: null }
  if (state === 'failed') {
    return { projectId, state: 'failed', project, failure: explainFailure(project.failure_code) }
  }
  if (state === 'running' || state === 'waiting' || state === 'cancelled' || state === 'empty') {
    return { projectId, state, project } as OutputBundle
  }

  // `ready` by the row. The output still has to be SIGNABLE: `getEditorOutput`
  // collapses every server-side refusal to null, and a row that says there is a
  // video while the endpoint will not serve one is not something to render a
  // player for. It reports as `empty` — the creator's experience of "no video
  // here" is identical, and inventing a seventh state for it would make every
  // consumer handle a case it cannot act on differently.
  const output = await getEditorOutput(projectId)
  if (!output) return { projectId, state: 'empty', project }

  const [plan, events] = await Promise.all([
    getEditPlanDocument(projectId).catch(() => null),
    getEditEvents(projectId).catch(() => []),
  ])
  // No plan means no facts, and `runCraftChecks` turns absent facts into
  // `not_checked` rather than into passes.
  const craft = runCraftChecks(craftFactsFromPlan(plan as never, events as never))

  return { projectId, state: 'ready', project, output, craft }
}
