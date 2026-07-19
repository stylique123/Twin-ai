// editor_v2 — the Phase-3 orchestration handler. Drives an edit_project
// through the full stage pipeline with SIMULATED stage work (no Whisper, no
// media analysis, no Gemini Director, no EditPlan compilation, no FFmpeg, no
// captions/zooms/music, no output rendering — those are later phases; each
// stage here just proves the orchestration contract around it).
//
// What IS real, and under test:
//   * durable state transitions — every advance is a fenced, atomic DB call
//     (editor_advance_stage) that re-proves this worker still holds the
//     running lease before touching the project or its event history
//   * lease renewal — a background renew_job_lease loop keeps a long run
//     owned; a lost lease aborts the run instead of double-driving
//   * crash recovery — a reclaimed job resumes from the project's persisted
//     stage (re-running the interrupted stage; stage handlers are idempotent)
//   * cancellation — cancel_requested_at is observed at every stage boundary
//   * stage timeouts — a hung stage fails RETRYABLE before the lease expires
//   * retry classification — PermanentJobError dead-letters immediately and
//     fails the project; retryable errors burn the normal retry budget, and
//     the LAST attempt fails the project before the job dead-letters
//   * temp-dir lifecycle — a per-job scratch dir is created, used, and
//     removed on every exit path; orphans are swept by age
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { db, renewJobLease, type Job } from '../db.js'
import { env } from '../env.js'
import { LeaseLostError, PermanentJobError, isLeaseLost } from '../errors.js'
import { sanitizeError } from '../sanitizeError.js'
import { EDITOR_STAGES, isTerminal, stagePct, stagesFrom, type EditorStage } from './editorPipeline.js'
import { InspectionCancelledError, runInspectingStage } from './editorInspect.js'
import { SpeechCancelledError, runTranscribingStage, verifySpeechComponent } from './editorSpeech.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface EditProjectRow {
  id: string
  status: string
  cancel_requested_at: string | null
}

// ---- fenced RPC wrappers ---------------------------------------------------
// Every call carries (job id, worker id, attempt) — the attempt observed at
// claim time is the immutable fencing token; the database rejects any write
// from a run whose claim has been superseded, even by the same worker id.
async function advanceStage(job: Job, projectId: string, to: EditorStage): Promise<EditProjectRow> {
  const { data, error } = await db.rpc('editor_advance_stage', {
    p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
    p_to: to, p_pct: stagePct(to), p_message_code: 'stage_started',
    p_details: { attempt: job.attempts, simulated: true },
  })
  if (error) throw toClassifiedError(error.message)
  // PostgREST returns a composite either bare or single-element depending on
  // client version — normalize.
  return (Array.isArray(data) ? data[0] : data) as EditProjectRow
}

async function finishProject(
  job: Job, projectId: string, status: 'completed' | 'failed' | 'cancelled',
  failureCode?: string, details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.rpc('editor_finish_project', {
    p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
    p_status: status, p_failure_code: failureCode ?? null, p_details: details,
  })
  if (error) throw toClassifiedError(error.message)
}

async function appendEvent(
  job: Job, projectId: string, messageCode: string, details: Record<string, unknown> = {},
): Promise<void> {
  // History markers are best-effort ONLY when the failure is not fencing:
  // a lease_lost refusal must still abort the caller.
  const { error } = await db.rpc('editor_append_event', {
    p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
    p_message_code: messageCode, p_pct: null, p_details: details,
  })
  if (error) {
    if (/lease_lost/.test(error.message)) throw new LeaseLostError(error.message)
    console.warn(`[editor_v2 ${projectId}] event append failed:`, error.message)
  }
}

// The DB raises typed messages; map them back onto the worker's error classes
// so the queue loop settles the job correctly.
function toClassifiedError(message: string): Error {
  if (/lease_lost/.test(message)) return new LeaseLostError(message)
  if (/project_terminal|not found/.test(message)) return new PermanentJobError(message, 'project_state')
  return new Error(message)
}

// ---- background lease renewal ----------------------------------------------
function startLeaseRenewal(job: Job): { lost: () => boolean; stop: () => void } {
  let lost = false
  const t = setInterval(() => {
    renewJobLease(job.id, job.attempts).then(
      (n) => { if (n === 0) lost = true },
      () => { /* transient network error: the next tick retries; fenced RPCs are the hard guarantee */ },
    )
  }, env.editorLeaseRenewMs)
  return { lost: () => lost, stop: () => clearInterval(t) }
}

// Deterministic crash injection for the staging matrix ONLY: hard-exit the
// process at a named point ('before_stage:<stage>' | 'after_finish') so crash
// recovery can be proven at exact boundaries, not just wherever SIGKILL lands.
// Gated by EDITOR_SIM_FAIL_ATTEMPTS so the retried attempt runs clean.
function maybeCrash(point: string, job: Job): void {
  if (env.editorSimCrashPoint && env.editorSimCrashPoint === point && job.attempts <= env.editorSimFailAttempts) {
    console.error(JSON.stringify({ level: 'error', msg: 'simulated crash', point, attempt: job.attempts }))
    process.exit(9)
  }
}

