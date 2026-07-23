// Editor v2 — Phase 7 staging integration matrix (SEPARATE from phase6.mjs).
//
// GATE 0 (kept): the max 30-minute Director envelope fits ONE inference — real
// countTokens when GEMINI_API_KEY is present, else the offline self-test.
//
// IMPLEMENTATION MATRIX (the REAL directing stage, gated by EDITOR_DIRECTOR_ENABLED):
//   A. Happy path: full pipeline with directing REAL -> one succeeded director
//      call, one immutable decision, edit_plans still 0, output NULL.
//   C. Crash-before-directing resume: exactly one call/decision after recovery.
//   D. Fenced RPC truth table: indeterminate (no second call), DB filler guard,
//      wrong attempt (lease_lost), wrong stage.
//   E. Fail-closed credentials: enabled + no GEMINI_API_KEY => project failed,
//      no decision leaks.
//   F. Zero-delta boundary: flag unset => directing stays SIMULATED, no call,
//      no decision (production behaviour unchanged).
// Production stays disabled; compiling/rendering/validating remain simulated;
// edit_plans stays 0; output_asset_id stays NULL.
import { createClient } from '@supabase/supabase-js'
import { execFile as _execFile, spawn, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const execFile = promisify(_execFile)
const REPO_ROOT = join(import.meta.dirname, '..', '..')
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- Gate 0 (unchanged) -----------------------------------------------------
function gate0() {
  console.log('== Phase 7 · GATE 0: max 30-minute Director envelope fits one inference ==')
  const args = ['scripts/director-eval/count_tokens.mjs']
  if (!process.env.GEMINI_API_KEY) args.push('--selftest')
  const r = spawnSync('node', args, { stdio: 'inherit' })
  if (r.status !== 0) { console.error('::error::Phase 7 Gate 0 envelope/token assertion FAILED'); process.exit(1) }
  console.log('Phase 7 Gate 0: PASS')
}

// ---- staging env + harness (same shapes as phase6) --------------------------
function need(k) { const v = process.env[k]; if (!v) { console.error(`missing env ${k}`); process.exit(1) } return v }
const URL = need('STAGING_URL')
const ANON = need('STAGING_ANON_KEY')
const SERVICE = need('STAGING_SERVICE_ROLE_KEY')
const PW = `It-${randomUUID()}`
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

let passed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${name}  ${detail}`) }
}

async function makeUser(label) {
  const email = `${label}-${randomUUID().slice(0, 8)}@staging.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser: ${error.message}`)
  return { id: data.user.id, email }
}
async function login(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PW })
  if (error) throw new Error(`login: ${error.message}`)
  return c
}
async function newGen(ownerId, sceneTimeline = null, selectedHook = null) {
  const id = randomUUID()
  const { error } = await admin.from('generations').insert({
    id, user_id: ownerId, blueprint: {},
    ...(sceneTimeline ? { scene_timeline: sceneTimeline } : {}),
    ...(selectedHook ? { selected_hook: selectedHook } : {}),
  })
  if (error) throw new Error(`newGen: ${error.message}`)
  return id
}
async function callEdge(client, fn, body) {
  const headers = { 'Content-Type': 'application/json', apikey: ANON }
  if (client) { const { data: { session } } = await client.auth.getSession(); headers.Authorization = `Bearer ${session.access_token}` }
  const res = await fetch(`${URL}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
async function putSigned(signedUrl, buf, ct) {
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': ct }, body: buf })
  return { status: res.status, body: res.ok ? '' : (await res.text().catch(() => '')).slice(0, 200) }
}
async function sourceFlow(client, genId, buf, ct = 'video/webm') {
  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const c = await callEdge(client, 'source-asset', { action: 'create', generation_id: genId, recording_attempt_id: randomUUID(), content_type: ct, size_bytes: buf.byteLength })
      if (c.status !== 200) throw new Error(`source create ${c.status}: ${JSON.stringify(c.body)}`)
      const p = await putSigned(c.body.signedUrl, buf, ct)
      if (p.status >= 300) throw new Error(`signed PUT ${p.status}: ${p.body}`)
      const f = await callEdge(client, 'source-asset', { action: 'finalize', asset_id: c.body.assetId })
      if (f.status !== 200) throw new Error(`finalize ${f.status}: ${JSON.stringify(f.body)}`)
      return { assetId: c.body.assetId }
    } catch (e) { lastErr = e; console.log(`   (upload retry: ${e.message})`); await sleep(2000) }
  }
  throw lastErr
}
async function waitAsset(assetId, timeoutMs = 120_000) {
  const start = Date.now()
  for (;;) {
    const { data: a } = await admin.from('media_assets').select('*').eq('id', assetId).maybeSingle()
    if (a && (a.status === 'ready' || a.status === 'rejected')) return a
    if (Date.now() - start > timeoutMs) throw new Error(`asset ${assetId} stuck (${a?.status})`)
    await sleep(1200)
  }
}
async function startProject(client, genId, assetId) {
  for (let attempt = 0; ; attempt++) {
    const r = await callEdge(client, 'start-editor-v2', { generation_id: genId, source_asset_id: assetId, idempotency_key: randomUUID() })
    if (r.status === 429 && attempt < 3) { console.log('   (start rate window — waiting 61s…)'); await sleep(61_000); continue }
    if (r.status !== 200) throw new Error(`start ${r.status}: ${JSON.stringify(r.body)}`)
    return r.body.projectId
  }
}
const getProject = async (id) => (await admin.from('edit_projects').select('*').eq('id', id).maybeSingle()).data
const getEvents = async (pid) => (await admin.from('edit_events').select('*').eq('project_id', pid).order('seq')).data ?? []
const directorCalls = async (pid) => (await admin.from('edit_director_calls').select('*').eq('edit_project_id', pid)).data ?? []
const directorDecisions = async (pid) => (await admin.from('edit_director_decisions').select('*').eq('edit_project_id', pid)).data ?? []
const editPlanCount = async (pid) => (await admin.from('edit_plans').select('id', { count: 'exact', head: true }).eq('edit_project_id', pid)).count ?? 0
async function waitSettled(id, timeoutMs = 240_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && ['completed', 'failed', 'cancelled'].includes(p.status)) return p
    if (Date.now() - start > timeoutMs) throw new Error(`waitSettled ${label || id}: ${p?.status}`)
    await sleep(500)
  }
}

