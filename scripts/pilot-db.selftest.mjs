#!/usr/bin/env node
// The control plane, driven end to end against a stub. The defect this exists
// to catch is a MOVE: create on one machine, enqueue on another, and get a
// different eight references with nobody noticing.
import { createPilotRun, loadPilotRun, enqueueForRun, SELECTION_VERSION } from './pilot-db.mjs'
import { manifestDigest, PILOT_PRIORITY } from './pilot-core.mjs'

let failed = 0
const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }
const threw = async (n, fn, needle) => {
  try { await fn(); console.error(`selftest: ${n} — FAILED (did not refuse)`); failed++ }
  catch (e) {
    if (needle && !e.message.includes(needle)) { console.error(`selftest: ${n} — FAILED (${e.message})`); failed++ }
    else console.log(`  ok: ${n}`)
  }
}

const cohort = (n) => Array.from({ length: n }, (_, i) => ({
  url: `https://www.tiktok.com/@c${i}/video/${1000 + i}`,
  transcript_chars: i % 2 === 0 ? 0 : 5 + i,
}))

// A stub with just enough Postgrest to be honest about what was written.
function stub({ profiles = cohort(40), jobs = [] } = {}) {
  const db = { runs: [], refs: [], jobs: [...jobs], inserts: [], reads: [] }
  let seq = 0
  const result = (data) => ({ data, error: null })
  db.from = (table) => {
    const q = { _table: table, _eq: {}, _filters: [] }
    q.select = () => { db.reads.push(table); return q }
    q.like = () => q; q.order = () => q; q.limit = () => q
    q.in = () => q
    q.eq = (col, val) => { q._eq[col] = val; return q }
    q.single = () => q.maybeSingle()
    q.maybeSingle = () => {
      if (table === 'visual_pilot_runs') {
        if (q._inserted) return result(q._inserted[0])
        return result(db.runs.find((r) => r.id === q._eq.id) ?? null)
      }
      return result(null)
    }
    q.insert = (rows) => {
      const list = Array.isArray(rows) ? rows : [rows]
      db.inserts.push({ table, rows: list })
      if (table === 'visual_pilot_runs') {
        const made = list.map((r) => ({ ...r, id: `run-${++seq}` }))
        db.runs.push(...made); q._inserted = made
      }
      if (table === 'visual_pilot_references') db.refs.push(...list)
      if (table === 'jobs') db.jobs.push(...list.map((j) => ({ ...j, status: 'queued' })))
      return q
    }
    // ⚠️ FILTERS ARRIVE AFTER .update(). A stub that applied the patch here
    // would ignore every .eq() chained onto it -- the exact way a previous stub
    // reported 120 claims where 90 was correct.
    q.update = (patch) => { q._update = patch; return q }
    q._applyUpdate = () => {
      if (table !== 'visual_pilot_runs') return
      for (const r of db.runs) {
        if (r.id !== q._eq.id) continue
        // .eq('status','frozen') is a GUARD, not decoration.
        if (q._eq.status !== undefined && r.status !== q._eq.status) continue
        Object.assign(r, q._update)
      }
    }
    q.then = (res, rej) => {
      if (q._update) { q._applyUpdate(); return Promise.resolve(result(null)).then(res, rej) }
      if (table === 'reference_content_profiles') return Promise.resolve(result(profiles)).then(res, rej)
      if (table === 'visual_pilot_references') {
        return Promise.resolve(result(db.refs.filter((r) => r.pilot_run_id === q._eq.pilot_run_id))).then(res, rej)
      }
      if (table === 'jobs') return Promise.resolve(result(db.jobs)).then(res, rej)
      return Promise.resolve(result(null)).then(res, rej)
    }
    return q
  }
  return db
}

