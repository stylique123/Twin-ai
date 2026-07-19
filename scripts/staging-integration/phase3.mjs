// Editor v2 Phase 3 — staging orchestration matrix for the editor_v2 worker,
// against the dedicated staging Supabase project.
//
// What Phase 2 left queued, Phase 3 drives: the REAL worker binary claims the
// editor_v2 job and walks the project through every pipeline stage with
// SIMULATED stage work. Under test, through the real chain only:
//   * durable state transitions + deterministic, append-only event history
//   * lease renewal keeping a slow run owned (no reclaim, no double-run)
//   * SIGKILL crash recovery — reclaim after visibility, resume from the
//     persisted stage
//   * duplicate-worker prevention — two live workers, one driver; and a
//     PAUSED stale worker fenced out at the database after its lease expires
//   * stage timeouts failing retryable before the lease expires
//   * retry classification — retryable retries then succeeds; permanent
//     dead-letters immediately and fails the project
//   * cancellation — queued cancel settles instantly, mid-run cancel is
//     observed at a stage boundary, settled projects are a no-op, foreign
//     cancel leaks nothing
//   * lost-job reconciliation — queued+missing job is re-enqueued; mid-flight
//     +missing job and dead-lettered job fail the project loudly
//   * access posture — every worker RPC is service-role only
//   * Phase-3 boundary — no analyses, no plans, no output assets, no credits
//
// Ready sources are minted through the REAL Phase-1 chain (edge fn → signed
// PUT → finalize → real worker ffprobe), never by service-role fiat.
import { createClient } from '@supabase/supabase-js'
import { execFile as _execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const execFile = promisify(_execFile)

const URL = need('STAGING_URL')
const ANON = need('STAGING_ANON_KEY')
const SERVICE = need('STAGING_SERVICE_ROLE_KEY')
const PW = `It-${randomUUID()}`
function need(k) {
  const v = process.env[k]
  if (!v) { console.error(`missing env ${k}`); process.exit(1) }
  return v
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

let passed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${name}  ${detail}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function makeUser(label) {
  const email = `${label}-${randomUUID().slice(0, 8)}@staging.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser ${label}: ${error.message}`)
  return { id: data.user.id, email }
}
async function login(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PW })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}
async function newGen(ownerId) {
  const id = randomUUID()
  const { error } = await admin.from('generations').insert({ id, user_id: ownerId, blueprint: {} })
  if (error) throw new Error(`newGen: ${error.message}`)
  return id
}

async function callEdge(client, fn, body) {
  const headers = { 'Content-Type': 'application/json', apikey: ANON }
  if (client) {
    const { data: { session } } = await client.auth.getSession()
    headers.Authorization = `Bearer ${session.access_token}`
  }
  const res = await fetch(`${URL}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

// ---- Phase-1 source pipeline (real chain) to mint ready sources ------------
async function putSigned(signedUrl, buf, contentType) {
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': contentType }, body: buf })
  return res.status
}
async function sourceFlow(client, genId, buf, contentType = 'video/webm') {
  const c = await callEdge(client, 'source-asset', {
    action: 'create', generation_id: genId, recording_attempt_id: randomUUID(),
    content_type: contentType, size_bytes: buf.byteLength,
  })
  if (c.status !== 200) throw new Error(`source create ${c.status}: ${JSON.stringify(c.body)}`)
  const p = await putSigned(c.body.signedUrl, buf, contentType)
  if (p >= 300) throw new Error(`signed PUT ${p}`)
  const f = await callEdge(client, 'source-asset', { action: 'finalize', asset_id: c.body.assetId })
  if (f.status !== 200) throw new Error(`finalize ${f.status}: ${JSON.stringify(f.body)}`)
  return c.body.assetId
}
async function waitAssetReady(assetId, timeoutMs = 120_000) {
  const start = Date.now()
  for (;;) {
    const { data: a } = await admin.from('media_assets').select('id,status').eq('id', assetId).maybeSingle()
    if (a && a.status === 'ready') return a
    if (a && a.status === 'rejected') throw new Error(`asset ${assetId} rejected`)
    if (Date.now() - start > timeoutMs) throw new Error(`asset ${assetId} not ready in time (status ${a?.status})`)
    await sleep(1200)
  }
}

// ---- worker management ------------------------------------------------------
// Each scenario runs its own worker process with scenario-specific env
// (fault injection, visibility, renewal cadence). Editor scenarios claim ONLY
// editor_v2 so their injected faults never touch source validation.
const workers = new Set()
function startWorker(name, extraEnv = {}) {
  const w = spawn('node', ['dist/index.js'], {
    cwd: 'worker',
    env: {
      ...process.env,
      SUPABASE_URL: URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      HOSTNAME: name,
      WORKER_JOB_TYPES: 'editor_v2',
      WORKER_POLL_MS: '400',
      WORKER_VISIBILITY_SECS: '60',
      WORKER_RETRY_BACKOFF_BASE_SECS: '1',
      EDITOR_SIM_STAGE_MS: '200',
      EDITOR_LEASE_RENEW_MS: '2000',
      EDITOR_STAGE_TIMEOUT_MS: '120000',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  w.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`))
  w.stderr.on('data', (d) => process.stderr.write(`[${name}!] ${d}`))
  workers.add(w)
  return w
}
function stopWorker(w, signal = 'SIGTERM') {
  if (!w) return
  try { w.kill(signal) } catch { /* already gone */ }
  workers.delete(w)
}
function stopAllWorkers() { for (const w of [...workers]) stopWorker(w, 'SIGKILL') }

