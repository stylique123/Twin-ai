// TwinAI worker — the keystone background service.
// Polls the Supabase `jobs` queue, atomically claims one job at a time
// (FOR UPDATE SKIP LOCKED via claim_job), runs the handler, and reports
// done/fail (with retry + backoff) back to the queue. Stateless and
// horizontally scalable: run N replicas, they won't collide.

import { writeFileSync } from 'node:fs'
import { db, claimJob, completeJob, deadLetterJob, failJob, heartbeat, recordDownloaderCapability } from './db.js'
import {
  evaluateSchemaHealth, claimableTypes, healthChanged, type SchemaHealth,
} from './schemaCapabilities.js'
import { handlers } from './jobs/index.js'
import { beginJobScope } from './jobs/editorCancel.js'
import { env } from './env.js'
import { capabilitySummary, darkCapabilityWarnings, readCapabilities } from './capabilities.js'
import { probeDownloader } from './downloaderProbe.js'
import { probeAlignment, alignmentSummary } from './alignmentCapabilities.js'
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

// ⚠️ WHAT THE PRODUCTION SCHEMA CAN ACTUALLY DO. Six migrations reached main
// unapplied in one day, and twice a job type claimed work it could only throw
// on while the queue reported it as pending. `null` until the first check —
// which is NOT "healthy", it is "nobody has asked yet".
let schemaHealth: SchemaHealth | null = null

/** ⚖️ FIVE MINUTES, so a migration applied by hand HEALS THE WORKER without a
 *  redeploy. A startup-only check would leave the job type blocked until
 *  somebody restarted the container, which turns a two-minute fix into a
 *  deploy. */
const SCHEMA_RECHECK_MS = 5 * 60_000
let lastSchemaCheck = 0

async function refreshSchemaHealth(reason: string): Promise<void> {
  const next = await evaluateSchemaHealth(env.jobTypes)
  lastSchemaCheck = Date.now()
  // ⚖️ SPEAK ONLY WHEN SOMETHING CHANGED. A re-check every five minutes that
  // re-logged the same incident would become a chorus nobody reads, which is
  // how a real incident hides among its own repetitions.
  if (healthChanged(schemaHealth, next)) {
    const blockedTypes = Object.keys(next.blocked)
    log(next.status === 'healthy' ? 'info' : 'error', 'schema_health', {
      event: 'schema_health',
      status: next.status,
      reason,
      blocked_job_types: next.blocked,
      // The recovery case matters as much as the failure: an operator who
      // applied the migration needs to see the worker notice.
      recovered: schemaHealth !== null && blockedTypes.length === 0,
    })
  }
  schemaHealth = next
}

async function tick(): Promise<boolean> {
  // ⚠️ NEVER CLAIM WORK THAT CANNOT SUCCEED. A blocked type is removed from the
  // claim list entirely, so the queue does not fill with jobs that fail on every
  // attempt while looking like pending work.
  if (Date.now() - lastSchemaCheck >= SCHEMA_RECHECK_MS) await refreshSchemaHealth('periodic')
  const types = schemaHealth ? claimableTypes(env.jobTypes, schemaHealth) : env.jobTypes
  // ⚖️ AN EMPTY CLAIM LIST IS IDLE, NOT DEAD. The worker keeps beating and
  // keeps re-checking, so it recovers on its own the moment the schema does.
  if (types.length === 0) return false
  const job = await claimJob(types)
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

  // ⚠️ AWAITED, AND IT NEVER REFUSES TO BOOT. A worker that will not start on a
  // missing table converts a silent data gap into a full outage — strictly
  // worse than the defect it guards. Same rule readCapabilities follows for a
  // missing APIFY_TOKEN: reduced capability is a legitimate state.
  //
  // ⚖️ CI CANNOT DO THIS CHECK. migration-reconcile.yml REFUSES if its DB url
  // ever points at production, so the only place holding legitimate production
  // access is this process. The check lives where the access already is.
  await refreshSchemaHealth('startup').catch((e) =>
    log('warn', 'schema_health check failed', { error: String(e) }))

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
      yt_dlp_version: probe.ytDlpVersion,
      curl_cffi_version: probe.curlCffiVersion,
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
      // ⚠️ THE VERSIONS BELONG IN THE ROW, NOT ONLY THE LOG. requirements.txt
      // states a FLOOR; Docker caches the pip layer on that file's contents, so
      // what is installed can lag the floor by weeks without anything saying so.
      // This is the field that answers "what is production actually running?"
      // without reading a build log for the word CACHED.
      yt_dlp_version: probe.ytDlpVersion,
      curl_cffi_version: probe.curlCffiVersion,
      impersonate_targets: probe.impersonateTargets,
      tiktok_readable: probe.tiktokReadable,
      detail: probe.detail,
      probed_at: new Date().toISOString(),
    })
  }).catch((e) => log('warn', 'downloader_probe failed', { error: String(e) }))

  // ⚠️ AND WHAT THIS IMAGE CAN DO TO A TIMESTAMP. Same lesson as the downloader
  // probe, different dependency: `whisper_transcribe.py` described a three-tier
  // refiner ladder while two tiers raised ImportError on every call. A docstring
  // cannot be queried; this line can.
  //
  // ⚖️ `acousticAlignment=unavailable` IS THE EXPECTED, DECIDED ANSWER — torch is
  // declined until a measured bad-cut rate justifies it. Seeing it in the log is
  // confirmation, not an alarm. `unknown` is the line worth reading twice.
  probeAlignment().then((caps) => {
    log('info', 'alignment_probe', { event: 'alignment_probe', ...caps, summary: alignmentSummary(caps) })
  }).catch((e) => log('warn', 'alignment_probe failed', { error: String(e) }))
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
