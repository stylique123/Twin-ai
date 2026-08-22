#!/usr/bin/env node
// THE PILOT, DRIVEN BY ID.
//
//   node scripts/frame-pilot.mjs --review --size 8 --go
//
// freeze a durable run -> enqueue BY pilot_run_id -> the worker does the media
// work -> poll -> store the packet -> print the protected review URL.
//
// ⚠️ IDENTITY COMES FROM THE DATABASE, NEVER FROM A FILE. The old flow kept the
// frozen sample in .twinai-pilot/run.json; a second machine found no file,
// DREW ITS OWN EIGHT, and the pre-registration was gone with nothing to notice
// it. Here the local file is written as a MIRROR and never read back for
// identity -- resuming takes --pilot-run-id, or the run the DB says is open.
//
// ⚖️ NO MEDIA PASSES THROUGH THIS PROCESS. Downloads, frame extraction and the
// vision pass belong to the worker. This speaks SQL and prints a URL.

import { createPilotRun, loadPilotRun, enqueueForRun } from './pilot-db.mjs'
import { collectForRun } from './pilot-collect.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The one link the owner needs. Built from the app origin, not from localhost. */
export const reviewUrl = (appUrl, pilotRunId) =>
  `${String(appUrl).replace(/\/+$/, '')}/internal/review/visual/${pilotRunId}`

/** ⚠️ A RUN ALREADY IN FLIGHT IS RESUMED, NOT DUPLICATED. Freezing a second
 *  sample while the first is still collecting spends twice and leaves two
 *  half-pilots nobody can tell apart. */
export async function openRun(db) {
  const { data, error } = await db.from('visual_pilot_runs')
    .select('id, status, frozen_size, sample_digest')
    .in('status', ['frozen', 'enqueued', 'collecting', 'ready_for_label'])
    .order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(`could not look for an open pilot: ${error.message}`)
  return (data ?? [])[0] ?? null
}

/** Terminal-state progress, read from the frozen references themselves. */
export function progressOf(references) {
  const n = references.length
  const done = references.filter((r) => r.terminal_state !== null && r.terminal_state !== undefined)
  return {
    selected: n,
    ready: done.filter((r) => r.terminal_state === 'READY_FOR_LABEL').length,
    failed: done.filter((r) => r.terminal_state === 'FAILED').length,
    unreadable: done.filter((r) => r.terminal_state === 'UNREADABLE').length,
    pending: n - done.length,
    done: done.length === n,
  }
}

export async function runRemotePilot(db, opts = {}) {
  const { appUrl, size = 8, dryRun = true, timeoutMin = 60, pilotRunId = null,
          mirror = null, pollMs = 15_000, log = console.log } = opts
  if (!appUrl) throw new Error('the review URL needs the app origin — pass --app-url or set TWIN_APP_URL')

  // ── 1. IDENTITY ──────────────────────────────────────────────────────────
  let id = pilotRunId
  if (!id) {
    const open = await openRun(db)
    if (open) { id = open.id; log(`\nresuming pilot ${id} (status ${open.status})`) }
  }
  if (!id) {
    if (dryRun) {
      log('\ndry run — pass --go to freeze a sample and spend. Nothing was created.')
      return null
    }
    id = await createPilotRun(db, { size, createdBy: opts.createdBy ?? 'frame-pilot' })
    log(`\nfroze pilot ${id}`)
  }

  const { run, references, urls } = await loadPilotRun(db, id)
  log(`\nPILOT ${id} — digest ${String(run.sample_digest).slice(0, 12)}, status ${run.status}`)
  for (const u of urls) log(`  ${u}`)
  // ⚖️ THE BILL, FROM THE RECORD THAT FROZE IT.
  log(`\n  ${run.frozen_size} references · about ${run.expected_max_downloads} downloads\n`)

  // ⚠️ THE MIRROR IS WRITE-ONLY. It exists so a human can see which run this
  // shell is talking about, and for nothing else.
  if (mirror) mirror({ pilot_run_id: id, sample_digest: run.sample_digest, urls })

  // ── 2. ENQUEUE, BY ID ────────────────────────────────────────────────────
  if (run.status === 'frozen') {
    if (dryRun) { log('dry run — pass --go to enqueue. Nothing was enqueued.'); return { id, run } }
    const { enqueued } = await enqueueForRun(db, id)
    log(`  enqueued ${enqueued} job(s) — the worker does the downloads, not this process`)
  }

  // ── 3. WAIT ──────────────────────────────────────────────────────────────
  const deadline = Date.now() + Number(timeoutMin) * 60_000
  let p = progressOf(references)
  for (;;) {
    const { data: refs } = await db.from('visual_pilot_references')
      .select('*').eq('pilot_run_id', id)
    p = progressOf(refs ?? [])
    log(`  ${p.ready} ready · ${p.failed} failed · ${p.unreadable} unreadable · ${p.pending} pending`)
    if (p.done) break
    if (Date.now() > deadline) {
      // ⚖️ A TIMEOUT IS NOT A RESULT. Stopping with references still running
      // must never be reported as those references failing.
      log(`\n  stopped waiting with ${p.pending} still running. Nothing is lost — re-run with`)
      log(`  --pilot-run-id ${id} and it resumes exactly this sample.`)
      return { id, run, progress: p, timedOut: true }
    }
    await sleep(pollMs)
  }

  // ── 4. STORE THE PACKET ──────────────────────────────────────────────────
  const stored = await collectForRun(db, id)
  log(`\n  packet stored: ${stored.ready} ready reference(s), ${stored.claims} claims`)

  // ── 5. THE ONLY THING LEFT IS THE JUDGEMENT ──────────────────────────────
  const url = reviewUrl(appUrl, id)
  log(`\nReview ready: ${url}`)
  log('  Open it signed in as an admin, label every claim, then Finish & Lock.')
  log('  The rates, the friction and the #69 brief are computed server-side after the lock.')
  return { id, run, progress: p, packet: stored, url }
}
