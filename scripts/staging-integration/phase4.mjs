// Editor v2 Phase 4 — staging matrix for the REAL `inspecting` stage.
//
// Governing rule under test: ANALYZE ONCE AND REUSE THE RESULT.
//   * a ready Phase-1 asset is inspected from its persisted validation facts —
//     no second download, no second ffprobe
//   * one immutable inspection component per (asset, component, inspector
//     version); repeats hit the cache; a version bump recomputes
//   * assets without probe_facts (pre-Phase-4) take ONE bounded upgrade probe
//   * identical bytes under two unrelated users → two independent rows, no
//     uniqueness conflict, no cross-tenant visibility (per-asset cache identity)
//   * integrity: changed bytes / deleted source / became-ineligible fail safely
//   * cooperative cancellation lands mid-download, mid-probe, and after
//     persist; crash mid-inspection reclaims and converges on ONE cached row
//   * stored errors are sanitized (no URLs, tokens, temp paths)
//   * boundary: nothing beyond inspection — no speech/plans/outputs/credits
import { createClient } from '@supabase/supabase-js'
import { execFile as _execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const execFile = promisify(_execFile)
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
async function putSigned(signedUrl, buf, ct) {
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': ct }, body: buf })
  return { status: res.status, body: res.ok ? '' : (await res.text().catch(() => '')).slice(0, 200) }
}
async function sourceFlow(client, genId, buf, ct = 'video/webm') {
  // A fresh signed PUT occasionally 400s transiently on the shared staging
  // storage; the whole intent (create → PUT → finalize) is retried once with
  // a NEW attempt id — exactly the client retry contract from Phase 1.
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
      return { assetId: c.body.assetId, signedUrl: c.body.signedUrl }
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

const allProjects = []
async function startProject(client, genId, assetId) {
  for (let attempt = 0; ; attempt++) {
    const r = await callEdge(client, 'start-editor-v2', {
      generation_id: genId, source_asset_id: assetId, idempotency_key: randomUUID(),
    })
    if (r.status === 429 && attempt < 2) {
      // The per-user start rate limit (10/60s) is a PRODUCT feature, not a
      // failure — the matrix legitimately packs starts; wait out the window.
      console.log('   (start rate window — waiting 61s…)')
      await sleep(61_000)
      continue
    }
    if (r.status !== 200) throw new Error(`start ${r.status}: ${JSON.stringify(r.body)}`)
    allProjects.push(r.body.projectId)
    return r.body.projectId
  }
}
async function getProject(id) { return (await admin.from('edit_projects').select('*').eq('id', id).maybeSingle()).data }
async function getJob(pid) { return (await admin.from('jobs').select('*').eq('dedup_key', `editor_v2:${pid}:1`).maybeSingle()).data }
async function getEvents(pid) { return (await admin.from('edit_events').select('*').eq('project_id', pid).order('seq')).data ?? [] }
// Phase 4 asserts on the INSPECTION component only. Phase 5 made `transcribing`
// real, so a completed project now ALSO writes a `speech` component for the
// same asset — that row is phase5.mjs's subject, not Phase 4's. Scope every
// Phase-4 count to inspection so those assertions stay about inspection.
async function analyses(assetId) {
  return (await admin.from('media_analyses').select('*')
    .eq('source_asset_id', assetId).eq('component', 'inspection').order('created_at')).data ?? []
}
async function waitSettled(id, timeoutMs = 90_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && ['completed', 'failed', 'cancelled'].includes(p.status)) return p
    if (Date.now() - start > timeoutMs) throw new Error(`waitSettled ${label || id}: ${p?.status}`)
    await sleep(500)
  }
}

