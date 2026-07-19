// Editor v2 Phase 5 — staging matrix for the REAL `transcribing` stage and
// the speech portion of `analyzing`.
//
// Governing rules under test:
//   * the transcript comes from the ACTUAL recording (espeak-synthesized
//     speech with a known spoken script + an off-script addition) — never a
//     teleprompter, never filtered against one
//   * integrity INDEPENDENT of Phase 4: etag/size reconcile → bounded
//     download → sha256 → only then audio extract + ASR; an inspection that
//     passed moments earlier does NOT authorize later-changed bytes, and a
//     cached speech component never legitimizes changed bytes
//   * one immutable speech component per (asset, 'speech', speech version);
//     repeats cache-hit; version bump recomputes; concurrent misses and
//     crash-retries converge on ONE row; rows are append-only
//   * candidates ONLY (silence/filler/false-start/repetition with evidence);
//     off-script words retained; low ASR confidence alone is never a candidate
//   * cooperative cancellation lands during download, mid-ASR (process group
//     killed promptly) and after persist; provider failures surface sanitized
//   * boundary: nothing beyond inspection+speech — no plans/outputs/credits
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

// The words the probe SPEAKS on-script (segments 1+2) and off-script (3).
const SCRIPTED = 'the quick brown fox jumps over the lazy dog um i want i want to tell you about pineapples today'
const OFFSCRIPT_WORDS = ['bananas', 'wonderful', 'morning']
const normWords = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean)

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

const allProjects = []
async function startProject(client, genId, assetId) {
  for (let attempt = 0; ; attempt++) {
    const r = await callEdge(client, 'start-editor-v2', {
      generation_id: genId, source_asset_id: assetId, idempotency_key: randomUUID(),
    })
    if (r.status === 429 && attempt < 2) {
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
async function speechRows(assetId) {
  return (await admin.from('media_analyses').select('*')
    .eq('source_asset_id', assetId).eq('component', 'speech').order('created_at')).data ?? []
}
async function waitSettled(id, timeoutMs = 150_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && ['completed', 'failed', 'cancelled'].includes(p.status)) return p
    if (Date.now() - start > timeoutMs) throw new Error(`waitSettled ${label || id}: ${p?.status}`)
    await sleep(500)
  }
}
async function waitStage(id, stage, timeoutMs = 120_000, label = '') {
  const start = Date.now()
  for (;;) {
    const p = await getProject(id)
    if (p && p.status === stage) return p
    if (p && ['completed', 'failed', 'cancelled'].includes(p.status)) throw new Error(`waitStage ${label}: settled early (${p.status})`)
    if (Date.now() - start > timeoutMs) throw new Error(`waitStage ${label || id}: ${p?.status}`)
    await sleep(300)
  }
}
async function waitJobSettled(pid, timeoutMs = 20_000) {
  const start = Date.now()
  for (;;) {
    const j = await getJob(pid)
    if (j && ['done', 'failed'].includes(j.status)) return j
    if (Date.now() - start > timeoutMs) return j
    await sleep(400)
  }
}

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

// ---- fixture: a REAL spoken recording with known content -------------------
//  seg1 (scripted): "The quick brown fox jumps over the lazy dog."
//  1.5s silence
//  seg2 (scripted): "Um, I want, I want to tell you about pineapples today."
//  1.5s silence
//  seg3 (OFF-script): "Bananas are wonderful in the morning."
async function makeSpeechFixture(dir) {
  const es = (out, text) => execFile('espeak-ng', ['-v', 'en-us', '-s', '130', '-a', '120', '-w', out, text], { timeout: 60_000 })
  const ff = (args) => execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 120_000 })
  await es(join(dir, 's1.wav'), 'The quick brown fox jumps over the lazy dog.')
  await es(join(dir, 's2.wav'), 'Um, I want, I want to tell you about pineapples today.')
  await es(join(dir, 's3.wav'), 'Bananas are wonderful in the morning.')
  await ff(['-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '1.5', '-sample_fmt', 's16', join(dir, 'gap.wav')])
  for (const f of ['s1', 's2', 's3']) {
    await ff(['-i', join(dir, `${f}.wav`), '-ac', '1', '-ar', '22050', '-sample_fmt', 's16', join(dir, `${f}n.wav`)])
  }
  await ff(['-i', join(dir, 's1n.wav'), '-i', join(dir, 'gap.wav'), '-i', join(dir, 's2n.wav'),
    '-i', join(dir, 'gap.wav'), '-i', join(dir, 's3n.wav'),
    '-filter_complex', '[0:a][1:a][2:a][3:a][4:a]concat=n=5:v=0:a=1[a]', '-map', '[a]', join(dir, 'speech.wav')])
  const dur = (await execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(dir, 'speech.wav')])).stdout.trim()
  await ff(['-f', 'lavfi', '-i', `testsrc=size=720x1280:rate=30:duration=${Math.ceil(Number(dur))}`,
    '-i', join(dir, 'speech.wav'),
    '-c:v', 'libvpx', '-b:v', '500k', '-c:a', 'libvorbis', '-shortest', join(dir, 'speech.webm')])
  console.log(`  fixture: ${dur}s spoken recording`)
  return { speech: await readFile(join(dir, 'speech.webm')), durationSec: Number(dur) }
}

