// Editor v2 — Phase 8 staging integration matrix: the REAL render.
//
// THIS FILE IS THE ONLY THING THAT EVER EXECUTES THE RENDERER.
//
// Every other proof Phase 8 has is a typecheck, a unit test of a pure function,
// or Gate-F against a throwaway Postgres. None of them run ffmpeg. With
// EDITOR_RENDER_ENABLED unset — which is every other phase, and production —
// the compiling/rendering/validating branches are unreachable code the stage
// loop never dispatches into. A green Phases-1-7 run says "8.5 broke nothing",
// which is worth knowing and is not the same claim as "the editor makes a
// video".
//
// So this matrix enables the flag per-worker (the way phase7 does for the
// Director) and asserts on the ARTIFACT, not on the project status. `completed`
// is exactly the thing a scaffold produces; the questions worth asking are
// whether bytes exist, whether they are the video the plan described, and
// whether anything was published that nobody measured.
//
// WHAT IS DELIBERATELY NOT INFERRED FROM STATUS (Gate-0 §8.7)
//   * `completed` -> that a video exists          (assert output_asset_id + row)
//   * a media_assets row -> that it has content   (assert size, digest, duration)
//   * a duration -> that it matches the plan      (assert within the ±250 ms)
//   * no error -> that nothing leaked             (assert no stale processes)
import { createClient } from '@supabase/supabase-js'
import { execFile as _execFile, spawn, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const execFile = promisify(_execFile)
const REPO_ROOT = join(import.meta.dirname, '..', '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
      const c = await callEdge(client, 'source-asset', { action: 'create', capture: { origin: 'upload', recording_script_sha256: null, recorder_clock: 'none', accepted_segments: [] }, generation_id: genId, recording_attempt_id: randomUUID(), content_type: ct, size_bytes: buf.byteLength })
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

// ABSENT IS NOT ZERO — the same rule phase7's edit_plans count had to learn.
async function countRows(table, col, id) {
  const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, id)
  if (error) return `unreadable: ${error.message}`
  if (typeof count !== 'number') return 'unreadable: no count'
  return count
}
const editPlans = async (pid) => (await admin.from('edit_plans').select('*').eq('edit_project_id', pid)).data ?? []
const editOutputs = async (pid) => (await admin.from('edit_outputs').select('*').eq('edit_project_id', pid)).data ?? []

async function waitSettled(id, timeoutMs = 600_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && ['completed', 'failed', 'cancelled'].includes(p.status)) return p
    if (Date.now() - start > timeoutMs) throw new Error(`waitSettled ${label || id}: stuck at ${p?.status}`)
    await sleep(700)
  }
}