// ---- temp-dir lifecycle ----------------------------------------------------
const TEMP_BASE = join(tmpdir(), 'editor-v2')

async function sweepOrphanTempDirs(): Promise<number> {
  let swept = 0
  try {
    for (const name of await readdir(TEMP_BASE)) {
      const p = join(TEMP_BASE, name)
      try {
        const s = await stat(p)
        if (Date.now() - s.mtimeMs > env.editorTempMaxAgeMs) {
          await rm(p, { recursive: true, force: true })
          swept++
        }
      } catch { /* raced with another cleanup — fine */ }
    }
  } catch { /* base dir doesn't exist yet */ }
  return swept
}

// ---- simulated stage work --------------------------------------------------
async function runSimulatedStage(stage: EditorStage, job: Job, dir: string): Promise<void> {
  // Prove the scratch dir is writable and job-scoped (real stages will put
  // downloads/intermediates here).
  await writeFile(join(dir, `${stage}.txt`), `${job.id} ${stage} attempt=${job.attempts}\n`, { flag: 'a' })

  const injected = env.editorSimFailStage === stage && job.attempts <= env.editorSimFailAttempts
  if (injected && env.editorSimFailMode === 'hang') {
    await sleep(2 ** 31 - 1) // never returns — the stage timeout must fire
  }
  await sleep(env.editorSimStageMs)
  if (injected && env.editorSimFailMode === 'permanent') {
    throw new PermanentJobError(`simulated permanent failure in ${stage}`, 'simulated_permanent')
  }
  if (injected) {
    throw new Error(`simulated retryable failure in ${stage}`)
  }
}

