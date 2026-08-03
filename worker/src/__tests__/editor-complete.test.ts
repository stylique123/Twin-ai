// Batch 8.4 — the fenced completion module.
//
// WHAT IS AND IS NOT UNDER TEST HERE. The invariants — plan immutability,
// server-derived paths, "ready means measured", "completed requires a ready
// output" — are enforced in SQL and proven by Gate-F against a real Postgres.
// They are deliberately NOT re-asserted here, because a mock database that
// refuses what I told it to refuse proves nothing about the real one.
//
// What this file tests is the part that lives in TypeScript and can be wrong
// independently: ERROR CLASSIFICATION, and the argument shaping around it.
//
// Classification is not clerical. `lease_lost` means another worker owns this
// project and this one must stop immediately; `output_completion_conflict`
// means the work is already done and retrying can never help; anything
// unrecognised is probably a transient connection failure and SHOULD retry.
// Collapsing those into one "database error" turns a permanent failure into an
// infinite retry loop, which is exactly the shape of bug that survives review
// because every individual call site looks fine.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PermanentJobError, LeaseLostError } from '../errors.js'
import { classifyCompletionError } from '../jobs/editorComplete.js'

describe('error classification decides retry behaviour, so it is tested directly', () => {
  it('lease_lost stops this worker rather than failing the project', () => {
    // A lost lease is not the project's failure — another worker has it. Marking
    // the project permanently failed here would destroy work that is currently
    // succeeding somewhere else.
    const e = classifyCompletionError('lease_lost: worker w no longer holds the running lease for project p')
    expect(e).toBeInstanceOf(LeaseLostError)
    expect(e).not.toBeInstanceOf(PermanentJobError)
  })

  const permanent = [
    'edit_plan_divergent', 'edit_plan_invalid', 'edit_plan_wrong_stage',
    'render_wrong_stage', 'render_output_profile_invalid', 'output_completion_conflict',
  ]
  for (const code of permanent) {
    it(`${code} is PERMANENT — retrying it can never help`, () => {
      const e = classifyCompletionError(`${code}: something specific happened`)
      expect(e).toBeInstanceOf(PermanentJobError)
      expect((e as PermanentJobError).code).toBe(code)
    })
  }

  it('every permanent code it emits is in the FROZEN Gate-0 §5 catalog', () => {
    // A stable catalog that the code drifts away from is worse than none:
    // callers branch on these, and an unlisted code is unhandled by definition.
    const FROZEN = new Set([
      'edit_plan_identity_mismatch', 'edit_plan_invalid', 'edit_plan_too_large',
      'edit_plan_divergent', 'edit_plan_unsafe_cut', 'edit_plan_filler_disabled',
      'edit_plan_no_kept_media', 'render_asset_integrity_failed', 'render_font_integrity_failed',
      'render_watermark_integrity_failed', 'speech_language_policy_invalid',
      'render_music_license_invalid', 'render_graph_invalid', 'render_output_profile_invalid',
      'output_decode_failed', 'output_duration_mismatch', 'output_stream_mismatch',
      'output_audio_invalid', 'output_caption_invalid', 'output_cover_invalid',
      'output_completion_conflict', 'source_too_long_for_editor',
      // Stage-position codes raised by 0094's fenced RPCs. Named here so that
      // adding one to the classifier without adding it to a catalog is a
      // deliberate act rather than an oversight.
      'edit_plan_wrong_stage', 'render_wrong_stage',
    ])
    for (const code of permanent) expect(FROZEN.has(code)).toBe(true)
  })

  it('an UNRECOGNISED failure stays retryable — the two mistakes are not symmetric', () => {
    // Misclassifying a transient as permanent abandons a render that would have
    // succeeded. Misclassifying a permanent as transient is caught by the
    // attempt ceiling. The default follows the cheaper mistake.
    for (const m of [
      'could not connect to server: Connection refused',
      'canceling statement due to statement timeout',
      'remaining connection slots are reserved',
      '',
    ]) {
      const e = classifyCompletionError(m)
      expect(e).not.toBeInstanceOf(PermanentJobError)
      expect(e).not.toBeInstanceOf(LeaseLostError)
    }
  })

  it('MUTATION: a code that merely CONTAINS a permanent one is not permanent', () => {
    // Matching on the raised prefix, not a substring. `not_lease_lost_at_all`
    // and a message that happens to mention a code elsewhere must not be
    // promoted to permanent — a substring match here would silently make
    // transient connection errors unretryable whenever their text mentioned one.
    expect(classifyCompletionError('some_other_thing: see output_completion_conflict for context'))
      .not.toBeInstanceOf(PermanentJobError)
    expect(classifyCompletionError('xx_lease_lost: not the real prefix'))
      .not.toBeInstanceOf(LeaseLostError)
  })
})

