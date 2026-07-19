import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

// Service-role client. RLS is bypassed — every query here is trusted backend code.
export const db = createClient(env.supabaseUrl, env.serviceKey, {
  auth: { persistSession: false },
})

export interface Job {
  id: string
  owner_id: string | null
  type: string
  payload: Record<string, unknown>
  status: string
  attempts: number
  max_attempts: number
}

// Atomically claim one due job of the given types (FOR UPDATE SKIP LOCKED in SQL).
export async function claimJob(types: string[]): Promise<Job | null> {
  const { data, error } = await db.rpc('claim_job', {
    p_worker: env.workerId,
    p_types: types,
    p_visibility_secs: env.visibilitySecs,
  })
  if (error) throw error
  const rows = data as Job[] | null
  return rows && rows.length ? rows[0] : null
}

export async function completeJob(id: string, result: unknown, attempt?: number): Promise<void> {
  // Pass our worker id AND the attempt observed at claim time so the RPC only
  // completes a job we still own (a job reclaimed after the visibility timeout
  // must not be clobbered by us — even by a later claim under the SAME worker
  // identity; attempts is the immutable fencing token). A 0 return means we
  // lost the lease — the new owner now drives it, so don't clobber/log loud.
  const { data, error } = await db.rpc('complete_job', { p_id: id, p_result: result, p_worker: env.workerId, p_attempt: attempt ?? null })
  if (error) throw error
  if (data === 0) console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'complete_job no-op: job was reclaimed', job: id, worker: env.workerId }))
}

// Best-effort live progress: write the current stage into the job's result while
// it's still running, so the UI can show a real, moving status instead of a stale
// "Editing…" screen. complete_job overwrites this with the final result.
export async function updateJobProgress(id: string, progress: { phase: string; pct: number; label: string; instant_url?: string }): Promise<void> {
  // Only write progress for a job we STILL own AND that is still running. Without
  // these guards, a job reclaimed after its visibility timeout (or already
  // completed by the new owner) could have its final result column clobbered by a
  // stale progress write from the original worker — losing the finished video URL.
  try { await db.from('jobs').update({ result: { progress } }).eq('id', id).eq('status', 'running').eq('locked_by', env.workerId) } catch (e) { console.warn(`[job ${id}] progress write failed:`, e) /* never block the render on a progress write */ }
}

// Liveness heartbeat: record that this worker is alive so a dead/wedged worker is
// visible (system_health + the check-worker-liveness cron alert). Best-effort — a
// failed heartbeat must never affect job processing.
export async function heartbeat(): Promise<void> {
  try {
    await db.from('worker_heartbeat').upsert({ worker_id: env.workerId, last_seen_at: new Date().toISOString() })
  } catch { /* best-effort; the Docker HEALTHCHECK file still reflects local liveness */ }
}

// Extend the visibility lease on a job this worker still owns (worker id +
// attempt token). Returns 1 when renewed, 0 when the lease was lost
// (reclaimed/settled) — the caller must STOP driving the job's work on 0.
export async function renewJobLease(id: string, attempt: number): Promise<number> {
  const { data, error } = await db.rpc('renew_job_lease', { p_id: id, p_worker: env.workerId, p_attempt: attempt })
  if (error) throw error
  return (data as number) ?? 0
}

// Settle a PERMANENT (non-retryable) failure immediately instead of burning
// the remaining retry budget on an error that can never succeed. Fenced the
// same way as complete/fail: only the current lease+attempt holder settles.
export async function deadLetterJob(id: string, message: string, attempt: number): Promise<void> {
  const { data, error } = await db.rpc('dead_letter_job', { p_id: id, p_error: message.slice(0, 500), p_worker: env.workerId, p_attempt: attempt })
  if (error) throw error
  if (data === 0) console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'dead_letter_job no-op: job was reclaimed', job: id, worker: env.workerId }))
}

export async function failJob(id: string, message: string, backoffSecs = 30, attempt?: number): Promise<void> {
  const { data, error } = await db.rpc('fail_job', { p_id: id, p_error: message.slice(0, 500), p_backoff_secs: backoffSecs, p_worker: env.workerId, p_attempt: attempt ?? null })
  if (error) throw error
  if (data === 0) console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'fail_job no-op: job was reclaimed', job: id, worker: env.workerId }))
}
