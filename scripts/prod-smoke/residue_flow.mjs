// R6-1/R6-2: the REAL prod-source-smoke residue accounting control-flow, as an
// importable, dependency-injected module. The workflow runs this module directly
// (`node scripts/prod-smoke/residue_flow.mjs`) and the failure-injection harness
// (residue_harness.mjs) drives the SAME functions with a fake fetch — so the
// harness exercises the actual control flow, not a hand-copied static table.
//
// The flow mirrors the three workflow cases exactly:
//   A. no create was ever attempted            → nothing created → clean
//   B. create attempted, no assetId reached us  → every artifact UNKNOWN, fail closed
//   C. assetId known                            → OBSERVE each artifact honestly
//
// HONESTY RULE (R6-2): an artifact is `false` (confirmed absent) ONLY on a
// documented, unambiguous "missing" result. Everything else that is not a
// confirmed presence is `"unknown"` — never `false`:
//   * storage GET  → 404 (documented "Object not found") ⇒ false; 200 ⇒ true;
//                    400 / 401 / 403 / 5xx / network / anything else ⇒ unknown.
//   * PostgREST rows → HTTP 200 with a VALID array body ⇒ true if non-empty,
//                      false if the array is empty; any non-200 / malformed JSON
//                      / non-array / network failure ⇒ unknown.
//   * pointer → HTTP 200 valid row: source_asset_id === assetId ⇒ true; a valid
//               row whose pointer is null/other, or an empty result (generation
//               gone) ⇒ false; anything not a confirmed 200-observation ⇒ unknown.
//   * validation_job_events → no supported client read path ⇒ always "unknown".
//
// A 400 is NOT proof of absence (it usually means a malformed key or bad
// request), so it maps to "unknown" and keeps the run fail-closed.
import { classify } from './probe_residue_report.mjs'
import { fileURLToPath } from 'node:url'

// ── Pure observation mappers (one HTTP observation → tri-state) ──────────────
// An "observation" is { status:Number, body:String, networkError:Boolean }.

export function observeStorageObject(obs) {
  if (!obs || obs.networkError) return 'unknown'
  if (obs.status === 404) return false // documented Supabase Storage "Object not found"
  if (obs.status === 200) return true
  return 'unknown' // 400 (bad key) / 401 / 403 / 5xx / anything else ⇒ not proof of absence
}

function parseArray(obs) {
  if (!obs || obs.networkError || obs.status !== 200) return null
  let v
  try { v = JSON.parse(obs.body) } catch { return null }
  return Array.isArray(v) ? v : null
}

export function observeRow(obs) {
  const arr = parseArray(obs)
  if (arr === null) return 'unknown' // non-200 / malformed / non-array / network ⇒ unknown
  return arr.length > 0 ? true : false // 200 + valid empty array ⇒ confirmed absent
}

export function observePointer(obs, assetId) {
  const arr = parseArray(obs)
  if (arr === null) return 'unknown'
  if (arr.length === 0) return false // generation row gone ⇒ no pointer to our asset
  const ptr = arr[0] && arr[0].source_asset_id
  if (ptr === assetId) return true // still points at our probe asset
  return false // null / different id ⇒ our pointer is confirmed absent (valid 200 observed)
}

// ── HTTP wrapper: never throws; returns a uniform observation ────────────────
async function observe(fetchImpl, url, init) {
  try {
    const res = await fetchImpl(url, init)
    const body = typeof res.text === 'function' ? await res.text() : ''
    return { status: res.status, body, networkError: false }
  } catch {
    return { status: 0, body: '', networkError: true }
  }
}

