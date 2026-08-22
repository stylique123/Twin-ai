#!/usr/bin/env node
// The defect this suite exists for is a MOVE: run the command on one machine,
// resume on another, and get a different eight references with nobody noticing.
import { runRemotePilot, reviewUrl, progressOf, openRun } from './pilot-remote.mjs'
import { CLAIM_PATHS, manifestDigest } from './pilot-core.mjs'

let failed = 0
const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }
const threw = async (n, fn, needle) => {
  try { await fn(); console.error(`selftest: ${n} — FAILED (did not refuse)`); failed++ }
  catch (e) {
    if (needle && !e.message.includes(needle)) { console.error(`selftest: ${n} — FAILED (${e.message})`); failed++ }
    else console.log(`  ok: ${n}`)
  }
}
const APP = 'https://app.twin.example/'

ok('the review url is built from the app origin, never localhost',
  reviewUrl(APP, 'run-1') === 'https://app.twin.example/internal/review/visual/run-1')
ok('and a trailing slash does not double up', !reviewUrl(APP, 'x').includes('//internal'))

// ── progress reads terminal state, and ABSENT IS NOT FAILED ──────────────────
{
  const p = progressOf([
    { terminal_state: 'READY_FOR_LABEL' }, { terminal_state: 'FAILED' },
    { terminal_state: 'UNREADABLE' }, { terminal_state: null },
  ])
  ok('a reference with no terminal state is pending, not failed',
    p.pending === 1 && p.failed === 1 && p.done === false)
  ok('done only when every selected reference is terminal',
    progressOf([{ terminal_state: 'FAILED' }]).done === true)
}

const answered = () => {
  const set = (o, path, v) => {
    const ks = path.split('.'); let cur = o
    for (const k of ks.slice(0, -1)) cur = (cur[k] ??= {})
    cur[ks.at(-1)] = v
  }
  const o = {}
  for (const p of CLAIM_PATHS) set(o, p, { value: 'v', evidence: { frames: [1] } })
  return o
}

function stub({ cohortSize = 20, openStatus = null } = {}) {
  const profiles = Array.from({ length: cohortSize }, (_, i) => ({
    url: `https://t/${i}`, transcript_chars: i % 2 === 0 ? 0 : 5 + i,
  }))
  const db = { runs: [], refs: [], jobs: [], claims: [], reads: [], seq: 0, polled: false }
  if (openStatus) db.runs.push({ id: 'open-1', status: openStatus, frozen_size: 0, sample_digest: '' })
  db.from = (table) => {
    const q = { _eq: {}, _table: table }
    q.select = () => { db.reads.push(table); return q }
    q.like = () => q; q.order = () => q; q.limit = () => q; q.not = () => q
    q.in = (col, vals) => { q._in = { col, vals }; return q }
    q.eq = (c, v) => { q._eq[c] = v; return q }
    q.maybeSingle = () => ({ data: q._inserted?.[0] ?? db.runs.find((r) => r.id === q._eq.id) ?? null, error: null })
    q.single = () => q.maybeSingle()
    q.insert = (rows) => {
      const list = Array.isArray(rows) ? rows : [rows]
      if (table === 'visual_pilot_runs') {
        const made = list.map((r) => ({ ...r, id: `run-${++db.seq}` }))
        db.runs.push(...made); q._inserted = made
      }
      if (table === 'visual_pilot_references') db.refs.push(...list)
      if (table === 'jobs') db.jobs.push(...list.map((j) => ({ ...j, status: 'queued' })))
      return q
    }
    q.upsert = (rows) => { db.claims.push(...rows); return q }
    q.update = (p) => { q._update = p; return q }
    q.then = (res, rej) => {
      if (q._update) {
        if (table === 'visual_pilot_runs') {
          for (const r of db.runs) {
            if (r.id !== q._eq.id) continue
            if (q._eq.status !== undefined && r.status !== q._eq.status) continue
            Object.assign(r, q._update)
          }
        }
        if (table === 'visual_pilot_references') {
          for (const r of db.refs) if (r.pilot_run_id === q._eq.pilot_run_id && r.url === q._eq.url) Object.assign(r, q._update)
        }
        return Promise.resolve({ data: null, error: null }).then(res, rej)
      }
      if (table === 'reference_content_profiles') {
        // the cohort table, OR the per-url profile read during collect
        if (q._in?.col === 'url') {
          return Promise.resolve({ data: db.refs.map((r) => ({
            url: r.url, visual_profile: answered(), error: 'no_speech: 0 chars',
            frames_sampled: 6, download_route: 'local_impersonated',
          })), error: null }).then(res, rej)
        }
        return Promise.resolve({ data: profiles, error: null }).then(res, rej)
      }
      if (table === 'visual_pilot_runs') {
        const open = db.runs.filter((r) => (q._in?.vals ?? []).includes(r.status))
        return Promise.resolve({ data: open, error: null }).then(res, rej)
      }
      if (table === 'visual_pilot_references') {
        const mine = db.refs.filter((r) => r.pilot_run_id === q._eq.pilot_run_id)
        // Stand in for the worker: the first poll finds work outstanding, the
        // next finds it terminal. Without this the poll loop never ends, which
        // is what a real worker that never ran would also look like.
        if (db.workerRuns !== false) {
          if (db.polled) for (const r of mine) r.terminal_state ??= 'READY_FOR_LABEL'
          db.polled = true
        }
        return Promise.resolve({ data: mine, error: null }).then(res, rej)
      }
      if (table === 'jobs') return Promise.resolve({ data: db.jobs, error: null }).then(res, rej)
      return Promise.resolve({ data: null, error: null }).then(res, rej)
    }
    return q
  }
  return db
}

