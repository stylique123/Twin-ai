// Editor v2 Phase 1 — staging integration matrix.
//
// Runs the REAL chain against the dedicated staging Supabase project:
//   client → source-asset edge fn → signed Storage PUT → finalize (atomic RPC)
//   → validate_source job → REAL worker process (ffprobe) → ready | rejected
//   → editor_link_ready_source → generations.source_asset_id → DB-first recovery
//
// Sections mirror the Phase-1 gate review:
//   T1/T2 record & upload happy paths (webm + mp4) with exact accounting
//   T3    refresh recovery at every stage (fresh sessions, no local state)
//   T4    second-device recovery + signed playback
//   T5    concurrent duplicate submission (create / full flow / finalize)
//   T6    signed-upload lifecycle (path-bound token, missing object, tiny file,
//         post-finalize overwrite → bytes_changed_after_finalize, expiry bound,
//         no re-issued token once ready)
//   T7    real media matrix (valid, VFR, rotated, corrupt, no-video, no-audio,
//         8K, too short, too long, oversized-claim)
//   T8    worker SIGKILL mid-job → lease reclaim → converges to ONE final state
//   T9    retake race through the real worker (old take finishing late loses)
//   T10   owner / peer / unrelated / anonymous — rows AND storage playback
//   Caps  open-asset cap + per-user rate limit
//
// Each section runs as its OWN user where call volume matters — the per-user
// rate limit (30/min) is itself under test and must not trip incidentally.
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

// ---------- tiny check framework ----------
let passed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${name}  ${detail}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- identities ----------
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

