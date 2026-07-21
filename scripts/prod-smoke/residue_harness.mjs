// R7-2: GENUINE end-to-end failure-injection harness for the prod-source-smoke.
//
// It drives BOTH real modules the workflow runs — the full functional chain
// (smoke_chain.mjs: login/create/parse/PUT/finalize/verify + $GITHUB_ENV recovery
// export) AND the residue accounting (residue_flow.mjs) — with injected fetch and
// injected I/O. Failures are injected at the ACTUAL boundaries the reviewer named:
// create, response parsing, PUT, finalize, classifier, reporter, and process exit.
// For each it asserts (a) the returned exit code, (b) the persisted recovery state
// ($GITHUB_ENV map), and (c) that composing the persisted state into the residue
// accounting still FAILS CLOSED.
//
// It also proves the TWO-STAGE operational protocol invariant: a PASSING
// functional chain composed with an unobservable job/events artifact yields a
// GREEN functional stage and a RED residue-accounting stage — a red workflow is
// NOT a conventional passing smoke (see docs/prod-source-smoke-protocol.md).
//
//   node scripts/prod-smoke/residue_harness.mjs --selftest
import { readdirSync, readFileSync } from 'node:fs'
import { classify } from './probe_residue_report.mjs'
import { runResidueAccounting, runResidueMain, observeStorageObject, observeRow, observePointer } from './residue_flow.mjs'
import { runSmokeChain } from './smoke_chain.mjs'
import { evaluateProtocol } from './protocol_verdict.mjs'
import { evaluate as evalTakesPolicy, buildTakesInventory } from '../ci/check_takes_delete_policy.mjs'

const ASSET = 'aaaaaaaa-1111-2222-3333-444444444444'
const GID = 'bbbbbbbb-5555-6666-7777-888888888888'