const workers = new Set()
function startWorker(name, extraEnv = {}) {
  const w = spawn('node', ['dist/index.js'], {
    cwd: 'worker',
    env: {
      ...process.env, SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE, HOSTNAME: name,
      WORKER_JOB_TYPES: 'editor_v2', WORKER_POLL_MS: '400', WORKER_VISIBILITY_SECS: '60',
      WORKER_RETRY_BACKOFF_BASE_SECS: '1', EDITOR_SIM_STAGE_MS: '120', EDITOR_LEASE_RENEW_MS: '2000',
      // Phase 5 made `transcribing` real; Phase 4 asserts on INSPECTION, so the
      // speech stage that now also runs per project uses the fastest model.
      EDITOR_SPEECH_MODEL: 'tiny',
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

async function makeFixtures(dir) {
  const ff = (args) => execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 120_000 })
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libvorbis', '-shortest', join(dir, 'portrait.webm')])
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30000/1001:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', join(dir, 'landscape.mp4')])
  // Rotation must be a real display-matrix (modern ffmpeg drops the legacy
  // `rotate` metadata tag on mp4 mux): encode, then remux with the matrix.
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', join(dir, 'rot-src.mp4')])
  await ff(['-display_rotation', '90', '-i', join(dir, 'rot-src.mp4'), '-c', 'copy', '-movflags', '+faststart', join(dir, 'rotated.mp4')])
  await ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'libvorbis', join(dir, 'audio-only.webm')])
  return {
    portrait: await readFile(join(dir, 'portrait.webm')),
    landscape: await readFile(join(dir, 'landscape.mp4')),
    rotated: await readFile(join(dir, 'rotated.mp4')),
    audioOnly: await readFile(join(dir, 'audio-only.webm')),
  }
}

async function mintReady(client, ownerId, buf, ct = 'video/webm') {
  const gen = await newGen(ownerId)
  const { assetId } = await sourceFlow(client, gen, buf, ct)
  const asset = await waitAsset(assetId)
  if (asset.status !== 'ready') throw new Error(`fixture asset rejected: ${JSON.stringify(asset.metadata)}`)
  return { gen, assetId, asset }
}
// Simulate a pre-Phase-4 asset: validated, ready, but with neither probe
// facts NOR a finalize integrity reference (legacy assets predate both).
async function stripProbeFacts(assetId) {
  const { data: a } = await admin.from('media_assets').select('metadata').eq('id', assetId).maybeSingle()
  const meta = { ...(a.metadata ?? {}) }
  delete meta.probe_facts
  delete meta.finalized_etag
  delete meta.finalized_bytes
  await admin.from('media_assets').update({ metadata: meta }).eq('id', assetId)
}