// ---------- edge fn + storage helpers ----------
async function edge(client, body) {
  const { data: { session } } = await client.auth.getSession()
  const res = await fetch(`${URL}/functions/v1/source-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const createIntent = (client, genId, attemptId, contentType, sizeBytes) =>
  edge(client, { action: 'create', capture: { origin: 'upload', recording_script_sha256: null, recorder_clock: 'none', accepted_segments: [] }, generation_id: genId, recording_attempt_id: attemptId, content_type: contentType, size_bytes: sizeBytes })
const finalize = (client, assetId) => edge(client, { action: 'finalize', asset_id: assetId })

async function putSigned(signedUrl, buf, contentType) {
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': contentType }, body: buf })
  return res.status
}

// The full client flow (what the browser runs): intent → signed PUT → finalize.
async function fullFlow(client, genId, attemptId, buf, contentType) {
  const c = await createIntent(client, genId, attemptId, contentType, buf.byteLength)
  if (c.status !== 200) throw new Error(`create ${c.status}: ${JSON.stringify(c.body)}`)
  if (c.body.status === 'ready') return { intent: c.body, finalizeStatus: 200 }
  const p = await putSigned(c.body.signedUrl, buf, contentType)
  if (p >= 300) throw new Error(`signed PUT ${p}`)
  const f = await finalize(client, c.body.assetId)
  return { intent: c.body, finalizeStatus: f.status, finalizeBody: f.body }
}

async function assetRow(id) {
  const { data } = await admin.from('media_assets').select('*').eq('id', id).maybeSingle()
  return data
}
async function waitTerminal(assetId, timeoutMs = 180_000) {
  const start = Date.now()
  for (;;) {
    const a = await assetRow(assetId)
    if (a && (a.status === 'ready' || a.status === 'rejected')) return a
    if (Date.now() - start > timeoutMs) return a
    await sleep(1500)
  }
}
async function jobsFor(assetId) {
  const { data } = await admin.from('jobs').select('id, status, attempts, dedup_key').like('dedup_key', `validate_source:${assetId}:%`)
  return data ?? []
}
async function objectCount(prefix) {
  const { data, error } = await admin.storage.from('takes').list(prefix, { limit: 100 })
  if (error) return -1
  return (data ?? []).length
}
async function genRow(id) {
  const { data } = await admin.from('generations').select('id, source_asset_id, take_path').eq('id', id).maybeSingle()
  return data
}

// ---------- the real worker process ----------
let worker = null
function startWorker() {
  worker = spawn('node', ['dist/index.js'], {
    cwd: 'worker',
    env: {
      ...process.env,
      SUPABASE_URL: URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      WORKER_JOB_TYPES: 'validate_source',
      WORKER_POLL_MS: '500',
      WORKER_VISIBILITY_SECS: '20',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  worker.stdout.on('data', (d) => process.stdout.write(`[worker] ${d}`))
  worker.stderr.on('data', (d) => process.stderr.write(`[worker!] ${d}`))
}
function killWorker(signal = 'SIGKILL') {
  if (worker) { worker.kill(signal); worker = null }
}

// ---------- fixtures ----------
async function makeFixtures(dir) {
  const ff = (args) => execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 300_000 })
  const out = {}
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libvorbis', '-shortest', join(dir, 'portrait.webm')])
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'landscape.mp4')])
  // Variable frame rate: shove timestamps around and keep them (vsync vfr).
  await ff(['-i', join(dir, 'landscape.mp4'), '-vf', "setpts='PTS+if(gt(N,90),0.4/TB,0)'", '-vsync', 'vfr',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', join(dir, 'vfr.mp4')])
  // Rotated phone video: display-matrix rotation, stream copy (ffmpeg 5+).
  await ff(['-display_rotation', '90', '-i', join(dir, 'landscape.mp4'), '-c', 'copy', join(dir, 'rotated.mp4')])
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'tooshort.mp4')])
  await ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'aac', join(dir, 'audioonly.mp4')])
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=640x1138:rate=30:duration=6', '-c:v', 'libvpx', '-b:v', '400k', '-an', join(dir, 'noaudio.webm')])
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=7680x4320:rate=2:duration=1.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', join(dir, 'bigres.mp4')])
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=1:duration=1860', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', join(dir, 'toolong.mp4')])
  // Big-ish valid file so the SIGKILL test reliably catches the job mid-flight.
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=8',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '5', '-c:a', 'aac', '-shortest', join(dir, 'slow.mp4')])
  for (const f of ['portrait.webm', 'landscape.mp4', 'vfr.mp4', 'rotated.mp4', 'tooshort.mp4', 'audioonly.mp4', 'noaudio.webm', 'bigres.mp4', 'toolong.mp4', 'slow.mp4']) {
    out[f] = await readFile(join(dir, f))
  }
  // Corrupt: the first 30% of an mp4 whose moov atom lives at the end.
  out['corrupt.mp4'] = out['landscape.mp4'].subarray(0, Math.floor(out['landscape.mp4'].byteLength * 0.3))
  return out
}

// =====================================================================
async function main() {
  console.log('== setup: identities, generations, fixtures ==')
  const dir = await mkdtemp(join(tmpdir(), 'phase1-fixtures-'))
  const [fix, owner, ownerT3, ownerT6, matrixOwner, raceOwner, capsUser, peer, outsider] = await Promise.all([
    makeFixtures(dir), makeUser('owner'), makeUser('t3'), makeUser('t6'),
    makeUser('matrix'), makeUser('race'), makeUser('caps'), makeUser('peer'), makeUser('outsider'),
  ])
  {
    const { error } = await admin.from('workspace_members').insert({ owner_id: owner.id, member_id: peer.id })
    if (error) throw new Error(`workspace_members: ${error.message}`)
  }
  const cOwner = await login(owner.email)
  const cT3 = await login(ownerT3.email)
  const cT6 = await login(ownerT6.email)
  const cMatrix = await login(matrixOwner.email)
  const cRace = await login(raceOwner.email)
  const cCaps = await login(capsUser.email)
  const cPeer = await login(peer.email)
  const cOutsider = await login(outsider.email)
  const cAnon = createClient(URL, ANON, { auth: { persistSession: false } })

  const webm = fix['portrait.webm']
  const mp4 = fix['landscape.mp4']

  // ---------- Phase A: everything that must run with NO worker ----------
  console.log('== T5: concurrent duplicate submission (endpoint-level, same attempt) ==')
  const genT1 = await newGen(owner.id)
  const attemptT1 = randomUUID()
  let assetT1
  {
    // 5 concurrent creates for the SAME attempt: every response must be a
    // SUCCESS (idempotent convergence at the endpoint, not a surfaced
    // conflict), one asset row total.
    const results = await Promise.all(Array.from({ length: 5 }, () => createIntent(cOwner, genT1, attemptT1, 'video/webm', webm.byteLength)))
    check('T5a concurrent creates all succeed (no conflict surfaced)', results.every((r) => r.status === 200),
      results.map((r) => r.status).join(','))
    const ids = new Set(results.map((r) => r.body.assetId))
    check('T5a concurrent creates converge on ONE asset id', ids.size === 1, [...ids].join(','))
    const { count } = await admin.from('media_assets').select('id', { count: 'exact', head: true }).eq('recording_attempt_id', attemptT1)
    check('T5a exactly one media_assets row for the attempt', count === 1, `count=${count}`)
    assetT1 = results[0].body.assetId
  }
  {
    // Full flow ×3 concurrently (double-click / two tabs): same asset, same
    // path, ONE job — the SAME attempt id is the contract.
    const flows = await Promise.all(Array.from({ length: 3 }, () => fullFlow(cOwner, genT1, attemptT1, webm, 'video/webm')))
    check('T5b concurrent full flows all succeed', flows.every((f) => f.finalizeStatus === 200), flows.map((f) => f.finalizeStatus).join(','))
    check('T5b one storage path', new Set(flows.map((f) => f.intent.path)).size === 1)
    check('T5b exactly one validation job (v1)', (await jobsFor(assetT1)).length === 1)
    const fins = await Promise.all(Array.from({ length: 5 }, () => finalize(cOwner, assetT1)))
    check('T5c repeated concurrent finalize all succeed', fins.every((f) => f.status === 200), fins.map((f) => f.status).join(','))
    check('T5c still exactly one job', (await jobsFor(assetT1)).length === 1)
  }

  console.log('== T3 (a-c): refresh recovery pre-validation — fresh sessions, same attempt ==')
  const genT3 = await newGen(ownerT3.id)
  const attemptT3 = randomUUID()
  {
    // (a) refresh BEFORE upload: intent from session 1, everything again from session 2.
    const s1 = await createIntent(cT3, genT3, attemptT3, 'video/webm', webm.byteLength)
    const fresh1 = await login(ownerT3.email) // "refresh" = brand-new session, zero local state
    const s2 = await createIntent(fresh1, genT3, attemptT3, 'video/webm', webm.byteLength)
    check('T3a re-create after refresh returns the SAME asset', s1.body.assetId === s2.body.assetId,
      `${s1.body.assetId} vs ${s2.body.assetId}`)
    // (b) refresh DURING upload: PUT with a re-issued token from a third session.
    const fresh2 = await login(ownerT3.email)
    const s3 = await createIntent(fresh2, genT3, attemptT3, 'video/webm', webm.byteLength)
    const p = await putSigned(s3.body.signedUrl, webm, 'video/webm')
    check('T3b re-issued token re-uploads the same object', p < 300, `status=${p}`)
    // (c) refresh AFTER upload, BEFORE finalize: finalize from yet another session.
    const fresh3 = await login(ownerT3.email)
    const f = await finalize(fresh3, s1.body.assetId)
    check('T3c finalize from a fresh session succeeds', f.status === 200, JSON.stringify(f.body))
    check('T3c exactly one job after the whole dance', (await jobsFor(s1.body.assetId)).length === 1)
    const { count } = await admin.from('media_assets').select('id', { count: 'exact', head: true }).eq('recording_attempt_id', attemptT3)
    check('T3c exactly one asset row', count === 1, `count=${count}`)
  }

  console.log('== T6 (a-f): signed-upload lifecycle ==')
  let assetT6f, genT6f
  {
    // (a) token is bound to its exact path — try it against another object name.
    const genX = await newGen(ownerT6.id)
    const x = await createIntent(cT6, genX, randomUUID(), 'video/webm', webm.byteLength)
    const otherPath = x.body.signedUrl.replace(x.body.path.split('/').pop(), 'forged-object.webm')
    const forged = await fetch(otherPath, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': 'video/webm' }, body: webm })
    check('T6a token refuses a different object path', forged.status >= 400, `status=${forged.status}`)
    // (b) ...including a path under ANOTHER user's prefix.
    const token = new URLSearchParams(x.body.signedUrl.split('?')[1]).get('token')
    const crossPath = `${URL}/storage/v1/object/upload/sign/takes/${outsider.id}/x/y.webm?token=${token}`
    const cross = await fetch(crossPath, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': 'video/webm' }, body: webm })
    check("T6b token refuses another user's path", cross.status >= 400, `status=${cross.status}`)
    // (c) finalize refuses a missing object.
    const f1 = await finalize(cT6, x.body.assetId)
    check('T6c finalize refuses when no object exists', f1.status === 409, `status=${f1.status}`)
    // (d) finalize checks the REAL uploaded bytes, not the claimed size.
    const pt = await putSigned(x.body.signedUrl, Buffer.alloc(700, 1), 'video/webm')
    const f2 = await finalize(cT6, x.body.assetId)
    check('T6d finalize refuses a sub-minimum object', pt < 300 && f2.status === 409, `put=${pt} fin=${f2.status}`)
    // (e) token expiry is bounded (platform signs a JWT with exp ≈ 2h).
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      const lifeSecs = payload.exp - Math.floor(Date.now() / 1000)
      check('T6e upload token expiry is bounded (≤ 2h05m)', lifeSecs > 0 && lifeSecs <= 7500, `life=${lifeSecs}s`)
    } catch { check('T6e upload token expiry is bounded (≤ 2h05m)', false, 'token not decodable') }
    // (f) THE replay: overwrite the object with DIFFERENT bytes after finalize,
    // while the token is still valid. The validator must reject it later.
    genT6f = await newGen(ownerT6.id)
    const c = await createIntent(cT6, genT6f, randomUUID(), 'video/webm', webm.byteLength)
    assetT6f = c.body.assetId
    await putSigned(c.body.signedUrl, webm, 'video/webm')
    const f = await finalize(cT6, assetT6f)
    check('T6f setup: finalize ok', f.status === 200)
    const replay = await putSigned(c.body.signedUrl, fix['noaudio.webm'], 'video/webm')
    check('T6f replayed token still writes the object (the attack is real)', replay < 300, `status=${replay}`)
  }

  console.log('== T2 setup: landscape mp4 flow enqueued ==')
  const genT2 = await newGen(owner.id)
  const t2 = await fullFlow(cOwner, genT2, randomUUID(), mp4, 'video/mp4')
  const assetT2 = t2.intent.assetId
  check('T2 create+upload+finalize (mp4) succeeded', t2.finalizeStatus === 200)

  console.log('== Caps: open-asset cap + per-user rate limit ==')
  {
    const capsGen = await newGen(capsUser.id)
    const statuses = []
    for (let i = 0; i < 6; i++) statuses.push((await createIntent(cCaps, capsGen, randomUUID(), 'video/webm', webm.byteLength)).status)
    check('Caps: 6th open source asset refused (429)', statuses.slice(0, 5).every((s) => s === 200) && statuses[5] === 429, statuses.join(','))
    // Rate limit: hammer the SAME attempt (existing-asset path mints nothing new).
    let sawRateLimit = false
    const oneAttempt = randomUUID()
    for (let i = 0; i < 32 && !sawRateLimit; i++) {
      const r = await createIntent(cCaps, capsGen, oneAttempt, 'video/webm', webm.byteLength)
      if (r.status === 429 && String(r.body.error ?? '').includes('few seconds')) sawRateLimit = true
    }
    check('Caps: per-user rate limit trips within the window', sawRateLimit)
  }

  console.log('== T7-oversize: 700MB claim refused at create ==')
  {
    const g = await newGen(matrixOwner.id)
    const r = await createIntent(cMatrix, g, randomUUID(), 'video/mp4', 700 * 1024 * 1024)
    check('T7-oversize refused (400)', r.status === 400, `status=${r.status}`)
  }

  const matrix = [
    ['portrait.webm', 'video/webm', 'ready', null],
    ['landscape-2.mp4', 'video/mp4', 'ready', null, 'landscape.mp4'],
    ['vfr.mp4', 'video/mp4', 'ready', null],
    ['rotated.mp4', 'video/mp4', 'ready', null],
    ['corrupt.mp4', 'video/mp4', 'rejected', /probe_failed|no_video_stream|download_failed/],
    ['tooshort.mp4', 'video/mp4', 'rejected', /too_short/],
    ['audioonly.mp4', 'video/mp4', 'rejected', /no_video_stream/],
    ['noaudio.webm', 'video/webm', 'ready', null],
    ['bigres.mp4', 'video/mp4', 'rejected', /resolution_too_high/],
    ['toolong.mp4', 'video/mp4', 'rejected', /too_long/],
  ]
  // ---------- Phase B: start the REAL worker ----------
  console.log('== starting the real worker (ffprobe) ==')
  startWorker()

  console.log('== T7 setup: media matrix enqueued (paced under the open-asset cap) ==')
  // 10 fixtures against a 5-open-asset cap: the worker drains validations while
  // we submit, and we wait for headroom before each create — the cap itself is
  // covered by the dedicated Caps section above.
  async function waitOpenBelow(ownerId, n, timeoutMs = 180_000) {
    const start = Date.now()
    for (;;) {
      const { count } = await admin.from('media_assets').select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId).eq('kind', 'source').in('status', ['uploading', 'validating'])
      if ((count ?? 0) < n) return
      if (Date.now() - start > timeoutMs) throw new Error(`open-asset headroom never appeared (count=${count})`)
      await sleep(1000)
    }
  }
  const matrixAssets = []
  for (const row of matrix) {
    const [label, ct, , , srcName] = row
    const buf = fix[srcName ?? label]
    const g = await newGen(matrixOwner.id)
    try {
      await waitOpenBelow(matrixOwner.id, 5)
      const r = await fullFlow(cMatrix, g, randomUUID(), buf, ct)
      matrixAssets.push({ label, assetId: r.intent.assetId, gen: g, expect: row[2], codeRe: row[3] })
    } catch (e) {
      matrixAssets.push({ label, assetId: null, gen: g, expect: row[2], codeRe: row[3], setupError: String(e) })
    }
  }

  console.log('== T1: record-equivalent portrait webm → ready, exact accounting ==')
  {
    const a = await waitTerminal(assetT1)
    check('T1 asset becomes ready', a?.status === 'ready', `status=${a?.status} ${JSON.stringify(a?.metadata ?? {})}`)
    check('T1 integer-ms duration measured', Number.isInteger(a?.duration_ms) && a.duration_ms > 5000 && a.duration_ms < 7500, `ms=${a?.duration_ms}`)
    check('T1 sha256 recorded', typeof a?.content_sha256 === 'string' && a.content_sha256.length === 64)
    check('T1 has_audio true', a?.has_audio === true)
    const g = await genRow(genT1)
    check('T1 generation.source_asset_id set', g?.source_asset_id === assetT1)
    check('T1 take_path is the compatibility projection', g?.take_path === a?.storage_path)
    const jobs = await jobsFor(assetT1)
    check('T1 exactly one validation job, done', jobs.length === 1 && jobs[0].status === 'done', JSON.stringify(jobs))
    const objs = await objectCount(`${owner.id}/${genT1}`)
    check('T1 exactly one storage object', objs === 1, `objects=${objs}`)
    const { count } = await admin.from('media_assets').select('id', { count: 'exact', head: true }).eq('generation_id', genT1)
    check('T1 exactly one asset row for the generation', count === 1, `count=${count}`)
  }

  console.log('== T2: upload-equivalent landscape mp4 → ready ==')
  {
    const a = await waitTerminal(assetT2)
    check('T2 mp4 becomes ready', a?.status === 'ready', `status=${a?.status} ${JSON.stringify(a?.metadata ?? {})}`)
    check('T2 dimensions measured', a?.width === 1280 && a?.height === 720, `${a?.width}x${a?.height}`)
    const g = await genRow(genT2)
    check('T2 generation pointer set', g?.source_asset_id === assetT2)
  }

  console.log('== T6f: post-finalize overwrite is REFUSED by the validator ==')
  {
    const a = await waitTerminal(assetT6f)
    check('T6f swapped bytes → rejected', a?.status === 'rejected', `status=${a?.status}`)
    check('T6f rejection code is bytes_changed_after_finalize',
      a?.metadata?.rejection_code === 'bytes_changed_after_finalize', JSON.stringify(a?.metadata ?? {}))
  }

  console.log('== T3 (d-f): refresh during validation / after ready / cleared local state ==')
  {
    const g = await newGen(ownerT3.id)
    const at = randomUUID()
    const r = await fullFlow(cT3, g, at, webm, 'video/webm')
    // (d) "refresh during validation": a brand-new session sees the in-flight
    // status via the database alone.
    const freshMid = await login(ownerT3.email)
    const { data: midRow } = await freshMid.from('media_assets').select('id,status').eq('id', r.intent.assetId).maybeSingle()
    check('T3d fresh session sees the in-flight asset via DB', !!midRow && ['validating', 'ready'].includes(midRow.status), JSON.stringify(midRow))
    const done = await waitTerminal(r.intent.assetId)
    check('T3d that take completes', done?.status === 'ready', `status=${done?.status}`)
    // (e) "after ready, local storage cleared": DB-first recovery — newest ready
    // source for the generation, zero local state consulted.
    const freshLater = await login(ownerT3.email)
    const { data: rec } = await freshLater
      .from('media_assets').select('*')
      .eq('generation_id', g).eq('kind', 'source').eq('status', 'ready')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    check('T3e DB-first recovery finds the ready source with zero local state', rec?.id === r.intent.assetId)
    // (f) create on a ready attempt reports ready and re-issues NO write token.
    const again = await createIntent(freshLater, g, at, 'video/webm', webm.byteLength)
    check('T3f create on a ready attempt reports ready with no token', again.status === 200 && again.body.status === 'ready' && again.body.token === null, JSON.stringify(again.body))
  }

  console.log('== T4: second device ==')
  {
    const device2 = await login(owner.email) // separate session = separate device
    const g = await genRow(genT1)
    const { data: viaDb } = await device2.from('media_assets').select('*').eq('id', g.source_asset_id).maybeSingle()
    check('T4 second device resolves generation → ready source', viaDb?.status === 'ready')
    const { count } = await admin.from('media_assets').select('id', { count: 'exact', head: true }).eq('generation_id', genT1)
    check('T4 no duplicate asset from the second device', count === 1)
    const { data: signed, error: signErr } = await device2.storage.from('takes').createSignedUrl(viaDb.storage_path, 120)
    check('T4 second device can sign the source for playback', !signErr && !!signed?.signedUrl, signErr?.message)
    if (signed?.signedUrl) {
      const play = await fetch(signed.signedUrl)
      check('T4 signed playback fetch works', play.status === 200 && Number(play.headers.get('content-length')) > 10_000, `status=${play.status}`)
    }
  }

  console.log('== T6g: once ready, no write path exists for the object ==')
  {
    const before = await assetRow(assetT1)
    const again = await createIntent(cOwner, genT1, attemptT1, 'video/webm', webm.byteLength)
    check('T6g no upload token is ever re-issued for a ready asset', again.status === 200 && again.body.token === null && again.body.status === 'ready', JSON.stringify(again.body))
    const after = await assetRow(assetT1)
    check('T6g asset row unchanged (status, sha)', after.status === 'ready' && after.content_sha256 === before.content_sha256)
  }

  console.log('== T7: media matrix results ==')
  for (const m of matrixAssets) {
    if (!m.assetId) { check(`T7 ${m.label} setup`, false, m.setupError); continue }
    const a = await waitTerminal(m.assetId, 240_000)
    if (m.expect === 'ready') {
      check(`T7 ${m.label} → ready`, a?.status === 'ready', `status=${a?.status} ${JSON.stringify(a?.metadata ?? {})}`)
    } else {
      const code = a?.metadata?.rejection_code ?? ''
      check(`T7 ${m.label} → rejected (${m.codeRe})`, a?.status === 'rejected' && m.codeRe.test(code), `status=${a?.status} code=${code}`)
    }
  }
  {
    const rot = matrixAssets.find((m) => m.label === 'rotated.mp4')
    const a = rot?.assetId ? await assetRow(rot.assetId) : null
    check('T7 rotated.mp4 rotation detected', !!a && a.rotation !== 0 && a.rotation != null, `rotation=${a?.rotation}`)
    const na = matrixAssets.find((m) => m.label === 'noaudio.webm')
    const naRow = na?.assetId ? await assetRow(na.assetId) : null
    check('T7 noaudio ready but has_audio=false', naRow?.status === 'ready' && naRow?.has_audio === false)
    check('T7 noaudio flagged editor_eligible=false (no-audio policy)', naRow?.metadata?.editor_eligible === false, JSON.stringify(naRow?.metadata ?? {}))
    const vfr = matrixAssets.find((m) => m.label === 'vfr.mp4')
    const vfrRow = vfr?.assetId ? await assetRow(vfr.assetId) : null
    check('T7 vfr duration is a sane integer ms', !!vfrRow && Number.isInteger(vfrRow.duration_ms) && vfrRow.duration_ms > 4000, `ms=${vfrRow?.duration_ms}`)
  }

  console.log('== T8: worker SIGKILL mid-job → lease reclaim → one final state ==')
  {
    killWorker('SIGKILL') // stop the healthy worker between jobs
    await sleep(1000)
    const g = await newGen(raceOwner.id)
    const r = await fullFlow(cRace, g, randomUUID(), fix['slow.mp4'], 'video/mp4')
    startWorker()
    let claimed = null
    for (let i = 0; i < 60 && !claimed; i++) {
      const [j] = await jobsFor(r.intent.assetId)
      if (j && j.status !== 'queued') claimed = j
      else await sleep(250)
    }
    check('T8 job was claimed', !!claimed, 'never left queued')
    killWorker('SIGKILL')
    const [afterKill] = await jobsFor(r.intent.assetId)
    const dangling = afterKill?.status === 'running'
    check('T8 job left dangling in running after SIGKILL', dangling, `status=${afterKill?.status} (completed before the kill — timing)`)
    startWorker()
    const a = await waitTerminal(r.intent.assetId, 240_000)
    check('T8 asset converges to ONE terminal state (ready)', a?.status === 'ready', `status=${a?.status}`)
    // The asset flips ready a beat BEFORE complete_job marks the job done —
    // give the job row a moment to settle instead of racing it.
    let jobs = await jobsFor(r.intent.assetId)
    for (let i = 0; i < 15 && jobs[0]?.status !== 'done'; i++) { await sleep(1000); jobs = await jobsFor(r.intent.assetId) }
    check('T8 still exactly one job row (re-claimed, not duplicated)', jobs.length === 1 && jobs[0].status === 'done', JSON.stringify(jobs))
    if (dangling) check('T8 attempts > 1 proves the reclaim happened', (jobs[0]?.attempts ?? 0) >= 2, `attempts=${jobs[0]?.attempts}`)
    const gen = await genRow(g)
    check('T8 exactly one generation link', gen?.source_asset_id === r.intent.assetId)
  }

  console.log('== T9: retake race through the real worker ==')
  {
    const g = await newGen(raceOwner.id)
    // Take A: created FIRST (older seq), uploaded, but its finalize is DELAYED —
    // the exact "slow validation finishing late" shape.
    const attemptA = randomUUID()
    const cA = await createIntent(cRace, g, attemptA, 'video/webm', webm.byteLength)
    await putSigned(cA.body.signedUrl, webm, 'video/webm')
    // Take B: full flow now → validates and links while A is still unfinalized.
    const rB = await fullFlow(cRace, g, randomUUID(), mp4, 'video/mp4')
    const b = await waitTerminal(rB.intent.assetId)
    check('T9 newer take B becomes ready first', b?.status === 'ready', `status=${b?.status}`)
    // The ready flip and the generation link are two consecutive statements
    // in the worker — poll briefly rather than racing the gap between them.
    let genAfterB = await genRow(g)
    for (let i = 0; i < 25 && genAfterB?.source_asset_id !== rB.intent.assetId; i++) {
      await sleep(400)
      genAfterB = await genRow(g)
    }
    check('T9 generation links to B', genAfterB?.source_asset_id === rB.intent.assetId,
      `points to ${genAfterB?.source_asset_id}`)
    // Now A finishes late.
    const fA = await finalize(cRace, cA.body.assetId)
    check('T9 old take A finalize still succeeds', fA.status === 200, JSON.stringify(fA.body))
    const a = await waitTerminal(cA.body.assetId)
    check('T9 old take A validates to ready', a?.status === 'ready', `status=${a?.status}`)
    const genFinal = await genRow(g)
    check('T9 THE RACE: generation still points to newer take B', genFinal?.source_asset_id === rB.intent.assetId,
      `points to ${genFinal?.source_asset_id}`)
    check('T9 take_path still projects B', genFinal?.take_path === b?.storage_path)
  }

  console.log('== T10: access matrix through real sessions (rows AND storage) ==')
  {
    const t1 = await assetRow(assetT1)
    const { data: ownerRows } = await cOwner.from('media_assets').select('id').eq('id', assetT1)
    check('T10 owner sees the asset row', (ownerRows ?? []).length === 1)
    const { data: peerRows } = await cPeer.from('media_assets').select('id').eq('id', assetT1)
    check('T10 workspace peer sees the asset row', (peerRows ?? []).length === 1)
    const { data: outRows } = await cOutsider.from('media_assets').select('id').eq('id', assetT1)
    check('T10 unrelated user sees NOTHING', (outRows ?? []).length === 0)
    const anonRes = await cAnon.from('media_assets').select('id').eq('id', assetT1)
    check('T10 anonymous is denied at the table', anonRes.error !== null || (anonRes.data ?? []).length === 0,
      anonRes.error ? anonRes.error.message : 'rows=0')
    const { data: sOwn, error: eOwn } = await cOwner.storage.from('takes').createSignedUrl(t1.storage_path, 120)
    check('T10 owner can sign playback', !eOwn && !!sOwn?.signedUrl, eOwn?.message)
    const { data: sPeer, error: ePeer } = await cPeer.storage.from('takes').createSignedUrl(t1.storage_path, 120)
    check('T10 peer can sign playback', !ePeer && !!sPeer?.signedUrl, ePeer?.message)
    const { data: sOut, error: eOut } = await cOutsider.storage.from('takes').createSignedUrl(t1.storage_path, 120)
    check('T10 outsider cannot sign', !!eOut || !sOut?.signedUrl)
    const { data: sAnon, error: eAnon } = await cAnon.storage.from('takes').createSignedUrl(t1.storage_path, 120)
    check('T10 anonymous cannot sign', !!eAnon || !sAnon?.signedUrl)
    const { data: { session: outSess } } = await cOutsider.auth.getSession()
    const direct = await fetch(`${URL}/storage/v1/object/authenticated/takes/${t1.storage_path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${outSess.access_token}` },
    })
    check('T10 outsider direct object download refused', direct.status >= 400, `status=${direct.status}`)
  }

  killWorker('SIGTERM')

  console.log('\n==============================================')
  console.log(`PASSED: ${passed}   FAILED: ${failures.length}`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  console.log('==============================================')
  if (failures.length > 0) process.exit(1)
}

main().then(
  () => { killWorker(); process.exit(0) },
  (e) => { console.error('HARNESS ERROR:', e); killWorker(); process.exit(1) },
)
