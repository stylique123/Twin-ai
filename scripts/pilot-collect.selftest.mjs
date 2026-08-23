#!/usr/bin/env node
// The stored packet. The invariant under test is the one that mattered most:
// FAILED and UNREADABLE references contribute ZERO claims, and the stored count
// multiplies out against the references reported ready.
import { readFileSync, readdirSync } from 'node:fs'
import { collectForRun, terminalStateOf, collectReadiness, PROFILE_COLUMNS } from './pilot-collect.mjs'
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

// ── the three states, read off a row ─────────────────────────────────────────
ok('a missing row is not a failure', terminalStateOf(null) === null)
ok('a failure code is FAILED', terminalStateOf({ visual_failure_code: 'download_blocked' }) === 'FAILED')
ok('a profile is READY_FOR_LABEL', terminalStateOf({ visual_profile: {} }) === 'READY_FOR_LABEL')
// ⚠️ LOOKED AND SAW NOTHING IS NOT COULD NOT LOOK.
ok('frames but no profile is UNREADABLE', terminalStateOf({ frames_sampled: 6 }) === 'UNREADABLE')
ok('a row that has done nothing yet has no terminal state', terminalStateOf({}) === null)
// A failure code beside a profile is still a failure -- 0162 forbids the row,
// but the reader must not silently prefer the success.
ok('a code beside a profile reads as FAILED',
  terminalStateOf({ visual_profile: {}, visual_failure_code: 'x' }) === 'FAILED')

// ── a full profile, so flattenClaims answers every declared path ─────────────
const answered = (n) => {
  const set = (o, path, v) => {
    const ks = path.split('.'); let cur = o
    for (const k of ks.slice(0, -1)) cur = (cur[k] ??= {})
    cur[ks.at(-1)] = v
  }
  const o = {}
  for (const p of CLAIM_PATHS) set(o, p, { value: `v${n}`, evidence: { frames: [n] } })
  return o
}

const URLS = ['https://t/1', 'https://t/2', 'https://t/3', 'https://t/4']

function stub(profiles) {
  const db = {
    runs: [{ id: 'run-1', status: 'collecting', frozen_size: URLS.length, sample_digest: manifestDigest(URLS) }],
    refs: URLS.map((u) => ({ pilot_run_id: 'run-1', url: u })),
    claims: [], reads: [],
  }
  db.from = (table) => {
    const q = { _eq: {} }
    q.select = () => { db.reads.push(table); return q }
    q.in = () => q; q.order = () => q; q.like = () => q; q.limit = () => q; q.not = () => q
    q.eq = (c, v) => { q._eq[c] = v; return q }
    q.maybeSingle = () => ({ data: db.runs.find((r) => r.id === q._eq.id) ?? null, error: null })
    q.single = () => q.maybeSingle()
    // Filters arrive AFTER update()/upsert(); apply on await, never here.
    q.update = (p) => { q._update = p; return q }
    q.upsert = (rows) => { q._upsert = rows; return q }
    q.then = (res, rej) => {
      if (q._update) {
        if (table === 'visual_pilot_references') {
          for (const r of db.refs) if (r.pilot_run_id === q._eq.pilot_run_id && r.url === q._eq.url) Object.assign(r, q._update)
        }
        if (table === 'visual_pilot_runs') {
          for (const r of db.runs) if (r.id === q._eq.id) Object.assign(r, q._update)
        }
        return Promise.resolve({ data: null, error: null }).then(res, rej)
      }
      if (q._upsert) { db.claims.push(...q._upsert); return Promise.resolve({ data: null, error: null }).then(res, rej) }
      if (table === 'visual_pilot_references') {
        return Promise.resolve({ data: db.refs.filter((r) => r.pilot_run_id === q._eq.pilot_run_id), error: null }).then(res, rej)
      }
      if (table === 'reference_content_profiles') return Promise.resolve({ data: profiles, error: null }).then(res, rej)
      return Promise.resolve({ data: null, error: null }).then(res, rej)
    }
    return q
  }
  return db
}

// two ready, one failed, one unreadable
const mixed = [
  { url: URLS[0], visual_profile: answered(1), error: 'no_speech: 0 chars', frames_sampled: 6, download_route: 'local_impersonated' },
  { url: URLS[1], visual_profile: answered(2), error: 'no_speech: 3 chars', frames_sampled: 6, download_route: 'local_impersonated' },
  { url: URLS[2], visual_failure_code: 'download_blocked', error: 'no_speech: 0 chars' },
  { url: URLS[3], frames_sampled: 6, error: 'no_speech: 0 chars', download_route: 'local_impersonated' },
]
const a = stub(mixed)
const res = await collectForRun(a, 'run-1')
ok('every frozen reference gets a terminal state', res.references === 4)
ok('only the two with profiles are ready', res.ready === 2)
// ⚠️ THE COUNT MUST MULTIPLY OUT. Six ready references once produced 120 claims
// where 90 was correct, and the contradiction was printed unasserted.
ok('the packet holds ready × declared claim paths',
  res.claims === 2 * CLAIM_PATHS.length && a.claims.length === 2 * CLAIM_PATHS.length)
ok('and no claim belongs to a FAILED or UNREADABLE reference',
  a.claims.every((c) => c.url === URLS[0] || c.url === URLS[1]))
ok('the failed reference records its code',
  a.refs[2].terminal_state === 'FAILED' && a.refs[2].failure_code === 'download_blocked')
// ⚠️ THIS FIXTURE USED TO INVENT visual_failure_stage AND THEN ASSERT IT BACK.
// The column has never existed in any migration and nothing writes it, so the
// test was proving a property of its own stub while the real query -- which
// named that column -- was refused outright by PostgREST. A fixture that
// manufactures the column under test cannot fail when the column is missing.
ok('no failure stage is invented for a reference nobody staged',
  a.refs[2].failure_stage === undefined)