async function mintReady(client, ownerId, buf) {
  const gen = await newGen(ownerId)
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
    method: 'PUT',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': ct },
    body: buf,
  })
  if (!res.ok) throw new Error(`tamper overwrite failed: ${res.status} ${(await res.text()).slice(0, 120)}`)
  const after = await headEtag(asset)
  if (!before || !after || before === after) throw new Error(`tamper NOT effective: etag ${before} -> ${after}`)
}

async function runToSettled(name, projectId, extraEnv = {}, timeoutMs = 150_000) {
  const w = startWorker(name, extraEnv)
  const p = await waitSettled(projectId, timeoutMs, name)
  stopWorker(w)
  return p
}

// =====================================================================
async function main() {
  console.log('== setup ==')
  const dir = await mkdtemp(join(tmpdir(), 'phase5-'))
  const [fix, uA, uB] = await Promise.all([makeSpeechFixture(dir), makeUser('p5a'), makeUser('p5b')])
  const [cA, cB] = await Promise.all([login(uA.email), login(uB.email)])

  // Settle strays from earlier matrices (same persistent staging DB).
  await admin.from('jobs').update({ status: 'done', result: { drained_by: 'phase5-setup' }, locked_at: null, locked_by: null })
    .eq('type', 'editor_v2').in('status', ['queued', 'running'])
  await admin.from('edit_projects').update({ status: 'cancelled' }).not('status', 'in', '("completed","failed","cancelled")')

  const validator = startWorker('p5-validator', { WORKER_JOB_TYPES: 'validate_source' })
  const S = await mintReady(cA, uA.id, fix.speech)   // happy path + cache + version chain
  const XA = await mintReady(cA, uA.id, fix.speech)  // cross-tenant: identical bytes, owner A
  const XB = await mintReady(cB, uB.id, fix.speech)  // cross-tenant: identical bytes, owner B
  const T = await mintReady(cA, uA.id, fix.speech)   // tamper mid-project (speech's own guard)
  const T2 = await mintReady(cA, uA.id, fix.speech)  // cached speech never legitimizes tamper
  const G4 = await mintReady(cA, uA.id, fix.speech)  // crash after speech → converge
  const CC = await mintReady(cA, uA.id, fix.speech)  // stale-writer fence
  const P = await mintReady(cA, uA.id, fix.speech)   // provider failure sanitized
  // Cancellation gets a dedicated asset PER window (each project settles
  // cancelled before publishing, except after_persist which keeps its row).
  const CANCEL_POINTS = [
    { key: 'before_download', label: 'before download', slow: 'before_reconcile', waitStage: true },
    { key: 'during_download', label: 'during download', slow: 'during_download', waitStage: true },
    { key: 'during_extract', label: 'during audio extraction', slow: 'during_extract', waitWav: true },
    { key: 'model_load', label: 'during model loading', hold: 'after_model_load', waitWav: true },
    { key: 'mid_transcription', label: 'mid-transcription', hold: 'after_transcribe', waitWav: true },
    { key: 'after_asr', label: 'after transcription, before persist', slow: 'after_asr_before_persist', waitWav: true },
    { key: 'after_persist', label: 'after persistence, before stage advance', slow: 'after_persist', keepsRow: true, waitWav: true },
  ]
  const cancelAssets = {}
  for (const p of CANCEL_POINTS) cancelAssets[p.key] = await mintReady(cA, uA.id, fix.speech)
  stopWorker(validator)

  const { count: creditsBefore } = await admin.from('credit_events')
    .select('id', { count: 'exact', head: true }).eq('user_id', uA.id)

  // =================================================================
  console.log('\n== S. real transcription of a real recording ==')
  {
    const pid = await startProject(cA, S.gen, S.assetId)
    const proj = await runToSettled('p5-happy', pid)
    check('S1 project completed with the real transcribing stage', proj.status === 'completed', proj.status)

    const rows = await speechRows(S.assetId)
    check('S2 exactly ONE speech component (asset × speech × speech-1)',
      rows.length === 1 && rows[0].analyzer_bundle_version === 'speech-1', `rows=${rows.length}`)
    const r = rows[0]?.result ?? {}
    check('S3 component identity: schema 1, checksum bound to the validated bytes',
      r.schemaVersion === 1 && r.speechVersion === 'speech-1' && r.sourceChecksum === S.asset.content_sha256)

    const words = r.words ?? []
    check('S4 words exist with integer ms, ordered, deterministic ids',
      words.length > 5
      && words.every((w, i) => w.id === `w${i}` && Number.isInteger(w.startMs) && Number.isInteger(w.endMs) && w.endMs >= w.startMs)
      && words.every((w, i) => i === 0 || w.startMs >= words[i - 1].startMs),
      `words=${words.length}`)
    check('S5 word confidences are real probabilities (not defaulted)',
      words.some((w) => w.confidence > 0 && w.confidence < 1))

    const heard = new Set(normWords(r.transcript ?? ''))
    const scripted = [...new Set(normWords(SCRIPTED))]
    const overlap = scripted.filter((w) => heard.has(w)).length / scripted.length
    console.log(`  transcript: ${r.transcript}`)
    check('S6 transcript matches the ACTUAL recording (>=50% scripted-word recall)',
      overlap >= 0.5, `recall=${(overlap * 100).toFixed(0)}%`)
    check('S7 off-script words the speaker ADDED are retained (not teleprompter-filtered)',
      OFFSCRIPT_WORDS.some((w) => heard.has(w)), `heard=${[...heard].join(' ')}`)

    check('S8 sentence boundaries derived (>=2 sentences with word spans)',
      (r.sentences ?? []).length >= 2 && r.sentences.every((s) => s.firstWordId && s.lastWordId && Number.isInteger(s.startMs)))
    check('S9 VAD evidence: multiple speech regions on the source timeline',
      (r.vadSegments ?? []).length >= 2 && r.vadSegments.every((v) => Number.isInteger(v.startMs) && v.endMs > v.startMs))
    check('S10 bounded energy curve present',
      r.energy && r.energy.windowMs >= 100 && Array.isArray(r.energy.rms) && r.energy.rms.length > 0 && r.energy.rms.length <= 2000)

    const cands = r.candidates ?? []
    const kinds = new Set(cands.map((c) => c.kind))
    const sil = cands.filter((c) => c.kind === 'silence')
    check('S11 silence candidates are banded (removable / dead_air) over the inserted gaps',
      sil.some((c) => c.evidence?.gapMs >= 1000 && ['removable', 'dead_air'].includes(c.evidence?.class)),
      JSON.stringify(sil.map((c) => ({ gapMs: c.evidence?.gapMs, class: c.evidence?.class, conf: c.confidence }))))
    check('S12 filler candidate for the spoken "um" (disfluency)',
      cands.some((c) => c.kind === 'filler' && c.evidence?.markerType === 'disfluency'
        && (c.evidence?.words ?? []).some((w) => /um/i.test(w))),
      JSON.stringify(cands.filter((c) => c.kind === 'filler')))
    check('S13 the "I want, I want" stumble is a false_start/repetition CANDIDATE',
      kinds.has('false_start') || kinds.has('repetition'), [...kinds].join(','))
    check('S14 candidates are PROPOSALS: safeToConsider, evidence codes, rule version, bounded confidence',
      cands.length > 0 && cands.every((c) =>
        c.safeToConsider === true && !('safeToRemove' in c)
        && Array.isArray(c.evidenceCodes) && c.evidenceCodes.length > 0
        && c.ruleVersion === 'speech-rules-1'
        && ['high', 'medium', 'low'].includes(c.confidence)
        && 'prevWordId' in c && 'nextWordId' in c))

    const ev = await getEvents(pid)
    const rec = ev.find((e) => e.message_code === 'speech_recorded')
    const ver = ev.find((e) => e.message_code === 'speech_analysis_verified')
    check('S15 speech_recorded event: fresh ASR, no cache',
      rec?.details?.cache_hit === false && rec?.details?.asr_performed === true && rec?.details?.word_count === words.length,
      JSON.stringify(rec?.details))
    check('S16 analyzing re-verified the durable component',
      ver?.details?.word_count === words.length && ver?.details?.speech_version === 'speech-1', JSON.stringify(ver?.details))
    const job = await waitJobSettled(pid)
    check('S17 job result carries the speech summary', job?.result?.speech?.asrPerformed === true, JSON.stringify(job?.result?.speech))
    check('S18 provenance pins engine/model/vad', r.provenance?.asrEngine === 'faster-whisper' && r.provenance?.vad === 'silero')
    check('S19 the speech write did NOT clobber the inspection epoch (0085)',
      proj.analysis_version === 'inspect-1', String(proj.analysis_version))
    // Word timing contract: monotonic, non-overlapping beyond a small tolerated
    // ASR overlap, every word inside the source duration.
    let mono = true; let inBounds = true; let overlaps = 0
    for (let i = 0; i < words.length; i++) {
      if (words[i].endMs < words[i].startMs) inBounds = false
      if (words[i].endMs > r.durationMs + 50 || words[i].startMs < 0) inBounds = false
      if (i > 0) {
        if (words[i].startMs < words[i - 1].startMs) mono = false
        if (words[i].startMs < words[i - 1].endMs - 50) overlaps++
      }
    }
    check('S20 words monotonic, in-bounds, no material overlaps', mono && inBounds && overlaps === 0,
      `mono=${mono} inBounds=${inBounds} overlaps=${overlaps}`)
  }

  // =================================================================
  console.log('\n== X. cross-tenant identical bytes stay isolated ==')
  {
    check('X1 identical bytes → identical checksums (the collision case)',
      XA.asset.content_sha256 === XB.asset.content_sha256 && !!XA.asset.content_sha256)
    const pidA = await startProject(cA, XA.gen, XA.assetId)
    const pidB = await startProject(cB, XB.gen, XB.assetId)
    const w = startWorker('p5-xtenant')
    const [pA, pB] = await Promise.all([waitSettled(pidA, 180_000, 'xA'), waitSettled(pidB, 180_000, 'xB')])
    stopWorker(w)
    check('X2 both tenants completed', pA.status === 'completed' && pB.status === 'completed', `${pA.status}/${pB.status}`)
    const rowsA = await speechRows(XA.assetId); const rowsB = await speechRows(XB.assetId)
    check('X3 each asset owns its OWN speech row (no cross-tenant dedup)',
      rowsA.length === 1 && rowsB.length === 1 && rowsA[0].id !== rowsB[0].id)
    check('X4 owner is derived from the asset, not the caller',
      rowsA[0].owner_id === uA.id && rowsB[0].owner_id === uB.id, `${rowsA[0].owner_id}/${rowsB[0].owner_id}`)
  }

  // =================================================================
  console.log('\n== C. analyze once — the second project reuses the component ==')
  {
    // Same (generation, asset), new idempotency key after the first settled —
    // the product path for "edit this recording again".
    const pid = await startProject(cA, S.gen, S.assetId)
    const proj = await runToSettled('p5-cache', pid)
    check('C1 repeat project completed', proj.status === 'completed', proj.status)
    const ev = await getEvents(pid)
    const rec = ev.find((e) => e.message_code === 'speech_recorded')
    check('C2 speech cache HIT — no second ASR run',
      rec?.details?.cache_hit === true && rec?.details?.asr_performed === false, JSON.stringify(rec?.details))
    check('C3 still exactly ONE component row', (await speechRows(S.assetId)).length === 1)
  }

  // =================================================================
  console.log('\n== V. version bump recomputes; components immutable ==')
  {
    const pid = await startProject(cA, S.gen, S.assetId)
    const proj = await runToSettled('p5-v2', pid, { EDITOR_SPEECH_VERSION: 'speech-2' })
    check('V1 bumped-version project completed', proj.status === 'completed', proj.status)
    const rows = await speechRows(S.assetId)
    check('V2 a NEW immutable component for speech-2 (both rows kept)',
      rows.length === 2 && new Set(rows.map((x) => x.analyzer_bundle_version)).size === 2, `rows=${rows.length}`)
    check('V3 recording speech-2 did not stamp the inspection epoch',
      proj.analysis_version !== 'speech-2', String(proj.analysis_version))

    const { error: upErr } = await admin.from('media_analyses')
      .update({ result: { forged: true } }).eq('id', rows[0].id)
    check('V4 component rows are append-only (UPDATE rejected even for service role)',
      /append-only|immutable/i.test(upErr?.message ?? ''), upErr?.message ?? 'no error')
    const { error: delErr } = await admin.from('media_analyses').delete().eq('id', rows[0].id)
    check('V5 DELETE rejected too', /append-only|immutable/i.test(delErr?.message ?? ''), delErr?.message ?? 'no error')
  }

  // =================================================================
  console.log('\n== T. integrity: earlier green checks never authorize changed bytes ==')
  {
    // T-a: inspection passes, THEN the bytes change, before transcribing's own
    // reconcile — the speech stage must catch it itself.
    const pid = await startProject(cA, T.gen, T.assetId)
    const w = startWorker('p5-tamper', { EDITOR_SPEECH_SLOW_POINT: 'before_reconcile', EDITOR_SPEECH_SLOW_MS: '9000' })
    await waitStage(pid, 'transcribing', 120_000, 'tamper-window')
    await tamperObject({ bucket: T.asset.bucket, storage_path: T.asset.storage_path }, Buffer.from(`tampered-${randomUUID()}`))
    console.log('  tampered during the transcribing hold (inspection already green)')
    const proj = await waitSettled(pid, 150_000, 'tamper')
    stopWorker(w)
    check('T1 project failed source_bytes_changed IN transcribing — Phase-4 green did not authorize',
      proj.status === 'failed' && proj.failure_code === 'source_bytes_changed' && proj.failure_details?.stage === 'transcribing',
      `${proj.status}/${proj.failure_code}/${proj.failure_details?.stage}`)
    check('T2 no speech component recorded for the tampered asset', (await speechRows(T.assetId)).length === 0)
    const ev = await getEvents(pid)
    check('T3 inspection had ALREADY passed in this very run (the point of the test)',
      ev.some((e) => e.message_code === 'inspection_recorded'))
    check('T4 no ASR ran on tampered bytes', !ev.some((e) => e.message_code === 'speech_recorded'))

    // T-b: a CACHED speech component must not legitimize changed bytes either.
    const pid1 = await startProject(cA, T2.gen, T2.assetId)
    const p1 = await runToSettled('p5-t2-seed', pid1)
    check('T5 seed project completed (speech cached)', p1.status === 'completed', p1.status)
    await tamperObject({ bucket: T2.asset.bucket, storage_path: T2.asset.storage_path }, Buffer.from(`tampered-${randomUUID()}`))
    const pid2 = await startProject(cA, T2.gen, T2.assetId)
    const p2 = await runToSettled('p5-t2-replay', pid2)
    check('T6 replay failed source_bytes_changed BEFORE any cached analysis was reused',
      p2.status === 'failed' && p2.failure_code === 'source_bytes_changed', `${p2.status}/${p2.failure_code}`)
    check('T7 the cached component was not re-served for changed bytes',
      !(await getEvents(pid2)).some((e) => e.message_code === 'speech_recorded' && e.details?.cache_hit === true))
  }

  // =================================================================
  console.log('\n== G. cooperative cancellation lands in EVERY real speech window ==')
  {
    const base = join(tmpdir(), 'editor-v2')
    const wavDirs = async () => {
      const out = new Set()
      try {
        for (const d of await readdir(base)) {
          try { if ((await readdir(join(base, d))).includes('speech-audio.wav')) out.add(d) } catch { }
        }
      } catch { }
      return out
    }
    let gi = 0
    for (const point of CANCEL_POINTS) {
      gi++
      const a = cancelAssets[point.key]
      const extraEnv = point.hold
        ? { EDITOR_SPEECH_BRIDGE_HOLD_AT: point.hold, EDITOR_SPEECH_BRIDGE_HOLD_MS: '20000' }
        : { EDITOR_SPEECH_SLOW_POINT: point.slow, EDITOR_SPEECH_SLOW_MS: '9000' }
      // Snapshot existing wav scratch dirs BEFORE this case so we detect only
      // the wav THIS run extracts (not leftovers).
      const pre = await wavDirs()
      const pid = await startProject(cA, a.gen, a.assetId)
      const w = startWorker(`p5-cancel-${point.key}`, extraEnv)
      await waitStage(pid, 'transcribing', 120_000, `cancel-${point.key}`)
      // For bridge-hold windows (model load / mid-transcription / after-asr),
      // wait until a NEW extracted wav proves the bridge is running.
      if (point.waitWav) {
        const deadline = Date.now() + 60_000
        let saw = false
        while (Date.now() < deadline && !saw) {
          saw = [...await wavDirs()].some((d) => !pre.has(d))
          if (!saw) await sleep(250)
        }
      } else {
        await sleep(800)
      }
      await cA.rpc('editor_request_cancel', { p_project: pid })
      const t0 = Date.now()
      const p = await waitSettled(pid, 60_000, `cancel-${point.key}`)
      const elapsed = Date.now() - t0
      stopWorker(w)
      check(`G${gi} cancel ${point.label} → cancelled promptly (process group torn down)`,
        p.status === 'cancelled' && elapsed < 25_000, `${p.status} in ${elapsed}ms`)
      const rows = await speechRows(a.assetId)
      if (point.keepsRow) {
        check(`G${gi}b after-persist keeps the valid immutable component`, rows.length === 1, `rows=${rows.length}`)
      } else {
        check(`G${gi}b no component written from the aborted run`, rows.length === 0, `rows=${rows.length}`)
      }
      // No stage advanced past transcribing after cancellation.
      check(`G${gi}c no stage advanced past transcribing after cancel`,
        !(await getEvents(pid)).some((e) => e.message_code === 'stage_started'
          && ['directing', 'compiling', 'rendering', 'validating'].includes(e.stage)))
    }

    // After a post-persist cancellation the kept component is reusable: the
    // next project converges on it (cache hit, still one row).
    const ap = cancelAssets.after_persist
    const pidR = await startProject(cA, ap.gen, ap.assetId)
    const pR = await runToSettled('p5-cancel-converge', pidR)
    check('G8 post-persist component is reusable — next project cache-hits it',
      pR.status === 'completed'
      && (await getEvents(pidR)).some((e) => e.message_code === 'speech_recorded' && e.details?.cache_hit === true)
      && (await speechRows(ap.assetId)).length === 1)

    // Crash AFTER speech persisted → reclaim resumes, cache-hits, ONE row.
    const pid5 = await startProject(cA, G4.gen, G4.assetId)
    const w5 = startWorker('p5-crash', {
      WORKER_VISIBILITY_SECS: '30', EDITOR_SIM_CRASH_POINT: 'before_stage:analyzing', EDITOR_SIM_FAIL_ATTEMPTS: '1',
    })
    await new Promise((r) => w5.on('exit', r))
    workers.delete(w5)
    const p5 = await runToSettled('p5-crash-2', pid5, { WORKER_VISIBILITY_SECS: '30' })
    const ev5 = await getEvents(pid5)
    check('G9 crash after speech → resumed run completed', p5.status === 'completed', p5.status)
    check('G10 the resumed attempt REUSED the crashed attempt\'s component (converged, 1 row)',
      (await speechRows(G4.assetId)).length === 1
      && ev5.some((e) => e.message_code === 'speech_recorded' && e.details?.cache_hit === true))
  }

  // =================================================================
  console.log('\n== F. a stale ASR writer cannot publish (attempt-token fence) ==')
  {
    // Worker A stalls INSIDE the speech stage (SIGSTOP during the before_asr
    // hold, so its lease-renewal loop freezes too); worker B reclaims after
    // lease expiry, runs the FULL ASR and persists. A is then resumed: it
    // finishes its own ASR and tries to persist with the superseded attempt
    // token — the fenced writer must refuse, converging on B's single row.
    const base = join(tmpdir(), 'editor-v2')
    const wavDirs = async () => {
      const out = new Set()
      try {
        for (const d of await readdir(base)) {
          try { if ((await readdir(join(base, d))).includes('speech-audio.wav')) out.add(d) } catch { }
        }
      } catch { }
      return out
    }
    const preexisting = await wavDirs() // G-d's crashed attempt left one behind
    const pid = await startProject(cA, CC.gen, CC.assetId)
    const wA = startWorker('p5-fence-a', {
      WORKER_VISIBILITY_SECS: '10', EDITOR_SPEECH_SLOW_POINT: 'before_asr', EDITOR_SPEECH_SLOW_MS: '45000',
    })
    await waitStage(pid, 'transcribing', 120_000, 'fence')
    // A NEW extracted wav = A finished extraction and is entering the hold;
    // freeze it mid-stage.
    const holdDeadline = Date.now() + 60_000
    let inHold = false
    while (Date.now() < holdDeadline && !inHold) {
      inHold = [...await wavDirs()].some((d) => !preexisting.has(d))
      if (!inHold) await sleep(250)
    }
    check('F0 observed A inside the speech stage (extraction done)', inHold)
    wA.kill('SIGSTOP')
    console.log('  worker A frozen inside the speech stage; waiting for reclaim')

    const wB = startWorker('p5-fence-b', { WORKER_VISIBILITY_SECS: '10' })
    const p = await waitSettled(pid, 180_000, 'fence-b')
    check('F1 reclaimed worker B completed the project', p.status === 'completed', p.status)
    const rowsAfterB = await speechRows(CC.assetId)
    check('F2 B recorded the single speech component', rowsAfterB.length === 1)

    wA.kill('SIGCONT')
    console.log('  worker A resumed; its stale persist must be fenced off')
    await sleep(20_000) // A finishes its ASR and hits the fenced writer
    stopWorker(wA); stopWorker(wB)
    const rowsAfterA = await speechRows(CC.assetId)
    check('F3 the stale writer changed NOTHING (still one row, same id)',
      rowsAfterA.length === 1 && rowsAfterA[0].id === rowsAfterB[0].id)
    const asrEvents = (await getEvents(pid)).filter((e) => e.message_code === 'speech_recorded')
    check('F4 exactly one speech_recorded event (the stale attempt appended nothing)',
      asrEvents.length === 1 && asrEvents[0].details?.asr_performed === true, `events=${asrEvents.length}`)
    const job = await getJob(pid)
    check('F5 the job shows the reclaim (attempt 2 settled it)', job?.attempts === 2 && job?.status === 'done', `attempts=${job?.attempts}`)
  }

  // =================================================================
  console.log('\n== P. provider failure surfaces SANITIZED ==')
  {
    const pid = await startProject(cA, P.gen, P.assetId)
    const proj = await runToSettled('p5-provider', pid, { EDITOR_SPEECH_MODEL: 'no-such-model-p5' }, 240_000)
    check('P1 provider failure fails the project after the retry budget',
      proj.status === 'failed' && ['asr_failed', 'retries_exhausted'].includes(proj.failure_code),
      `${proj.status}/${proj.failure_code}`)
    check('P2 stable sanitized code + retry class recorded',
      proj.failure_details?.code === 'asr_failed' && proj.failure_details?.retry === 'retryable',
      JSON.stringify(proj.failure_details))
    const ev = await getEvents(pid)
    const durable = JSON.stringify({ d: proj.failure_details, e: ev.map((x) => x.details) })
    check('P3 no URLs, hosts, or filesystem paths leak into durable state',
      !/https?:\/\/|huggingface|\/tmp\/|dist-packages|site-packages/.test(durable), durable.slice(0, 300))
    check('P4 no component recorded from failed provider runs', (await speechRows(P.assetId)).length === 0)
  }

  // =================================================================
  console.log('\n== B. phase boundary: speech evidence only, nothing downstream ==')
  {
    const runAssets = [S, XA, XB, T, T2, G4, CC, P, ...Object.values(cancelAssets)].map((x) => x.assetId)
    const { data: comps } = await admin.from('media_analyses')
      .select('component').in('source_asset_id', runAssets)
    const kinds = new Set((comps ?? []).map((c) => c.component))
    check('B1 only inspection+speech components exist (visual/audio/hook = 0)',
      [...kinds].every((k) => ['inspection', 'speech'].includes(k)) && kinds.has('speech'), [...kinds].join(','))
    const count = async (t) => (await admin.from(t).select('id', { count: 'exact', head: true })).count ?? 0
    check('B2 zero edit_plans (no Director/EditPlan — later phases)', (await count('edit_plans')) === 0)
    const { count: outputs } = await admin.from('media_assets').select('id', { count: 'exact', head: true }).eq('kind', 'output')
    check('B3 zero output assets — no FFmpeg VIDEO editing (audio extraction only)', (outputs ?? 0) === 0)
    const { count: creditsAfter } = await admin.from('credit_events')
      .select('id', { count: 'exact', head: true }).in('user_id', [uA.id, uB.id])
    check('B4 zero credit events for the run users (no charging)', (creditsAfter ?? 0) === (creditsBefore ?? 0),
      `${creditsBefore}->${creditsAfter}`)
    const { count: transcripts } = await admin.from('transcripts')
      .select('id', { count: 'exact', head: true }).in('owner_id', [uA.id, uB.id])
    check('B5 zero legacy transcript rows (speech lives only in media_analyses)', (transcripts ?? 0) === 0)
    // No Gemini Director in this phase: a completed speech project reaches
    // `completed` with only speech evidence; no plan/analysis rows beyond the
    // two sanctioned components exist (B1+B2), which is the observable proof
    // that no Director/EditPlan generation ran.
    check('B6 no analysis beyond the two sanctioned components (no Gemini Director output)',
      (comps ?? []).every((c) => ['inspection', 'speech'].includes(c.component)))

    // Temp hygiene: every attempt dir belonging to THIS run's jobs is gone —
    // except the deliberately SIGKILLed crash attempt (G-d), which the age
    // sweep owns (proven in the Phase-3 T-series). Dirs from earlier matrices
    // are out of scope here.
    const jobIds = new Set()
    for (const pid of allProjects) { const j = await getJob(pid); if (j) jobIds.add(j.id) }
    const leftovers = []
    try {
      const base = join(tmpdir(), 'editor-v2')
      for (const d of await readdir(base)) {
        if (jobIds.has(d.replace(/-a\d+$/, ''))) leftovers.push(d)
      }
    } catch { }
    // Only a hard-crashed FIRST attempt (G-d's SIGKILL window) may survive —
    // the age sweep owns those (proven in the Phase-3 T-series). Every
    // graceful exit path must have removed its dir.
    check('B6 settled runs left no attempt dirs (crashed first attempt excepted)',
      leftovers.every((d) => d.endsWith('-a1')), leftovers.join(','))

    // Event hygiene across every project this run created.
    let dirty = 0
    for (const pid of allProjects) {
      for (const e of await getEvents(pid)) {
        if (/\/tmp\/|https?:\/\//.test(JSON.stringify(e.details ?? {}))) dirty++
      }
    }
    check('B7 no event detail contains urls or temp paths', dirty === 0, `${dirty} dirty`)
  }

  // =================================================================
  stopAll()
  console.log(`\n==== phase5 matrix: ${passed} passed, ${failures.length} failed ====`)
  if (failures.length) { for (const f of failures) console.log(`  FAILED: ${f}`); process.exit(1) }
}

main().catch((e) => { console.error('phase5 matrix crashed:', e); stopAll(); process.exit(1) })
