// R6-1/R6-2: GENUINE workflow-level failure-injection harness.
//
// This does NOT test a hand-copied static table. It imports the REAL residue
// control flow (`runResidueAccounting` from residue_flow.mjs — the exact module
// the workflow runs) and drives it with an injected fake `fetch`, so every
// assertion exercises the actual A/B/C branches, the real observation sequence
// (storage DELETE + re-fetch, media_assets row, generations pointer), and the
// real classifier. The fake fetch records the requests it received so we can
// PROVE the flow actually performed the observation calls.
//
// It asserts two things:
//   1. SAFETY INVARIANT — no branch in which a create was ATTEMPTED ever exits
//      clean; the only clean exit is "no create was attempted" (Case A).
//   2. OBSERVATION TRUTH TABLE — only a documented, unambiguous missing result
//      yields `false`; 400 / 401 / 403 / 5xx / network / malformed ⇒ `unknown`.
//
// It also validates the takes DELETE-policy posture from the migration-derived
// inventory (check_takes_delete_policy.mjs), not from comments or a bounded regex.
//
//   node scripts/prod-smoke/residue_harness.mjs --selftest
import { readdirSync, readFileSync } from 'node:fs'
import { classify } from './probe_residue_report.mjs'
import { runResidueAccounting, observeStorageObject, observeRow, observePointer } from './residue_flow.mjs'
import { evaluate as evalTakesPolicy, buildTakesInventory } from '../ci/check_takes_delete_policy.mjs'

const ASSET = 'aaaaaaaa-1111-2222-3333-444444444444'
const GID = 'bbbbbbbb-5555-6666-7777-888888888888'
const OK_ENV = { PROBE_CREATE_ATTEMPTED: '1', PROBE_GEN_ID: GID, PROBE_ASSET: ASSET, PROBE_BASE: 'https://x', PROBE_ANON: 'anon', PROBE_TOKEN: 'tok' }

// Build a fake fetch from a route spec. Each route value is either
// { status, body } or { networkError:true } (which makes fetch throw).
// `calls` records every (method,url) the flow issued.
function fakeFetch(spec, calls) {
  return async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase()
    calls.push(`${method} ${route(url, method)}`)
    const r = pick(spec, url, method)
    if (r && r.networkError) throw new Error('injected network failure')
    return { status: r.status, text: async () => r.body ?? '' }
  }
}
function route(url, method) {
  if (url.includes('/storage/v1/object/takes/')) return method === 'DELETE' ? 'storage:delete' : 'storage:get'
  if (url.includes('/rest/v1/media_assets') && url.includes('select=storage_path')) return 'rest:path'
  if (url.includes('/rest/v1/media_assets')) return 'rest:row'
  if (url.includes('/rest/v1/generations')) return 'rest:ptr'
  return 'other'
}
function pick(spec, url, method) {
  const r = route(url, method)
  return { 'storage:delete': spec.del, 'storage:get': spec.refetch, 'rest:path': spec.path, 'rest:row': spec.row, 'rest:ptr': spec.ptr, other: spec.other }[r] || { status: 0, body: '', networkError: true }
}

// A "healthy" path resolve so Case C proceeds to the object observation.
const PATH_OK = { status: 200, body: JSON.stringify([{ storage_path: `${GID}/take.webm` }]) }
const ROW_PRESENT = { status: 200, body: JSON.stringify([{ id: ASSET }]) }
const PTR_LINKED = { status: 200, body: JSON.stringify([{ source_asset_id: ASSET }]) }

