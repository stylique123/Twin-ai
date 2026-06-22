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

export async function completeJob(id: string, result: unknown): Promise<void> {
  // Pass our worker id so the RPC only completes a job we still own (a job
  // reclaimed after the visibility timeout must not be clobbered by us).
  const { error } = await db.rpc('complete_job', { p_id: id, p_result: result, p_worker: env.workerId })
  if (error) throw error
}

// Best-effort live progress: write the current stage into the job's result while
// it's still running, so the UI can show a real, moving status instead of a stale
// "Editing…" screen. complete_job overwrites this with the final result.
export async function updateJobProgress(id: string, progress: { phase: string; pct: number; label: string; instant_url?: string }): Promise<void> {
  try { await db.from('jobs').update({ result: { progress } }).eq('id', id) } catch { /* never block the render on a progress write */ }
}

export async function failJob(id: string, message: string, backoffSecs = 30): Promise<void> {
  const { error } = await db.rpc('fail_job', { p_id: id, p_error: message.slice(0, 500), p_backoff_secs: backoffSecs, p_worker: env.workerId })
  if (error) throw error
}
