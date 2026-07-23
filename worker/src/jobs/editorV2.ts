// editor_v2 — the orchestration handler. Drives an edit_project through the
// full stage pipeline. inspecting (Phase 4), transcribing (Phase 5) and
// analyzing (Phase 6: visual/audio/hook evidence) are REAL; directing,
// compiling, rendering and validating remain SIMULATED (no Gemini Director,
// no EditPlan compilation, no output rendering — those are later phases), so
// a `completed` project still has output_asset_id NULL and is a SCAFFOLD
// state, never a product success.
//
// Phase-6 additions:
//   * boot-artifact manifest + recording-script snapshot pinned (fenced,
//     set-once) BEFORE the first queued->inspecting transition; a divergent
//     manifest on resume fails closed (manifest_mismatch)
//   * one attempt-scoped VerifiedSourceSession owns the source bytes across
//     all real stages: at most ONE verified download per attempt
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
import { LeaseLostError, PermanentJobError, classifyDbError, isLeaseLost } from '../errors.js'
import { queueSafeError, sanitizeError } from '../sanitizeError.js'
import { EDITOR_STAGES, isTerminal, stagePct, stagesFrom, type EditorStage } from './editorPipeline.js'
import { AnalyzeCancelledError, DirectorCancelledError } from './editorCancel.js'
import { InspectionCancelledError, loadEligibleSource, runInspectingStage } from './editorInspect.js'
import { SpeechCancelledError, runTranscribingStage } from './editorSpeech.js'
import { runAnalyzingStage, type AnalyzeOutcome } from './editorAnalyze.js'
import { runDirectingStage, type DirectorOutcome } from './editorDirector.js'
import { buildBootManifest, buildScriptSnapshot, type BuiltManifest, type BuiltSnapshot } from './editorManifest.js'
import { VerifiedSourceSession } from './sourceSession.js'

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
// Stages whose work is REAL (not simulated). Everything after `analyzing`
// stays simulated until its phase lands.
const REAL_STAGES: ReadonlySet<EditorStage> = new Set(['inspecting', 'transcribing', 'analyzing'])

