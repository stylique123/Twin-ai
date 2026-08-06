// APPROVAL-1 — DID THEY APPROVE *THIS* VIDEO?
//
// `generations.approved` is a boolean and answers a different question: whether
// an approval ever happened. It cannot distinguish these two situations, and
// they are not remotely the same:
//
//   * A client approved the video that is on screen right now.
//   * A client approved a video, and then the creator re-edited, and the file
//     that would go out has been seen by nobody.
//
// The second is the one that matters, and until 0111 nothing recorded enough to
// detect it. `approved` stayed true across a re-render, so a superseded
// approval was indistinguishable from a current one — to the UI, to the
// publisher, and to anyone later asking what was agreed.
//
// ── THREE STATES, AND THE THIRD IS NOT A TECHNICALITY ─────────────────────
//
// Every approval taken before 0111 has a NULL binding. Those creators DID
// approve something. Reading NULL as "not approved" would revoke a real
// client's real decision to make a new check pass, so it is its own state:
// `unbound`. A surface may say "approved (before we recorded which version)" —
// it may not say "not approved", and it must not silently treat it as current
// when something is about to be published.
import type { FinishedOutput } from './finishedOutput'

export type ApprovalState =
  /** Nobody has approved. */
  | 'none'
  /** Approved, and the approved asset IS the current output. */
  | 'current'
  /** Approved, but a different output exists now. The approval is stale. */
  | 'superseded'
  /** Approved before 0111 recorded what. Real, and not verifiable. */
  | 'unbound'

/** The columns this reads. A row shape, not a new authority. */
export interface ApprovalRow {
  approved?: boolean | null
  approved_output_asset_id?: string | null
  approved_edit_project_id?: string | null
  approved_at?: string | null
}

/**
 * What kind of approval this generation has, relative to the output that
 * exists NOW.
 *
 * `finished` is the resolved current output (`resolveFinishedOutputs`). It is
 * passed in rather than fetched so this stays a pure function — the surfaces
 * that need it already hold the map, and a predicate that does I/O cannot be
 * used inside a render.
 */
export function approvalState(
  row: ApprovalRow | null | undefined,
  finished: FinishedOutput | null | undefined,
): ApprovalState {
  if (!row || row.approved !== true) return 'none'
  const approvedAsset = row.approved_output_asset_id
  if (!approvedAsset) return 'unbound'
  // No current v2 output to compare against. The approval named an asset, and
  // whatever is on screen now is not it — either the output was deleted or the
  // generation fell back to a legacy file. Superseded is the honest answer:
  // something was approved and it is not what would go out.
  if (!finished || finished.authority !== 'editor_v2' || !finished.outputAssetId) {
    return 'superseded'
  }
  return finished.outputAssetId === approvedAsset ? 'current' : 'superseded'
}

/**
 * MAY THIS BE PUBLISHED, given the brand's approval requirement?
 *
 * The consumer `needs_approval` never had. The flag is three-state and the
 * absence of an answer must not become a gate: a creator who was never asked
 * whether anyone approves their videos has not said that someone does, and
 * blocking their publish on a question we failed to ask would be inventing a
 * workflow they never described.
 *
 * So this blocks only on an EXPLICIT `true`. And when it does block, it blocks
 * on `current` alone — `unbound` is deliberately not enough at the moment of
 * publishing, because "approved, we do not know of what" is exactly the state
 * an approval requirement exists to refuse.
 */
export function publishAllowed(
  needsApproval: boolean | null | undefined,
  state: ApprovalState,
): boolean {
  if (needsApproval !== true) return true
  return state === 'current'
}

/**
 * Why a publish is blocked, in the terms the person reading it can act on.
 * Returns null when nothing is blocked — a caller renders nothing rather than
 * an all-clear, because a banner saying "this is fine" on every screen trains
 * people to stop reading banners.
 */
export function approvalBlockReason(
  needsApproval: boolean | null | undefined,
  state: ApprovalState,
): string | null {
  if (publishAllowed(needsApproval, state)) return null
  switch (state) {
    case 'superseded':
      return 'This video changed after it was approved. Send it for approval again before posting.'
    case 'unbound':
      return 'This was approved before we started recording which version. Re-approve it so the record matches the file.'
    default:
      return 'This needs approval before it can be posted.'
  }
}
