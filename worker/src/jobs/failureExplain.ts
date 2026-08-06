// FAILURE AT 11PM — Phase 10 item 5, the "explain" half.
//
// §5.2: "A batch films Sunday; two renders come back broken; the user churns
// silently without filing a ticket. No failure path exists."
//
// What exists today is `edit_projects.failure_code` — a stable machine string
// like `output_duration_mismatch`. Correct, and useless to the person holding
// the phone. Nothing turns it into what they actually need to know:
//
//   Is my footage still there?      Do I have to film it again?
//   Will pressing retry help?       Is this my fault or yours?
//
// ── WHY CLASSES AND NOT A PARAGRAPH PER CODE ──────────────────────────────
//
// The first shape I tried was one explanation per code. That is 38+ pieces of
// prose that all say roughly four things, drift apart as they are edited, and
// still leave the UI branching on a string. What a creator needs is not prose,
// it is the ANSWER TO "what do I do now" — and there are only five of those.
// The class is the contract; the sentence is a label on it.
//
// ── RETAIN FOOTAGE IS ALREADY TRUE, AND WORTH SAYING ──────────────────────
//
// Nothing deletes a source when a project fails: 0099's purge fires on a
// media_assets DELETE or status→deleted, and a failed PROJECT does neither. A
// retry is structurally possible too — `edit_projects_active_source_uniq` is
// PARTIAL (active statuses only), so a failed project does not block a new one
// on the same asset, and `media_analyses_reuse_uniq` means the retry reuses the
// analysis instead of paying for it twice. So this file does not have to build
// retention or retry. It has to tell the truth about them, per failure.
//
// ── FAIL SAFE, AND SAY WHEN YOU DO ────────────────────────────────────────
//
// An unrecognised code returns the `unknown` class rather than throwing or
// guessing. It says the footage is kept — which is TRUE for every failure by
// construction, per the paragraph above — and it marks itself `mapped: false`
// so the gap is findable rather than invisible. Guessing "just retry" for a
// code nobody classified would send people in circles on a failure that can
// never clear, which is the specific way this defect hurts.

export type FailureClass =
  /** Infrastructure or a transient upstream. The footage is fine and a retry is worth pressing. */
  | 'retry_helps'
  /** Deterministic on this input: the same footage will fail the same way. Footage kept; needs a fix, not a retry. */
  | 'retry_wont_help'
  /** The recording itself cannot be used. This is the only class that means film it again. */
  | 'refilm'
  /** The source is gone or changed under us — re-upload it. */
  | 'reupload'
  /** A configuration problem on our side. Nothing for the creator to do but wait. */
  | 'our_config'
  /** Not classified yet. Footage is kept; we do not pretend to know more. */
  | 'unknown'

export interface FailureExplanation {
  code: string
  failureClass: FailureClass
  /** Whether the recording is still stored and usable. TRUE for every class except `refilm`/`reupload`. */
  footageRetained: boolean
  /** Whether pressing retry can plausibly succeed on the same footage. */
  retryCanHelp: boolean
  /** One plain sentence, written for the creator and not for a log. */
  message: string
  /** False when the code hit no entry — the gap is reported, never hidden. */
  mapped: boolean
}

const RETRY_HELPS = 'Something on our side went wrong partway through. Your recording is safe — try again.'
const WONT_HELP = 'We could not finish this edit, and trying again would hit the same problem. Your recording is safe and we have the details.'
const OUR_CONFIG = 'This one is on us — a setting on our side is wrong. Your recording is safe and you do not need to do anything.'

/**
 * code -> class. Only codes that can actually REACH `edit_projects.failure_code`
 * belong here: a `PermanentJobError` code, an `EditPlanError` code, or
 * `retries_exhausted`. Anything else is an internal error that never settles a
 * project, and listing it would imply a creator can see something they cannot.
 */
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
  // The plan describes a render this build cannot construct — an unsupported
  // instruction, or a composed clip that is not what the plan says it is (wrong
  // owner, wrong kind, never measured). Deterministic on this plan: the same
  // plan builds the same refusal every time, so a retry is a second identical
  // failure. It reaches a creator for the first time now that a plan can name a
  // SCREEN CAPTURE, and the honest thing to say is that the recording is fine
  // and the edit is not — because the clip they made is genuinely still there.
  render_graph_invalid: { c: 'retry_wont_help' },
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
 * `footageRetained` is derived from the class rather than stored per code,
 * because it is not an independent fact: a failure never deletes a source, so
 * the recording is present in every case. `refilm` and `reupload` report false
 * because the footage that exists is not USABLE — which is what the creator is
 * actually asking.
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

/** Every code with an explanation — the guard reads this rather than a second copy. */
export function explainedCodes(): string[] {
  return Object.keys(CLASSES).sort()
}