// The argument-shaping tests drive the module through a stub `db.rpc`, so what
// is asserted is what the module SENDS — which is the half of the contract the
// database cannot check for us.
const rpc = vi.fn()
vi.mock('../db.js', () => ({ db: { rpc: (...a: unknown[]) => rpc(...a) } }))

describe('what the module sends to the fenced RPCs', () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: {}, error: null }) })

  it('reserveOutput sends NO PATH — the database derives it', async () => {
    // This is the structural half of "server-derived paths only". A path that
    // can be passed is a path that can be wrong, so the assertion is that no
    // argument resembling one exists at all.
    const { reserveOutput } = await import('../jobs/editorComplete.js')
    await reserveOutput({ projectId: 'p', jobId: 'j', worker: 'w', attempt: 1 }, 'video', 'media')
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('editor_reserve_output')
    for (const k of Object.keys(args)) expect(k).not.toMatch(/path/i)
    for (const v of Object.values(args)) {
      expect(typeof v === 'string' && v.includes('/')).toBe(false)
    }
  })

  it('every call carries the full fence — project, job, worker AND attempt', async () => {
    // An RPC called without the attempt token is fenced against a lost lease but
    // not against a STALE ATTEMPT of the same worker, which is the resume case.
    const { reserveOutput, completeOutput } = await import('../jobs/editorComplete.js')
    const fence = { projectId: 'p', jobId: 'j', worker: 'w', attempt: 3 }
    await reserveOutput(fence, 'video', 'media')
    await completeOutput(fence, 'asset-1')
    for (const [, args] of rpc.mock.calls as [string, Record<string, unknown>][]) {
      expect(args.p_project).toBe('p')
      expect(args.p_job).toBe('j')
      expect(args.p_worker).toBe('w')
      expect(args.p_attempt).toBe(3)
    }
  })

  it('markOutputReady refuses a video with no measured duration BEFORE calling', async () => {
    const { markOutputReady } = await import('../jobs/editorComplete.js')
    const fence = { projectId: 'p', jobId: 'j', worker: 'w', attempt: 1 }
    await expect(markOutputReady(fence, 'video', { bytes: 10, sha256: 'a'.repeat(64) }))
      .rejects.toBeInstanceOf(PermanentJobError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('markOutputReady refuses a zero-byte or bad-digest output before calling', async () => {
    const { markOutputReady } = await import('../jobs/editorComplete.js')
    const fence = { projectId: 'p', jobId: 'j', worker: 'w', attempt: 1 }
    await expect(markOutputReady(fence, 'video', { bytes: 0, sha256: 'a'.repeat(64), durationMs: 1 }))
      .rejects.toBeInstanceOf(PermanentJobError)
    await expect(markOutputReady(fence, 'video', { bytes: 10, sha256: 'nope', durationMs: 1 }))
      .rejects.toBeInstanceOf(PermanentJobError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('CONTROL: a well-formed video output DOES reach the RPC', async () => {
    // Without this the four refusals above could be satisfied by a function
    // that rejects everything.
    const { markOutputReady } = await import('../jobs/editorComplete.js')
    await markOutputReady({ projectId: 'p', jobId: 'j', worker: 'w', attempt: 1 },
      'video', { bytes: 10, sha256: 'a'.repeat(64), durationMs: 60000 })
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('editor_mark_output_ready')
    expect(args.p_measured_duration_ms).toBe(60000)
  })

  it('a COVER sends a null duration — only the video carries one', async () => {
    const { markOutputReady } = await import('../jobs/editorComplete.js')
    await markOutputReady({ projectId: 'p', jobId: 'j', worker: 'w', attempt: 1 },
      'cover', { bytes: 10, sha256: 'a'.repeat(64) })
    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(args.p_measured_duration_ms).toBeNull()
  })

  it('completeOutput refuses an empty asset id before calling', async () => {
    const { completeOutput } = await import('../jobs/editorComplete.js')
    await expect(completeOutput({ projectId: 'p', jobId: 'j', worker: 'w', attempt: 1 }, ''))
      .rejects.toBeInstanceOf(PermanentJobError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('an RPC error is CLASSIFIED, not passed through raw', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'output_completion_conflict: already completed' } })
    const { completeOutput } = await import('../jobs/editorComplete.js')
    await expect(completeOutput({ projectId: 'p', jobId: 'j', worker: 'w', attempt: 1 }, 'a'))
      .rejects.toBeInstanceOf(PermanentJobError)
  })
})
