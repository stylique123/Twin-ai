// TwinAI worker — the keystone background service.
// Polls the Supabase `jobs` queue, atomically claims one job at a time
// (FOR UPDATE SKIP LOCKED via claim_job), runs the handler, and reports
// done/fail (with retry + backoff) back to the queue. Stateless and
// horizontally scalable: run N replicas, they won't collide.

import { writeFileSync } from 'node:fs'
import { db, claimJob, completeJob, deadLetterJob, failJob, heartbeat, recordDownloaderCapability } from './db.js'
import { handlers } from './jobs/index.js'
import { beginJobScope } from './jobs/editorCancel.js'
import { env } from './env.js'
import { capabilitySummary, darkCapabilityWarnings, readCapabilities } from './capabilities.js'
import { probeDownloader } from './downloaderProbe.js'
import { isLeaseLost, isPermanent } from './errors.js'
import { redact } from './sanitizeError.js'

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
  //
  // THE RACE SETTLES THE JOB; IT DOES NOT STOP THE WORK. That was the defect.
  // `Promise.race` resolves this function, marks the job failed and moves on
  // while the handler keeps going — the ffmpeg it spawned keeps encoding, holds
  // its CPU and disk, and finishes into a project that is already failed. On a
  // single-worker box that is the next job's capacity, spent on a result nobody
  // will read. Worse, the render can still write its output after the failure
  // was recorded.
  //
  // So the deadline now ABORTS as well as rejects. `runMediaProcess` already
  // tears a child process group down properly (SIGTERM, then SIGKILL after a
  // grace period) when its CancelWatch aborts; `beginJobScope` links every watch
  // opened during this job to the controller below, so the deadline reaches that
  // machinery instead of duplicating it.
  //
  // Abort BEFORE reject, deliberately: rejecting first would let this function
  // return and the next tick claim a job while the previous handler's children
  // are still alive.
  const deadline = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      deadline.abort()
      reject(new Error(`Job exceeded hard timeout (${env.maxJobMs}ms)`))
    }, env.maxJobMs)
  })
  const endScope = beginJobScope(deadline.signal)
  try {
    const result = await Promise.race([handler(job), guard])
    await completeJob(job.id, result, job.attempts)
    log('info', 'done', { job: job.id, type: job.type })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // WHAT GOES IN A ROW A CLIENT CAN READ.
    //
    // sanitizeError.ts states the rule for durable state — signed URLs, tokens,
    // temp paths and raw command lines must never be persisted — and editorV2
    // honours it. This loop, which settles EVERY OTHER job type, did not: it
    // wrote `err.message` straight into jobs.error and ops_events.detail.
    //
    // The messages reaching here carry exactly what the rule names. media.ts
    // rejects with `${cmd} exited ${code}: ${stderr.slice(-400)}`, and
    // validateSource.ts with `not decodable media: ${String(e)}` — so yt-dlp
    // and ffprobe internals, local temp paths, and scraped CDN URLs with their
    // signature query strings all land in rows the owner can select (jobs is
    // owner-readable per 0002).
    //
    // Raw still goes to stdout below, which is the split the sanitizer's own
    // header describes: container logs are access-controlled and rotate; a
    // database row is neither.
    const safeMessage = redact(message)
    // A lost lease means another worker owns the job now. Every settle RPC is
    // fenced (would no-op), so just abandon — the new owner drives it.
    if (isLeaseLost(err)) {
      log('warn', 'lease lost — abandoning without settling', { job: job.id, type: job.type, error: message })
      return true
    }
    const permanent = isPermanent(err)
    if (permanent) {
      // Non-retryable: settle immediately instead of burning the retry budget.
      await deadLetterJob(job.id, safeMessage, job.attempts)
    } else {
      // Exponential backoff (30s, 60s, 120s… capped at 10min) so a flaky yt-dlp/Apify
      // call gets progressively more breathing room instead of hammering on a fixed 30s.
      const backoff = Math.min(env.retryBackoffBaseSecs * 2 ** Math.max(0, job.attempts - 1), 600)
      await failJob(job.id, safeMessage, backoff, job.attempts) // fail_job retries or dead-letters by attempts
    }
    log('error', 'failed', { job: job.id, type: job.type, attempt: job.attempts, permanent, error: message })
    // Dead-letter alert: the LAST attempt failed → surface it so spikes are visible
    // (the reliability panel's "alert when fail-rate spikes"). Best-effort.
    if (permanent || job.attempts >= job.max_attempts) {
      await db.from('ops_events')
        .insert({ kind: 'job_dead_letter', severity: 'warn', user_id: job.owner_id ?? null, detail: { job_id: job.id, type: job.type, attempts: job.attempts, error: safeMessage } })
        .then(() => {}, () => {})
    }
  } finally {
    if (timer) clearTimeout(timer)
    // Close the scope whatever happened, so the next job opens a clean one and
    // `beginJobScope`'s serial-worker assertion stays meaningful.
    endScope()
  }
  return true
}

async function main() {
  // ⚠️ WHAT THIS WORKER CAN DO, BEFORE ANYONE TRIPS OVER WHAT IT CANNOT.
  // `APIFY_TOKEN` was absent for a full day of development and nothing said so:
  // every credential check is per-call, so the absence only spoke when a user
  // hit it, and what it said — "not configured yet, contact support" — reads as
  // a product limitation rather than a missing variable.
  const caps = readCapabilities(env)
  log('info', 'worker up', {
    types: env.jobTypes, model: env.whisperModel, capabilities: capabilitySummary(caps),
  })
  // ⚖️ WARN, NOT FAIL. A worker without Apify still transcribes, renders and
  // scans TikTok — reduced capability is a legitimate state and crashing on it
  // would turn a missing optional key into an outage.
  for (const line of darkCapabilityWarnings(caps)) log('warn', line)

  // ⚠️ WHAT THE CONTAINER CAN DO, WHICH IS A DIFFERENT QUESTION FROM WHAT IT WAS
  // CONFIGURED TO DO. `curl-cffi` is pinned in requirements.txt precisely so
  // TikTok can be impersonated, and a forced re-run still printed "no
  // impersonate target is available" on every download. A declared dependency
  // is not an installed one. Only the running image can answer this, and until
  // this line nothing asked it.
  //
  // ⚖️ AWAITED BEFORE THE LOOP, so the answer is in the log ABOVE the first job
  // rather than interleaved with it — the operator reading a wave of TikTok
  // failures should find the cause above them, not have to search for it.
  probeDownloader().then((probe) => {
    log(probe.tiktokReadable ? 'info' : 'warn', 'downloader_probe', {
      event: 'downloader_probe',
      yt_dlp: probe.ytDlp,
      impersonate_targets: probe.impersonateTargets,
      tiktok_readable: probe.tiktokReadable,
      detail: probe.detail,
    })
    // ⚠️ AND WRITTEN WHERE IT CAN BE READ. The log line is for whoever is
    // tailing the container. The row is for everybody else — which on this
    // project is everybody, because the probe exists precisely because nobody
    // has a shell on this box. A diagnostic that requires the access it was
    // built to replace is not a diagnostic.
    void recordDownloaderCapability({
      yt_dlp: probe.ytDlp,
      impersonate_targets: probe.impersonateTargets,
      tiktok_readable: probe.tiktokReadable,
      detail: probe.detail,
      probed_at: new Date().toISOString(),
    })
  }).catch((e) => log('warn', 'downloader_probe failed', { error: String(e) }))
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