// ── DRY BY DEFAULT ───────────────────────────────────────────────────────────
{
  const db = stub()
  const r = await runRemotePilot(db, { appUrl: APP, log: () => {} })
  ok('a dry run creates nothing and spends nothing',
    r === null && db.runs.length === 0 && db.jobs.length === 0)
}

// ── the happy path ───────────────────────────────────────────────────────────
const db = stub()
const mirrored = []
const out = await runRemotePilot(db, {
  appUrl: APP, size: 8, dryRun: false, pollMs: 0, log: () => {},
  mirror: (m) => mirrored.push(m),
})
ok('it freezes a run and enqueues exactly the frozen references',
  db.runs.length === 1 && db.refs.length === 8 && db.jobs.length === 8)
ok('every job names the run it belongs to', db.jobs.every((j) => j.payload.pilot_run_id === out.id))
// ⚖️ THE MEDIA WORK IS THE WORKER'S. This process only ever wrote job rows.
ok('this process downloaded nothing — it only enqueued',
  db.jobs.every((j) => j.type === 'assess_reference' && j.payload.force === true))
ok('the packet is stored against the run', out.packet.claims === 8 * CLAIM_PATHS.length)
ok('it prints the protected review url', out.url === reviewUrl(APP, out.id))
ok('the mirror is written once, and carries the id not the identity',
  mirrored.length === 1 && mirrored[0].pilot_run_id === out.id)

// ── THE MOVE: a second machine, no local file ────────────────────────────────
{
  db.reads.length = 0
  const again = await runRemotePilot(db, { appUrl: APP, size: 8, dryRun: false, pollMs: 0, log: () => {} })
  ok('a second invocation resumes the same run rather than freezing a new one',
    again.id === out.id && db.runs.length === 1)
  ok('and it does not re-enqueue', db.jobs.length === 8)
  // ⚠️ NOT "it returned the same rows" -- there must be NO PATH from resuming to
  // the cohort table, because that path is what redraws on a new machine.
  const drewAgain = db.reads.filter((t) => t === 'reference_content_profiles').length
  ok('resuming reads profiles only to build the packet, never to draw a cohort',
    drewAgain <= 1)
}

// ── refusals ─────────────────────────────────────────────────────────────────
await threw('no app origin is a refusal, not a localhost fallback',
  () => runRemotePilot(stub(), { dryRun: false }), 'app origin')
await threw('an empty cohort is a refusal, not an empty run',
  () => runRemotePilot(stub({ cohortSize: 0 }), { appUrl: APP, dryRun: false, log: () => {} }),
  'nothing to pilot')

// ── a timeout is not a result ────────────────────────────────────────────────
{
  const slow = stub()
  const id = await (async () => {
    const r = await runRemotePilot(slow, { appUrl: APP, size: 8, dryRun: false, pollMs: 0, log: () => {} })
    return r.id
  })()
  // wipe the terminal states so nothing is done, then re-run with no time left
  for (const r of slow.refs) r.terminal_state = null
  slow.runs[0].status = 'collecting'
  slow.workerRuns = false   // the worker never ran; the poll must give up, not invent an outcome
  const t = await runRemotePilot(slow, {
    appUrl: APP, dryRun: false, pilotRunId: id, timeoutMin: 0, pollMs: 0, log: () => {},
  })
  ok('a timeout reports still-running, and never as failed',
    t.timedOut === true && t.progress.failed === 0 && t.progress.pending === 8)
}

console.log(failed === 0 ? '\npilot-remote selftest: all passed' : `\npilot-remote selftest: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