let failed = 0
const ok = (cond, msg) => { if (!cond) { console.error(`HARNESS FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }

// ── 1. Migration-policy posture from the inventory (not comments) ────────────
{
  const dir = 'supabase/migrations'
  const sqlBySource = {}
  for (const f of readdirSync(dir).sort()) if (f.endsWith('.sql')) sqlBySource[f] = readFileSync(`${dir}/${f}`, 'utf8')
  const { ok: polOk, inventory } = evalTakesPolicy(sqlBySource)
  ok(polOk && !inventory.deletePolicyPresent, 'migrations define NO DELETE-capable takes policy (client cannot delete its object)')
  ok(inventory.insertPresent && inventory.selectPresent, 'migrations define the expected takes INSERT + SELECT policies')
  // Prove the inventory would CATCH a planted DELETE policy.
  const planted = buildTakesInventory({ ...sqlBySource, _planted: `create policy "x" on storage.objects for delete to authenticated using (bucket_id = 'takes');` })
  ok(planted.deletePolicyPresent, 'inventory catches a deliberately planted takes DELETE policy')
}

// ── 2. Failure-injection scenarios over the REAL control flow ────────────────
// Each runs runResidueAccounting() with an injected fetch; every attempted-create
// scenario must fail closed (classify → not clean).
const SCEN = [
  // Case A — nothing created (the ONLY clean exit).
  { name: 'no create attempted (Case A) → clean', env: { PROBE_CREATE_ATTEMPTED: '0' }, spec: {}, cleanExpected: true, attempted: false },
  // Case B — create committed but response lost / malformed (no assetId).
  { name: 'create response lost after commit (Case B) → fail closed', env: { PROBE_CREATE_ATTEMPTED: '1', PROBE_GEN_ID: GID, PROBE_ASSET: '' }, spec: {}, cleanExpected: false, attempted: true },
  { name: 'malformed create response, no assetId (Case B) → fail closed', env: { PROBE_CREATE_ATTEMPTED: '1', PROBE_GEN_ID: GID, PROBE_ASSET: '' }, spec: {}, cleanExpected: false, attempted: true },
  // Case C — PUT/finalize failed but asset row exists; object still present.
  { name: 'PUT failure, object+row present (Case C) → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { status: 200, body: '' }, row: ROW_PRESENT, ptr: { status: 200, body: '[]' } }, cleanExpected: false, attempted: true },
  { name: 'finalize failure, object present, ptr linked (Case C) → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { status: 200, body: '' }, row: ROW_PRESENT, ptr: PTR_LINKED }, cleanExpected: false, attempted: true },
  // Denied DELETE → refetch 200 ⇒ object PRESENT.
  { name: 'DELETE denied, refetch 200 ⇒ object present → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { status: 200, body: '' }, row: ROW_PRESENT, ptr: PTR_LINKED }, cleanExpected: false, attempted: true },
  // Denied DELETE → refetch 400 ⇒ object UNKNOWN (400 is NOT absence).
  { name: 'DELETE denied, refetch 400 ⇒ object UNKNOWN (400≠absent) → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { status: 400, body: '' }, row: { status: 200, body: '[]' }, ptr: { status: 200, body: '[]' } }, cleanExpected: false, attempted: true },
  // Observation HTTP failures on row/ptr ⇒ unknown.
  { name: 'row 401 + ptr 500 ⇒ unknown → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { status: 404, body: '' }, row: { status: 401, body: '' }, ptr: { status: 500, body: '' } }, cleanExpected: false, attempted: true },
  // Network failure on the object re-fetch ⇒ unknown.
  { name: 'refetch network failure ⇒ object UNKNOWN → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { networkError: true }, row: { status: 200, body: '[]' }, ptr: { status: 200, body: '[]' } }, cleanExpected: false, attempted: true },
  // Malformed API bodies ⇒ unknown.
  { name: 'malformed row+ptr JSON ⇒ unknown → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { status: 404, body: '' }, row: { status: 200, body: 'not-json' }, ptr: { status: 200, body: '<html>' }, }, cleanExpected: false, attempted: true },
  // Even a best-case observation (object 404, row empty, ptr empty) stays fail
  // closed because validation_job_events is never client-observable ⇒ unknown.
  { name: 'best-case observation still fails (job/events unobservable) → fail closed', env: OK_ENV, spec: { path: PATH_OK, del: { status: 403, body: '' }, refetch: { status: 404, body: '' }, row: { status: 200, body: '[]' }, ptr: { status: 200, body: '[]' } }, cleanExpected: false, attempted: true },
]

for (const s of SCEN) {
  const calls = []
  const result = await runResidueAccounting(s.env, { fetchImpl: fakeFetch(s.spec, calls) })
  const { clean } = classify(result.artifacts)
  ok(clean === s.cleanExpected, `${s.name} (clean=${clean})`)
  if (s.attempted) {
    ok(!clean, `attempted-create scenario fails closed — ${s.name}`)
    const obj = result.artifacts.find((a) => a.name === 'storage_object')
    // storage_object may be `false` ONLY when the injected re-fetch was a
    // documented 404 (confirmed absence) — never inferred from a denied delete,
    // a 400, a 5xx, or a network error.
    if (obj && obj.present === false) {
      ok(s.spec.refetch && s.spec.refetch.status === 404, `storage_object=false only via a documented 404 (not a guess) — ${s.name}`)
    }
  }
  // Prove the REAL Case C control flow issued the observation sequence.
  if (result.case === 'C') {
    ok(calls.includes('DELETE storage:delete') && calls.includes('GET storage:get') && calls.includes('GET rest:row') && calls.includes('GET rest:ptr'),
      `Case C executed the real observation sequence (delete+refetch+row+ptr) — ${s.name}`)
  }
}

// ── 3. Per-observation truth table (only confirmed absence ⇒ false) ──────────
const OBS = [
  ['storage 200', () => observeStorageObject({ status: 200, body: '' }), true],
  ['storage 404', () => observeStorageObject({ status: 404, body: '' }), false],
  ['storage 400', () => observeStorageObject({ status: 400, body: '' }), 'unknown'],
  ['storage 401', () => observeStorageObject({ status: 401, body: '' }), 'unknown'],
  ['storage 403', () => observeStorageObject({ status: 403, body: '' }), 'unknown'],
  ['storage 500', () => observeStorageObject({ status: 500, body: '' }), 'unknown'],
  ['storage network', () => observeStorageObject({ networkError: true }), 'unknown'],
  ['row 200 non-empty', () => observeRow({ status: 200, body: '[{"id":"a"}]' }), true],
  ['row 200 empty', () => observeRow({ status: 200, body: '[]' }), false],
  ['row 200 malformed', () => observeRow({ status: 200, body: 'nope' }), 'unknown'],
  ['row 200 non-array', () => observeRow({ status: 200, body: '{"error":"x"}' }), 'unknown'],
  ['row 400', () => observeRow({ status: 400, body: '' }), 'unknown'],
  ['row 401', () => observeRow({ status: 401, body: '' }), 'unknown'],
  ['row 403', () => observeRow({ status: 403, body: '' }), 'unknown'],
  ['row 500', () => observeRow({ status: 500, body: '' }), 'unknown'],
  ['row network', () => observeRow({ networkError: true }), 'unknown'],
  ['ptr 200 linked', () => observePointer({ status: 200, body: `[{"source_asset_id":"${ASSET}"}]` }, ASSET), true],
  ['ptr 200 null', () => observePointer({ status: 200, body: '[{"source_asset_id":null}]' }, ASSET), false],
  ['ptr 200 other', () => observePointer({ status: 200, body: '[{"source_asset_id":"other"}]' }, ASSET), false],
  ['ptr 200 empty (gen gone)', () => observePointer({ status: 200, body: '[]' }, ASSET), false],
  ['ptr 200 malformed', () => observePointer({ status: 200, body: 'nope' }, ASSET), 'unknown'],
  ['ptr 400', () => observePointer({ status: 400, body: '' }, ASSET), 'unknown'],
  ['ptr 401', () => observePointer({ status: 401, body: '' }, ASSET), 'unknown'],
  ['ptr 500', () => observePointer({ status: 500, body: '' }, ASSET), 'unknown'],
  ['ptr network', () => observePointer({ networkError: true }, ASSET), 'unknown'],
]
console.log('observation truth table:')
for (const [name, fn, expected] of OBS) {
  const got = fn()
  const good = got === expected
  ok(good, `  ${name} ⇒ ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`)
  // Extra guard: false may ONLY come from a documented-absence input.
  if (got === false) ok(/404|empty|null|other|gone/.test(name), `  ${name}: false is a confirmed absence (not a guess)`)
}

// ── 4. Classifier/report failure stays fail-closed ───────────────────────────
ok(!classify([{ name: 'x', present: 'unknown' }]).clean, 'classifier: any unknown artifact ⇒ not clean (report-path failure stays fail-closed)')

if (failed) { console.error(`residue-harness: ${failed} failed`); process.exit(1) }
console.log('residue-harness: real-flow injection + truth table + migration policy all passed'); process.exit(0)