async function advanceStage(job: Job, projectId: string, to: EditorStage): Promise<EditProjectRow> {
  const { data, error } = await db.rpc('editor_advance_stage', {
    p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
    p_to: to, p_pct: stagePct(to), p_message_code: 'stage_started',
    p_details: { attempt: job.attempts, simulated: !REAL_STAGES.has(to) },
  })
  if (error) throw classifyDbError(error.message)
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
  if (error) throw classifyDbError(error.message)
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

// ---- boot-manifest pinning --------------------------------------------------
// Fenced, set-once: called on EVERY attempt before the stage loop. First call
// pins; an identical recomputation is an idempotent 'already_pinned'; a
// DIVERGENT manifest (different worker build / rules / models mid-project)
// fails closed as the PERMANENT manifest_mismatch — versions are never mixed
// within one project.
async function pinManifest(
  job: Job, projectId: string, generationId: string,
): Promise<{ manifest: BuiltManifest; snapshot: BuiltSnapshot; pin: string }> {
  const manifest = await buildBootManifest({
    inspectorVersion: env.inspectorVersion, speechVersion: env.speechVersion,
  })
  // Read the REQUIRED script columns explicitly. If a required column is
  // absent (schema drift / an un-migrated deployment), PostgREST returns a
  // "column ... does not exist" error — fail CLOSED with a stable
  // schema-drift code rather than silently degrading to "no script". A
  // legitimately NULL scene_timeline is fine (buildScriptSnapshot then
  // produces the documented empty-scenes snapshot); only a MISSING column is
  // the error.
  const { data: gen, error: genErr } = await db
    .from('generations').select('id, selected_hook, scene_timeline')
    .eq('id', generationId).maybeSingle()
  if (genErr) {
    if (/column .*does not exist|scene_timeline|selected_hook/i.test(genErr.message)) {
      throw new PermanentJobError(
        `pin: generations schema is missing a required script column (deployment drift): ${genErr.message}`,
        'script_schema_drift')
    }
    throw new Error(`pin: generation read failed: ${genErr.message}`)
  }
  if (!gen) throw new PermanentJobError(`pin: generation ${generationId} missing`, 'generation_missing')
  const snapshot = buildScriptSnapshot(gen as { id: string; selected_hook: string | null; scene_timeline: unknown })
  // throws script_snapshot_too_large (fail closed)
  const { data, error } = await db.rpc('editor_pin_manifest', {
    p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
    p_manifest: manifest.manifest, p_manifest_sha: manifest.manifestSha,
    p_snapshot: snapshot.snapshot, p_snapshot_sha: snapshot.snapshotSha,
  })
  if (error) throw classifyDbError(error.message)
  return { manifest, snapshot, pin: String(data ?? '') }
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
  let session: VerifiedSourceSession | null = null
  try {
    const { data: proj, error } = await db
      .from('edit_projects')
      .select('id,status,cancel_requested_at,generation_id')
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
    // exists yet; see docs/editor-v2-worker-orchestration.md.

    // Phase 6: pin the boot-artifact manifest + recording-script snapshot
    // BEFORE the first queued->inspecting transition (idempotent on resume;
    // fails closed on divergence). Then open the attempt-scoped source
    // session every real stage shares.
    const pinned = await pinManifest(job, projectId, String(proj.generation_id))
    const src = await loadEligibleSource(projectId, 'session')
    session = new VerifiedSourceSession(src.asset, src.meta, dir)

    let inspect: Record<string, unknown> | null = null
    let speech: Record<string, unknown> | null = null
    let analysis: AnalyzeOutcome | null = null
    let director: DirectorOutcome | null = null
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
        if (err instanceof InspectionCancelledError || err instanceof SpeechCancelledError
            || err instanceof AnalyzeCancelledError || err instanceof DirectorCancelledError) {
          await finishProject(job, projectId, 'cancelled', undefined, { at_stage: stage })
          return true
        }
        return false
      }

      if (stage === 'inspecting') {
        // Phase 4: reuses Phase-1 validation facts (or the cached component)
        // and only downloads/reprobes as a bounded upgrade.
        try {
          const out = await runInspectingStage(job, projectId, session)
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
          const out = await runTranscribingStage(job, projectId, dir, session)
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
        // Phase 6: the REAL analyzing stage — strict-version speech/inspection
        // consumption, digest-keyed visual/audio/hook evidence components,
        // fenced recording with recorded/reused event accounting.
        try {
          analysis = await runAnalyzingStage(job, projectId, dir, session, pinned)
        } catch (err) {
          if (await cancelledMidStage(err)) return { cancelled: true, at_stage: stage, stages_ran: ranStages }
          if (!isLeaseLost(err)) {
            // Durable failure marker with the stable code: a manifest
            // divergence gets its own event code; every other failure
            // (integrity `source_bytes_changed`, bounds, payload, provider…)
            // is `analysis_failed` with the code in details. Best-effort
            // append (a lease-loss refusal still aborts the caller).
            const code = err instanceof PermanentJobError ? err.code : 'analysis_error'
            const evCode = code === 'manifest_mismatch' ? 'manifest_mismatch' : 'analysis_failed'
            await appendEvent(job, projectId, evCode, { code })
          }
          throw err
        }
      } else if (stage === 'directing' && env.editorDirectorEnabled) {
        // Phase 7: the REAL directing stage — one pinned gemini-3.5-flash call,
        // server-side re-resolution, immutable decision. Gated by env so
        // production (flag unset) keeps directing SIMULATED below.
        try {
          director = await runDirectingStage(job, projectId, dir, session, pinned)
        } catch (err) {
          if (await cancelledMidStage(err)) return { cancelled: true, at_stage: stage, stages_ran: ranStages }
          if (!isLeaseLost(err)) {
            const code = err instanceof PermanentJobError ? err.code : 'director_error'
            await appendEvent(job, projectId, 'director_failed', { code })
          }
          throw err
        }
      } else {
        await runStageWithTimeout(stage, job, dir)
      }
      ranStages.push(stage)
    }

    await finishProject(job, projectId, 'completed', undefined, {
      // Scaffold marker: compiling/rendering/validating are still simulated and
      // output_asset_id stays NULL — never a product success. When directing
      // ran for real, the boundary moves to after-directing; otherwise it is
      // the unchanged after-analysis boundary (production).
      ...(director ? { simulated_after_directing: true } : { simulated_after_analysis: true }),
      director_ran: !!director,
      manifest_sha: pinned.manifest.manifestSha,
      source_downloads: session.downloadsPerformed,
      components: analysis ? {
        visual: analysis.visual, audio: analysis.audio, hook: analysis.hook,
      } : null,
      director: director ? { selections: director.selections, reused: director.reused, decision_sha256: director.decisionSha256 } : null,
    })
    maybeCrash('after_finish', job) // project settled, job not yet acknowledged
    return {
      // compiling/rendering/validating are still simulated; directing is real
      // only when the flag is enabled (else after-analysis, as in production).
      ...(director ? { simulated_after_directing: true } : { simulated_after_analysis: true }),
      stages_ran: ranStages,
      inspection: inspect,
      speech,
      analysis: analysis as unknown as Record<string, unknown> | null,
      director: director as unknown as Record<string, unknown> | null,
      source_downloads: session.downloadsPerformed,
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
    throw queueSafeError(err, safe)
  } finally {
    lease.stop()
    session?.dispose()
    try {
      await rm(dir, { recursive: true, force: true })
    } catch (teardownErr) {
      // NEVER masked: the orphan sweep backstops the disk, but the failure is
      // announced durably (best-effort — a lost lease here just logs).
      try {
        await appendEvent(job, projectId, 'teardown_failed', {
          message: String(teardownErr).slice(0, 200),
        })
      } catch { /* fenced refusal — the container log still has the error */ }
      console.warn(`[editor_v2 ${projectId}] temp-dir teardown failed:`, teardownErr)
    }
  }
}
