// TwinAI worker — the keystone background service.
// Polls the Supabase `jobs` queue, atomically claims one job at a time
// (FOR UPDATE SKIP LOCKED via claim_job), runs the handler, and reports
// done/fail (with retry + backoff) back to the queue. Stateless and
// horizontally scalable: run N replicas, they won't collide.

import { db, claimJob, completeJob, failJob } from './db.js'
import { handlers } from './jobs/index.js'
import { env } from './env.js'

let running = true
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

  try {
    const result = await handler(job)
    await completeJob(job.id, result)
    log('info', 'done', { job: job.id, type: job.type })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Exponential backoff (30s, 60s, 120s… capped at 10min) so a flaky yt-dlp/Apify
    // call gets progressively more breathing room instead of hammering on a fixed 30s.
    const backoff = Math.min(30 * 2 ** Math.max(0, job.attempts - 1), 600)
    await failJob(job.id, message, backoff) // fail_job retries or dead-letters by attempts
    log('error', 'failed', { job: job.id, type: job.type, attempt: job.attempts, error: message })
    // Dead-letter alert: the LAST attempt failed → surface it so spikes are visible
    // (the reliability panel's "alert when fail-rate spikes"). Best-effort.
    if (job.attempts >= job.max_attempts) {
      await db.from('ops_events')
        .insert({ kind: 'job_dead_letter', severity: 'warn', user_id: job.owner_id ?? null, detail: { job_id: job.id, type: job.type, attempts: job.attempts, error: message.slice(0, 300) } })
        .then(() => {}, () => {})
    }
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

main().catch((err) => {
  log('error', 'fatal', { error: err instanceof Error ? err.message : String(err) })
  process.exit(1)
})
