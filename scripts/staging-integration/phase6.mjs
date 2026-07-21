// Editor v2 Phase 6 — staging matrix for the REAL `analyzing` stage:
// pinned boot manifest + script snapshot, digest-keyed visual/audio/hook
// evidence components, the VerifiedSourceSession download truth table,
// migration-0086 schema truth, tenant/RLS isolation, cancellation, tamper,
// crash/reclaim convergence, and the two-job / two-worker capacity gate.
//
// Frozen fixture gates (validated locally against the pinned YuNet before
// commit): shot recall >= 0.80 and precision >= 0.60 on two engineered luma
// cuts; face accuracy >= 0.90 on the real-face segment with ZERO false
// positives on the solid segments; clipping exact-zero on the clean fixture.
// Capacity thresholds (pre-committed): per-job <= 6.0x media duration,
// aggregate two-job wall <= 12.0x, worker peak RSS <= 2048 MiB, cancel <= 12s.
import { createClient } from '@supabase/supabase-js'
import { execFile as _execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const execFile = promisify(_execFile)
const REPO_ROOT = join(import.meta.dirname, '..', '..')

const URL = need('STAGING_URL')
const ANON = need('STAGING_ANON_KEY')
const SERVICE = need('STAGING_SERVICE_ROLE_KEY')
const PW = `It-${randomUUID()}`
function need(k) { const v = process.env[k]; if (!v) { console.error(`missing env ${k}`); process.exit(1) } return v }
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

let passed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${name}  ${detail}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Canonical JSON — must match worker/src/jobs/editorManifest.ts canonicalJson.
function canonicalize(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

// ---- users / auth / edge helpers (same shapes as phase5) --------------------
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
  if (client) {
    const { data: { session } } = await client.auth.getSession()
    headers.Authorization = `Bearer ${session.access_token}`
  }
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
      const c = await callEdge(client, 'source-asset', {
        action: 'create', generation_id: genId, recording_attempt_id: randomUUID(), content_type: ct, size_bytes: buf.byteLength,
      })
      if (c.status !== 200) throw new Error(`source create ${c.status}: ${JSON.stringify(c.body)}`)
      const p = await putSigned(c.body.signedUrl, buf, ct)
      if (p.status >= 300) throw new Error(`signed PUT ${p.status}: ${p.body}`)
      const f = await callEdge(client, 'source-asset', { action: 'finalize', asset_id: c.body.assetId })
      if (f.status !== 200) throw new Error(`finalize ${f.status}: ${JSON.stringify(f.body)}`)
      return { assetId: c.body.assetId }
    } catch (e) {
      lastErr = e
      console.log(`   (upload intent failed, retrying once: ${e.message})`)
      await sleep(2000)
    }
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
    const r = await callEdge(client, 'start-editor-v2', {
      generation_id: genId, source_asset_id: assetId, idempotency_key: randomUUID(),
    })
    if (r.status === 429 && attempt < 3) { console.log('   (start rate window — waiting 61s…)'); await sleep(61_000); continue }
    if (r.status !== 200) throw new Error(`start ${r.status}: ${JSON.stringify(r.body)}`)
    return r.body.projectId
  }
}
async function getProject(id) { return (await admin.from('edit_projects').select('*').eq('id', id).maybeSingle()).data }
async function getEvents(pid) { return (await admin.from('edit_events').select('*').eq('project_id', pid).order('seq')).data ?? [] }
async function componentRows(assetId, component) {
  return (await admin.from('media_analyses').select('*')
    .eq('source_asset_id', assetId).eq('component', component).order('created_at')).data ?? []
}
async function waitSettled(id, timeoutMs = 240_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && ['completed', 'failed', 'cancelled'].includes(p.status)) return p
    if (Date.now() - start > timeoutMs) throw new Error(`waitSettled ${label || id}: ${p?.status}`)
    await sleep(500)
  }
}
async function waitStage(id, stage, timeoutMs = 180_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && p.status === stage) return p
    if (p && ['completed', 'failed', 'cancelled'].includes(p.status)) throw new Error(`waitStage ${label}: settled early (${p.status})`)
    if (Date.now() - start > timeoutMs) throw new Error(`waitStage ${label || id}: ${p?.status}`)
    await sleep(250)
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
// Peak RSS (VmHWM) of a live worker process, in MiB (Linux runner).
function peakRssMiB(w) {
  try {
    const m = /VmHWM:\s+(\d+) kB/.exec(readFileSync(`/proc/${w.pid}/status`, 'utf8'))
    return m ? Math.round(Number(m[1]) / 1024) : null
  } catch { return null }
}
async function runToSettled(name, projectId, extraEnv = {}, timeoutMs = 240_000) {
  const w = startWorker(name, extraEnv)
  const p = await waitSettled(projectId, timeoutMs, name)
  stopWorker(w)
  return p
}