const workers = new Set()
function startWorker(name, extraEnv = {}) {
  const w = spawn('node', ['dist/index.js'], {
    cwd: 'worker',
    env: {
      ...process.env, SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE, HOSTNAME: name,
      WORKER_JOB_TYPES: 'editor_v2', WORKER_POLL_MS: '400', WORKER_VISIBILITY_SECS: '180',
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

// BOTH flags. Compiling needs a REAL decision to compile from — under the
// simulated director there is no decision row and the stage fails closed by
// design, so a render matrix that enabled only its own flag would prove the
// refusal rather than the renderer.
const RENDER_ENV = { EDITOR_DIRECTOR_ENABLED: 'true', EDITOR_RENDER_ENABLED: 'true' }
async function runToSettled(name, projectId, extraEnv = {}, timeoutMs = 600_000) {
  const w = startWorker(name, { ...RENDER_ENV, ...extraEnv })
  try { return await waitSettled(projectId, timeoutMs, name) } finally { stopWorker(w) }
}

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

/** Download a storage object to a local file so it can be PROBED.
 *  Asserting on a database row proves a row exists; the artifact question is
 *  whether the bytes are a video, and only ffprobe answers that. */
async function fetchToFile(bucket, path, dest) {
  const { data, error } = await admin.storage.from(bucket).download(path)
  if (error) throw new Error(`download ${bucket}/${path}: ${error.message}`)
  const buf = Buffer.from(await data.arrayBuffer())
  const { writeFileSync } = await import('node:fs')
  writeFileSync(dest, buf)
  return buf.byteLength
}
async function ffprobe(path) {
  const { stdout } = await execFile('ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { timeout: 60_000 })
  return JSON.parse(stdout)
}
/** ffmpeg/ffprobe processes still alive, by name. Gate-0 §9 allows ZERO after a
 *  cancel or timeout, and "the project said cancelled" does not establish it. */
function strayMediaProcesses() {
  const r = spawnSync('pgrep', ['-c', '-f', 'ffmpeg'], { encoding: 'utf8' })
  const n = Number((r.stdout ?? '0').trim())
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'phase8-'))
  const user = await makeUser('p8')
  const client = await login(user.email)
  console.log('== building the real fixture (espeak + ffmpeg) ==')
  const buf = await makeFixture(dir, 'happy')

  // ---- A. the happy path: a real video comes out --------------------------
  console.log('\n== A. full pipeline with rendering REAL ==')
  {
    const { gen, assetId } = await mintReady(client, user.id, buf)
    const pid = await startProject(client, gen, assetId)
    const proj = await runToSettled('p8-happy', pid)

    check('A1 project completed', proj.status === 'completed', proj.status)
    // `completed` is what a scaffold produces too. Everything below is the
    // difference between that and a product success.
    check('A2 output_asset_id is NOT null — the scaffold always left it null',
      proj.output_asset_id !== null, String(proj.output_asset_id))

    const plans = await editPlans(pid)
    check('A3 exactly one edit_plan recorded', plans.length === 1, `got ${plans.length}`)
    check('A4 the plan carries a sha256 digest',
      /^[0-9a-f]{64}$/.test(plans[0]?.plan_hash ?? ''), plans[0]?.plan_hash)

    const outs = await editOutputs(pid)
    const vid = outs.find((o) => o.kind === 'video')
    const cov = outs.find((o) => o.kind === 'cover')
    check('A5 a video output row exists and is READY', vid?.state === 'ready', vid?.state)
    check('A6 a cover output row exists and is READY', cov?.state === 'ready', cov?.state)
    check('A7 READY MEANS MEASURED: the video row carries bytes, digest and duration',
      Number(vid?.bytes) > 0 && /^[0-9a-f]{64}$/.test(vid?.sha256 ?? '') && Number(vid?.measured_duration_ms) > 0,
      JSON.stringify({ bytes: vid?.bytes, sha: vid?.sha256?.slice(0, 12), dur: vid?.measured_duration_ms }))
    check('A8 the path is SERVER-DERIVED under the owner prefix',
      vid?.storage_path === `edit-outputs/${user.id}/${pid}/1/output.mp4`, vid?.storage_path)

    const { data: assetRow } = await admin.from('media_assets').select('*').eq('id', proj.output_asset_id).maybeSingle()
    check('A9 the output media_asset is kind=output and ready',
      assetRow?.kind === 'output' && assetRow?.status === 'ready', `${assetRow?.kind}/${assetRow?.status}`)
    check('A10 the asset duration is the MEASURED one, not the plan\'s promise',
      Number(assetRow?.duration_ms) === Number(vid?.measured_duration_ms),
      `asset=${assetRow?.duration_ms} measured=${vid?.measured_duration_ms}`)

    // THE ARTIFACT ITSELF. Everything above is rows describing a video; this is
    // the video.
    const local = join(dir, 'out.mp4')
    const bytes = await fetchToFile(vid.storage_bucket, vid.storage_path, local)
    check('A11 the object EXISTS in storage and is non-empty', bytes > 0, `${bytes} bytes`)
    check('A12 storage bytes match the recorded size', bytes === Number(vid.bytes), `${bytes} vs ${vid.bytes}`)

    const probe = await ffprobe(local)
    const v = (probe.streams ?? []).find((s) => s.codec_type === 'video')
    const a = (probe.streams ?? []).find((s) => s.codec_type === 'audio')
    check('A13 it decodes as h264 video', v?.codec_name === 'h264', v?.codec_name)
    check('A14 it carries aac audio', a?.codec_name === 'aac', a?.codec_name)
    check('A15 the raster is the frozen 1080x1920', v?.width === 1080 && v?.height === 1920, `${v?.width}x${v?.height}`)
    check('A16 the pixel format is yuv420p', v?.pix_fmt === 'yuv420p', v?.pix_fmt)

    const durMs = Math.round(Number(probe.format?.duration ?? 0) * 1000)
    const planned = Number(plans[0]?.output_duration_ms ?? 0)
    check('A17 the rendered length is within the FROZEN ±250 ms of the plan',
      planned > 0 && Math.abs(durMs - planned) <= 250, `probed=${durMs} planned=${planned}`)

    const coverLocal = join(dir, 'cover.jpg')
    const coverBytes = await fetchToFile(cov.storage_bucket, cov.storage_path, coverLocal)
    const coverProbe = await ffprobe(coverLocal)
    check('A18 the cover is a real image of the frozen size',
      coverBytes > 0 && (coverProbe.streams ?? [])[0]?.width === 1080 && (coverProbe.streams ?? [])[0]?.height === 1920,
      `${coverBytes}B ${(coverProbe.streams ?? [])[0]?.width}x${(coverProbe.streams ?? [])[0]?.height}`)

    const codes = (await getEvents(pid)).map((e) => e.message_code)
    check('A19 no render_failed / validate_failed event',
      !codes.includes('render_failed') && !codes.includes('validate_failed'), codes.join(','))
    check('A20 ZERO stray ffmpeg processes after a clean run', strayMediaProcesses() === 0)
  }

  // ---- B. cancellation mid-render ----------------------------------------
  // Gate-0 §5: cancellation is NOT failure. The local files go, nothing is
  // published, and §9 allows zero stale processes.
  console.log('\n== B. cancel while rendering ==')
  {
    const { gen, assetId } = await mintReady(client, user.id, buf)
    const pid = await startProject(client, gen, assetId)
    const w = startWorker('p8-cancel', RENDER_ENV)
    try {
      // Wait until the project is actually rendering, then cancel.
      const start = Date.now()
      for (;;) {
        const p = await getProject(pid)
        if (p?.status === 'rendering') break
        if (['completed', 'failed', 'cancelled'].includes(p?.status)) break
        if (Date.now() - start > 600_000) throw new Error(`never reached rendering (${p?.status})`)
        await sleep(400)
      }
      await admin.from('edit_projects').update({ cancel_requested_at: new Date().toISOString() }).eq('id', pid)
      const proj = await waitSettled(pid, 120_000, 'p8-cancel')
      check('B1 cancellation settles as CANCELLED, not failed', proj.status === 'cancelled', proj.status)
      check('B2 no output asset was published', proj.output_asset_id === null, String(proj.output_asset_id))
      const outs = await editOutputs(pid)
      const vid = outs.find((o) => o.kind === 'video')
      check('B3 the reserved output was never marked ready',
        !vid || vid.state !== 'ready', vid?.state)
      await sleep(13_000) // Gate-0 §9 allows 12s for cancel -> process exit
      check('B4 ZERO stray ffmpeg processes 13s after cancel (§9 allows 12s, and zero stale)',
        strayMediaProcesses() === 0)
    } finally { stopWorker(w) }
  }

  // ---- C. the flag is what makes it real ---------------------------------
  // Without this, every assertion above could be explained by the pipeline
  // rendering unconditionally, and the gate would be proving nothing about the
  // flag it exists to protect.
  console.log('\n== C. CONTROL: flag unset => still the scaffold ==')
  {
    const { gen, assetId } = await mintReady(client, user.id, buf)
    const pid = await startProject(client, gen, assetId)
    const w = startWorker('p8-off', { EDITOR_DIRECTOR_ENABLED: 'true' }) // render flag NOT set
    let proj
    try { proj = await waitSettled(pid, 600_000, 'p8-off') } finally { stopWorker(w) }
    check('C1 it still completes', proj.status === 'completed', proj.status)
    check('C2 but output_asset_id stays NULL — production behaviour unchanged',
      proj.output_asset_id === null, String(proj.output_asset_id))
    const n = await countRows('edit_outputs', 'edit_project_id', pid)
    check('C3 and NO output was ever reserved', n === 0, `got ${n}`)
  }

  stopAll()
  console.log(`\n===== phase8: ${passed} passed, ${failures.length} failed =====`)
  if (failures.length) { for (const f of failures) console.log(`  FAILED: ${f}`); process.exit(1) }
}

main().catch((e) => { console.error('phase8 fatal:', e); stopAll(); process.exit(1) })
