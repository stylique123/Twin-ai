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
//
// SCENARIO D (8.6) asks the question the four above cannot: can the CREATOR get
// the video? Everything in A-C reads storage with the service role, which proves
// bytes exist and proves nothing about reachability. D downloads through the
// signed URL with no service key at all, and checks the sha256 of what comes
// back — a URL that 403s, or that serves a different file, is not a video the
// user can watch.
import { createClient } from '@supabase/supabase-js'
import { execFile as _execFile, spawn, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { authHeader } from './authSession.mjs'
import { captionChecks, captionEvidenceChecks } from './captionAssertions.mjs'

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
  if (client) headers.Authorization = await authHeader(client)
  const res = await fetch(`${URL}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) })
  // ⚠️ THE ERROR BODY USED TO BE SWALLOWED HERE TOO. A non-JSON gateway page — a
  // platform 429, a 502 from the edge runtime — became `{}`, so the assertion
  // reported `code=undefined` and blamed the function for a throttle. See
  // `phase2.mjs` for the failure that found this.
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { /* not JSON — keep the text */ }
  return { status: res.status, body: parsed ?? {}, raw: parsed ? null : text.trim() }
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

  // A DEDICATED validate_source WORKER, which this file omitted on its first
  // run and which every other phase has.
  //
  // `mintReady` waits for the uploaded asset to reach `ready`, and that
  // transition is done by a WORKER claiming a `validate_source` job — not by
  // the edge function that finalizes the upload. Without one running, the job
  // sits unclaimed and the asset stays at `validating` until waitAsset times
  // out. That is exactly how this failed: 120 seconds at `validating`, and the
  // renderer never ran at all.
  //
  // The editor worker is a SEPARATE process with WORKER_JOB_TYPES=editor_v2, so
  // it will not pick these up. Both are needed, and this one has to be running
  // before the first mint rather than alongside the render.
  //
  // ALL THREE SCENARIOS mint, including the control, so it stays up for the
  // whole run and is stopped at the end rather than per-scenario.
  const validator = startWorker('p8-validator', { WORKER_JOB_TYPES: 'validate_source' })

  // ---- A. the happy path: a real video comes out --------------------------
  // Scenario D re-uses these: the endpoint under test is about a project that
  // ALREADY rendered, and re-rendering one just to ask for its URL would test a
  // second pipeline run rather than the endpoint.
  let happyPid = null
  let happyVideo = null
  let scaffoldPid = null
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
    happyPid = pid
    happyVideo = vid
    const cov = outs.find((o) => o.kind === 'cover')
    check('A5 a video output row exists and is READY', vid?.state === 'ready', vid?.state)
    check('A6 a cover output row exists and is READY', cov?.state === 'ready', cov?.state)
    check('A7 READY MEANS MEASURED: the video row carries bytes, digest and duration',
      Number(vid?.bytes) > 0 && /^[0-9a-f]{64}$/.test(vid?.sha256 ?? '') && Number(vid?.measured_duration_ms) > 0,
      JSON.stringify({ bytes: vid?.bytes, sha: vid?.sha256?.slice(0, 12), dur: vid?.measured_duration_ms }))
    // Named for what it CHECKS. The owner id is the second segment, not the
    // first, so this is not "under the owner prefix" in the sense the `edits`
    // RLS policies mean (they key on foldername[1]); finished edits are served
    // by an edge function that authorizes and signs with the service role, the
    // way review/social/generate-thumbnail already do. 0097 records that as a
    // decision. The old name would have been quoted later as proof of a
    // property the path does not have.
    check('A8 the path is SERVER-DERIVED and contains the owner and project ids',
      vid?.storage_path === `edit-outputs/${user.id}/${pid}/1/output.mp4`, vid?.storage_path)
    // THE BUCKET. It defaulted to 'media', which 0065 never creates — the render
    // would have encoded, validated, and then 404'd on upload. Gate-F reserved
    // into 'media' nine times and passed every time, because a throwaway
    // Postgres has no storage for a bucket name to be wrong about.
    check('A8b both outputs are in the edits bucket that actually exists',
      vid?.storage_bucket === 'edits' && cov?.storage_bucket === 'edits',
      `video=${vid?.storage_bucket} cover=${cov?.storage_bucket}`)

    const { data: assetRow } = await admin.from('media_assets').select('*').eq('id', proj.output_asset_id).maybeSingle()
    check('A9 the output media_asset is kind=output and ready',
      assetRow?.kind === 'output' && assetRow?.status === 'ready', `${assetRow?.kind}/${assetRow?.status}`)
    check('A10 the asset duration is the MEASURED one, not the plan\'s promise',
      Number(assetRow?.duration_ms) === Number(vid?.measured_duration_ms),
      `asset=${assetRow?.duration_ms} measured=${vid?.measured_duration_ms}`)

    // ARTIFACT ASSERTIONS ONLY RUN IF THERE IS AN ARTIFACT.
    //
    // The first time A failed, `vid` was undefined and the next line threw
    // `TypeError: Cannot read properties of undefined (reading 'storage_bucket')`
    // — which killed the whole file and took scenarios B and C with it. A
    // harness that crashes on the failure it is meant to REPORT hides every
    // other result behind the first one, and B (cancellation) and C (the flag
    // control) are independent questions that deserved to be asked anyway.
    if (!vid || vid.state !== 'ready') {
      check('A11-A18 SKIPPED: no ready video output to probe', false,
        'the artifact assertions could not run — see the failures above for why')
    } else {
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

    // ---- CAPTIONS ---------------------------------------------------------
    // The predicates live in captionAssertions.mjs so they can be run offline
    // against a real compiled plan. They were inline first, with a copy in a
    // scratch script to try them out, and the copy immediately disagreed with
    // the original -- three of seven were written against `startMs`/`endMs`
    // when a cue actually carries `outputStartMs`/`outputEndMs`. That would
    // have failed the matrix and cost a full ~40-minute run to discover.
    // `join(REPO_ROOT, …)` and NOT `new URL(…, import.meta.url)`, because line 46
    // of this file does `const URL = need('STAGING_URL')` — a module-scope const
    // that shadows the global URL constructor for the whole module. `new URL` here
    // is `new` applied to a string, which throws "URL is not a constructor" and
    // took a full matrix run to find. REPO_ROOT is the idiom this file already
    // uses and cannot be shadowed by an environment variable.
    const policy = JSON.parse(await readFile(join(REPO_ROOT, 'worker', 'edit_policy_v1.json'), 'utf8'))
    for (const c of captionChecks(plans[0]?.plan ?? {}, policy, durMs)) {
      check(c.name, c.ok, c.detail)
    }

    // NO CAPTION WORD IS INVENTED. Read from the DB independently rather than
    // from anything the compiler produced — a check fed by the thing it is
    // checking proves nothing. The speech component is the transcript; the
    // pinned snapshot is the script, and since captions began taking the
    // script's spelling a word may legitimately come from either.
    const speechRows = (await admin.from('media_analyses').select('result')
      .eq('source_asset_id', assetId).eq('component', 'speech')).data ?? []
    const spokenWords = speechRows.flatMap((r) =>
      (Array.isArray(r?.result?.words) ? r.result.words : []).map((w) => String(w?.text ?? '')))
    const snapRows = (await admin.from('source_script_snapshots').select('snapshot')
      .eq('source_asset_id', assetId)).data ?? []
    const scriptWords = snapRows.flatMap((r) =>
      JSON.stringify(r?.snapshot ?? {}).split(/[^\p{L}\p{N}]+/u).filter(Boolean))
    for (const c of captionEvidenceChecks(plans[0]?.plan ?? {}, spokenWords, scriptWords)) {
      check(c.name, c.ok, c.detail)
    }
    }

    const codes = (await getEvents(pid)).map((e) => e.message_code)
    check('A19 no render_failed / validate_failed event',
      !codes.includes('render_failed') && !codes.includes('validate_failed'), codes.join(','))
    check('A20 ZERO stray ffmpeg processes after a clean run', strayMediaProcesses() === 0)

    // ---- the duration evidence 0164 added, and nothing yet proved lands -----
    //
    // ⚠️ recordRenderAttempt SWALLOWS EVERY INSERT ERROR. It wraps the insert in
    // try/catch and logs `render_attempt_not_recorded` on failure, deliberately,
    // so a telemetry problem can never fail a render a creator is waiting on.
    // The cost is that a wrong column name, a constraint violation or a missing
    // grant produces NO test failure anywhere: the render passes, the gate goes
    // green, and the table quietly stays empty.
    //
    // ⚖️ WHICH IS EXACTLY THE COLUMN SET #445 RELIES ON. `zoom_count`,
    // `target_frame_count` and `plan_quantisation_delta_ms` exist to make the
    // zoomCount -> duration-error relationship measurable at all. If they are
    // never written, the instrument that reads them reports "no evidence"
    // forever and that reads like "no problem".
    const { data: attempts, error: attemptErr } = await admin
      .from('render_attempts').select('*').eq('edit_project_id', pid)
    check('A21 the render recorded a render_attempt row',
      !attemptErr && (attempts?.length ?? 0) >= 1,
      attemptErr?.message ?? `rows=${attempts?.length ?? 0}`)

    const ra = attempts?.[0]
    if (ra) {
      // ⚖️ ABSENT IS NOT ZERO, and this is the assertion that says so. NULL means
      // the worker never recorded it; 0 means a plan that genuinely has no
      // zooms. Accepting NULL here would let the column rot while the suite
      // stayed green.
      check('A22 zoom_count is RECORDED, not null (0 is a real answer, null is not)',
        ra.zoom_count !== null && Number.isInteger(ra.zoom_count) && ra.zoom_count >= 0,
        String(ra.zoom_count))
      check('A23 target_frame_count is a positive frame count',
        Number.isInteger(ra.target_frame_count) && ra.target_frame_count > 0,
        String(ra.target_frame_count))
      check('A24 plan_quantisation_delta_ms is recorded as its own number',
        ra.plan_quantisation_delta_ms !== null && Number.isFinite(Number(ra.plan_quantisation_delta_ms)),
        String(ra.plan_quantisation_delta_ms))
      // The database constraint already asserts delta = actual - predicted, so
      // this catches a row that somehow bypassed it rather than re-deriving it.
      check('A25 the recorded delta IS actual minus predicted',
        Number(ra.duration_delta_ms) === Number(ra.actual_duration_ms) - Number(ra.predicted_duration_ms),
        `${ra.duration_delta_ms} vs ${ra.actual_duration_ms} - ${ra.predicted_duration_ms}`)

      // ⚠️ THIS LINE IS THE POINT OF THE WHOLE BLOCK, AND IT IS NOT AN
      // ASSERTION. One render is ONE zoom count, and one zoom count cannot show
      // a trend -- claiming "the correlation is gone" from a single row is the
      // unrun experiment wearing a green tick. Printing it makes every staging
      // run contribute a readable data point, so the population #454's
      // check_zoom_delta_correlation needs actually accumulates.
      console.log(`NOTE render-attempt evidence: zoomCount=${ra.zoom_count}`
        + ` targetFrames=${ra.target_frame_count}`
        + ` predicted=${ra.predicted_duration_ms}ms actual=${ra.actual_duration_ms}ms`
        + ` delta=${ra.duration_delta_ms}ms`
        + ` planQuantisation=${ra.plan_quantisation_delta_ms}ms`
        + ` outcome=${ra.validator_outcome}`)
      console.log('NOTE   one render is one zoom count — this is a data point, NOT a slope.')
    }
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
    scaffoldPid = pid
  }

  // ---- D. the finished video is REACHABLE (8.6) ---------------------------
  //
  // Phase 8 proved a video exists in storage. It did not prove anyone can watch
  // it, and until 8.6 nobody could: the `edits` object policies key on the owner
  // id being the FIRST path segment and the server-derived path puts it second,
  // so the client could read every row and download nothing.
  //
  // Every assertion below downloads through the SIGNED URL — never through the
  // service-role client the rest of this file uses. A harness that fetches with
  // admin credentials proves the bytes exist, which is what scenario A already
  // proved; the question here is whether the CALLER can get them.
  console.log('\n== D. the finished video is reachable ==')
  if (!happyPid || !happyVideo || happyVideo.state !== 'ready') {
    check('D SKIPPED: scenario A produced no ready video to fetch', false,
      'the endpoint assertions could not run — see A above')
  } else {
    const r = await callEdge(client, 'editor-output', { project_id: happyPid })
    check('D1 the owner gets 200 with a video URL',
      r.status === 200 && typeof r.body.videoUrl === 'string' && r.body.videoUrl.length > 0,
      `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`)

    if (r.status === 200 && r.body.videoUrl) {
      // THE ACTUAL QUESTION. A URL that 403s is not a reachable video, and a
      // 200 from the endpoint says nothing about whether the signature works.
      const res = await fetch(r.body.videoUrl)
      const got = res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0)
      check('D2 the signed URL DOWNLOADS — unauthenticated, no service key',
        res.ok && got.byteLength > 0, `${res.status} ${got.byteLength}B`)
      // Byte identity, not size. The same length proves nothing about which file
      // came back, and the digest is already recorded by mark-output-ready.
      const digest = createHash('sha256').update(got).digest('hex')
      check('D3 the downloaded bytes ARE the validated output (sha256 match)',
        digest === happyVideo.sha256, `got ${digest.slice(0, 12)} want ${String(happyVideo.sha256).slice(0, 12)}`)
      check('D4 the reported duration is the MEASURED one, not the plan promise',
        Number(r.body.durationMs) === Number(happyVideo.measured_duration_ms),
        `endpoint=${r.body.durationMs} measured=${happyVideo.measured_duration_ms}`)
      if (r.body.coverUrl) {
        const cres = await fetch(r.body.coverUrl)
        check('D5 the cover URL downloads too', cres.ok, String(cres.status))
      } else {
        check('D5 the cover URL downloads too', false, 'no coverUrl returned')
      }
    } else {
      check('D2-D5 SKIPPED: no URL to download', false, 'see D1')
    }

    // ---- the refusals, which are the reason this endpoint exists at all ----
    const outsider = await makeUser('p8-outsider')
    const outsiderClient = await login(outsider.email)
    const ro = await callEdge(outsiderClient, 'editor-output', { project_id: happyPid })
    check('D6 A STRANGER IS REFUSED — and told nothing about whether it exists',
      ro.status === 404 && ro.body.code === 'output_not_found',
      `${ro.status} ${JSON.stringify(ro.body).slice(0, 120)}`)
    // Same answer for a project id that does not exist at all. If these two
    // differed, the endpoint would be an oracle for which ids are real.
    const rmissing = await callEdge(outsiderClient, 'editor-output', { project_id: randomUUID() })
    check('D7 a NON-EXISTENT project gets the IDENTICAL refusal (no existence oracle)',
      rmissing.status === ro.status && rmissing.body.code === ro.body.code,
      `missing=${rmissing.status}/${rmissing.body.code} foreign=${ro.status}/${ro.body.code}`)

    const anon = await callEdge(null, 'editor-output', { project_id: happyPid })
    check('D8 an unauthenticated caller is refused', anon.status === 401, String(anon.status))

    // A path arriving in the body is a contract violation, not a field to
    // ignore. The endpoint derives everything from the project id.
    const extra = await callEdge(client, 'editor-output',
      { project_id: happyPid, storage_path: 'edit-outputs/anything/at/all.mp4' })
    check('D9 a body carrying a STORAGE PATH is refused outright', extra.status === 400, String(extra.status))

    // THE CONTROL THAT MATTERS MOST. Scenario C is a project that completed with
    // the render flag unset — exactly what production produces today. It must be
    // reported as "no video", never as a URL and never as a broken edit.
    if (scaffoldPid) {
      const rs = await callEdge(client, 'editor-output', { project_id: scaffoldPid })
      check('D10 CONTROL: the scaffold completion yields output_absent, not a URL',
        rs.status === 409 && rs.body.code === 'output_absent' && !rs.body.videoUrl,
        `${rs.status} ${JSON.stringify(rs.body).slice(0, 120)}`)
    } else {
      check('D10 CONTROL: the scaffold completion yields output_absent, not a URL', false, 'scenario C did not run')
    }
  }

  stopWorker(validator)
  stopAll()
  console.log(`\n===== phase8: ${passed} passed, ${failures.length} failed =====`)
  if (failures.length) { for (const f of failures) console.log(`  FAILED: ${f}`); process.exit(1) }
}

main().catch((e) => { console.error('phase8 fatal:', e); stopAll(); process.exit(1) })
