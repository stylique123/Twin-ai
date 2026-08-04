// FAILURE EXPLANATIONS, CLIENT-SIDE — §9's "failure at 11pm", surfaced.
//
// Phase 10 item 5 built the catalogue (worker/src/jobs/failureExplain.ts) and
// left it unserved: "Still to build: surfacing it (the API/UI), and the retry
// button itself." A creator whose render failed at 11pm still saw a bare code.
//
// ── WHY THIS IS A SECOND COPY, AND WHAT STOPS IT DRIFTING ─────────────────
//
// The classification is a pure function of `edit_projects.failure_code`, which
// the owner can already read. So the client needs no API: it needs the map.
//
// The worker cannot export it — it deliberately does not depend on
// @twinai/shared, and its CI job runs `npm ci` inside worker/ — and moving the
// map here would put the AUTHORITY on the wrong side, since the worker's
// coverage guard reads every `new PermanentJobError` in the tree from source
// to prove the catalogue has no holes.
//
// So the worker stays the authority, this is a mirror, and
// `scripts/ci/check_failure_catalogue.mjs` compares the two code->class maps
// and fails the build on any disagreement. Same shape as the glossary fold:
// two implementations, one asserted agreement, neither importing the other.
//
// ── WHAT A CREATOR IS ACTUALLY ASKING ────────────────────────────────────
//
// Four questions, and the classes exist to answer them: is my footage still
// there, must I film it again, will retry help, is this my fault. An
// unclassified code is `unknown` and specifically never claims a retry will
// help — telling someone to retry a failure that can never clear is exactly
// how this defect hurts.

export type FailureClass =
  | 'retry_helps'
  | 'retry_wont_help'
  | 'refilm'
  | 'reupload'
  | 'our_config'
  | 'unknown'

export interface FailureExplanation {
  code: string
  failureClass: FailureClass
  footageRetained: boolean
  retryCanHelp: boolean
  message: string
  mapped: boolean
}

const RETRY_HELPS = 'Something on our side went wrong partway through. Your recording is safe — try again.'
const WONT_HELP = 'We could not finish this edit, and trying again would hit the same problem. Your recording is safe and we have the details.'
const OUR_CONFIG = 'This one is on us — a setting on our side is wrong. Your recording is safe and you do not need to do anything.'