// The CONTROL: the columns that DO exist still arrive, so the fix removed the
// imaginary field and nothing else.
ok('CONTROL the real failure column still lands', a.refs[2].failure_code === 'download_blocked')
ok('CONTROL the real frames column still lands', a.refs[3].frames_sampled === 6)
ok('the unreadable one records frames but no code',
  a.refs[3].terminal_state === 'UNREADABLE' && a.refs[3].failure_code === null && a.refs[3].frames_sampled === 6)
ok('answered is stored as its own column', a.claims.every((c) => c.answered === true))
ok('cited frames travel with the claim', a.claims.every((c) => Array.isArray(c.cited_frames)))
ok('the run advances to ready_for_label', a.runs[0].status === 'ready_for_label')

// ── a reference that came back speaking ──────────────────────────────────────
const spoke = stub([
  { url: URLS[0], visual_profile: answered(1), error: null, frames_sampled: 6 },
  { url: URLS[1], visual_profile: answered(2), error: 'no_speech: 0 chars', frames_sampled: 6 },
  { url: URLS[2], visual_failure_code: 'x', error: 'no_speech: 0 chars' },
  { url: URLS[3], frames_sampled: 6, error: 'no_speech: 0 chars' },
])
await collectForRun(spoke, 'run-1')
// ⚖️ REPORTED, NOT DROPPED. Its frames were scheduled on content beats, so it is
// not evidence about the silent population -- but removing it would shrink the
// sample after the fact.
ok('a reference that came back speaking is flagged, not dropped',
  spoke.refs[0].turned_out_to_have_speech === true && spoke.refs[0].terminal_state === 'READY_FOR_LABEL')
ok('and one still drawn silent is not flagged', spoke.refs[1].turned_out_to_have_speech === false)

// ── refusals ─────────────────────────────────────────────────────────────────
await threw('a reference with no terminal state stops the packet',
  () => collectForRun(stub(mixed.slice(0, 3)), 'run-1'), 'no terminal state yet')
await threw('a run where nothing produced claims is a refusal',
  () => collectForRun(stub(URLS.map((u) => ({ url: u, visual_failure_code: 'x' }))), 'run-1'),
  'nothing to label')

const locked = stub(mixed); locked.runs[0].status = 'locked'
await threw('a locked run refuses a fresh packet', () => collectForRun(locked, 'run-1'), 'is locked')


// ── the gate in front of READY_FOR_LABEL ──────────────────────────────────
//
// ⚠️ THIS IS THE DEFECT THAT REACHED A REAL OWNER. `status` read progress from
// reference_content_profiles, said 8/8 ready and handed over the review URL,
// while nothing on the button path had ever built the packet the review page
// reads. Eight references' worth of paid-for evidence rendered as
// "Claim 1 of 0".
ok('a finished run with ready references may be collected',
  collectReadiness({ done: true, ready: 8 }, { status: 'enqueued' }).collect === true)
// ⚠️ MID-FLIGHT IS REFUSED. Collecting before every reference is terminal would
// record an unfinished reference as though it produced nothing.
ok('a run still collecting is refused',
  collectReadiness({ done: false, ready: 3 }, { status: 'enqueued' }).collect === false)
ok('and says which state it is in',
  collectReadiness({ done: false, ready: 3 }, { status: 'enqueued' }).reason === 'still collecting')
// ⚠️ ZERO READY IS NOT A PACKET. Building one anyway is how a run locks an
// empty denominator as though it were a measurement.
ok('a finished run with nothing ready is refused',
  collectReadiness({ done: true, ready: 0 }, { status: 'enqueued' }).collect === false)
ok('a finished run with a non-integer ready count is refused, not coerced',
  collectReadiness({ done: true, ready: null }, { status: 'enqueued' }).collect === false)
// ⚠️ A LOCKED PACKET IS FINAL. Re-collecting over it would rewrite the exact
// artefact the labels were given against.
ok('a locked run is never re-collected',
  collectReadiness({ done: true, ready: 8 }, { status: 'locked' }).collect === false)
ok('a missing run is refused rather than assumed', collectReadiness({ done: true, ready: 8 }, null).collect === false)
// CONTROL: the gate must not simply refuse everything.
ok('CONTROL: the only accepting case really does accept',
  collectReadiness({ done: true, ready: 1 }, { status: 'collecting' }).collect === true)

// ── every column asked for must actually exist ────────────────────────────
//
// ⚠️ THE GUARD THAT WOULD HAVE CAUGHT IT. PostgREST refuses the ENTIRE read if
// one name in the projection is unknown, so an imaginary column does not
// degrade the packet -- it destroys it. visual_failure_stage was named here,
// was created by no migration, and was written by nothing, and the only reason
// the suite stayed green is that the fixture invented the column it asserted.
const MIGRATIONS = readdirSync(new URL('../supabase/migrations', import.meta.url))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'))
  .join('\n')
const declared = (col) => new RegExp(`\\b${col}\\b`).test(MIGRATIONS)

for (const col of PROFILE_COLUMNS) {
  ok(`${col} is declared by a migration`, declared(col))
}
// ⚠️ AND THE CHECK IS PROVEN ABLE TO FAIL. A guard whose zero has never been
// falsified is not evidence; this asserts the detector rejects a column that
// is not there -- including the exact one that broke production.
ok('CONTROL the check rejects an invented column', declared('visual_failure_stage') === false)
ok('CONTROL the check rejects a nonsense column', declared('column_that_never_existed_xyz') === false)
ok('CONTROL the check accepts a column that does exist', declared('visual_profile') === true)

console.log(failed === 0 ? '\npilot-collect selftest: all passed' : `\npilot-collect selftest: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