// ---- observation helpers ----------------------------------------------------
async function getProject(id) {
  const { data } = await admin.from('edit_projects').select('*').eq('id', id).maybeSingle()
  return data
}
async function getEditorJob(projectId) {
  const { data } = await admin.from('jobs').select('*').eq('dedup_key', `editor_v2:${projectId}:1`).maybeSingle()
  return data
}
async function getEvents(projectId) {
  const { data } = await admin.from('edit_events').select('*').eq('project_id', projectId).order('seq', { ascending: true })
  return data ?? []
}
async function waitProject(id, pred, timeoutMs = 90_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && pred(p)) return p
    if (Date.now() - start > timeoutMs) throw new Error(`waitProject ${label || id}: timeout (status ${p?.status})`)
    await sleep(500)
  }
}
const isSettled = (p) => ['completed', 'failed', 'cancelled'].includes(p.status)

async function startProject(client, genId, assetId) {
  const r = await callEdge(client, 'start-editor-v2', {
    generation_id: genId, source_asset_id: assetId, idempotency_key: randomUUID(),
  })
  if (r.status !== 200) throw new Error(`start-editor-v2 ${r.status}: ${JSON.stringify(r.body)}`)
  allProjects.push(r.body.projectId)
  return r.body.projectId
}

const PIPELINE = ['inspecting', 'transcribing', 'analyzing', 'directing', 'compiling', 'rendering', 'validating']

// Every project this run creates — for run-scoped hygiene sweeps at the end.
const allProjects = []

// The editor scratch root the spawned workers use (same host as this harness,
// so temp-dir lifecycle is assertable directly on the filesystem).
const EDITOR_TMP = join(tmpdir(), 'editor-v2')
async function editorTmpEntries() {
  const { readdir } = await import('node:fs/promises')
  try { return await readdir(EDITOR_TMP) } catch { return [] }
}

async function makeFixture(dir) {
  const ff = (args) => execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 120_000 })
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libvorbis', '-shortest', join(dir, 'good.webm')])
  return readFile(join(dir, 'good.webm'))
}

