// Editor v2 feature gating — ENFORCED IN CODE, not only in docs/thresholds.
//
// Auto filler-removal is NOT shipped (owner decision 2026-07-20). Phase 5 stores
// `filler` candidates as `safeToConsider` EVIDENCE, but no downstream stage —
// the future AI Director, the EditPlan compiler, or the renderer — may SELECT a
// filler candidate for removal until the acoustically-grounded disfluency
// detector (task #117) closes the recall gate AND the flag below is flipped.
//
// This module is the single mandatory seam: every removal-candidate selection
// MUST go through `selectableRemovalCandidates`. It is unit-tested, so a future
// phase that forgets the guard fails its own tests the moment it tries to act on
// filler evidence. Flipping `autoFillerRemoval` to true is the deliberate,
// reviewed enablement step.

import type { SpeechCandidate, SpeechCandidateKind } from './contracts'

export interface EditorFeatureFlags {
  /** Auto filler-removal. FALSE until task #117 lands + explicit enablement. */
  autoFillerRemoval: boolean
}

export const EDITOR_FEATURES: Readonly<EditorFeatureFlags> = Object.freeze({
  autoFillerRemoval: false,
})

// Candidate kinds a downstream stage may act on when a feature is disabled.
// `filler` is gated behind EDITOR_FEATURES.autoFillerRemoval; silence,
// false_start and repetition evidence are accepted (Phase 5 PASS scope).
const FEATURE_GATED_KINDS: Partial<Record<SpeechCandidateKind, keyof EditorFeatureFlags>> = {
  filler: 'autoFillerRemoval',
}

/**
 * The ONLY sanctioned way for a Director / EditPlan compiler / renderer to pick
 * speech candidates to act on. Drops any candidate whose kind is gated behind a
 * disabled feature. Pure + deterministic.
 */
export function selectableRemovalCandidates(
  candidates: readonly SpeechCandidate[],
  features: EditorFeatureFlags = EDITOR_FEATURES,
): SpeechCandidate[] {
  return candidates.filter((c) => {
    const flag = FEATURE_GATED_KINDS[c.kind]
    return flag === undefined || features[flag] === true
  })
}

/** True iff acting on this candidate kind is currently permitted. */
export function isRemovalKindEnabled(
  kind: SpeechCandidateKind,
  features: EditorFeatureFlags = EDITOR_FEATURES,
): boolean {
  const flag = FEATURE_GATED_KINDS[kind]
  return flag === undefined || features[flag] === true
}