// ── freeze ───────────────────────────────────────────────────────────────────
const a = stub()
const id = await createPilotRun(a, { size: 8 })
const runRow = a.runs[0]
ok('a run is created frozen', runRow.status === 'frozen')
ok('it records the selection algorithm', runRow.selection_version === SELECTION_VERSION)
ok('requested and frozen sizes are both kept', runRow.requested_size === 8 && runRow.frozen_size === 8)
// ⚖️ THE BILL IS RECORDED BEFORE IT IS SPENT: force pays twice per reference.
ok('the expected download ceiling is stored', runRow.expected_max_downloads === 16)
ok('the sample digest is over the urls actually frozen',
  runRow.sample_digest === manifestDigest(a.refs.map((r) => r.url)))
ok('every reference carries its stratum',
  a.refs.length === 8 && a.refs.every((r) => r.stratum === 'chars_zero' || r.stratum === 'chars_tiny'))
ok('every reference carries its creator', a.refs.every((r) => typeof r.creator_handle === 'string'))

await threw('an empty cohort is a refusal, not an empty run',
  () => createPilotRun(stub({ profiles: [] })), 'nothing to pilot')

// ── the move ─────────────────────────────────────────────────────────────────
// THE WHOLE POINT. Reading back by id must return the SAME eight even though the
// cohort table has since changed underneath.
a.reads.length = 0
const moved = await loadPilotRun(a, id)
ok('loading by id returns the frozen sample',
  [...moved.urls].sort().join() === a.refs.map((r) => r.url).sort().join())
// ⚠️ NOT MERELY 'IT RETURNED THE SAME ROWS'. There must be no code path from
// loading a run to the cohort table -- that path is what redraws on a new machine.
ok('and never reads the cohort table at all',
  !a.reads.includes('reference_content_profiles'))

await threw('an unknown id is refused, not silently redrawn',
  () => loadPilotRun(a, 'run-nope'), 'does not have that run')

// A sample changed behind the trigger must make the run unusable.
const tampered = stub()
const tid = await createPilotRun(tampered, { size: 8 })
tampered.refs.push({ pilot_run_id: tid, url: 'https://www.tiktok.com/@x/video/9', stratum: 'chars_zero' })
await threw('a sample that no longer matches its digest cannot be labelled',
  () => loadPilotRun(tampered, tid), 'changed after freeze')

// ── enqueue ──────────────────────────────────────────────────────────────────
const res = await enqueueForRun(a, id)
ok('exactly the frozen references are enqueued', res.enqueued === 8 && a.jobs.length === 8)
ok('at the pilot priority', a.jobs.every((j) => j.priority === PILOT_PRIORITY))
ok('with frames and force exactly true',
  a.jobs.every((j) => j.payload.frames === true && j.payload.force === true))
ok('and each job names the run it belongs to',
  a.jobs.every((j) => j.payload.pilot_run_id === id))
ok('the run advances to enqueued', a.runs[0].status === 'enqueued')

// The status guard is a guard: a run that left 'frozen' underneath us is not
// stamped again by a late writer.
const g = stub()
const gid = await createPilotRun(g, { size: 8 })
g.runs[0].status = 'collecting'
await g.from('visual_pilot_runs').update({ status: 'enqueued' }).eq('id', gid).eq('status', 'frozen')
ok('a status update filtered on frozen does not touch a run that moved on',
  g.runs[0].status === 'collecting')

const second = await enqueueForRun(a, id)
ok('a second enqueue spends nothing', second.enqueued === 0 && second.already === true && a.jobs.length === 8)

// A job somebody queued by hand is invisible to the status flag.
const c = stub()
const cid = await createPilotRun(c, { size: 8 })
c.jobs.push({ type: 'assess_reference', status: 'queued', payload: { url: c.refs[0].url } })
await threw('an in-flight job for a sampled url stops the spend',
  () => enqueueForRun(c, cid), 'already queued or running')
ok('and nothing was enqueued when it refused', c.jobs.length === 1)

const locked = stub()
const lid = await createPilotRun(locked, { size: 8 })
locked.runs[0].status = 'locked'
await threw('a locked run cannot be re-enqueued', () => enqueueForRun(locked, lid), 'is locked')

console.log(failed === 0 ? '\npilot-db selftest: all passed' : `\npilot-db selftest: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