async function runStageWithTimeout(stage: EditorStage, job: Job, dir: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`stage_timeout: ${stage} exceeded ${env.editorStageTimeoutMs}ms`)),
      env.editorStageTimeoutMs,
    )
  })
  try {
    await Promise.race([runSimulatedStage(stage, job, dir), guard])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ---- the handler -----------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleEditorV2(job: Job): Promise<Record<string, unknown>> {
  const projectId = String(job.payload?.project_id ?? '')
  if (!UUID_RE.test(projectId)) throw new PermanentJobError('editor_v2 job missing/invalid project_id', 'bad_payload')
  // job.id comes from our own uuid column, but validate anyway so the scratch
  // path can NEVER escape the configured temp root.
  if (!UUID_RE.test(job.id)) throw new PermanentJobError('editor_v2 job has a non-uuid id', 'bad_payload')

  const sweptOrphans = await sweepOrphanTempDirs()
  // One directory PER ATTEMPT: a reclaimed attempt on the same host never
  // shares scratch state with the crashed attempt's leftovers.
  const dir = join(TEMP_BASE, `${job.id}-a${job.attempts}`)
  await mkdir(dir, { recursive: true })

  const lease = startLeaseRenewal(job)
  const ranStages: string[] = []
  let currentStage: EditorStage | null = null
  try {
    const { data: proj, error } = await db
      .from('edit_projects')
      .select('id,status,cancel_requested_at')
      .eq('id', projectId)
      .maybeSingle()
    if (error) throw new Error(`project read failed: ${error.message}`)
    if (!proj) throw new PermanentJobError(`project ${projectId} not found`, 'project_missing')

    // Settled elsewhere (cancelled while queued, reconciler): nothing to drive.
    if (isTerminal(proj.status)) {
      return { noop: true, project_status: proj.status }
    }
    if (proj.cancel_requested_at) {
      await finishProject(job, projectId, 'cancelled')
      return { cancelled: true, before_stage: proj.status }
    }

    const resume = proj.status !== 'queued'
    if (resume) {
      await appendEvent(job, projectId, 'resumed', { from_stage: proj.status, attempt: job.attempts })
    }

    // NOTE (Phase-3 billing boundary, design-only): the billing reservation
    // will be taken HERE — at worker claim, before the first stage — and
    // finalized/released in editor_finish_project. No reservation or charge
    // exists in Phase 3; see docs/editor-v2-worker-orchestration.md.
    let inspect: Record<string, unknown> | null = null
    let speech: Record<string, unknown> | null = null
    for (const stage of stagesFrom(proj.status)) {
      if (lease.lost()) throw new LeaseLostError(`lease lost before stage ${stage}`)
      maybeCrash(`before_stage:${stage}`, job)
      currentStage = stage

      // Fenced advance. On resume the first call re-enters the persisted
      // stage (a same-status no-op transition) and re-records stage_started.
      const p = await advanceStage(job, projectId, stage)
      if (p.cancel_requested_at) {
        await finishProject(job, projectId, 'cancelled', undefined, { at_stage: stage })
        return { cancelled: true, at_stage: stage, stages_ran: ranStages }
      }

      // A cooperative mid-stage cancellation (watcher-tripped abort) settles
      // the project as cancelled — shared by every real stage.
      const cancelledMidStage = async (err: unknown): Promise<boolean> => {
        if (err instanceof InspectionCancelledError || err instanceof SpeechCancelledError) {
          await finishProject(job, projectId, 'cancelled', undefined, { at_stage: stage })
          return true
        }
        return false
      }

      if (stage === 'inspecting') {
        // Phase 4: reuses Phase-1 validation facts (or the cached component)
        // and only downloads/reprobes as a bounded upgrade.
        try {
          const out = await runInspectingStage(job, projectId, dir)
          inspect = { ...out }
          await appendEvent(job, projectId, 'inspection_recorded', {
            cache_hit: out.cacheHit,
            reused_validation_facts: out.reusedValidationFacts,
            fallback_probe_performed: out.fallbackProbePerformed,
            inspector_version: env.inspectorVersion,
          })
        } catch (err) {
          if (await cancelledMidStage(err)) return { cancelled: true, at_stage: stage, stages_ran: ranStages }
          throw err
        }
      } else if (stage === 'transcribing') {
        // Phase 5: the real speech analysis — integrity-verified download,
        // Faster-Whisper, VAD/energy evidence, candidates; immutable component.
        try {
          const out = await runTranscribingStage(job, projectId, dir)
          speech = { ...out }
          await appendEvent(job, projectId, 'speech_recorded', {
            cache_hit: out.cacheHit,
            asr_performed: out.asrPerformed,
            word_count: out.wordCount,
            language: out.language,
            candidate_counts: out.candidateCounts,
            speech_version: env.speechVersion,
          })
        } catch (err) {
          if (await cancelledMidStage(err)) return { cancelled: true, at_stage: stage, stages_ran: ranStages }
          throw err
        }
      } else if (stage === 'analyzing') {
        // Phase 5: the SPEECH portion of analyzing is real — re-verify the
        // durable component against the current bytes (fail closed). The
        // visual/audio portions stay simulated until their phases.
        try {
          const v = await verifySpeechComponent(projectId)
          await appendEvent(job, projectId, 'speech_analysis_verified', {
            speech_version: v.speechVersion,
            word_count: v.wordCount,
            candidates_total: v.candidatesTotal,
          })
        } catch (err) {
          if (await cancelledMidStage(err)) return { cancelled: true, at_stage: stage, stages_ran: ranStages }
          throw err
        }
        await runStageWithTimeout(stage, job, dir)
      } else {
        await runStageWithTimeout(stage, job, dir)
      }
      ranStages.push(stage)
    }

    await finishProject(job, projectId, 'completed', undefined, { simulated_after_speech: true })
    maybeCrash('after_finish', job) // project settled, job not yet acknowledged
    return {
      simulated: true, // directing/compiling/rendering/validating are still simulated
      stages_ran: ranStages,
      inspection: inspect,
      speech,
      swept_orphan_dirs: sweptOrphans,
      temp_dir_cleaned: true, // the finally below removes it before we return
    }
  } catch (err) {
    // A lost lease means another worker drives this project now — abort
    // silently; every state write is fenced so nothing was corrupted.
    if (isLeaseLost(err)) throw err

    const permanent = err instanceof PermanentJobError
    const lastAttempt = job.attempts >= job.max_attempts
    // Everything persisted goes through the sanitizer: stable code, safe
    // stage, retry class, bounded REDACTED message. The raw error stays in
    // the worker's stdout only (access-controlled container logs).
    const safe = sanitizeError(err, currentStage ?? ranStages.at(-1) ?? 'inspecting')
    try {
      if (permanent || lastAttempt) {
        // We still hold the lease: settle the PROJECT before the job settles,
        // so no project ever hangs on a dead-lettered job. (If we crash right
        // here instead, the reconciler sweep closes the same gap.)
        await finishProject(job, projectId, 'failed',
          permanent ? (err as PermanentJobError).code : 'retries_exhausted',
          { error: safe.message, code: safe.code, retry: safe.retry, stage: safe.stage,
            attempt: job.attempts, stages_ran: ranStages })
      } else {
        await appendEvent(job, projectId, 'stage_retry_scheduled', {
          error: safe.message, code: safe.code, retry: safe.retry,
          attempt: job.attempts, max_attempts: job.max_attempts,
        })
      }
    } catch (settleErr) {
      // Fencing refusals here mean the state is already owned/settled by
      // someone else — the original error still decides the job's fate.
      if (!isLeaseLost(settleErr) && !(settleErr instanceof PermanentJobError)) throw settleErr
    }
    throw err
  } finally {
    lease.stop()
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort; the orphan sweep backstops */ })
  }
}