// ---- workers ----------------------------------------------------------------
const workers = new Set()
function startWorker(name, extraEnv = {}) {
  const w = spawn('node', ['dist/index.js'], {
    cwd: 'worker',
    env: {
      ...process.env, SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE, HOSTNAME: name,
      WORKER_JOB_TYPES: 'editor_v2', WORKER_POLL_MS: '400', WORKER_VISIBILITY_SECS: '90',
      WORKER_RETRY_BACKOFF_BASE_SECS: '1', EDITOR_SIM_STAGE_MS: '120', EDITOR_LEASE_RENEW_MS: '2000',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  w.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`))
  w.stderr.on('data', (d) => process.stderr.write(`[${name}!] ${d}`))
  workers.add(w)
  return w
}
function stopWorker(w, sig = 'SIGTERM') { if (w) { try { w.kill(sig) } catch { } workers.delete(w) } }
function stopAll() { for (const w of [...workers]) stopWorker(w, 'SIGKILL') }
async function runToSettled(name, projectId, extraEnv = {}, timeoutMs = 240_000) {
  const w = startWorker(name, extraEnv)
  try { return await waitSettled(projectId, timeoutMs, name) } finally { stopWorker(w) }
}

// ---- fixture (real speech so the pipeline reaches directing) -----------------
const HOOK_LINE = 'Stop scrolling this changes everything'
async function makeFixture(dir, variant) {
  const es = (out, text) => execFile('espeak-ng', ['-v', 'en-us', '-s', '140', '-a', '120', '-w', out, text], { timeout: 60_000 })
  const ff = (args) => execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 180_000 })
  const v = (n) => join(dir, `${variant}-${n}`)
  await es(v('hook.wav'), `${HOOK_LINE}.`)
  await es(v('body.wav'), `I recorded this take for the ${variant} scenario today.`)
  await ff(['-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '2.0', '-sample_fmt', 's16', v('gap.wav')])
  for (const f of ['hook', 'body']) await ff(['-i', v(`${f}.wav`), '-ac', '1', '-ar', '22050', '-sample_fmt', 's16', v(`${f}n.wav`)])
  await ff(['-i', v('hookn.wav'), '-i', v('gap.wav'), '-i', v('bodyn.wav'), '-i', v('gap.wav'),
    '-filter_complex', '[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1,apad[a]', '-map', '[a]', '-t', '15', v('speech.wav')])
  await ff(['-f', 'lavfi', '-i', 'color=c=black:size=720x1280:rate=30:duration=5', v('b1.mp4')])
  await ff(['-f', 'lavfi', '-i', 'color=c=white:size=720x1280:rate=30:duration=5', v('b2.mp4')])
  await ff(['-f', 'lavfi', '-i', 'color=c=gray:size=720x1280:rate=30:duration=5',
    '-i', join(REPO_ROOT, 'scripts', 'staging-integration', 'fixtures', 'face_astronaut.jpg'),
    '-filter_complex', '[1:v]scale=500:500[f];[0:v][f]overlay=110:300', v('b3.mp4')])
  await ff(['-i', v('b1.mp4'), '-i', v('b2.mp4'), '-i', v('b3.mp4'), '-i', v('speech.wav'),
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v]', '-map', '[v]', '-map', '3:a',
    '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libvorbis', '-shortest', v('fix.webm')])
  return await readFile(v('fix.webm'))
}
const SCENE_TIMELINE = {
  version: 1, generation_id: 'x', platform: 'tiktok', hook: HOOK_LINE, wpm: 'natural',
  scenes: [{ scene_number: 1, scene_type: 'talking_head', purpose: 'hook', dialogue: HOOK_LINE, duration_sec: 3, camera_framing: '', background: '', movement: '', caption_text: '', pause_after: false, show_in_teleprompter: true }],
  total_duration_sec: 3,
}
async function mintReady(client, ownerId, buf) {
  const gen = await newGen(ownerId, SCENE_TIMELINE, HOOK_LINE)
  const { assetId } = await sourceFlow(client, gen, buf)
  const asset = await waitAsset(assetId)
  if (asset.status !== 'ready') throw new Error(`fixture asset rejected: ${JSON.stringify(asset.metadata)}`)
  return { gen, assetId, asset }
}

// Fabricated fenced lease + scratch project for direct-RPC truth-table tests.
async function fabricateLease(ownerId, projectId, worker = 'p7-hx') {
  const id = randomUUID()
  const { error } = await admin.from('jobs').insert({
    id, owner_id: ownerId, type: 'editor_v2', status: 'running', attempts: 1,
    locked_at: new Date().toISOString(), locked_by: worker,
    payload: { project_id: projectId }, dedup_key: `editor_v2:${projectId}:hx`,
  })
  if (error) throw new Error(`fabricateLease: ${error.message}`)
  return { jobId: id, worker, attempt: 1 }
}
async function scratchProject(ownerId, genId, assetId) {
  const id = randomUUID()
  const { error } = await admin.from('edit_projects').insert({ id, owner_id: ownerId, generation_id: genId, source_asset_id: assetId, status: 'queued', idempotency_key: randomUUID() })
  if (error) throw new Error(`scratchProject: ${error.message}`)
  return id
}
async function advanceTo(pid, lease, stages) {
  for (const to of stages) {
    const { error } = await admin.rpc('editor_advance_stage', {
      p_project: pid, p_job: lease.jobId, p_worker: lease.worker, p_attempt: lease.attempt,
      p_to: to, p_pct: null, p_message_code: 'stage_started', p_details: {},
    })
    if (error) throw new Error(`advanceTo ${to}: ${error.message}`)
  }
}
const dirBegin = (pid, lease, assetId, attemptOverride) => admin.rpc('editor_director_begin', {
  p_project: pid, p_job: lease.jobId, p_worker: lease.worker, p_attempt: attemptOverride ?? lease.attempt,
  p_source_asset: assetId, p_envelope_sha256: sha256('env-' + pid), p_model: 'gemini-3.5-flash', p_provider: 'google',
})

async function main() {
  console.log('\n== Phase 7 · staging matrix (real directing) ==')
  const dir = await mkdtemp(join(tmpdir(), 'phase7-'))
  const uA = await makeUser('p7a')
  const cA = await login(uA.email)

  // Drain strays from prior matrices on the shared staging DB.
  await admin.from('jobs').update({ status: 'done', result: { drained_by: 'phase7-setup' }, locked_at: null, locked_by: null })
    .eq('type', 'editor_v2').in('status', ['queued', 'running'])
  await admin.from('edit_projects').update({ status: 'cancelled' }).not('status', 'in', '("completed","failed","cancelled")')

  const validator = startWorker('p7-validator', { WORKER_JOB_TYPES: 'validate_source' })
  const A = await mintReady(cA, uA.id, await makeFixture(dir, 'happy'))
  const CR = await mintReady(cA, uA.id, await makeFixture(dir, 'crash'))
  const E = await mintReady(cA, uA.id, await makeFixture(dir, 'nocreds'))
  const F = await mintReady(cA, uA.id, await makeFixture(dir, 'zerodelta'))
  const D1 = await mintReady(cA, uA.id, await makeFixture(dir, 'rpc1'))
  const D2 = await mintReady(cA, uA.id, await makeFixture(dir, 'rpc2'))
  const D3 = await mintReady(cA, uA.id, await makeFixture(dir, 'rpc3'))
  const D4 = await mintReady(cA, uA.id, await makeFixture(dir, 'rpc4'))
  stopWorker(validator)

  // ---- A. happy path -----------------------------------------------------
  console.log('\n== A. happy path: real directing ==')
  {
    const pid = await startProject(cA, A.gen, A.assetId)
    const proj = await runToSettled('p7-happy', pid, { EDITOR_DIRECTOR_ENABLED: 'true' })
    check('A1 project completed', proj.status === 'completed', proj.status)
    check('A2 director_version pinned on the project', !!proj.director_version, String(proj.director_version))
    check('A3 output_asset_id stays NULL (no rendering)', proj.output_asset_id === null)
    const calls = await directorCalls(pid)
    check('A4 exactly ONE director call, state=succeeded', calls.length === 1 && calls[0].state === 'succeeded', JSON.stringify(calls.map((c) => c.state)))
    const decs = await directorDecisions(pid)
    check('A5 exactly ONE immutable decision, auto_filler_removal=false', decs.length === 1 && decs[0].auto_filler_removal === false)
    check('A6 decision has selections array', decs.length === 1 && Array.isArray(decs[0].decision?.selections))
    check('A7 no filler in the persisted selections', decs.length === 1 && (decs[0].decision.selections ?? []).every((s) => s.kind !== 'filler' && s.selectionEnabled === 1))
    const codes = (await getEvents(pid)).map((e) => e.message_code)
    check('A8 director_started + director_succeeded events', codes.includes('director_started') && codes.includes('director_succeeded'))
    check('A9 edit_plans still 0 (compilation is Phase 8)', (await editPlanCount(pid)) === 0)
  }

  // ---- C. crash-before-directing resume ----------------------------------
  console.log('\n== C. crash before directing, then resume ==')
  {
    const pid = await startProject(cA, CR.gen, CR.assetId)
    const w1 = startWorker('p7-crash', { EDITOR_DIRECTOR_ENABLED: 'true', EDITOR_SIM_CRASH_POINT: 'before_stage:directing' })
    // Let it run the real stages and hit the crash point before directing.
    await sleep(30_000)
    stopWorker(w1, 'SIGKILL')
    const proj = await runToSettled('p7-crash2', pid, { EDITOR_DIRECTOR_ENABLED: 'true' })
    check('C1 recovered project completed', proj.status === 'completed', proj.status)
    check('C2 exactly ONE director call after crash+resume', (await directorCalls(pid)).length === 1)
    check('C3 exactly ONE decision after crash+resume', (await directorDecisions(pid)).length === 1)
  }

  // ---- D. fenced RPC truth table -----------------------------------------
  console.log('\n== D. fenced director RPC truth table ==')
  {
    // D-indeterminate: begin twice => 'started' then 'indeterminate', row 'unknown'.
    const p1 = await scratchProject(uA.id, D1.gen, D1.assetId)
    const l1 = await fabricateLease(uA.id, p1)
    await advanceTo(p1, l1, ['inspecting', 'transcribing', 'analyzing', 'directing'])
    const b1 = await dirBegin(p1, l1, D1.assetId)
    check('D1 first begin => started', b1.data === 'started', JSON.stringify(b1.error || b1.data))
    const b2 = await dirBegin(p1, l1, D1.assetId)
    check('D2 second begin => indeterminate (no second provider call)', b2.data === 'indeterminate', JSON.stringify(b2.error || b2.data))
    check('D3 call row is now state=unknown', (await directorCalls(p1))[0]?.state === 'unknown')

    // D-source-mismatch: begin naming a DIFFERENT asset than the project's source.
    const p4 = await scratchProject(uA.id, D4.gen, D4.assetId)
    const l4 = await fabricateLease(uA.id, p4)
    await advanceTo(p4, l4, ['inspecting', 'transcribing', 'analyzing', 'directing'])
    const bSrc = await dirBegin(p4, l4, randomUUID()) // a foreign/mismatched source asset
    check('D4 begin with a mismatched source asset => director_source_mismatch', !!bSrc.error && /director_source_mismatch/.test(bSrc.error.message), JSON.stringify(bSrc.error))
    check('D5 no call row written for the source-mismatch attempt', (await directorCalls(p4)).length === 0)

    // D-ledger-binding: begin -> receive; then succeed must MATCH the ledger.
    const p2 = await scratchProject(uA.id, D2.gen, D2.assetId)
    const l2 = await fabricateLease(uA.id, p2)
    await advanceTo(p2, l2, ['inspecting', 'transcribing', 'analyzing', 'directing'])
    await dirBegin(p2, l2, D2.assetId)
    const recvSha = sha256('r2')
    await admin.rpc('editor_director_receive', { p_project: p2, p_job: l2.jobId, p_worker: l2.worker, p_attempt: l2.attempt, p_response_sha256: recvSha })
    const okDecision = { schemaVersion: 1, selections: [], keptBoundaries: [], summary: '' }
    const succeed = (over) => admin.rpc('editor_director_succeed', {
      p_project: p2, p_job: l2.jobId, p_worker: l2.worker, p_attempt: l2.attempt, p_schema_version: 1,
      p_response_sha256: recvSha, p_decision: okDecision, p_decision_sha256: sha256('d2'), p_model: 'gemini-3.5-flash', p_provider: 'google', ...over,
    })
    const sHash = await succeed({ p_response_sha256: sha256('WRONG') })
    check('D6 succeed with wrong response hash => director_response_mismatch', !!sHash.error && /director_response_mismatch/.test(sHash.error.message), JSON.stringify(sHash.error))
    const sModel = await succeed({ p_model: 'gpt-4' })
    check('D7 succeed with wrong model => director_model_mismatch', !!sModel.error && /director_model_mismatch/.test(sModel.error.message), JSON.stringify(sModel.error))
    const sProv = await succeed({ p_provider: 'openai' })
    check('D8 succeed with wrong provider => director_provider_mismatch', !!sProv.error && /director_provider_mismatch/.test(sProv.error.message), JSON.stringify(sProv.error))
    // D-filler-guard: a decision selecting a filler candidate is rejected by the DB.
    const sFiller = await succeed({ p_decision: { schemaVersion: 1, selections: [{ candidateIndex: 0, kind: 'filler', selectionEnabled: 1, startCs: 0, endCs: 1 }], keptBoundaries: [], summary: '' } })
    check('D9 DB rejects a filler selection (director_filler_disabled)', !!sFiller.error && /director_filler_disabled/.test(sFiller.error.message), JSON.stringify(sFiller.error))
    check('D10 zero decision rows across all rejected succeed attempts', (await directorDecisions(p2)).length === 0)

    // D-wrong-attempt: fenced begin with a stale attempt => lease_lost.
    const bWrong = await dirBegin(p2, l2, D2.assetId, 999)
    check('D11 wrong attempt => lease_lost', !!bWrong.error && /lease_lost/.test(bWrong.error.message), JSON.stringify(bWrong.error))

    // D-wrong-stage: a project not at directing => director_wrong_stage.
    const p3 = await scratchProject(uA.id, D3.gen, D3.assetId)
    const l3 = await fabricateLease(uA.id, p3)
    const bStage = await dirBegin(p3, l3, D3.assetId)
    check('D12 begin before directing => director_wrong_stage', !!bStage.error && /director_wrong_stage/.test(bStage.error.message), JSON.stringify(bStage.error))
  }

  // ---- E. fail-closed credentials ----------------------------------------
  console.log('\n== E. enabled + no GEMINI_API_KEY => fail closed ==')
  {
    const pid = await startProject(cA, E.gen, E.assetId)
    const proj = await runToSettled('p7-nocreds', pid, { EDITOR_DIRECTOR_ENABLED: 'true', GEMINI_API_KEY: '' })
    check('E1 project FAILED (fail closed)', proj.status === 'failed', proj.status)
    check('E2 failure_code is director_no_credentials', proj.failure_code === 'director_no_credentials', String(proj.failure_code))
    check('E3 ZERO decision rows (no ledger mutation)', (await directorDecisions(pid)).length === 0)
    check('E4 ZERO call rows — credential check precedes any ledger mutation', (await directorCalls(pid)).length === 0)
  }

  // ---- F. zero-delta boundary (flag unset => simulated) ------------------
  console.log('\n== F. flag unset => directing stays simulated (production) ==')
  {
    const pid = await startProject(cA, F.gen, F.assetId)
    const proj = await runToSettled('p7-zerodelta', pid) // no EDITOR_DIRECTOR_ENABLED
    check('F1 project completed via the simulated path', proj.status === 'completed', proj.status)
    check('F2 NO director call row (directing simulated)', (await directorCalls(pid)).length === 0)
    check('F3 NO decision row', (await directorDecisions(pid)).length === 0)
    check('F4 edit_plans still 0', (await editPlanCount(pid)) === 0)
  }

  stopAll()
  console.log(`\n===== phase7: ${passed} passed, ${failures.length} failed =====`)
  if (failures.length) { for (const f of failures) console.log(`  FAILED: ${f}`); process.exit(1) }
}

gate0()
main().catch((e) => { console.error('phase7 fatal:', e); stopAll(); process.exit(1) })