// ── The real control flow (A/B/C) — pure except for the injected fetch ───────
export async function runResidueAccounting(env, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch
  const createAttempted = env.PROBE_CREATE_ATTEMPTED === '1'
  const gid = env.PROBE_GEN_ID || 'unknown'
  const att = env.PROBE_ATTEMPT || 'unknown'
  const asset = env.PROBE_ASSET || ''

  // Case A — nothing was ever created.
  if (!createAttempted) {
    return { case: 'A', attemptedCreate: false, artifacts: [] }
  }

  // Case B — create attempted but no assetId reached us (response lost /
  // malformed). It may have committed server-side ⇒ everything UNKNOWN.
  if (!asset) {
    return {
      case: 'B', attemptedCreate: true,
      artifacts: [
        { name: 'storage_object', id: `gen=${gid} attempt=${att}`, present: 'unknown' },
        { name: 'media_assets_row', id: `gen=${gid} attempt=${att}`, present: 'unknown' },
        { name: 'generation_pointer', id: `gen=${gid}`, present: 'unknown' },
        { name: 'validation_job_events', id: `gen=${gid}`, present: 'unknown' },
      ],
    }
  }

  // Case C — assetId known. Observe each artifact; never assume deletion.
  const base = env.PROBE_BASE, anon = env.PROBE_ANON, token = env.PROBE_TOKEN
  const H = { apikey: anon, Authorization: `Bearer ${token}` }

  // 1. Resolve the object path (RLS-scoped read). Unreadable ⇒ cannot confirm.
  let objPath = ''
  const pathObs = await observe(fetchImpl, `${base}/rest/v1/media_assets?id=eq.${asset}&select=storage_path`, { headers: H })
  const pathArr = parseArray(pathObs)
  if (pathArr && pathArr.length > 0 && pathArr[0].storage_path) objPath = pathArr[0].storage_path

  // 2. storage_object: best-effort DELETE (RLS-denied — no takes DELETE policy),
  //    then OBSERVE the object via a re-fetch. 404 ⇒ absent, 200 ⇒ present,
  //    everything else ⇒ unknown.
  let objState = 'unknown'
  if (objPath) {
    const enc = encodeURIComponent(objPath)
    await observe(fetchImpl, `${base}/storage/v1/object/takes/${enc}`, { method: 'DELETE', headers: H })
    const refetch = await observe(fetchImpl, `${base}/storage/v1/object/takes/${enc}`, { headers: H })
    objState = observeStorageObject(refetch)
  }

  // 3. media_assets row — HTTP status captured SEPARATELY (R6-2).
  const rowObs = await observe(fetchImpl, `${base}/rest/v1/media_assets?id=eq.${asset}&select=id`, { headers: H })
  const rowState = observeRow(rowObs)

  // 4. generation pointer — HTTP status captured SEPARATELY (R6-2).
  const ptrObs = await observe(fetchImpl, `${base}/rest/v1/generations?id=eq.${gid}&select=source_asset_id`, { headers: H })
  const ptrState = observePointer(ptrObs, asset)

  return {
    case: 'C', attemptedCreate: true,
    observations: { path: pathObs, row: rowObs, ptr: ptrObs },
    artifacts: [
      { name: 'storage_object', id: objPath || 'n/a', present: objState },
      { name: 'media_assets_row', id: asset, present: rowState },
      { name: 'generation_pointer', id: gid, present: ptrState },
      { name: 'validation_job_events', id: 'service-side validate_source job + events for this generation', present: 'unknown' },
    ],
  }
}

// Testable entry point: runs the flow, classifies, reports, and RETURNS the
// process exit code (0/1) instead of calling process.exit — so the harness can
// inject failures at the classifier / reporter / exit boundaries and assert the
// code. Any throw anywhere (accounting, classifier, or reporter) is caught and
// mapped to exit 1 (fail closed).
export async function runResidueMain(env, deps = {}) {
  const classifyFn = deps.classify || classify
  const emit = deps.emit || ((s) => console.log(s))
  const fail = deps.fail || ((s) => console.error(s))
  try {
    const result = await runResidueAccounting(env, deps)
    if (result.case === 'A') { emit('no create was attempted — nothing was created; nothing to clean'); return 0 }
    const { clean, report } = classifyFn(result.artifacts)
    emit(`residue case=${result.case}`)
    emit(report)
    if (!clean) {
      fail('::error::probe cleanup left PRESENT/UNKNOWN residue — sanctioned operator retention required (see report above)')
      return 1
    }
    return 0
  } catch (e) {
    fail(`::error::residue accounting failed — treating as residue and failing closed: ${e && e.message}`)
    return 1
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  process.exit(await runResidueMain(process.env))
}
