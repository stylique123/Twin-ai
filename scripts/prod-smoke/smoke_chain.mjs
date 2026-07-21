// R7-2: the COMPLETE prod-source-smoke functional chain as executable production
// code — the exact module the workflow runs, so the failure-injection harness can
// exercise the REAL create / response-parse / PUT / finalize / verify branches
// AND their recovery-state (GITHUB_ENV) export behavior. Previously these lived
// as inline shell in the workflow and were untested.
//
// Chain: sign in → PERSIST recovery ids (before create) → create source asset →
// parse response → PERSIST asset id → signed PUT upload → finalize → poll ready →
// verify preserved metadata merge → poll generation pointer → verified.
//
// All I/O is injected (fetchImpl, persist, sleep, newAttemptId, readFixture, log,
// mask) so the harness can fail any boundary. runSmokeChain RETURNS
// { exitCode, stage, functionalChainPass } — it never calls process.exit — so the
// exit boundary is assertable. `persist(k,v)` models writing a line to
// $GITHUB_ENV; the harness inspects the persisted map to prove recovery state.
//
//   node scripts/prod-smoke/smoke_chain.mjs   # prod: reads env, writes $GITHUB_ENV
import { fileURLToPath } from 'node:url'

const STAGES = ['login', 'create', 'put', 'finalize', 'ready', 'metadata', 'pointer', 'verified']

async function readJson(res) {
  const text = typeof res.text === 'function' ? await res.text() : ''
  return { status: res.status, text, json: safeJson(text) }
}
function safeJson(t) { try { return JSON.parse(t) } catch { return null } }

export function verifyReadyRow(row) {
  if (!row || typeof row !== 'object') return false
  const md = row.metadata || {}
  return row.status === 'ready'
    && md.finalized_etag != null
    && Number(md.finalized_bytes) > 0
    && md.probe_facts && md.probe_facts.frame_rate != null
    && md.container != null && md.video_codec != null && md.audio_codec != null
    && md.editor_eligible === true
    && typeof row.content_sha256 === 'string' && row.content_sha256.length === 64
    && Number(row.duration_ms) > 1500 && row.has_audio === true
    && row.width === 320 && row.height === 240 && row.rotation === 0
}

