// TwinAI worker — the keystone background service.
// Polls the Supabase `jobs` queue, atomically claims one job at a time
// (FOR UPDATE SKIP LOCKED via claim_job), runs the handler, and reports
// done/fail (with retry + backoff) back to the queue. Stateless and
// horizontally scalable: run N replicas, they won't collide.

import { writeFileSync } from 'node:fs'
import { db, claimJob, completeJob, deadLetterJob, failJob, heartbeat } from './db.js'
import { handlers } from './jobs/index.js'
import { env } from './env.js'
import { isLeaseLost, isPermanent } from './errors.js'

let running = true
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Liveness: touch a local file every loop (for the Docker HEALTHCHECK — catches a
// wedged, not-crashed worker) and write a DB heartbeat at most every 15s (for
// system_health + the worker-down alert). Both are best-effort and never block work.
const HEARTBEAT_FILE = '/tmp/worker-alive'
let lastDbBeat = 0
async function beat(): Promise<void> {
  const now = Date.now()
  try { writeFileSync(HEARTBEAT_FILE, String(now)) } catch { /* fs read-only — ignore */ }
  if (now - lastDbBeat > 15_000) { lastDbBeat = now; await heartbeat() }
}

function log(level: string, msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, worker: env.workerId, ...extra }))
}

async function tick(): Promise<boolean> {
  const job = await claimJob(env.jobTypes)
  if (!job) return false

  const handler = handlers[job.type]
  log('info', 'claimed', { job: job.id, type: job.type, attempt: job.attempts })
  if (!handler) {
    await failJob(job.id, `No handler for job type ${job.type}`, 3600)
    return true
  }

  // Hard per-job timeout backstop: if a handler hangs (child process never returns),
  // give up before the lease expires so this worker frees up instead of wedging.
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Job exceeded hard timeout (${env.maxJobMs}ms)`)), env.maxJobMs)
  })
  try {
    const result = await Promise.race([handler(job), guard])
    await completeJob(job.id, result)
    log('info', 'done', { job: job.id, type: job.type })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // A lost lease means another worker owns the job now. Every settle RPC is
    // fenced (would no-op), so just abandon — the new owner drives it.
    if (isLeaseLost(err)) {
      log('warn', 'lease lost — abandoning without settling', { job: job.id, type: job.type, error: message })
      return true
    }
    const permanent = isPermanent(err)
    if (permanent) {
      // Non-retryable: settle immediately instead of burning the retry budget.
      await deadLetterJob(job.id, message)
    } else {
      // Exponential backoff (30s, 60s, 120s… capped at 10min) so a flaky yt-dlp/Apify
      // call gets progressively more breathing room instead of hammering on a fixed 30s.
      const backoff = Math.min(env.retryBackoffBaseSecs * 2 ** Math.max(0, job.attempts - 1), 600)
      await failJob(job.id, message, backoff) // fail_job retries or dead-letters by attempts
    }
    log('error', 'failed', { job: job.id, type: job.type, attempt: job.attempts, permanent, error: message })
    // Dead-letter alert: the LAST attempt failed → surface it so spikes are visible
    // (the reliability panel's "alert when fail-rate spikes"). Best-effort.
    if (permanent || job.attempts >= job.max_attempts) {
      await db.from('ops_events')
        .insert({ kind: 'job_dead_letter', severity: 'warn', user_id: job.owner_id ?? null, detail: { job_id: job.id, type: job.type, attempts: job.attempts, error: message.slice(0, 300) } })
        .then(() => {}, () => {})
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
  return true
}

async function main() {
  log('info', 'worker up', { types: env.jobTypes, model: env.whisperModel })
  // Graceful shutdown: finish the current job, then exit.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log('info', 'shutdown requested', { sig })
      running = false
    })
  }

  while (running) {
    try {
      await beat() // record liveness before each claim attempt
      const didWork = await tick()
      if (!didWork) await sleep(env.pollMs) // idle backoff when the queue is empty
    } catch (err) {
      log('error', 'loop error', { error: err instanceof Error ? err.message : String(err) })
      await sleep(env.pollMs)
    }
  }
  log('info', 'worker stopped')
  process.exit(0)
}

// Safety net for the many fire-and-forget best-effort writes: a floating promise
// that slips through must never take the whole worker down mid-render.
process.on('unhandledRejection', (err) => {
  log('error', 'unhandled rejection', { error: err instanceof Error ? err.message : String(err) })
})

main().catch((err) => {
  log('error', 'fatal', { error: err instanceof Error ? err.message : String(err) })
  process.exit(1)
})