// =====================================================================
async function main() {
  console.log('== setup: identities, fixture, ready sources via the REAL chain ==')
  const dir = await mkdtemp(join(tmpdir(), 'phase3-'))
  const [good, u1, u2, outsider, peer] = await Promise.all([
    makeFixture(dir), makeUser('p3a'), makeUser('p3b'), makeUser('p3out'), makeUser('p3peer'),
  ])
  // peer joins u2's workspace: the product rule is peers OBSERVE, never control.
  {
    const { error } = await admin.from('workspace_members').insert({ owner_id: u2.id, member_id: peer.id })
    if (error) throw new Error(`workspace_members: ${error.message}`)
  }
  const [c1, c2, cOut, cPeer] = await Promise.all([
    login(u1.email), login(u2.email), login(outsider.email), login(peer.email),
  ])

  // The Phase-2 matrix (which runs before this one, same staging DB)
  // deliberately leaves its editor_v2 jobs queued — "no worker claims them"
  // was itself under test there. Settle those strays (and any leftovers from
  // an interrupted prior run) BEFORE any phase-3 project exists, so claim
  // order in the scenarios below stays deterministic.
  await admin.from('jobs')
    .update({ status: 'done', result: { drained_by: 'phase3-setup' }, locked_at: null, locked_by: null })
    .eq('type', 'editor_v2').in('status', ['queued', 'running'])
  await admin.from('edit_projects')
    .update({ status: 'cancelled' })
    .not('status', 'in', '("completed","failed","cancelled")')

  // A validate-only worker drains source validations during minting; its env
  // carries no editor fault injection.
  const validator = startWorker('p3-validator', { WORKER_JOB_TYPES: 'validate_source', EDITOR_SIM_STAGE_MS: '200' })

  // Mint ready sources: [client, count] — each source gets its own generation.
  async function mintSources(client, ownerLabel, n) {
    const out = []
    for (let i = 0; i < n; i++) {
      const gen = await newGen((await client.auth.getUser()).data.user.id)
      const asset = await sourceFlow(client, gen, good)
      await waitAssetReady(asset)
      out.push({ gen, asset })
    }
    console.log(`  minted ${n} ready sources for ${ownerLabel}`)
    return out
  }
  const s1 = await mintSources(c1, 'u1', 9)
  const s2 = await mintSources(c2, 'u2', 13)
  stopWorker(validator)

  // =================================================================
  console.log('\n== A. happy path: full pipeline, durable transitions, ordered events ==')
  {
    const { gen, asset } = s1[0]
    const projectId = await startProject(c1, gen, asset)
    const pre = await getEditorJob(projectId)
    check('A1 start → queued project + queued job', pre?.status === 'queued')

    const w = startWorker('p3-happy')
    const proj = await waitProject(projectId, isSettled, 60_000, 'happy')
    stopWorker(w)

    check('A2 project completed', proj.status === 'completed', proj.status)
    check('A3 timestamps set, no failure', !!proj.started_at && !!proj.completed_at && proj.failure_code === null)
    check('A4 simulated completion has NO output asset (rendering is a later phase)', proj.output_asset_id === null)

    const job = await getEditorJob(projectId)
    check('A5 job done in one attempt', job?.status === 'done' && job?.attempts === 1, `status=${job?.status} attempts=${job?.attempts}`)
    check('A6 job result reports all 7 simulated stages + temp-dir cleanup',
      job?.result?.simulated === true && job?.result?.stages_ran?.length === 7 && job?.result?.temp_dir_cleaned === true)

    const ev = await getEvents(projectId)
    const seqs = ev.map((e) => e.seq)
    check('A7 events in strictly increasing seq order', seqs.every((s, i) => i === 0 || s > seqs[i - 1]))
    const started = ev.filter((e) => e.message_code === 'stage_started').map((e) => e.stage)
    check('A8 one stage_started per pipeline stage, in exact order', JSON.stringify(started) === JSON.stringify(PIPELINE), JSON.stringify(started))
    check('A9 history ends with project_completed at pct 100',
      ev.at(-1)?.message_code === 'project_completed' && ev.at(-1)?.pct === 100)
    const pcts = ev.filter((e) => e.pct !== null).map((e) => e.pct)
    check('A10 pct is monotonically increasing', pcts.every((p, i) => i === 0 || p >= pcts[i - 1]), JSON.stringify(pcts))

    // stash for B3 (cancel-after-settled)
    s1[0].projectId = projectId
  }

  // =================================================================
  console.log('\n== B. cancellation foundations ==')
  {
    // B1: cancel while queued, NO worker running → settles immediately.
    const { gen, asset } = s1[1]
    const projectId = await startProject(c1, gen, asset)
    const { data: mode1, error: e1 } = await c1.rpc('editor_request_cancel', { p_project: projectId })
    check('B1 queued cancel settles immediately', !e1 && mode1 === 'cancelled', e1?.message ?? mode1)
    const p1 = await getProject(projectId)
    const j1 = await getEditorJob(projectId)
    check('B2 project cancelled, job closed without ever running',
      p1.status === 'cancelled' && j1?.status === 'done' && j1?.result?.cancelled === true && j1?.attempts === 0,
      `p=${p1.status} j=${j1?.status} attempts=${j1?.attempts}`)
    const ev1 = await getEvents(projectId)
    check('B3 cancel history: cancel_requested → project_cancelled',
      JSON.stringify(ev1.map((e) => e.message_code)) === JSON.stringify(['cancel_requested', 'project_cancelled']))

    // B4: cancel MID-RUN → worker observes at the next stage boundary.
    const { gen: g2, asset: a2 } = s1[2]
    const pid2 = await startProject(c1, g2, a2)
    const w = startWorker('p3-cancel', { EDITOR_SIM_STAGE_MS: '1200' })
    await waitProject(pid2, (p) => p.status !== 'queued', 30_000, 'cancel-midrun')
    const { data: mode2 } = await c1.rpc('editor_request_cancel', { p_project: pid2 })
    check('B4 mid-run cancel returns cancel_requested', mode2 === 'cancel_requested', String(mode2))
    const p2 = await waitProject(pid2, isSettled, 60_000, 'cancel-midrun-settle')
    stopWorker(w)
    check('B5 worker finished the project as cancelled at a stage boundary', p2.status === 'cancelled', p2.status)
    const j2 = await getEditorJob(pid2)
    check('B6 mid-run cancel: job settled cleanly', j2?.status === 'done' && j2?.result?.cancelled === true, `j=${j2?.status}`)
    const ev2 = await getEvents(pid2)
    check('B7 mid-run history has cancel_requested then project_cancelled last',
      ev2.some((e) => e.message_code === 'cancel_requested') && ev2.at(-1)?.message_code === 'project_cancelled')

    // B8: cancelling a SETTLED project is an idempotent no-op.
    const { data: mode3 } = await c1.rpc('editor_request_cancel', { p_project: s1[0].projectId })
    check('B8 cancel after completion is a no-op returning the settled status', mode3 === 'completed', String(mode3))

    // B9/B10: no existence observation — foreign and unknown behave identically.
    const { error: eF } = await cOut.rpc('editor_request_cancel', { p_project: pid2 })
    const { error: eU } = await cOut.rpc('editor_request_cancel', { p_project: randomUUID() })
    check('B9 foreign cancel → not_found', /not_found/.test(eF?.message ?? ''), eF?.message)
    check('B10 unknown project cancel → identical not_found', /not_found/.test(eU?.message ?? ''), eU?.message)
  }

  // =================================================================
  console.log('\n== C. lease renewal keeps a slow run owned ==')
  {
    // 7 stages × 2s ≈ 14s of work against an 8s visibility lease: without
    // renewal the job would be reclaimed and re-attempted; with the 2s renewal
    // loop it must finish in ONE attempt with no resume marker.
    const { gen, asset } = s1[3]
    const projectId = await startProject(c1, gen, asset)
    const w = startWorker('p3-lease', { WORKER_VISIBILITY_SECS: '8', EDITOR_SIM_STAGE_MS: '2000', EDITOR_LEASE_RENEW_MS: '2000' })
    const proj = await waitProject(projectId, isSettled, 90_000, 'lease')
    stopWorker(w)
    const job = await getEditorJob(projectId)
    const ev = await getEvents(projectId)
    check('C1 slow run completed', proj.status === 'completed', proj.status)
    check('C2 exactly one attempt — the lease never lapsed', job?.attempts === 1, `attempts=${job?.attempts}`)
    check('C3 no resume marker in history', !ev.some((e) => e.message_code === 'resumed'))
  }

  // =================================================================
  console.log('\n== D. crash recovery: SIGKILL mid-pipeline, resume from persisted stage ==')
  {
    const { gen, asset } = s1[4]
    const projectId = await startProject(c1, gen, asset)
    const w1 = startWorker('p3-crash-1', { WORKER_VISIBILITY_SECS: '10', EDITOR_SIM_STAGE_MS: '1200' })
    const mid = await waitProject(projectId, (p) => PIPELINE.indexOf(p.status) >= 1, 30_000, 'crash-mid')
    stopWorker(w1, 'SIGKILL') // no graceful shutdown — the lease is left dangling
    console.log(`  killed worker at stage ${mid.status}`)

    const w2 = startWorker('p3-crash-2', { WORKER_VISIBILITY_SECS: '10', EDITOR_SIM_STAGE_MS: '400' })
    const proj = await waitProject(projectId, isSettled, 90_000, 'crash-recover')
    stopWorker(w2)

    const job = await getEditorJob(projectId)
    const ev = await getEvents(projectId)
    const resumed = ev.find((e) => e.message_code === 'resumed')
    check('D1 project completed after the crash', proj.status === 'completed', proj.status)
    check('D2 job was reclaimed (second attempt)', job?.attempts === 2, `attempts=${job?.attempts}`)
    check('D3 resume marker recorded with the persisted stage', !!resumed && PIPELINE.includes(resumed?.details?.from_stage), JSON.stringify(resumed?.details))
    check('D4 exactly one terminal event', ev.filter((e) => e.message_code.startsWith('project_')).length === 1)
  }

  // =================================================================
  console.log('\n== CP. deterministic crash points ==')
  {
    // CP-a: crash BEFORE a stage starts (after the previous stage committed).
    const { gen, asset } = s1[6]
    const pidA = await startProject(c1, gen, asset)
    const w1 = startWorker('p3-cp-a1', {
      WORKER_VISIBILITY_SECS: '8', EDITOR_SIM_CRASH_POINT: 'before_stage:analyzing', EDITOR_SIM_FAIL_ATTEMPTS: '1',
    })
    // the process exits itself at the crash point; wait for it
    await new Promise((r) => w1.on('exit', r))
    workers.delete(w1)
    const w2 = startWorker('p3-cp-a2', { WORKER_VISIBILITY_SECS: '8' })
    const pA = await waitProject(pidA, isSettled, 90_000, 'crash-before-stage')
    stopWorker(w2)
    const jA = await getEditorJob(pidA)
    const evA = await getEvents(pidA)
    check('CP1 crash before a stage: converges to completed', pA.status === 'completed', pA.status)
    check('CP2 reclaimed on attempt 2, resumed from the last COMMITTED stage',
      jA?.attempts === 2 && evA.some((e) => e.message_code === 'resumed' && e.details?.from_stage === 'transcribing'),
      `attempts=${jA?.attempts}`)
    check('CP3 no stage was skipped (analyzing..validating all present after resume)',
      ['analyzing', 'directing', 'compiling', 'rendering', 'validating']
        .every((s) => evA.some((e) => e.message_code === 'stage_started' && e.stage === s)))

    // CP-b: crash AFTER the terminal state commit but BEFORE the job is
    // acknowledged — the exact "state committed, ack lost" window.
    const { gen: g2, asset: a2 } = s1[7]
    const pidB = await startProject(c1, g2, a2)
    const w3 = startWorker('p3-cp-b1', {
      WORKER_VISIBILITY_SECS: '8', EDITOR_SIM_CRASH_POINT: 'after_finish', EDITOR_SIM_FAIL_ATTEMPTS: '1',
    })
    await new Promise((r) => w3.on('exit', r))
    workers.delete(w3)
    const pMid = await getProject(pidB)
    const jMid = await getEditorJob(pidB)
    check('CP4 crash window is real: project settled, job still unacknowledged',
      pMid.status === 'completed' && jMid?.status === 'running', `p=${pMid.status} j=${jMid?.status}`)
    const w4 = startWorker('p3-cp-b2', { WORKER_VISIBILITY_SECS: '8' })
    const start = Date.now()
    for (;;) {
      const j = await getEditorJob(pidB)
      if (j?.status === 'done') break
      if (Date.now() - start > 60_000) break
      await sleep(500)
    }
    stopWorker(w4)
    const jB = await getEditorJob(pidB)
    const evB = await getEvents(pidB)
    check('CP5 reclaim converges the job as a no-op (project already terminal)',
      jB?.status === 'done' && jB?.result?.noop === true && jB?.attempts === 2,
      `j=${jB?.status} attempts=${jB?.attempts}`)
    check('CP6 no duplicated terminal event, no duplicated stages',
      evB.filter((e) => e.message_code === 'project_completed').length === 1
      && evB.filter((e) => e.message_code === 'stage_started').length === 7)
  }

  // =================================================================
  console.log('\n== E. duplicate-worker prevention ==')
  {
    // E1: two LIVE workers, one job — SKIP LOCKED admits exactly one driver.
    const { gen, asset } = s2[0]
    const projectId = await startProject(c2, gen, asset)
    const wa = startWorker('p3-dup-a', { EDITOR_SIM_STAGE_MS: '600' })
    const wb = startWorker('p3-dup-b', { EDITOR_SIM_STAGE_MS: '600' })
    const proj = await waitProject(projectId, isSettled, 60_000, 'dup')
    stopWorker(wa); stopWorker(wb)
    const job = await getEditorJob(projectId)
    const ev = await getEvents(projectId)
    const started = ev.filter((e) => e.message_code === 'stage_started').map((e) => e.stage)
    check('E1 two live workers: completed in one attempt', proj.status === 'completed' && job?.attempts === 1, `attempts=${job?.attempts}`)
    check('E2 no duplicated stage anywhere in history', JSON.stringify(started) === JSON.stringify(PIPELINE), JSON.stringify(started))

    // E3: a STALE worker (paused past its lease) must be fenced out at the DB.
    const { gen: g2, asset: a2 } = s2[1]
    const pid2 = await startProject(c2, g2, a2)
    // Renewal cadence (60s) is far beyond the 6s lease: pausing the process
    // guarantees expiry. SIGSTOP ≈ a wedged-but-alive worker, the worst case.
    const stale = startWorker('p3-stale', { WORKER_VISIBILITY_SECS: '6', EDITOR_SIM_STAGE_MS: '2500', EDITOR_LEASE_RENEW_MS: '60000' })
    await waitProject(pid2, (p) => p.status !== 'queued', 30_000, 'stale-claim')
    stale.kill('SIGSTOP')
    console.log('  paused stale worker mid-stage; waiting out its lease')
    await sleep(8000)

    const fresh = startWorker('p3-fresh', { WORKER_VISIBILITY_SECS: '6', EDITOR_SIM_STAGE_MS: '400' })
    const p2 = await waitProject(pid2, isSettled, 60_000, 'stale-recover')
    const maxSeqBefore = (await getEvents(pid2)).at(-1)?.seq

    stale.kill('SIGCONT') // wake the zombie: every write it now attempts must be refused
    await sleep(5000)
    stopWorker(stale); stopWorker(fresh)

    const ev2 = await getEvents(pid2)
    const terminal = ev2.filter((e) => e.message_code.startsWith('project_'))
    check('E3 reclaimed run completed', p2.status === 'completed', p2.status)
    check('E4 exactly one terminal event despite the woken stale worker', terminal.length === 1 && terminal[0].message_code === 'project_completed')
    check('E5 the fenced stale worker appended NOTHING after settlement', ev2.at(-1)?.seq === maxSeqBefore,
      `maxSeq ${maxSeqBefore} → ${ev2.at(-1)?.seq}`)
    const j2 = await getEditorJob(pid2)
    check('E6 job settled done exactly once', j2?.status === 'done')

    // E7: SAME-IDENTITY reclaim — the reviewer's sharpest case. locked_by
    // alone cannot fence this: both processes carry the same worker id, so
    // only the immutable ATTEMPT token separates the stale run (attempt 1)
    // from its own successor (attempt 2).
    const { gen: g3, asset: a3 } = s2[9]
    const pid3 = await startProject(c2, g3, a3)
    const sameA = startWorker('p3-same', { WORKER_VISIBILITY_SECS: '6', EDITOR_SIM_STAGE_MS: '2500', EDITOR_LEASE_RENEW_MS: '60000' })
    await waitProject(pid3, (p) => p.status !== 'queued', 30_000, 'same-id-claim')
    sameA.kill('SIGSTOP')
    await sleep(8000)
    const sameB = startWorker('p3-same', { WORKER_VISIBILITY_SECS: '6', EDITOR_SIM_STAGE_MS: '400' })
    const p3 = await waitProject(pid3, isSettled, 60_000, 'same-id-recover')
    const seqBefore = (await getEvents(pid3)).at(-1)?.seq
    sameA.kill('SIGCONT')
    await sleep(5000)
    stopWorker(sameA); stopWorker(sameB)
    const ev3 = await getEvents(pid3)
    const j3 = await getEditorJob(pid3)
    check('E7 same-identity reclaim completed under attempt 2', p3.status === 'completed' && j3?.attempts === 2,
      `p=${p3.status} attempts=${j3?.attempts}`)
    check('E8 the woken attempt-1 run (same worker id!) wrote NOTHING after settlement',
      ev3.at(-1)?.seq === seqBefore && ev3.filter((e) => e.message_code === 'project_completed').length === 1,
      `maxSeq ${seqBefore} → ${ev3.at(-1)?.seq}`)
    check('E9 job stayed settled (attempt token fenced complete/fail too)', j3?.status === 'done')

    // Workspace rule: peers OBSERVE, never control.
    const { data: peerSees } = await cPeer.from('edit_projects').select('id').eq('id', pid2)
    check('E10 workspace peer CAN observe the project', (peerSees ?? []).length === 1)
    const { error: ePeer } = await cPeer.rpc('editor_request_cancel', { p_project: pid2 })
    check('E11 workspace peer CANNOT cancel (owner-only, identical not_found)', /not_found/.test(ePeer?.message ?? ''), ePeer?.message)
  }

  // =================================================================
  console.log('\n== F. stage timeout: hung stage fails RETRYABLE, then succeeds ==')
  {
    const { gen, asset } = s2[2]
    const projectId = await startProject(c2, gen, asset)
    // Attempt 1 hangs in `directing` until the 2s stage timeout; attempt 2
    // runs clean (fault injected only while attempts <= 1).
    const w = startWorker('p3-timeout', {
      EDITOR_STAGE_TIMEOUT_MS: '2000', EDITOR_SIM_FAIL_STAGE: 'directing',
      EDITOR_SIM_FAIL_MODE: 'hang', EDITOR_SIM_FAIL_ATTEMPTS: '1',
    })
    const proj = await waitProject(projectId, isSettled, 90_000, 'timeout')
    stopWorker(w)
    const job = await getEditorJob(projectId)
    const ev = await getEvents(projectId)
    const retry = ev.find((e) => e.message_code === 'stage_retry_scheduled')
    check('F1 completed after the timeout retry', proj.status === 'completed', proj.status)
    check('F2 exactly two attempts', job?.attempts === 2, `attempts=${job?.attempts}`)
    check('F3 retry event names the stage timeout', /stage_timeout: directing/.test(retry?.details?.error ?? ''), JSON.stringify(retry?.details))
    check('F4 resumed at the interrupted stage', ev.some((e) => e.message_code === 'resumed' && e.details?.from_stage === 'directing'))
  }

  // =================================================================
  console.log('\n== G. retryable failure: retry budget, then success ==')
  {
    const { gen, asset } = s2[3]
    const projectId = await startProject(c2, gen, asset)
    const w = startWorker('p3-retry', {
      EDITOR_SIM_FAIL_STAGE: 'analyzing', EDITOR_SIM_FAIL_MODE: 'retryable', EDITOR_SIM_FAIL_ATTEMPTS: '1',
    })
    const proj = await waitProject(projectId, isSettled, 90_000, 'retry')
    stopWorker(w)
    const job = await getEditorJob(projectId)
    const ev = await getEvents(projectId)
    check('G1 completed on the second attempt', proj.status === 'completed' && job?.attempts === 2, `p=${proj.status} attempts=${job?.attempts}`)
    check('G2 retry was recorded before the job requeued',
      ev.some((e) => e.message_code === 'stage_retry_scheduled' && /simulated retryable/.test(e.details?.error ?? '')))
    check('G3 project state was durable across the retry (resumed at analyzing)',
      ev.some((e) => e.message_code === 'resumed' && e.details?.from_stage === 'analyzing'))
  }

  // =================================================================
  console.log('\n== RC. cancellation during retry delay ==')
  {
    // Attempt 1 fails retryable with a LONG backoff so the job parks queued.
    // A cancel arriving in that window must settle immediately — the job is
    // unclaimed, so nobody will ever observe the flag otherwise.
    const { gen, asset } = s2[8]
    const projectId = await startProject(c2, gen, asset)
    const w = startWorker('p3-retrydelay', {
      EDITOR_SIM_FAIL_STAGE: 'directing', EDITOR_SIM_FAIL_MODE: 'retryable', EDITOR_SIM_FAIL_ATTEMPTS: '9999',
      WORKER_RETRY_BACKOFF_BASE_SECS: '60',
    })
    const start = Date.now()
    for (;;) {
      const j = await getEditorJob(projectId)
      if (j?.status === 'queued' && j?.attempts === 1 && j?.error) break
      if (Date.now() - start > 60_000) throw new Error('retry-delay park not reached')
      await sleep(500)
    }
    stopWorker(w)
    const { data: mode } = await c2.rpc('editor_request_cancel', { p_project: projectId })
    check('RC1 cancel during retry backoff settles immediately', mode === 'cancelled', String(mode))
    const p = await getProject(projectId)
    const j = await getEditorJob(projectId)
    const ev = await getEvents(projectId)
    check('RC2 project cancelled from its persisted mid-pipeline stage', p.status === 'cancelled' && !!p.completed_at, p.status)
    check('RC3 parked job closed without another attempt', j?.status === 'done' && j?.result?.cancelled === true && j?.attempts === 1,
      `j=${j?.status} attempts=${j?.attempts}`)
    check('RC4 history: retry recorded, then cancel, then terminal — in seq order',
      ev.some((e) => e.message_code === 'stage_retry_scheduled')
      && ev.at(-1)?.message_code === 'project_cancelled')
  }

  // =================================================================
  console.log('\n== H. permanent failure: immediate dead-letter, project failed ==')
  {
    const { gen, asset } = s2[4]
    const projectId = await startProject(c2, gen, asset)
    const w = startWorker('p3-permanent', {
      EDITOR_SIM_FAIL_STAGE: 'compiling', EDITOR_SIM_FAIL_MODE: 'permanent', EDITOR_SIM_FAIL_ATTEMPTS: '9999',
    })
    const proj = await waitProject(projectId, isSettled, 60_000, 'permanent')
    stopWorker(w)
    const job = await getEditorJob(projectId)
    const ev = await getEvents(projectId)
    check('H1 project failed with the permanent code', proj.status === 'failed' && proj.failure_code === 'simulated_permanent',
      `${proj.status}/${proj.failure_code}`)
    check('H2 job dead-lettered immediately (failed, attempts pinned to max, no retries burned)',
      job?.status === 'failed' && job?.attempts === job?.max_attempts && /simulated permanent/.test(job?.error ?? ''),
      `status=${job?.status} attempts=${job?.attempts}/${job?.max_attempts}`)
    check('H3 the failing stage ran exactly once', ev.filter((e) => e.message_code === 'stage_started' && e.stage === 'compiling').length === 1)
    check('H4 history ends with project_failed', ev.at(-1)?.message_code === 'project_failed')
    check('H5 failure details captured on the project', /simulated permanent/.test(proj.failure_details?.error ?? ''), JSON.stringify(proj.failure_details))
  }

  // =================================================================
  console.log('\n== I. lost-job reconciliation ==')
  {
    // I-a: queued project whose job insert is "lost" → heal by re-enqueue.
    const { gen, asset } = s2[5]
    const pidA = await startProject(c2, gen, asset)
    await admin.from('jobs').delete().eq('dedup_key', `editor_v2:${pidA}:1`)
    const { data: r1, error: er1 } = await admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 })
    check('I1 reconciler healed the queued project', !er1 && r1?.requeued >= 1, er1?.message ?? JSON.stringify(r1))
    const jA = await getEditorJob(pidA)
    check('I2 job re-enqueued under the SAME dedup key', jA?.status === 'queued' && jA?.dedup_key === `editor_v2:${pidA}:1`)
    check('I3 heal recorded in history', (await getEvents(pidA)).some((e) => e.message_code === 'job_reenqueued'))
    await c2.rpc('editor_request_cancel', { p_project: pidA }) // settle for later sweeps

    // I-b: MID-FLIGHT project whose job vanishes → fail loudly, never hang.
    const { gen: gB, asset: aB } = s2[6]
    const pidB = await startProject(c2, gB, aB)
    const w = startWorker('p3-lost', { EDITOR_SIM_STAGE_MS: '1500' })
    await waitProject(pidB, (p) => p.status !== 'queued', 30_000, 'lost-mid')
    stopWorker(w, 'SIGKILL')
    await admin.from('jobs').delete().eq('dedup_key', `editor_v2:${pidB}:1`)
    const { data: r2 } = await admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 })
    const pB = await getProject(pidB)
    check('I4 reconciler failed the orphaned mid-flight project', r2?.failed >= 1 && pB.status === 'failed' && pB.failure_code === 'lost_job',
      `${pB.status}/${pB.failure_code}`)
    check('I5 reconciliation is visible in history',
      (await getEvents(pidB)).some((e) => e.message_code === 'project_failed' && e.details?.reconciled === true))

    // I-c: job dead-lettered outside the handler (e.g. worker died on its very
    // last attempt) → the sweep closes the project.
    const { gen: gC, asset: aC } = s2[7]
    const pidC = await startProject(c2, gC, aC)
    await admin.from('jobs').update({ status: 'failed', error: 'synthetic dead-letter (matrix)' })
      .eq('dedup_key', `editor_v2:${pidC}:1`)
    await admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 })
    const pC = await getProject(pidC)
    check('I6 dead-lettered job → project failed as job_dead_lettered', pC.status === 'failed' && pC.failure_code === 'job_dead_lettered',
      `${pC.status}/${pC.failure_code}`)
    check('I7 job error propagated into failure details', /synthetic dead-letter/.test(pC.failure_details?.job_error ?? ''))

    // I8: the reconciler must never touch a HEALTHY, actively leased run.
    const { gen: gH, asset: aH } = s2[10]
    const pidH = await startProject(c2, gH, aH)
    const wH = startWorker('p3-healthy', { EDITOR_SIM_STAGE_MS: '1500' })
    await waitProject(pidH, (p) => p.status !== 'queued', 30_000, 'healthy-mid')
    const { data: rH } = await admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 })
    const pHmid = await getProject(pidH)
    check('I8 mid-run project untouched by a concurrent reconciler sweep',
      !['failed', 'cancelled'].includes(pHmid.status) && !(await getEvents(pidH)).some((e) => e.details?.reconciled === true),
      JSON.stringify(rH))
    const pH = await waitProject(pidH, isSettled, 60_000, 'healthy-finish')
    stopWorker(wH)
    check('I9 …and it completed normally afterwards', pH.status === 'completed', pH.status)

    // I10: reconciler RESPECTS CANCELLATION — a swept project whose owner
    // asked to cancel settles cancelled, never failed, never re-enqueued.
    const { gen: gR, asset: aR } = s2[11]
    const pidR = await startProject(c2, gR, aR)
    const wR = startWorker('p3-cancelrec', { EDITOR_SIM_STAGE_MS: '2000' })
    await waitProject(pidR, (p) => p.status !== 'queued', 30_000, 'cancelrec-mid')
    const { data: modeR } = await c2.rpc('editor_request_cancel', { p_project: pidR })
    stopWorker(wR, 'SIGKILL')
    await admin.from('jobs').delete().eq('dedup_key', `editor_v2:${pidR}:1`)
    const { data: rR } = await admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 })
    const pR = await getProject(pidR)
    check('I10 reconciler honors a pending cancellation (cancelled, not failed/re-enqueued)',
      modeR === 'cancel_requested' && pR.status === 'cancelled' && rR?.cancelled >= 1,
      `mode=${modeR} p=${pR.status} r=${JSON.stringify(rR)}`)

    // I11: TERMINAL project left with a stale queued job → the sweep closes it.
    const { gen: gT, asset: aT } = s2[0] // E1's completed project
    void gT; void aT
    const pidT = (await admin.from('edit_projects').select('id').eq('source_asset_id', s2[0].asset).maybeSingle()).data?.id
    await admin.from('jobs').update({ status: 'queued', locked_at: null, locked_by: null })
      .eq('dedup_key', `editor_v2:${pidT}:1`)
    const { data: rT } = await admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 })
    const jT = await getEditorJob(pidT)
    check('I11 stale queued job under a terminal project is closed by the sweep',
      rT?.closed_stale_jobs >= 1 && jT?.status === 'done' && jT?.result?.reconciled === true,
      `r=${JSON.stringify(rT)} j=${jT?.status}`)
    check('I12 closure recorded in history', (await getEvents(pidT)).some((e) => e.message_code === 'stale_job_closed'))

    // I13/I14: idempotency + concurrent convergence. Broken state: queued
    // project, job deleted. Two reconciler runs race; then a third repeats.
    const { gen: gD, asset: aD } = s2[12]
    const pidD = await startProject(c2, gD, aD)
    await admin.from('jobs').delete().eq('dedup_key', `editor_v2:${pidD}:1`)
    await Promise.all([
      admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 }),
      admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 }),
    ])
    const evD = await getEvents(pidD)
    const jD = await getEditorJob(pidD)
    check('I13 two CONCURRENT reconciler runs converge: exactly one heal, one event',
      jD?.status === 'queued' && evD.filter((e) => e.message_code === 'job_reenqueued').length === 1,
      `j=${jD?.status} heals=${evD.filter((e) => e.message_code === 'job_reenqueued').length}`)
    const { data: r3 } = await admin.rpc('editor_reconcile_lost_projects', { p_min_age_secs: 0 })
    const evD2 = await getEvents(pidD)
    check('I14 a REPEATED run is a no-op on healed state',
      evD2.filter((e) => e.message_code === 'job_reenqueued').length === 1 && (r3?.requeued ?? 0) === 0,
      JSON.stringify(r3))
    await c2.rpc('editor_request_cancel', { p_project: pidD }) // settle
  }

  // =================================================================
  console.log('\n== J. access posture + transition guard ==')
  {
    // Worker/reconciler RPCs are service-role only — for BOTH client roles.
    const denied = async (client, fn, args) => {
      const { error } = await client.rpc(fn, args)
      return /permission denied|not exist/.test(error?.message ?? '')
    }
    const anonC = createClient(URL, ANON, { auth: { persistSession: false } })
    const uuid = randomUUID()
    const rpcs = [
      ['renew_job_lease', { p_id: uuid, p_worker: 'x', p_attempt: 1 }],
      ['dead_letter_job', { p_id: uuid, p_error: 'x', p_worker: 'x', p_attempt: 1 }],
      ['editor_advance_stage', { p_project: uuid, p_job: uuid, p_worker: 'x', p_attempt: 1, p_to: 'inspecting', p_pct: 1, p_message_code: 'x', p_details: {} }],
      ['editor_finish_project', { p_project: uuid, p_job: uuid, p_worker: 'x', p_attempt: 1, p_status: 'failed', p_failure_code: null, p_details: {} }],
      ['editor_append_event', { p_project: uuid, p_job: uuid, p_worker: 'x', p_attempt: 1, p_message_code: 'x', p_pct: null, p_details: {} }],
      ['editor_reconcile_lost_projects', { p_min_age_secs: 0 }],
    ]
    let authDenied = 0; let anonDenied = 0
    for (const [fn, args] of rpcs) {
      if (await denied(c1, fn, args)) authDenied++
      if (await denied(anonC, fn, args)) anonDenied++
    }
    check('J1 all 6 orchestration RPCs denied to authenticated', authDenied === 6, `${authDenied}/6`)
    check('J2 all 6 orchestration RPCs denied to anon', anonDenied === 6, `${anonDenied}/6`)
    const { error: eAnonCancel } = await anonC.rpc('editor_request_cancel', { p_project: uuid })
    check('J3 editor_request_cancel denied to anon', /permission denied|JWT|Auth/i.test(eAnonCancel?.message ?? ''), eAnonCancel?.message)

    // The stage guard binds EVERY role, service_role included.
    const { gen, asset } = s1[5]
    const pid = await startProject(c1, gen, asset)
    const { error: gJump } = await admin.from('edit_projects').update({ status: 'rendering' }).eq('id', pid)
    check('J4 service-role stage jump (queued→rendering) rejected by the DB', /illegal stage transition/.test(gJump?.message ?? ''), gJump?.message)
    await c1.rpc('editor_request_cancel', { p_project: pid }) // → cancelled (terminal)
    const { error: gTerm } = await admin.from('edit_projects').update({ status: 'queued' }).eq('id', pid)
    check('J5 service-role resurrection of a terminal project rejected', /terminal/.test(gTerm?.message ?? ''), gTerm?.message)
  }

  // =================================================================
  console.log('\n== K. Phase-3 boundary: orchestration only, no downstream side effects ==')
  {
    const count = async (t) => (await admin.from(t).select('id', { count: 'exact', head: true })).count ?? 0
    check('K1 zero media_analyses rows (analysis is Phase 4+)', (await count('media_analyses')) === 0)
    check('K2 zero edit_plans rows (planning is a later phase)', (await count('edit_plans')) === 0)
    const { count: outputs } = await admin.from('media_assets').select('id', { count: 'exact', head: true }).eq('kind', 'output')
    check('K3 zero output assets rendered', (outputs ?? 0) === 0)
    const { data: charged } = await admin.from('edit_projects').select('id,output_asset_id').not('output_asset_id', 'is', null)
    check('K4 no project acquired an output pointer', (charged ?? []).length === 0)

    // Event hygiene: no temp paths or raw path-like strings in any event this
    // run produced (error messages are sliced, never raw stack/paths).
    let dirty = 0
    for (const pid of allProjects) {
      for (const e of await getEvents(pid)) {
        const s = JSON.stringify(e.details ?? {})
        if (/\/tmp\/|editor-v2\//.test(s)) dirty++
      }
    }
    check('K5 no event detail contains temp paths', dirty === 0, `${dirty} dirty events`)
  }

  // =================================================================
  console.log('\n== T. temp-dir lifecycle on the shared filesystem ==')
  {
    // Crash scenarios (SIGKILL / process.exit) leave orphans BY DESIGN —
    // finally-blocks cannot run. Everything else must have cleaned up.
    const leftovers = await editorTmpEntries()
    check('T1 crash orphans exist and are attempt-scoped dirs', leftovers.length > 0 && leftovers.every((n) => /-a\d+$/.test(n)),
      JSON.stringify(leftovers))

    // The age-based orphan sweep (runs at each claim) removes them. Age floor
    // 1ms here; production uses 6h >> the 35-min hard job cap, so a LIVE
    // attempt's dir can never be swept there — and this scenario runs a solo
    // worker, so the sweep races nothing.
    const { gen, asset } = s1[8]
    const projectId = await startProject(c1, gen, asset)
    const w = startWorker('p3-sweep', { EDITOR_TEMP_MAX_AGE_MS: '1' })
    const proj = await waitProject(projectId, isSettled, 60_000, 'sweep')
    stopWorker(w)
    await sleep(1500) // let the worker's graceful exit finish its cleanup
    const after = await editorTmpEntries()
    const job = await getEditorJob(projectId)
    check('T2 sweep run completed and reported the orphans it removed',
      proj.status === 'completed' && (job?.result?.swept_orphan_dirs ?? 0) >= leftovers.length,
      `swept=${job?.result?.swept_orphan_dirs} expected>=${leftovers.length}`)
    check('T3 editor temp root is EMPTY after sweep + own cleanup', after.length === 0, JSON.stringify(after))
  }

  // =================================================================
  stopAllWorkers()
  console.log(`\n==== PHASE 3 RESULT: ${passed} passed, ${failures.length} failed ====`)
  if (failures.length) {
    for (const f of failures) console.log(`  FAILED: ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  stopAllWorkers()
  console.error('phase3 harness crashed:', err)
  process.exit(1)
})