export async function runSmokeChain(cfg, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch
  const persist = deps.persist || (() => {})
  const log = deps.log || (() => {})
  const mask = deps.mask || (() => {})
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  const newAttemptId = deps.newAttemptId || (() => { throw new Error('newAttemptId required') })
  const readFixture = deps.readFixture || (() => Buffer.alloc(0))
  const readyTries = deps.readyTries ?? 60
  const ptrTries = deps.ptrTries ?? 20

  const base = cfg.BASE, anon = cfg.ANON
  const H = (token) => ({ apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })
  const done = (exitCode, stage) => ({ exitCode, stage, functionalChainPass: stage === 'verified' })

  // 1. Sign in (credentials from cfg/env, never logged).
  let token = ''
  try {
    const r = await readJson(await fetchImpl(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cfg.PROBE_EMAIL, password: cfg.PROBE_PASSWORD }),
    }))
    token = (r.json && r.json.access_token) || ''
  } catch { token = '' }
  if (!token) { log('probe sign-in failed (no token; body suppressed)'); return done(1, 'login') }
  mask(token)
  persist('PROBE_BASE', base); persist('PROBE_ANON', anon); persist('PROBE_TOKEN', token)

  // 2. PERSIST durable recovery identifiers BEFORE the create request. A create
  //    can commit server-side while the response/parse fails before an assetId
  //    reaches us — the always-run residue step must then still report UNKNOWN
  //    residue keyed by generation + attempt (Case B).
  const attempt = newAttemptId()
  persist('PROBE_GEN_ID', cfg.GEN_ID); persist('PROBE_ATTEMPT', attempt); persist('PROBE_CREATE_ATTEMPTED', '1')

  // 3. Create source asset + 4. parse response.
  let assetId = '', signedUrl = ''
  try {
    const r = await readJson(await fetchImpl(`${base}/functions/v1/source-asset`, {
      method: 'POST', headers: H(token),
      body: JSON.stringify({ action: 'create', generation_id: cfg.GEN_ID, recording_attempt_id: attempt, content_type: 'video/webm', size_bytes: Number(cfg.SIZE) }),
    }))
    assetId = (r.json && r.json.assetId) || ''
    signedUrl = (r.json && r.json.signedUrl) || ''
  } catch { /* response lost / network / parse failure → assetId stays empty */ }
  if (!assetId) {
    log('create returned no assetId (may have committed server-side) — residue step will report UNKNOWN residue keyed by generation/attempt')
    return done(1, 'create')
  }
  mask(signedUrl)
  persist('PROBE_ASSET', assetId)
  log(`asset=${assetId}`)

  // 5. Signed PUT upload.
  let putCode = 0
  try {
    const r = await fetchImpl(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': 'video/webm' }, body: readFixture(cfg.FIXTURE || '/tmp/probe.webm') })
    putCode = r.status
  } catch { putCode = 0 }
  if (!(putCode >= 200 && putCode < 300)) { log(`signed PUT failed: ${putCode}`); return done(1, 'put') }

  // 6. Finalize.
  let finCode = 0
  try {
    const r = await fetchImpl(`${base}/functions/v1/source-asset`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'finalize', asset_id: assetId }) })
    finCode = r.status
  } catch { finCode = 0 }
  if (finCode !== 200) { log(`finalize failed: ${finCode}`); return done(1, 'finalize') }

  // 7. Poll until the production worker validates it (RLS-scoped read).
  const sel = 'status,storage_path,content_sha256,duration_ms,width,height,rotation,has_audio,metadata'
  let row = null
  for (let i = 0; i < readyTries; i++) {
    try {
      const r = await readJson(await fetchImpl(`${base}/rest/v1/media_assets?id=eq.${assetId}&select=${sel}`, { headers: H(token) }))
      row = r.json && r.json[0]
    } catch { row = null }
    if (row && row.status === 'ready') break
    if (row && row.status === 'rejected') { log('REJECTED by worker'); return done(1, 'ready') }
    await sleep(3000)
  }
  if (!row || row.status !== 'ready') { log(`asset never became ready (last: ${row && row.status})`); return done(1, 'ready') }

  // 8. Verify the metadata merge preserved everything.
  if (!verifyReadyRow(row)) { log('METADATA MERGE VERIFICATION FAILED'); return done(1, 'metadata') }

  // 9. Generation pointer must link to the probe asset.
  let ptr = ''
  for (let i = 0; i < ptrTries; i++) {
    try {
      const r = await readJson(await fetchImpl(`${base}/rest/v1/generations?id=eq.${cfg.GEN_ID}&select=source_asset_id`, { headers: H(token) }))
      ptr = (r.json && r.json[0] && r.json[0].source_asset_id) || ''
    } catch { ptr = '' }
    if (ptr === assetId) break
    await sleep(2000)
  }
  if (ptr !== assetId) { log(`GENERATION POINTER NOT LINKED (got ${ptr})`); return done(1, 'pointer') }

  log('FUNCTIONAL-CHAIN: PASS — ready + metadata merge preserved + generation pointer linked')
  return done(0, 'verified')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { appendFileSync, readFileSync } = await import('node:fs')
  const { randomUUID } = await import('node:crypto')
  const persist = (k, v) => { if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${k}=${v}\n`) }
  const mask = (v) => { if (v) console.log(`::add-mask::${v}`) }
  const cfg = {
    BASE: process.env.PROBE_BASE_URL, ANON: process.env.PROBE_ANON_KEY,
    PROBE_EMAIL: process.env.PROBE_EMAIL, PROBE_PASSWORD: process.env.PROBE_PASSWORD,
    GEN_ID: process.env.GEN_ID, SIZE: process.env.SIZE, FIXTURE: process.env.FIXTURE || '/tmp/probe.webm',
  }
  const res = await runSmokeChain(cfg, { persist, mask, newAttemptId: () => randomUUID(), readFixture: (p) => readFileSync(p) })
  // Persist the functional-chain verdict so the two-stage protocol is machine-checkable.
  persist('PROBE_FUNCTIONAL_CHAIN', res.functionalChainPass ? 'pass' : `fail:${res.stage}`)
  console.log(`smoke chain: stage=${res.stage} functionalChainPass=${res.functionalChainPass} exit=${res.exitCode}`)
  process.exit(res.exitCode)
}