// The PROJECT settles (fenced finish) an instant before the JOB result is
// acknowledged — poll for the job too before reading result.inspection.
async function waitJobSettled(pid, timeoutMs = 15_000) {
  const start = Date.now()
  for (;;) {
    const j = await getJob(pid)
    if (j && ['done', 'failed'].includes(j.status)) return j
    if (Date.now() - start > timeoutMs) return j
    await sleep(400)
  }
}
// Overwrite a validated object with different bytes (tamper simulation).
// MUST verify the write took — a silently failed overwrite made integrity
// tests pass vacuously in an earlier run.
async function headEtag(asset) {
  const res = await fetch(`${URL}/storage/v1/object/${asset.bucket}/${asset.storage_path}`, {
    method: 'HEAD', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  return res.ok ? res.headers.get('etag') : null
}
async function tamperObject(asset, buf, ct = 'video/webm') {
  const before = await headEtag(asset)
  const res = await fetch(`${URL}/storage/v1/object/${asset.bucket}/${asset.storage_path}`, {
    method: 'PUT',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': ct },
    body: buf,
  })
  if (!res.ok) throw new Error(`tamper overwrite failed: ${res.status} ${(await res.text()).slice(0, 120)}`)
  const after = await headEtag(asset)
  if (!before || !after || before === after) throw new Error(`tamper NOT effective: etag ${before} -> ${after}`)
  return { before, after }
}

async function runToSettled(name, projectId, extraEnv = {}, timeoutMs = 90_000) {
  const w = startWorker(name, extraEnv)
  const p = await waitSettled(projectId, timeoutMs, name)
  stopWorker(w)
  return p
}

// =====================================================================
async function main() {
  console.log('== setup ==')
  const dir = await mkdtemp(join(tmpdir(), 'phase4-'))
  const [fix, uA, uB] = await Promise.all([makeFixtures(dir), makeUser('p4a'), makeUser('p4b')])
  const [cA, cB] = await Promise.all([login(uA.email), login(uB.email)])

  // Settle strays from earlier matrices (same persistent staging DB).
  await admin.from('jobs').update({ status: 'done', result: { drained_by: 'phase4-setup' }, locked_at: null, locked_by: null })
    .eq('type', 'editor_v2').in('status', ['queued', 'running'])
  await admin.from('edit_projects').update({ status: 'cancelled' }).not('status', 'in', '("completed","failed","cancelled")')

  const validator = startWorker('p4-validator', { WORKER_JOB_TYPES: 'validate_source' })
  const A = await mintReady(cA, uA.id, fix.portrait)          // fact-reuse chain (A/B/C share this asset)
  const D = await mintReady(cA, uA.id, fix.portrait)          // upgrade path
  const G1 = await mintReady(cA, uA.id, fix.portrait)         // cancel during download
  const G2 = await mintReady(cA, uA.id, fix.portrait)         // cancel during probe
  const G3 = await mintReady(cA, uA.id, fix.portrait)         // cancel after persist
  const G4 = await mintReady(cA, uA.id, fix.portrait)         // crash mid-inspection → converge
  const G5 = await mintReady(cA, uA.id, fix.portrait)         // probe timeout classification
  const F1 = await mintReady(cA, uA.id, fix.portrait)         // bytes changed
  const F2 = await mintReady(cA, uA.id, fix.portrait)         // deleted source
  const F3o = await mintReady(cA, uA.id, fix.portrait)        // storage object vanishes
  const H = await mintReady(cA, uA.id, fix.portrait)          // becomes ineligible
  const XA = await mintReady(cA, uA.id, fix.landscape, 'video/mp4') // identical bytes, tenant A
  const XB = await mintReady(cB, uB.id, fix.landscape, 'video/mp4') // identical bytes, tenant B
  const ROT = await mintReady(cB, uB.id, fix.rotated, 'video/mp4')
  // Missing-video media is a PHASE 1 rejection — it can never reach inspection.
  const aoGen = await newGen(uB.id)
  const { assetId: aoAsset } = await sourceFlow(cB, aoGen, fix.audioOnly)
  const ao = await waitAsset(aoAsset)
  stopWorker(validator)
  check('S1 audio-only (no video stream) is rejected at Phase 1', ao.status === 'rejected' && ao.metadata?.rejection_code === 'no_video_stream',
    `${ao.status}/${ao.metadata?.rejection_code}`)
  const rejStart = await callEdge(cB, 'start-editor-v2', { generation_id: aoGen, source_asset_id: aoAsset, idempotency_key: randomUUID() })
  check('S2 rejected media cannot start an edit project', rejStart.status === 409 && rejStart.body?.code === 'source_rejected', `${rejStart.status}`)

  // =================================================================
  console.log('\n== A. fact reuse: no second download, no second probe ==')
  {
    const pid = await startProject(cA, A.gen, A.assetId)
    const p = await runToSettled('p4-reuse', pid)
    const job = await waitJobSettled(pid)
    const insp = job?.result?.inspection
    check('A1 project completed with the real inspecting stage', p.status === 'completed', p.status)
    check('A2 inspection REUSED Phase-1 facts — no fallback probe',
      insp?.cacheHit === false && insp?.reusedValidationFacts === true && insp?.fallbackProbePerformed === false, JSON.stringify(insp))
    const rows = await analyses(A.assetId)
    check('A3 exactly one immutable inspection component', rows.length === 1 && rows[0].component === 'inspection', `rows=${rows.length}`)
    const r = rows[0]?.result ?? {}
    check('A4 contract: schemaVersion 1, integer ms, rational fps, checksum traced',
      r.schemaVersion === 1 && Number.isInteger(r.durationMs) && r.durationMs > 5000
      && r.video?.frameRateNumerator === 30 && r.video?.frameRateDenominator === 1
      && r.sourceChecksum === A.asset.content_sha256
      && r.sourceValidationVersion === A.asset.validation_version, JSON.stringify(r).slice(0, 200))
    check('A5 no float seconds anywhere in the persisted contract', !/durationSec|"duration":/.test(JSON.stringify(r)))
    check('A6 audio facts captured (present/codec/sampleRate/channels)',
      r.audio?.present === true && !!r.audio?.codec && r.audio?.sampleRate > 0 && r.audio?.channels >= 1, JSON.stringify(r.audio))
    check('A7 telemetry event recorded with reuse flags',
      (await getEvents(pid)).some((e) => e.message_code === 'inspection_recorded' && e.details?.reused_validation_facts === true))

    // B: repeat project on the SAME asset + version → cache hit, still 1 row.
    const pid2 = await startProject(cA, A.gen, A.assetId)
    await runToSettled('p4-cachehit', pid2)
    const insp2 = (await waitJobSettled(pid2))?.result?.inspection
    check('B1 repeat project hits the cached component', insp2?.cacheHit === true, JSON.stringify(insp2))
    check('B2 still exactly one component row', (await analyses(A.assetId)).length === 1)

    // C: inspector-version bump → NEW component; the old one is untouched.
    const pid3 = await startProject(cA, A.gen, A.assetId)
    await runToSettled('p4-vbump', pid3, { EDITOR_INSPECTOR_VERSION: 'inspect-2' })
    const rows3 = await analyses(A.assetId)
    check('C1 version change created a second, separate component',
      rows3.length === 2 && new Set(rows3.map((x) => x.analyzer_bundle_version)).size === 2, `rows=${rows3.length}`)
    check('C2 project records the inspector version it used', (await getProject(pid3))?.analysis_version === 'inspect-2')
  }

  // =================================================================
  console.log('\n== D. bounded one-time upgrade for pre-Phase-4 assets ==')
  {
    await stripProbeFacts(D.assetId)
    const pid = await startProject(cA, D.gen, D.assetId)
    const p = await runToSettled('p4-upgrade', pid)
    const insp = (await waitJobSettled(pid))?.result?.inspection
    check('D1 missing facts → ONE bounded fallback probe', p.status === 'completed'
      && insp?.fallbackProbePerformed === true && insp?.reusedValidationFacts === false, JSON.stringify(insp))
    const rows = await analyses(D.assetId)
    check('D2 upgrade produced the cached component with full facts',
      rows.length === 1 && rows[0].result?.video?.frameRateNumerator > 0 && rows[0].result?.sourceChecksum === D.asset.content_sha256)
    // The upgrade backfilled the integrity reference (fenced, absent-only):
    // the next project reconciles the etag and reuses with no download.
    const { data: dMeta } = await admin.from('media_assets').select('metadata').eq('id', D.assetId).maybeSingle()
    check('D2b upgrade backfilled finalized_etag/bytes for future reconciliation',
      !!dMeta?.metadata?.finalized_etag && dMeta?.metadata?.integrity_backfilled === true, JSON.stringify({ e: dMeta?.metadata?.finalized_etag }))
    // Repeat → cache hit, no second probe ever.
    const pid2 = await startProject(cA, D.gen, D.assetId)
    await runToSettled('p4-upgrade2', pid2)
    check('D3 subsequent project reuses the upgraded component (no re-probe)',
      (await waitJobSettled(pid2))?.result?.inspection?.cacheHit === true && (await analyses(D.assetId)).length === 1)
  }

  // =================================================================
  console.log('\n== X. cross-tenant identical bytes ==')
  {
    check('X1 identical bytes → identical checksums (the collision case)',
      XA.asset.content_sha256 === XB.asset.content_sha256 && !!XA.asset.content_sha256)
    const pidA = await startProject(cA, XA.gen, XA.assetId)
    const pidB = await startProject(cB, XB.gen, XB.assetId)
    const w = startWorker('p4-xtenant')
    const [pa, pb] = [await waitSettled(pidA, 90_000, 'xa'), await waitSettled(pidB, 90_000, 'xb')]
    stopWorker(w)
    check('X2 BOTH tenants completed — no uniqueness conflict', pa.status === 'completed' && pb.status === 'completed',
      `${pa.status}/${pb.status}`)
    const rowsA = await analyses(XA.assetId); const rowsB = await analyses(XB.assetId)
    check('X3 each asset owns its own analysis row (per-asset cache identity)',
      rowsA.length === 1 && rowsB.length === 1 && rowsA[0].id !== rowsB[0].id
      && rowsA[0].owner_id === uA.id && rowsB[0].owner_id === uB.id)
    const { data: bSeesA } = await cB.from('media_analyses').select('id').eq('id', rowsA[0].id)
    const { data: aSeesOwn } = await cA.from('media_analyses').select('id').eq('id', rowsA[0].id)
    check('X4 tenant B cannot observe tenant A’s analysis row', (bSeesA ?? []).length === 0)
    check('X5 tenant A observes their own row via RLS', (aSeesOwn ?? []).length === 1)
    // Contract fidelity on the mp4 fixtures: unusual rational rate survives.
    check('X6 unusual rational frame rate persisted exactly (30000/1001)',
      rowsA[0].result?.video?.frameRateNumerator === 30000 && rowsA[0].result?.video?.frameRateDenominator === 1001,
      JSON.stringify(rowsA[0].result?.video))
  }

  // =================================================================
  console.log('\n== R. rotated mobile media ==')
  {
    const pid = await startProject(cB, ROT.gen, ROT.assetId)
    await runToSettled('p4-rotated', pid)
    const r = (await analyses(ROT.assetId))[0]?.result
    check('R1 rotation captured in the 0|90|180|270 domain', [90, 270].includes(r?.video?.rotation), `rot=${r?.video?.rotation}`)
    check('R2 display dimensions are rotation-applied (swapped)',
      r?.video?.displayWidth === r?.video?.height && r?.video?.displayHeight === r?.video?.width, JSON.stringify(r?.video))
  }

  // =================================================================
  console.log('\n== F. integrity reconciliation ==')
  {
    // F1: overwrite the object AFTER validation → etag mismatch → safe failure.
    const t1 = await tamperObject(F1.asset, fix.landscape)
    check('F0 tamper is REAL: overwrite succeeded and the object etag changed',
      !!t1.before && !!t1.after && t1.before !== t1.after, JSON.stringify(t1))
    const pid1 = await startProject(cA, F1.gen, F1.assetId)
    const p1 = await runToSettled('p4-bytes', pid1)
    check('F1 changed bytes fail safely as source_bytes_changed', p1.status === 'failed' && p1.failure_code === 'source_bytes_changed',
      `${p1.status}/${p1.failure_code}`)
    check('F2 no inspection row was published for the tampered asset', (await analyses(F1.assetId)).length === 0)
    check('F3 stored failure is sanitized (no urls/paths/tokens)',
      !/https?:|\/tmp\/|token|Bearer/i.test(JSON.stringify(p1.failure_details)), JSON.stringify(p1.failure_details))

    // F4: source deleted between start and inspection.
    const pid2 = await startProject(cA, F2.gen, F2.assetId)
    await admin.from('media_assets').update({ status: 'deleted' }).eq('id', F2.assetId)
    const p2 = await runToSettled('p4-deleted', pid2)
    check('F4 deleted source fails as source_deleted', p2.status === 'failed' && p2.failure_code === 'source_deleted', p2.failure_code)

    // F5: source becomes ineligible between start and inspection.
    const pid3 = await startProject(cA, H.gen, H.assetId)
    const { data: hMeta } = await admin.from('media_assets').select('metadata').eq('id', H.assetId).maybeSingle()
    await admin.from('media_assets').update({ metadata: { ...hMeta.metadata, editor_eligible: false } }).eq('id', H.assetId)
    const p3 = await runToSettled('p4-inelig', pid3)
    check('F5 became-ineligible fails BEFORE later stages', p3.status === 'failed' && p3.failure_code === 'source_not_editor_eligible',
      p3.failure_code)
    const ev3 = await getEvents(pid3)
    check('F6 no stage beyond inspecting ever started',
      !ev3.some((e) => e.message_code === 'stage_started' && e.stage !== 'inspecting'))

    // F7: a CACHED analysis must not legitimize changed bytes — A's asset has
    // two cached components; tamper its object and start a fresh project.
    await tamperObject(A.asset, fix.landscape)
    const pidT = await startProject(cA, A.gen, A.assetId)
    const pT = await runToSettled('p4-cachetamper', pidT)
    check('F7 cache does NOT legitimize changed bytes (etag re-proved every run)',
      pT.status === 'failed' && pT.failure_code === 'source_bytes_changed', `${pT.status}/${pT.failure_code}`)
    check('F8 the immutable cached components themselves are untouched', (await analyses(A.assetId)).length === 2)

    // F9: storage object deleted outright → object_missing.
    const pidO = await startProject(cA, F3o.gen, F3o.assetId)
    await fetch(`${URL}/storage/v1/object/${F3o.asset.bucket}/${F3o.asset.storage_path}`, {
      method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    })
    const pO = await runToSettled('p4-objmissing', pidO)
    check('F9 vanished storage object fails as object_missing', pO.status === 'failed' && pO.failure_code === 'object_missing',
      `${pO.status}/${pO.failure_code}`)
  }

  // =================================================================
  console.log('\n== G. cancellation inside inspection + crash convergence ==')
  {
    const cancelAt = async (label, item, slowPoint, expectRow) => {
      await stripProbeFacts(item.assetId) // force the download/probe path
      const pid = await startProject(cA, item.gen, item.assetId)
      const w = startWorker(`p4-${label}`, { EDITOR_INSPECT_SLOW_POINT: slowPoint, EDITOR_INSPECT_SLOW_MS: '6000' })
      const t0 = Date.now()
      for (;;) { // cancel once the run is inside the targeted window
        const p = await getProject(pid)
        if (p.status === 'inspecting') {
          // after_persist: the row must EXIST before we cancel, or the cancel
          // lands earlier in the pipeline and proves the wrong thing.
          if (slowPoint !== 'after_persist') break
          if ((await analyses(item.assetId)).length > 0) break
        }
        if (Date.now() - t0 > 40_000) throw new Error(`${label}: never reached the ${slowPoint} window`)
        await sleep(300)
      }
      if (slowPoint !== 'after_persist') await sleep(600) // into the held boundary
      await cA.rpc('editor_request_cancel', { p_project: pid })
      const p = await waitSettled(pid, 30_000, label)
      stopWorker(w)
      const rows = await analyses(item.assetId)
      check(`${label} cancelled promptly (not at a later stage boundary)`, p.status === 'cancelled', p.status)
      check(`${label} component row ${expectRow ? 'kept (already persisted)' : 'NOT published'}`,
        expectRow ? rows.length === 1 : rows.length === 0, `rows=${rows.length}`)
    }
    await cancelAt('G1 mid-download', G1, 'during_download', false)
    await cancelAt('G2 mid-probe', G2, 'during_probe', false)
    await cancelAt('G3 after-persist', G3, 'after_persist', true)

    // G4: crash while held before the probe → reclaim → attempt 2 completes;
    // concurrent-miss convergence: exactly ONE component row in the end.
    await stripProbeFacts(G4.assetId)
    const pid4 = await startProject(cA, G4.gen, G4.assetId)
    const w4 = startWorker('p4-crash', { WORKER_VISIBILITY_SECS: '8', EDITOR_INSPECT_SLOW_POINT: 'before_probe', EDITOR_INSPECT_SLOW_MS: '8000' })
    const t0 = Date.now()
    for (;;) {
      const p = await getProject(pid4)
      if (p.status === 'inspecting') break
      if (Date.now() - t0 > 30_000) throw new Error('G4: never reached inspecting')
      await sleep(300)
    }
    await sleep(1500)
    stopWorker(w4, 'SIGKILL')
    const p4 = await runToSettled('p4-crash2', pid4, { WORKER_VISIBILITY_SECS: '8' })
    const j4 = await waitJobSettled(pid4)
    check('G4 crash mid-inspection reclaims and completes', p4.status === 'completed' && j4?.attempts === 2, `${p4.status}/${j4?.attempts}`)
    check('G4 convergence: exactly one component despite the crash-retry', (await analyses(G4.assetId)).length === 1)

    // G5: ffprobe timeout classifies RETRYABLE with a sanitized message.
    await stripProbeFacts(G5.assetId)
    const pid5 = await startProject(cA, G5.gen, G5.assetId)
    const w5 = startWorker('p4-timeout', { EDITOR_INSPECT_PROBE_TIMEOUT_MS: '1', WORKER_RETRY_BACKOFF_BASE_SECS: '60' })
    const t5 = Date.now()
    for (;;) { // wait for the first retryable failure to park the job
      const j = await getJob(pid5)
      if (j?.status === 'queued' && j?.attempts === 1 && j?.error) break
      if (Date.now() - t5 > 45_000) throw new Error('G5: retry park not reached')
      await sleep(500)
    }
    stopWorker(w5)
    const ev5 = await getEvents(pid5)
    const retry5 = ev5.find((e) => e.message_code === 'stage_retry_scheduled')
    check('G5 probe timeout → retryable, sanitized stage_timeout', /stage_timeout/.test(retry5?.details?.error ?? '')
      && !/\/tmp\/|https?:/.test(JSON.stringify(retry5?.details)), JSON.stringify(retry5?.details))
    await cA.rpc('editor_request_cancel', { p_project: pid5 }) // settle the parked job
  }

  // =================================================================
  console.log('\n== J. access + immutability ==')
  {
    const uuid = randomUUID()
    const { error: e1 } = await cA.rpc('editor_record_inspection', {
      p_project: uuid, p_job: uuid, p_worker: 'x', p_attempt: 1, p_component: 'inspection',
      p_schema_version: 1, p_bundle_version: 'x', p_source_hash: 'x', p_result: {},
    })
    check('J1 editor_record_inspection denied to authenticated', /permission denied|not exist/.test(e1?.message ?? ''), e1?.message)
    const row = (await analyses(A.assetId))[0]
    const { error: e2 } = await admin.from('media_analyses').update({ result: {} }).eq('id', row.id)
    check('J2 components are immutable even for service role (append-only)', /append-only/.test(e2?.message ?? ''), e2?.message)
    const { error: e3 } = await admin.from('media_analyses').delete().eq('id', row.id)
    check('J3 direct deletes refused (retention via asset cascade only)', /append-only/.test(e3?.message ?? ''), e3?.message)
    const { error: e4 } = await cA.from('media_analyses').insert({
      owner_id: uA.id, source_asset_id: A.assetId, source_hash: 'x', schema_version: 1,
      analyzer_bundle_version: 'client', component: 'inspection', result: {},
    })
    check('J4 clients cannot insert analyses', !!e4, e4?.message)
  }

  // =================================================================
  console.log('\n== K. Phase-4 boundary + hygiene ==')
  {
    // Phase 5 made `transcribing` real: completing Phase-4 projects now also
    // record a speech component. Anything beyond inspection+speech stays a
    // later phase.
    const { count: beyondSpeech } = await admin.from('media_analyses')
      .select('id', { count: 'exact', head: true }).not('component', 'in', '("inspection","speech")')
    check('K1 zero components beyond inspection+speech (visual/audio/hook are later phases)', (beyondSpeech ?? 0) === 0)
    const { count: transcripts } = await admin.from('transcripts')
      .select('id', { count: 'exact', head: true }).in('owner_id', [uA.id, uB.id])
    check('K2 zero legacy transcript rows for this run (speech lives in media_analyses)', (transcripts ?? 0) === 0)
    const count = async (t) => (await admin.from(t).select('id', { count: 'exact', head: true })).count ?? 0
    check('K3 zero edit_plans', (await count('edit_plans')) === 0)
    const { count: outputs } = await admin.from('media_assets').select('id', { count: 'exact', head: true }).eq('kind', 'output')
    check('K4 zero output assets', (outputs ?? 0) === 0)
    const { count: credits } = await admin.from('credit_events').select('id', { count: 'exact', head: true }).in('user_id', [uA.id, uB.id])
    check('K5 zero credit changes for this run', (credits ?? 0) === 0)
    // Fallback probes ran ONLY where the matrix forced the upgrade path.
    let fallbacks = 0; let reuses = 0; let dirty = 0
    for (const pid of allProjects) {
      for (const e of await getEvents(pid)) {
        if (e.message_code === 'inspection_recorded') {
          if (e.details?.fallback_probe_performed) fallbacks++
          if (e.details?.reused_validation_facts) reuses++
        }
        if (/\/tmp\/|https?:\/\//.test(JSON.stringify(e.details ?? {}))) dirty++
      }
    }
    check('K6 ffprobe ran ONLY for forced upgrade paths (D×1 + G4×1 = 2)', fallbacks === 2, `fallbacks=${fallbacks}`)
    check('K7 every complete-facts inspection reused Phase-1 facts (A,C,XA,XB,ROT)', reuses === 5, `reuses=${reuses}`)
    check('K8 no event detail contains urls or temp paths', dirty === 0, `${dirty} dirty`)
    const leftovers = (await readdir(join(tmpdir(), 'editor-v2')).catch(() => []))
    check('K9 editor temp root holds only crash orphans (G4), attempt-scoped',
      leftovers.every((n) => /-a\d+$/.test(n)), JSON.stringify(leftovers))
  }

  stopAll()
  console.log(`\n==== PHASE 4 RESULT: ${passed} passed, ${failures.length} failed ====`)
  if (failures.length) { for (const f of failures) console.log(`  FAILED: ${f}`); process.exit(1) }
}

main().catch((err) => { stopAll(); console.error('phase4 harness crashed:', err); process.exit(1) })