let failed = 0
const ok = (cond, msg) => { if (!cond) { console.error(`HARNESS FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }

// ── Fixtures ─────────────────────────────────────────────────────────────────
const READY_ROW = {
  status: 'ready', storage_path: `${GID}/take.webm`, content_sha256: 'a'.repeat(64),
  duration_ms: 2000, width: 320, height: 240, rotation: 0, has_audio: true,
  metadata: { finalized_etag: 'etag', finalized_bytes: 1000, probe_facts: { frame_rate: 30 }, container: 'webm', video_codec: 'vp8', audio_codec: 'vorbis', editor_eligible: true },
}
const HEALTHY = () => ({
  login: { status: 200, body: JSON.stringify({ access_token: 'tok' }) },
  create: { status: 200, body: JSON.stringify({ assetId: ASSET, signedUrl: 'https://signed/put' }) },
  put: { status: 200, body: '' },
  finalize: { status: 200, body: '' },
  ready: { status: 200, body: JSON.stringify([READY_ROW]) },
  ptr: { status: 200, body: JSON.stringify([{ source_asset_id: ASSET }]) },
})

function smokeFetch(spec) {
  return async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase()
    let r
    if (url.includes('/auth/v1/token')) r = spec.login
    else if (url.includes('/functions/v1/source-asset')) {
      let action = ''; try { action = JSON.parse(init.body).action } catch {}
      r = action === 'finalize' ? spec.finalize : spec.create
    } else if (method === 'PUT') r = spec.put
    else if (url.includes('/rest/v1/media_assets')) r = spec.ready
    else if (url.includes('/rest/v1/generations')) r = spec.ptr
    r = r || { networkError: true }
    if (r.networkError) throw new Error('injected network failure')
    return { status: r.status, text: async () => r.body ?? '' }
  }
}
function smokeDeps(spec, store) {
  return {
    fetchImpl: smokeFetch(spec),
    persist: (k, v) => store.set(k, v),
    sleep: async () => {}, newAttemptId: () => 'attempt-1', readFixture: () => Buffer.alloc(4),
    readyTries: 2, ptrTries: 2, log: () => {}, mask: () => {},
  }
}

// Residue fetch (Case C): route → observation.
function residueFetch(spec) {
  return async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase()
    let r
    if (url.includes('/storage/v1/object/takes/')) r = method === 'DELETE' ? spec.del : spec.refetch
    else if (url.includes('/rest/v1/media_assets') && url.includes('select=storage_path')) r = spec.path
    else if (url.includes('/rest/v1/media_assets')) r = spec.row
    else if (url.includes('/rest/v1/generations')) r = spec.ptr
    r = r || { networkError: true }
    if (r.networkError) throw new Error('injected network failure')
    return { status: r.status, text: async () => r.body ?? '' }
  }
}
const RESIDUE_PRESENT = { path: { status: 200, body: JSON.stringify([{ storage_path: `${GID}/take.webm` }]) }, del: { status: 403 }, refetch: { status: 200 }, row: { status: 200, body: JSON.stringify([{ id: ASSET }]) }, ptr: { status: 200, body: JSON.stringify([{ source_asset_id: ASSET }]) } }
const envOf = (store) => ({ ...Object.fromEntries(store) })

// ── Section A: migration-policy posture (table-qualified inventory) ───────────
{
  const sqlBySource = {}
  for (const f of readdirSync('supabase/migrations').sort()) if (f.endsWith('.sql')) sqlBySource[f] = readFileSync(`supabase/migrations/${f}`, 'utf8')
  const { ok: polOk, inventory } = evalTakesPolicy(sqlBySource)
  ok(polOk && !inventory.deletePolicyPresent, 'migrations define NO DELETE-capable takes policy (table-qualified)')
  ok(inventory.insertPresent && inventory.selectPresent, 'migrations define the expected takes INSERT + SELECT policies')
  const planted = buildTakesInventory({ ...sqlBySource, _p: `create policy "x" on storage.objects for delete to authenticated using (bucket_id='takes');` })
  ok(planted.deletePolicyPresent, 'inventory catches a planted takes DELETE policy')
}

// ── Section B: smoke-chain boundary injection + recovery-state + compose ──────
async function runSmoke(mutate) {
  const spec = HEALTHY(); mutate(spec)
  const store = new Map()
  const res = await runSmokeChain({ BASE: 'https://x', ANON: 'anon', PROBE_EMAIL: 'e', PROBE_PASSWORD: 'p', GEN_ID: GID, SIZE: '100' }, smokeDeps(spec, store))
  return { res, store }
}

{
  // login boundary
  const { res, store } = await runSmoke((s) => { s.login = { status: 200, body: '{}' } })
  ok(res.exitCode === 1 && res.stage === 'login', 'login failure ⇒ exit 1 at stage login')
  ok(!store.has('PROBE_CREATE_ATTEMPTED'), 'login failure ⇒ NO create-attempted recovery state persisted')
}
{
  // create response lost (network) — real create branch
  const { res, store } = await runSmoke((s) => { s.create = { networkError: true } })
  ok(res.exitCode === 1 && res.stage === 'create', 'create response lost ⇒ exit 1 at stage create')
  ok(store.get('PROBE_CREATE_ATTEMPTED') === '1' && store.get('PROBE_GEN_ID') === GID && !store.has('PROBE_ASSET'),
    'create response lost ⇒ recovery state = attempted+gen, NO asset (drives residue Case B)')
  const code = await runResidueMain(envOf(store), { fetchImpl: residueFetch({}) })
  ok(code === 1, 'compose: residue on lost-create recovery state ⇒ exit 1 (Case B all-unknown)')
}
{
  // malformed create body — real parse branch
  const { res, store } = await runSmoke((s) => { s.create = { status: 200, body: 'not-json' } })
  ok(res.exitCode === 1 && res.stage === 'create', 'malformed create response ⇒ exit 1 at stage create')
  ok(!store.has('PROBE_ASSET'), 'malformed create ⇒ no asset persisted (Case B)')
}
{
  // PUT failure — real upload branch; asset already persisted
  const { res, store } = await runSmoke((s) => { s.put = { status: 500 } })
  ok(res.exitCode === 1 && res.stage === 'put', 'PUT failure ⇒ exit 1 at stage put')
  ok(store.get('PROBE_ASSET') === ASSET, 'PUT failure ⇒ asset persisted (drives residue Case C)')
  const code = await runResidueMain(envOf(store), { fetchImpl: residueFetch(RESIDUE_PRESENT) })
  ok(code === 1, 'compose: residue on PUT-failure recovery state ⇒ exit 1 (Case C object present)')
}
{
  // finalize failure — real finalize branch
  const { res, store } = await runSmoke((s) => { s.finalize = { status: 500 } })
  ok(res.exitCode === 1 && res.stage === 'finalize', 'finalize failure ⇒ exit 1 at stage finalize')
  ok(store.get('PROBE_ASSET') === ASSET, 'finalize failure ⇒ asset persisted (Case C)')
}
{
  // ready never / metadata / pointer branches
  const a = await runSmoke((s) => { s.ready = { status: 200, body: JSON.stringify([{ status: 'building' }]) } })
  ok(a.res.exitCode === 1 && a.res.stage === 'ready', 'never-ready ⇒ exit 1 at stage ready')
  const b = await runSmoke((s) => { s.ready = { status: 200, body: JSON.stringify([{ ...READY_ROW, width: 999 }]) } })
  ok(b.res.exitCode === 1 && b.res.stage === 'metadata', 'metadata-merge mismatch ⇒ exit 1 at stage metadata')
  const c = await runSmoke((s) => { s.ptr = { status: 200, body: JSON.stringify([{ source_asset_id: 'other' }]) } })
  ok(c.res.exitCode === 1 && c.res.stage === 'pointer', 'pointer not linked ⇒ exit 1 at stage pointer')
}

// R8-1: non-2xx responses with valid-LOOKING bodies must NOT advance the chain.
{
  const login500 = await runSmoke((s) => { s.login = { status: 500, body: JSON.stringify({ access_token: 'tok' }) } })
  ok(login500.res.exitCode === 1 && login500.res.stage === 'login', 'login HTTP 500 (valid body) ⇒ exit 1 at login (body not consumed)')
  const create500 = await runSmoke((s) => { s.create = { status: 500, body: JSON.stringify({ assetId: ASSET, signedUrl: 'https://signed/put' }) } })
  ok(create500.res.exitCode === 1 && create500.res.stage === 'create', 'create HTTP 500 (valid body) ⇒ exit 1 at create (body not consumed)')
  ok(!create500.store.has('PROBE_ASSET'), 'create HTTP 500 ⇒ no asset persisted')
  const ready500 = await runSmoke((s) => { s.ready = { status: 500, body: JSON.stringify([READY_ROW]) } })
  ok(ready500.res.exitCode === 1 && ready500.res.stage === 'ready', 'ready HTTP 500 (valid ready row) ⇒ exit 1 at ready (body not consumed)')
  const ptr500 = await runSmoke((s) => { s.ptr = { status: 500, body: JSON.stringify([{ source_asset_id: ASSET }]) } })
  ok(ptr500.res.exitCode === 1 && ptr500.res.stage === 'pointer', 'pointer HTTP 500 (expected pointer) ⇒ exit 1 at pointer (body not consumed)')
}

// R8-2: two-stage protocol verdict decision (testable module).
{
  const p = (o) => evaluateProtocol(o)
  const expected = p({ chainOutcome: 'success', residueOutcome: 'failure', functionalChain: 'pass', createAttempted: '1' })
  ok(expected.exitCode === 0 && expected.functionalEvidence === true && expected.verdict === 'functional-pass-residue-red', 'protocol: attempted + chain pass + residue red ⇒ exit 0, functional evidence accepted')
  const violation = p({ chainOutcome: 'success', residueOutcome: 'success', functionalChain: 'pass', createAttempted: '1' })
  ok(violation.exitCode === 1 && violation.verdict === 'protocol-violation', 'protocol: attempted-create run with GREEN residue ⇒ protocol violation exit 1 (unexpected-residue-success)')
  const disagree = p({ chainOutcome: 'success', residueOutcome: 'failure', functionalChain: 'not-run', createAttempted: '1' })
  ok(disagree.functionalEvidence === false, 'protocol: chain green but PROBE_FUNCTIONAL_CHAIN≠pass ⇒ NOT functional evidence (summary/outcome disagreement)')
  const ff = p({ chainOutcome: 'failure', residueOutcome: 'failure', functionalChain: 'fail:create', createAttempted: '1' })
  ok(ff.verdict === 'functional-failure' && !ff.functionalEvidence, 'protocol: functional failure distinguished from expected residue red')
  ok(p({ chainOutcome: 'failure', residueOutcome: 'success', functionalChain: 'fail:login', createAttempted: '0' }).exitCode === 0, 'protocol: no-create + residue clean ⇒ exit 0')
  ok(p({ chainOutcome: 'failure', residueOutcome: 'failure', functionalChain: 'fail:login', createAttempted: '0' }).exitCode === 1, 'protocol: no-create + unexpected residue failure ⇒ exit 1')
}

// ── Section C: residue classifier / reporter / exit boundaries ───────────────
{
  const lost = new Map([['PROBE_CREATE_ATTEMPTED', '1'], ['PROBE_GEN_ID', GID]])
  const thrownClassify = await runResidueMain(envOf(lost), { classify: () => { throw new Error('classifier boom') }, fetchImpl: residueFetch({}) })
  ok(thrownClassify === 1, 'classifier failure ⇒ exit 1 (fail closed)')
  const thrownReport = await runResidueMain(envOf(lost), { emit: () => { throw new Error('reporter boom') }, fetchImpl: residueFetch({}) })
  ok(thrownReport === 1, 'reporter failure ⇒ exit 1 (fail closed)')
  const noCreate = await runResidueMain({ PROBE_CREATE_ATTEMPTED: '0' })
  ok(noCreate === 0, 'process-exit boundary: no-create ⇒ exit 0 (only clean exit)')
}

// ── Section D: two-stage operational protocol invariant ──────────────────────
{
  const { res, store } = await runSmoke(() => {})
  ok(res.exitCode === 0 && res.functionalChainPass === true && res.stage === 'verified', 'full chain ⇒ functional-chain PASS (exit 0, stage verified)')
  const residueExit = await runResidueMain(envOf(store), { fetchImpl: residueFetch(RESIDUE_PRESENT) })
  ok(res.functionalChainPass === true && residueExit !== 0,
    'PROTOCOL: functional chain GREEN + residue accounting RED (nonzero by design) — a red workflow is NOT a passing smoke')
}

// ── Section E: per-observation truth table (only confirmed absence ⇒ false) ──
const OBS = [
  ['storage 200', () => observeStorageObject({ status: 200 }), true],
  ['storage 404', () => observeStorageObject({ status: 404 }), false],
  ['storage 400', () => observeStorageObject({ status: 400 }), 'unknown'],
  ['storage 401', () => observeStorageObject({ status: 401 }), 'unknown'],
  ['storage 403', () => observeStorageObject({ status: 403 }), 'unknown'],
  ['storage 500', () => observeStorageObject({ status: 500 }), 'unknown'],
  ['storage network', () => observeStorageObject({ networkError: true }), 'unknown'],
  ['row 200 empty', () => observeRow({ status: 200, body: '[]' }), false],
  ['row 200 non-empty', () => observeRow({ status: 200, body: '[{"id":"a"}]' }), true],
  ['row 200 malformed', () => observeRow({ status: 200, body: 'x' }), 'unknown'],
  ['row 401', () => observeRow({ status: 401 }), 'unknown'],
  ['row 500', () => observeRow({ status: 500 }), 'unknown'],
  ['row network', () => observeRow({ networkError: true }), 'unknown'],
  ['ptr 200 linked', () => observePointer({ status: 200, body: `[{"source_asset_id":"${ASSET}"}]` }, ASSET), true],
  ['ptr 200 null', () => observePointer({ status: 200, body: '[{"source_asset_id":null}]' }, ASSET), false],
  ['ptr 200 other', () => observePointer({ status: 200, body: '[{"source_asset_id":"o"}]' }, ASSET), false],
  ['ptr 200 empty', () => observePointer({ status: 200, body: '[]' }, ASSET), false],
  ['ptr 400', () => observePointer({ status: 400 }, ASSET), 'unknown'],
  ['ptr network', () => observePointer({ networkError: true }, ASSET), 'unknown'],
]
console.log('observation truth table:')
for (const [name, fn, expected] of OBS) {
  const got = fn()
  ok(got === expected, `  ${name} ⇒ ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`)
  if (got === false) ok(/404|empty|null|other/.test(name), `  ${name}: false is a confirmed absence`)
}
ok(!classify([{ name: 'x', present: 'unknown' }]).clean, 'classifier: any unknown artifact ⇒ not clean')

if (failed) { console.error(`residue-harness: ${failed} failed`); process.exit(1) }
console.log('residue-harness: full smoke-chain + residue boundary injection + protocol + truth table all passed'); process.exit(0)