const CLASSES: Record<string, { c: FailureClass, m?: string }> = {
  // ── the footage cannot be used ──────────────────────────────────────────
  source_rejected: { c: 'refilm', m: 'This recording could not be used. Please film it again.' },
  probe_failed: { c: 'refilm', m: 'We could not read this video file. Please film or upload it again.' },
  output_decode_failed: { c: 'retry_wont_help' },
  missing_frame_rate: { c: 'refilm', m: 'This file does not say what frame rate it was shot at, so we cannot edit it safely. Please film it again.' },
  speech_too_long: { c: 'refilm', m: 'This recording is longer than we can edit in one go. Please split it or film a shorter take.' },

  // ── the source is gone or moved ─────────────────────────────────────────
  source_deleted: { c: 'reupload', m: 'The original recording is no longer stored. Please upload it again.' },
  source_missing: { c: 'reupload', m: 'We could not find the original recording. Please upload it again.' },
  object_missing: { c: 'reupload', m: 'We could not find the original recording. Please upload it again.' },
  source_bytes_changed: { c: 'reupload', m: 'The recording changed while we were working on it. Please upload it again.' },
  missing_checksum: { c: 'reupload', m: 'We could not verify the recording. Please upload it again.' },
  generation_missing: { c: 'retry_wont_help' },
  project_missing: { c: 'retry_wont_help' },

  // ── ours to fix ─────────────────────────────────────────────────────────
  director_no_credentials: { c: 'our_config' },
  model_not_pinned: { c: 'our_config' },
  model_pin_failed: { c: 'our_config' },
  brand_schema_drift: { c: 'our_config' },
  // The pinned brand snapshot no longer hashes to what the manifest recorded.
  // Ours: nothing the creator did produced it and nothing they can do fixes it.
  brand_snapshot_corrupt: { c: 'our_config' },
  // A speech model pinned as one bundle answered as another. A pin problem,
  // not a recording problem.
  model_version_mismatch: { c: 'our_config' },
  build_provenance_missing: { c: 'our_config' },

  // ── transient: retry is genuinely worth pressing ────────────────────────
  retries_exhausted: { c: 'retry_helps' },
  director_call_failed: { c: 'retry_helps' },
  asr_failed: { c: 'retry_helps' },

  // ── deterministic on this input ─────────────────────────────────────────
  bad_payload: { c: 'retry_wont_help' },
  capture_manifest_required: { c: 'retry_wont_help' },
  script_binding_shape: { c: 'retry_wont_help' },
  manifest_corrupt: { c: 'retry_wont_help' },
  manifest_mismatch: { c: 'retry_wont_help' },
  director_component_missing: { c: 'retry_wont_help' },
  edit_plan_invalid: { c: 'retry_wont_help' },
  edit_plan_identity_mismatch: { c: 'retry_wont_help' },
  output_completion_conflict: { c: 'retry_wont_help' },
  output_duration_mismatch: { c: 'retry_wont_help' },
  output_stream_mismatch: { c: 'retry_wont_help' },
  visual_dimension_mismatch: { c: 'retry_wont_help' },
  visual_bounds_exceeded: { c: 'retry_wont_help' },
  speech_energy_overflow: { c: 'retry_wont_help' },
  // The transcriber returned word text grossly larger than the transcript it
  // came from — corrupt bridge output. Deterministic on this input.
  speech_transcript_mismatch: { c: 'retry_wont_help' },
  // The asset is not in a state the pipeline can start from. Re-uploading is
  // the action that resolves it; re-filming is not.
  source_not_ready: { c: 'reupload', m: 'This recording is not ready to edit yet. Please upload it again.' },
  simulated_permanent: { c: 'retry_wont_help' },

  // ── the payload outgrew a frozen cap ────────────────────────────────────
  // Deliberately their OWN sentence: "too big" is the one deterministic
  // failure a creator can act on themselves, by recording something shorter.
  audio_component_too_large: { c: 'retry_wont_help', m: 'This recording is too long or too complex for us to edit in one pass. A shorter take will work.' },
  visual_component_too_large: { c: 'retry_wont_help', m: 'This recording is too long or too complex for us to edit in one pass. A shorter take will work.' },
  speech_component_too_large: { c: 'retry_wont_help', m: 'This recording is too long or too complex for us to edit in one pass. A shorter take will work.' },
  hook_component_too_large: { c: 'retry_wont_help', m: 'This recording is too long or too complex for us to edit in one pass. A shorter take will work.' },
}

const DEFAULT_MESSAGE: Record<FailureClass, string> = {
  retry_helps: RETRY_HELPS,
  retry_wont_help: WONT_HELP,
  our_config: OUR_CONFIG,
  refilm: 'This recording could not be used. Please film it again.',
  reupload: 'We could not find the original recording. Please upload it again.',
  unknown: 'Something went wrong with this edit. Your recording is safe — we are looking into it.',
}

/**
 * Explain a project's `failure_code` to the person who recorded the video.
 *
 * `footageRetained` is derived from the class rather than stored per code: a
 * failure never deletes a source, so the recording is present in every case.
 * `refilm` and `reupload` report false because the footage that exists is not
 * USABLE — which is what the creator is actually asking.
 */
export function explainFailure(code: string | null | undefined): FailureExplanation {
  const key = typeof code === 'string' ? code.trim() : ''
  const hit = key ? CLASSES[key] : undefined
  const failureClass: FailureClass = hit?.c ?? 'unknown'
  return {
    code: key,
    failureClass,
    footageRetained: failureClass !== 'refilm' && failureClass !== 'reupload',
    retryCanHelp: failureClass === 'retry_helps',
    message: hit?.m ?? DEFAULT_MESSAGE[failureClass],
    mapped: hit !== undefined,
  }
}

/** Every code with an explanation — what the CI guard compares. */
export function explainedCodes(): string[] {
  return Object.keys(CLASSES).sort()
}