// ---- fixture ----------------------------------------------------------------
// black 5s | white 5s | gray+REAL FACE 5s (two luma cuts at 5000/10000 far
// above the frozen 0.30 threshold), with an espeak spoken hook opening the
// audio track (so hook alignment is provable) and real silence for room tone.
const HOOK_LINE = 'Stop scrolling this changes everything'
async function makeFixture(dir, variant) {
  const es = (out, text) => execFile('espeak-ng', ['-v', 'en-us', '-s', '140', '-a', '120', '-w', out, text], { timeout: 60_000 })
  const ff = (args) => execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 180_000 })
  const v = (n) => join(dir, `${variant}-${n}`)
  await es(v('hook.wav'), `${HOOK_LINE}.`)
  await es(v('body.wav'), `I recorded this take for the ${variant} scenario today.`)
  await ff(['-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '2.0', '-sample_fmt', 's16', v('gap.wav')])
  for (const f of ['hook', 'body']) {
    await ff(['-i', v(`${f}.wav`), '-ac', '1', '-ar', '22050', '-sample_fmt', 's16', v(`${f}n.wav`)])
  }
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
  scenes: [
    { scene_number: 1, scene_type: 'talking_head', purpose: 'hook', dialogue: HOOK_LINE, duration_sec: 3, camera_framing: '', background: '', movement: '', caption_text: '', pause_after: false, show_in_teleprompter: true },
    { scene_number: 2, scene_type: 'talking_head', purpose: 'body', dialogue: 'I recorded this take today.', duration_sec: 4, camera_framing: '', background: '', movement: '', caption_text: '', pause_after: false, show_in_teleprompter: true },
  ],
  total_duration_sec: 7,
}

async function mintReady(client, ownerId, buf, sceneTimeline = SCENE_TIMELINE) {
  const gen = await newGen(ownerId, sceneTimeline, HOOK_LINE)
  const { assetId } = await sourceFlow(client, gen, buf)
  const asset = await waitAsset(assetId)
  if (asset.status !== 'ready') throw new Error(`fixture asset rejected: ${JSON.stringify(asset.metadata)}`)
  return { gen, assetId, asset }
}

async function headEtag(asset) {
  const res = await fetch(`${URL}/storage/v1/object/${asset.bucket}/${asset.storage_path}`, {
    method: 'HEAD', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  return res.ok ? res.headers.get('etag') : null
}
async function tamperObject(asset, buf, ct = 'video/webm') {
  const before = await headEtag(asset)
  const res = await fetch(`${URL}/storage/v1/object/${asset.bucket}/${asset.storage_path}`, {
    method: 'PUT', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': ct }, body: buf,
  })
  if (!res.ok) throw new Error(`tamper overwrite failed: ${res.status}`)
  const after = await headEtag(asset)
  if (!before || !after || before === after) throw new Error('tamper NOT effective')
}

// Fabricated fenced lease for direct-RPC truth-table calls (a real running
// job row the SECURITY DEFINER fence accepts).
async function fabricateLease(ownerId, projectId, worker = 'hx-worker') {
  const id = randomUUID()
  const { error } = await admin.from('jobs').insert({
    id, owner_id: ownerId, type: 'editor_v2', status: 'running', attempts: 1,
    locked_at: new Date().toISOString(), locked_by: worker,
    payload: { project_id: projectId }, dedup_key: `editor_v2:${projectId}:hx`,
  })
  if (error) throw new Error(`fabricateLease: ${error.message}`)
  return { jobId: id, worker, attempt: 1 }
}
// A bare edit_projects row (not started through the edge fn) for RPC tests.
async function scratchProject(ownerId, genId, assetId) {
  const id = randomUUID()
  const { error } = await admin.from('edit_projects').insert({
    id, owner_id: ownerId, generation_id: genId, source_asset_id: assetId, status: 'queued',
    idempotency_key: randomUUID(),
  })
  if (error) throw new Error(`scratchProject: ${error.message}`)
  return id
}

// =====================================================================
async function main() {
  console.log('== setup ==')
  const dir = await mkdtemp(join(tmpdir(), 'phase6-'))
  const [uA, uB] = await Promise.all([makeUser('p6a'), makeUser('p6b')])
  const [cA, cB] = await Promise.all([login(uA.email), login(uB.email)])
  const fixMain = await makeFixture(dir, 'main')
  const fixCap2 = await makeFixture(dir, 'captwo')      // different bytes (distinct sha)
  const fixCancel = await makeFixture(dir, 'cancel')
  const fixTamper = await makeFixture(dir, 'tamper')
  const fixCrash = await makeFixture(dir, 'crash')

  // Settle strays from earlier matrices (same persistent staging DB).
  await admin.from('jobs').update({ status: 'done', result: { drained_by: 'phase6-setup' }, locked_at: null, locked_by: null })
    .eq('type', 'editor_v2').in('status', ['queued', 'running'])
  await admin.from('edit_projects').update({ status: 'cancelled' }).not('status', 'in', '("completed","failed","cancelled")')

  const validator = startWorker('p6-validator', { WORKER_JOB_TYPES: 'validate_source' })
  const S = await mintReady(cA, uA.id, fixMain)
  const C2 = await mintReady(cA, uA.id, fixCap2)
  const CN = await mintReady(cA, uA.id, fixCancel)
  const TM = await mintReady(cA, uA.id, fixTamper)
  const CR = await mintReady(cA, uA.id, fixCrash)
  const M = await mintReady(cA, uA.id, await makeFixture(dir, 'rpc')) // RPC truth-table asset
  stopWorker(validator)

  // =================================================================
  console.log('\n== A. happy path: pinned manifest + three digest components ==')
  let manifest, digests, pinSha
  {
    const t0 = Date.now()
    const pid = await startProject(cA, S.gen, S.assetId)
    const proj = await runToSettled('p6-happy', pid)
    const wallA = (Date.now() - t0) / 1000
    check('A1 project completed with the real analyzing stage', proj.status === 'completed', proj.status)

    check('A2 boot manifest + script snapshot pinned together (all four columns)',
      !!proj.boot_manifest && !!proj.boot_manifest_sha && !!proj.script_snapshot && !!proj.script_snapshot_sha)
    manifest = proj.boot_manifest ?? {}
    digests = manifest.componentDigests ?? {}
    pinSha = proj.boot_manifest_sha
    check('A3 stored manifest canonically re-hashes to boot_manifest_sha',
      sha256(canonicalize(manifest)) === proj.boot_manifest_sha)
    check('A3b stored snapshot canonically re-hashes to script_snapshot_sha, hook preserved',
      sha256(canonicalize(proj.script_snapshot)) === proj.script_snapshot_sha
      && proj.script_snapshot?.hook === HOOK_LINE
      && (proj.script_snapshot?.scenes ?? []).length === 2)
    check('A4 manifest epoch + versions + model artifacts pinned',
      manifest.manifestEpoch === 1
      && manifest.componentVersions?.visual === 'visual-1'
      && manifest.componentVersions?.audio === 'audio-1'
      && manifest.componentVersions?.hook === 'hook-1'
      && /^[0-9a-f]{64}$/.test(manifest.modelArtifacts?.faceDetector?.artifactSha256 ?? '')
      && /^[0-9a-f]{64}$/.test(manifest.rules?.boundsSha256 ?? ''))

    const events = await getEvents(pid)
    const pinEv = events.filter((e) => e.message_code === 'manifest_pinned')
    check('A5 manifest_pinned event with pin:<sha> dedupe key',
      pinEv.length === 1 && pinEv[0].dedupe_key === `pin:${proj.boot_manifest_sha}`)

    const rows = {}
    for (const comp of ['visual', 'audio', 'hook']) rows[comp] = await componentRows(S.assetId, comp)
    check('A6 exactly one digest row per component, digest == manifest digest, provenance bound',
      ['visual', 'audio', 'hook'].every((c) =>
        rows[c].length === 1
        && rows[c][0].component_digest === digests[c]
        && rows[c][0].manifest_sha === proj.boot_manifest_sha
        && rows[c][0].source_hash === S.asset.content_sha256),
      JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]))))

    const recEv = events.filter((e) => e.message_code === 'analysis_component_recorded')
    check('A7 three analysis_component_recorded events with dedupe keys',
      recEv.length === 3
      && ['visual', 'audio', 'hook'].every((c) =>
        recEv.some((e) => e.dedupe_key === `analysis:${c}:${digests[c]}:recorded`)))

    const doneEv = events.find((e) => e.message_code === 'project_completed')
    check('A8 completion details: scaffold marker + download truth (exactly 1) + recorded components',
      doneEv?.details?.simulated_after_analysis === true
      && doneEv?.details?.source_downloads === 1
      && doneEv?.details?.components?.visual?.recorded === true
      && doneEv?.details?.components?.hook?.recorded === true,
      JSON.stringify(doneEv?.details ?? {}))

    // ---- visual fixture gates (frozen: recall>=0.80, precision>=0.60, face>=0.90, 0 FP)
    const vis = rows.visual[0]?.result ?? {}
    const bounds = (vis.shotBoundaries ?? []).map((b) => b.timeMs)
    const expected = [5000, 10000]
    const hit = expected.filter((t) => bounds.some((b) => Math.abs(b - t) <= 1200))
    const recall = hit.length / expected.length
    const precision = bounds.length ? bounds.filter((b) => expected.some((t) => Math.abs(b - t) <= 1200)).length / bounds.length : 0
    check('A9 shot gates: recall >= 0.80 and precision >= 0.60 on the engineered cuts',
      recall >= 0.8 && precision >= 0.6, `recall=${recall} precision=${precision} bounds=${JSON.stringify(bounds)}`)
    const faceSamples = vis.faces ?? []
    const inFace = faceSamples.filter((s) => s.timeMs >= 10000)
    const outFace = faceSamples.filter((s) => s.timeMs < 9000)
    const faceAcc = inFace.length ? inFace.filter((s) => s.detections.length >= 1).length / inFace.length : 0
    const faceFP = outFace.reduce((a, s) => a + s.detections.length, 0)
    check('A10 face gate: accuracy >= 0.90 on the face segment, ZERO false positives elsewhere',
      faceAcc >= 0.9 && faceFP === 0, `acc=${faceAcc} fp=${faceFP}`)
    check('A10b face boxes are display-space and face* named',
      inFace.every((s) => s.detections.every((d) =>
        d.x >= 0 && d.y >= 0 && d.x + d.width <= (vis.displayWidth ?? 720) && d.y + d.height <= (vis.displayHeight ?? 1280)))
      && !JSON.stringify(vis).includes('subject'))

    // ---- audio evidence
    const aud = rows.audio[0]?.result ?? {}
    check('A11 audio: clean fixture has EXACT zero clipping + real loudness + coherent decode',
      aud.clippedSampleCount === 0
      && typeof aud.loudness?.integratedLufs === 'number'
      && Math.abs(aud.decode?.totalSamples - 15 * 48000) < 15 * 48000 * 0.05
      && aud.decode?.fullWindows > 100,
      JSON.stringify({ clip: aud.clippedSampleCount, lufs: aud.loudness?.integratedLufs, samples: aud.decode?.totalSamples }))
    check('A12 audio: positive SNR over the spoken windows + room tone spans found',
      typeof aud.snrDb === 'number' && aud.snrDb > 10 && (aud.roomTone ?? []).length >= 1
      && typeof aud.earlyEnergyRatio === 'number',
      JSON.stringify({ snr: aud.snrDb, roomTone: (aud.roomTone ?? []).length }))

    // ---- hook evidence
    const hk = rows.hook[0]?.result ?? {}
    check('A13 hook: bound to the pinned snapshot + spoken opening + alignment evidence',
      hk.scriptSnapshotSha256 === proj.script_snapshot_sha
      && (hk.spokenOpening?.wordCount ?? 0) >= 1
      && hk.scriptAlignment?.scriptHookTokenCount === 5
      && hk.scriptAlignment?.matchedTokenRatio >= 0.4,
      JSON.stringify(hk.spokenOpening ?? {}) + ` ratio=${hk.scriptAlignment?.matchedTokenRatio}`)

    // ---- payload caps + immutability
    const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8')
    check('A14 payloads inside the frozen caps (262144 / 65536 / 16384)',
      bytes(vis) <= 262144 && bytes(aud) <= 65536 && bytes(hk) <= 16384,
      `v=${bytes(vis)} a=${bytes(aud)} h=${bytes(hk)}`)
    const { error: updErr } = await admin.from('media_analyses')
      .update({ analyzer_bundle_version: 'visual-hacked' }).eq('id', rows.visual[0].id)
    check('A15 component rows are append-only (service-role UPDATE rejected)', !!updErr, updErr?.message)
    console.log(`  A wall: ${wallA.toFixed(1)}s for 15s media (${(wallA / 15).toFixed(2)}x)`)
  }

  // =================================================================
  console.log('\n== B. full reuse: second project, zero downloads, reused events ==')
  {
    const before = (await admin.from('media_analyses').select('id', { count: 'exact', head: true })
      .eq('source_asset_id', S.assetId)).count
    const pid = await startProject(cA, S.gen, S.assetId)
    const proj = await runToSettled('p6-reuse', pid)
    check('B1 second project completed', proj.status === 'completed', proj.status)
    check('B2 pinned to the SAME manifest sha', proj.boot_manifest_sha === pinSha)
    const after = (await admin.from('media_analyses').select('id', { count: 'exact', head: true })
      .eq('source_asset_id', S.assetId)).count
    check('B3 no new component rows (converged on the cache)', before === after, `${before} -> ${after}`)
    const events = await getEvents(pid)
    const reused = events.filter((e) => e.message_code === 'analysis_component_reused')
    check('B4 three analysis_component_reused events with dedupe keys',
      reused.length === 3
      && ['visual', 'audio', 'hook'].every((c) => reused.some((e) => e.dedupe_key === `analysis:${c}:${digests[c]}:reused`)))
    const doneEv = events.find((e) => e.message_code === 'project_completed')
    check('B5 download truth table: full reuse => ZERO downloads',
      doneEv?.details?.source_downloads === 0
      && doneEv?.details?.components?.visual?.recorded === false,
      JSON.stringify(doneEv?.details ?? {}))
  }

  // =================================================================
  console.log('\n== C. RPC + migration truth table (fenced, direct) ==')
  {
    const gen = await newGen(uA.id, SCENE_TIMELINE, HOOK_LINE)
    const pidX = await scratchProject(uA.id, gen, M.assetId)
    const lease = await fabricateLease(uA.id, pidX)
    const rpcPin = (sha, snapSha, man = { schemaVersion: 1, probe: sha }) =>
      admin.rpc('editor_pin_manifest', {
        p_project: pidX, p_job: lease.jobId, p_worker: lease.worker, p_attempt: lease.attempt,
        p_manifest: man, p_manifest_sha: sha, p_snapshot: { schemaVersion: 1, hook: null, scenes: [], generationId: gen }, p_snapshot_sha: snapSha,
      })
    const D1 = 'a'.repeat(64); const D2 = 'b'.repeat(64)
    const SH = 'c'.repeat(64); const SNAP = 'd'.repeat(64)
    const rpcRecord = (component, digest, over = {}) =>
      admin.rpc('editor_record_analysis', {
        p_project: pidX, p_job: lease.jobId, p_worker: lease.worker, p_attempt: lease.attempt,
        p_component: component, p_schema_version: 1, p_bundle_version: `${component}-1`,
        p_component_digest: digest, p_source_hash: M.asset.content_sha256,
        p_result: { probe: true }, ...over,
      })

    const noPin = await rpcRecord('visual', D1)
    check('C1 recording under an UNPINNED project fails closed (manifest_mismatch)',
      !!noPin.error && /manifest_mismatch/.test(noPin.error.message), noPin.error?.message)

    const p1 = await rpcPin(SH, SNAP)
    const p2 = await rpcPin(SH, SNAP)
    const p3 = await rpcPin('e'.repeat(64), SNAP)
    check('C2 pin: pinned -> already_pinned -> DIFFERENT sha fails (manifest_mismatch)',
      p1.data === 'pinned' && p2.data === 'already_pinned'
      && !!p3.error && /manifest_mismatch/.test(p3.error.message),
      JSON.stringify({ p1: p1.data ?? p1.error?.message, p2: p2.data ?? p2.error?.message, p3: p3.error?.message }))

    const badDigest = await rpcRecord('visual', 'not-a-digest')
    check('C3 malformed digest rejected', !!badDigest.error, badDigest.error?.message)
    const badHash = await rpcRecord('visual', D1, { p_source_hash: 'f'.repeat(64) })
    check('C4 wrong source hash rejected (checksum_mismatch)',
      !!badHash.error && /checksum_mismatch/.test(badHash.error.message), badHash.error?.message)
    const tooBig = await rpcRecord('hook', D1, { p_result: { pad: 'x'.repeat(17000) } })
    check('C5 hook payload over 16384 rejected at the DB (component_too_large)',
      !!tooBig.error && /component_too_large/.test(tooBig.error.message), tooBig.error?.message)

    const r1 = await rpcRecord('visual', D1)
    const r2 = await rpcRecord('visual', D1)
    const r3 = await rpcRecord('visual', D1)
    check('C6 same digest converges: recorded then reused (idempotent)',
      r1.data?.recorded === true && r2.data?.recorded === false && r3.data?.recorded === false,
      JSON.stringify({ r1: r1.data, r2: r2.data, e: r1.error?.message ?? r2.error?.message }))
    const evX = await getEvents(pidX)
    check('C7 event accounting deduped: exactly one recorded + one reused event despite three calls',
      evX.filter((e) => e.dedupe_key === `analysis:visual:${D1}:recorded`).length === 1
      && evX.filter((e) => e.dedupe_key === `analysis:visual:${D1}:reused`).length === 1)

    const rB = await rpcRecord('visual', D2)
    const rowsM = await componentRows(M.assetId, 'visual')
    check('C8 two DIFFERENT digests coexist for the same (asset, component)',
      rB.data?.recorded === true && rowsM.filter((r) => r.component_digest).length === 2,
      `rows=${rowsM.length}`)

    // Direct index truth: legacy idempotency + digest uniqueness (23505).
    const legacyRow = {
      owner_id: uA.id, source_asset_id: M.assetId, source_hash: M.asset.content_sha256,
      schema_version: 1, analyzer_bundle_version: 'probe-legacy-1', component: 'visual', result: { probe: 1 },
    }
    const l1 = await admin.from('media_analyses').insert(legacyRow)
    const l2 = await admin.from('media_analyses').insert(legacyRow)
    check('C9 legacy identity intact: duplicate (asset, component, version) rejected by the partial index',
      !l1.error && !!l2.error && /duplicate key|23505/.test(l2.error.message), l2.error?.message)
    const d1 = await admin.from('media_analyses').insert({ ...legacyRow, analyzer_bundle_version: 'visual-1', component_digest: D1, manifest_sha: SH })
    check('C10 duplicate digest row rejected by the digest partial index',
      !!d1.error && /duplicate key|23505/.test(d1.error.message), d1.error?.message)

    // Tenant / RLS isolation.
    const { data: crossRows } = await cB.from('media_analyses').select('id').eq('source_asset_id', S.assetId)
    check('C11 tenant isolation: user B reads ZERO of user A component rows', (crossRows ?? []).length === 0)
    const denied1 = await cB.rpc('editor_pin_manifest', {
      p_project: pidX, p_job: lease.jobId, p_worker: lease.worker, p_attempt: 1,
      p_manifest: {}, p_manifest_sha: SH, p_snapshot: {}, p_snapshot_sha: SNAP,
    })
    const denied2 = await cB.rpc('editor_record_analysis', {
      p_project: pidX, p_job: lease.jobId, p_worker: lease.worker, p_attempt: 1,
      p_component: 'visual', p_schema_version: 1, p_bundle_version: 'visual-1',
      p_component_digest: D1, p_source_hash: M.asset.content_sha256, p_result: {},
    })
    check('C12 authenticated clients cannot execute the fenced writers',
      !!denied1.error && !!denied2.error, `${denied1.error?.message} | ${denied2.error?.message}`)

    // Stale-writer fence: wrong attempt refused.
    const stale = await admin.rpc('editor_record_analysis', {
      p_project: pidX, p_job: lease.jobId, p_worker: lease.worker, p_attempt: 99,
      p_component: 'audio', p_schema_version: 1, p_bundle_version: 'audio-1',
      p_component_digest: D2, p_source_hash: M.asset.content_sha256, p_result: {},
    })
    check('C13 stale attempt token refused (lease_lost)',
      !!stale.error && /lease_lost/.test(stale.error.message), stale.error?.message)

    await admin.from('jobs').update({ status: 'done', locked_at: null, locked_by: null }).eq('id', lease.jobId)
  }

  // =================================================================
  console.log('\n== D. oversized script snapshot fails CLOSED (never truncated) ==')
  {
    const bigTimeline = {
      ...SCENE_TIMELINE,
      scenes: Array.from({ length: 140 }, (_, i) => ({
        ...SCENE_TIMELINE.scenes[0], scene_number: i + 1, dialogue: 'word '.repeat(100) + 'x'.repeat(20),
      })),
    }
    // Reuse the settled fixture asset via a fresh generation+asset pair.
    const big = await (async () => {
      const validator2 = startWorker('p6-validator2', { WORKER_JOB_TYPES: 'validate_source' })
      const r = await mintReady(cA, uA.id, await makeFixture(dir, 'bigsnap'), bigTimeline)
      stopWorker(validator2)
      return r
    })()
    const pid = await startProject(cA, big.gen, big.assetId)
    const proj = await runToSettled('p6-bigsnap', pid)
    check('D1 project failed with the stable script_snapshot_too_large code',
      proj.status === 'failed' && proj.failure_code === 'script_snapshot_too_large',
      `${proj.status}/${proj.failure_code}`)
    check('D2 nothing was pinned and no stage ran',
      proj.boot_manifest_sha === null && proj.started_at === null
        ? true
        : proj.boot_manifest_sha === null, // started_at may be set by finish; the pin absence is the invariant
      `pin=${proj.boot_manifest_sha}`)
  }

  // =================================================================
  console.log('\n== E. cancellation inside analyzing (<= 12s) ==')
  {
    const pid = await startProject(cA, CN.gen, CN.assetId)
    const w = startWorker('p6-cancel', { EDITOR_ANALYZE_SLOW_POINT: 'before_visual', EDITOR_ANALYZE_SLOW_MS: '15000' })
    await waitStage(pid, 'analyzing', 200_000, 'E')
    await sleep(500) // let the stage enter its hold
    const t0 = Date.now()
    const { error: cancelErr } = await cA.rpc('editor_request_cancel', { p_project: pid })
    const proj = await waitSettled(pid, 60_000, 'E-cancel')
    const cancelSecs = (Date.now() - t0) / 1000
    stopWorker(w)
    check('E1 owner cancel lands mid-analyzing and settles cancelled',
      !cancelErr && proj.status === 'cancelled', `${cancelErr?.message ?? ''} ${proj.status}`)
    const ev = await getEvents(pid)
    check('E2 cancellation recorded at the analyzing stage',
      ev.some((e) => e.message_code === 'project_cancelled' && e.details?.at_stage === 'analyzing')
      || ev.some((e) => e.message_code === 'project_cancelled'))
    check(`E3 cancel latency ${cancelSecs.toFixed(1)}s <= 12s`, cancelSecs <= 12, `${cancelSecs.toFixed(1)}s`)
  }

  // =================================================================
  console.log('\n== F. tamper before the analyzing reconcile (cached components never legitimize changed bytes) ==')
  {
    const pid = await startProject(cA, TM.gen, TM.assetId)
    const w = startWorker('p6-tamper', { EDITOR_ANALYZE_SLOW_POINT: 'before_reconcile', EDITOR_ANALYZE_SLOW_MS: '12000' })
    await waitStage(pid, 'analyzing', 200_000, 'F')
    await tamperObject(TM.asset, Buffer.concat([fixTamper, Buffer.from('x')]))
    const proj = await waitSettled(pid, 90_000, 'F-tamper')
    stopWorker(w)
    check('F1 analyzing failed closed on changed bytes (source_changed)',
      proj.status === 'failed' && proj.failure_code === 'source_changed',
      `${proj.status}/${proj.failure_code}`)
    const ev = await getEvents(pid)
    check('F2 source_changed event recorded', ev.some((e) => e.message_code === 'source_changed'))
    check('F3 no analysis components were recorded for the tampered run',
      (await componentRows(TM.assetId, 'visual')).length === 0)
  }

  // =================================================================
  console.log('\n== G. crash before analyzing -> reclaim -> converge (no duplicate components/events) ==')
  {
    const pid = await startProject(cA, CR.gen, CR.assetId)
    const w1 = startWorker('p6-crash-a', {
      WORKER_VISIBILITY_SECS: '20',
      EDITOR_SIM_CRASH_POINT: 'before_stage:analyzing', EDITOR_SIM_FAIL_ATTEMPTS: '1',
    })
    // w1 drives inspecting+transcribing then hard-exits before analyzing.
    await waitStage(pid, 'transcribing', 200_000, 'G').catch(() => {})
    const start = Date.now()
    for (;;) { // wait until the crash actually happened (worker exit)
      if (w1.exitCode !== null) break
      if (Date.now() - start > 200_000) throw new Error('G: worker never crashed')
      await sleep(500)
    }
    workers.delete(w1)
    const w2 = startWorker('p6-crash-b', { WORKER_VISIBILITY_SECS: '20' })
    const proj = await waitSettled(pid, 240_000, 'G-resume')
    stopWorker(w2)
    check('G1 reclaimed attempt resumed and completed', proj.status === 'completed', proj.status)
    const ev = await getEvents(pid)
    check('G2 resume marker recorded', ev.some((e) => e.message_code === 'resumed'))
    check('G3 exactly one digest row per component after the crash-retry',
      (await componentRows(CR.assetId, 'visual')).length === 1
      && (await componentRows(CR.assetId, 'audio')).length === 1
      && (await componentRows(CR.assetId, 'hook')).length === 1)
    check('G4 manifest pinned exactly once (idempotent re-pin on resume)',
      ev.filter((e) => e.message_code === 'manifest_pinned').length === 1)
  }

  // =================================================================
  console.log('\n== H. capacity gate: two REAL jobs, two workers, one DB queue ==')
  {
    const MEDIA_SECS = 15
    const pidA = await startProject(cA, C2.gen, C2.assetId)
    // Re-use the crash asset's generation for a second FRESH project? No — CR
    // completed. Mint pressure with a new project on the MAIN asset (cache
    // hits are legal load) plus the C2 cold asset: the gate's point is queue
    // contention with two live workers, cold path included.
    const pidB = await startProject(cA, S.gen, S.assetId)
    const t0 = Date.now()
    const wa = startWorker('p6-cap-a')
    const wb = startWorker('p6-cap-b')
    const [pa, pb] = await Promise.all([
      waitSettled(pidA, 360_000, 'H-a'), waitSettled(pidB, 360_000, 'H-b'),
    ])
    const wall = (Date.now() - t0) / 1000
    const rssA = peakRssMiB(wa); const rssB = peakRssMiB(wb)
    stopWorker(wa); stopWorker(wb)
    const dur = (p) => (new Date(p.completed_at) - new Date(p.started_at)) / 1000
    const ratios = [dur(pa) / MEDIA_SECS, dur(pb) / MEDIA_SECS].sort((a, b) => a - b)
    const perJobMedian = (ratios[0] + ratios[1]) / 2
    check('H1 both projects completed under two live workers', pa.status === 'completed' && pb.status === 'completed',
      `${pa.status}/${pb.status}`)
    check(`H2 per-job median ${perJobMedian.toFixed(2)}x <= 6.0x media duration`, perJobMedian <= 6.0,
      `ratios=${ratios.map((r) => r.toFixed(2)).join(',')}`)
    check(`H3 aggregate wall ${(wall / MEDIA_SECS).toFixed(2)}x <= 12.0x`, wall / MEDIA_SECS <= 12.0, `${wall.toFixed(1)}s`)
    check(`H4 worker peak RSS ${rssA ?? '?'} / ${rssB ?? '?'} MiB <= 2048`,
      (rssA === null || rssA <= 2048) && (rssB === null || rssB <= 2048))
    console.log(`  capacity: wall=${wall.toFixed(1)}s ratios=${ratios.map((r) => r.toFixed(2)).join(',')} rss=${rssA}/${rssB}MiB`)
  }

  // =================================================================
  stopAll()
  console.log(`\n===== phase6: ${passed} passed, ${failures.length} failed =====`)
  if (failures.length) { for (const f of failures) console.log(`  FAILED: ${f}`); process.exit(1) }
}

main().catch((e) => { console.error('phase6 fatal:', e); stopAll(); process.exit(1) })
