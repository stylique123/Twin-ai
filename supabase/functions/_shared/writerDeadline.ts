// GENERATED FROM packages/shared/src/script/writerDeadline.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// WRITER DEADLINE AND THE DEGRADED PATH (trial only; panel-current-7).
//
// Pure: no I/O. The edge's writer ladder asks `deadlineTimeout` how long each
// attempt may run, and asks `optionalPassAllowed` before each optional pass.
//
// ⚠️ THE ~120 s FAILURE WAS THIS ARITHMETIC, NOT THE PLATFORM. With a fixed
// 30 s reserve every writer attempt had to end by 150 - 30 = 120 s after the
// request started. Attempt 0 ran its 65 s cap, the fallback got the ~48 s that
// remained, both aborted, and the ladder threw GENERATION_FAILED at ~121 s with
// ~29 s of edge time unused. The reserve exists for optional passes, so on the
// degraded path the LAST attempt may use most of it and those passes are
// skipped instead. WRITER_DEGRADE=off is the kill switch (old arithmetic).

export const EDGE_WALL_MS = 150_000
/** Kept back for the post-writer passes (guards, gate enqueue, save). */
export const WRITER_RESERVE_MS = 30_000
/** Degraded path: what the LAST attempt must still leave (mandatory finish only). */
export const WRITER_LAST_RESERVE_MS = 14_000
export const WRITER_TRIAL_PRIMARY_MS = 65_000
export const WRITER_MIN_ATTEMPT_MS = 15_000
/** Degraded path: no optional pass starts after this much of the request. */
export const OPTIONAL_PASS_CUTOFF_MS = 95_000

export interface DeadlineOpts { last?: boolean; degrade?: boolean }

/** Per-attempt timeout under the request deadline. Null = skip the attempt. */
export function deadlineTimeout(i: number, base: number, startedAt: number | undefined, now: number, opts: DeadlineOpts = {}): number | null {
  if (startedAt == null) return base
  const reserve = opts.degrade && opts.last ? WRITER_LAST_RESERVE_MS : WRITER_RESERVE_MS
  const left = EDGE_WALL_MS - reserve - (now - startedAt)
  const cap = i === 0 ? Math.min(base, WRITER_TRIAL_PRIMARY_MS) : base
  const t = Math.min(cap, left)
  return t >= WRITER_MIN_ATTEMPT_MS ? t : null
}

/** Whether an optional (quality-only) pass may start. Always true off the degraded path. */
export function optionalPassAllowed(startedAt: number, now: number, degrade: boolean): boolean {
  return !degrade || now - startedAt < OPTIONAL_PASS_CUTOFF_MS
}

/** The reason code a failed run persists: a code and counts, never text. */
export type FailureReason = 'writer_timeout' | 'writer_deadline_skipped' | 'writer_provider' | 'writer_output' | 'post_writer' | 'unknown'
export function failureReason(input: { writerReturned: boolean; attemptsFailed: number; attemptsSkipped: number; lastCode: string | null }): FailureReason {
  if (input.writerReturned) return 'post_writer'
  if (input.attemptsFailed === 0 && input.attemptsSkipped > 0) return 'writer_deadline_skipped'
  const c = input.lastCode
  if (c === 'timeout') return 'writer_timeout'
  if (c === 'provider_quota' || c === 'provider_unavailable' || c === 'provider_rejected') return 'writer_provider'
  if (c === 'truncated' || c === 'empty_response' || c === 'invalid_json' || c === 'incomplete_blueprint') return 'writer_output'
  return 'unknown'
}
