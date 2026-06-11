// TwinAI worker — the keystone background service.
// Polls the Supabase `jobs` queue, atomically claims one job at a time
// (FOR UPDATE SKIP LOCKED via claim_job), runs the handler, and reports
// done/fail (with retry + backoff) back to the queue. Stateless and
// horizontally scalable: run N replicas, they won't collide.

import { claimJob, completeJob, failJob } from './db.js'
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
    await failJob(job.id, message) // claim_job already bumped attempts; fail_job retries or dead-letters
    log('error', 'failed', { job: job.id, type: job.type, error: message })
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
