// Editor v2 Phase 2 — staging authorization/idempotency matrix for
// start-editor-v2, against the dedicated staging Supabase project.
//
// The gate:
//   eligible source + one or many repeated requests
//   → one edit project → one queued editor_v2 job → same project to every caller
// plus every rejection path (unready/rejected/deleted/no-audio/ineligible/
// foreign/mismatched), unrelated-user + anonymous denial, the workspace rule
// (peers observe, only owners start), rate/concurrency limits, client
// write-denial on all four editor tables, and the Phase-2 boundary proofs:
// no AI provider/renderer runs (the queued job is never claimed), no output
// asset is created, no credit is charged.
//
// Ready sources are minted through the REAL Phase-1 chain (edge fn → signed
// PUT → finalize → real worker ffprobe), not by service-role fiat.
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
const startEdit = (client, generationId, sourceAssetId, idempotencyKey, extra = {}) =>
  callEdge(client, 'start-editor-v2', { generation_id: generationId, source_asset_id: sourceAssetId, idempotency_key: idempotencyKey, ...extra })

// ---- Phase-1 source pipeline (real chain) to mint ready/rejected assets ----
async function putSigned(signedUrl, buf, contentType) {
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true', 'content-type': contentType }, body: buf })
  return res.status
}
async function sourceFlow(client, genId, buf, contentType) {
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
async function waitTerminal(assetId, timeoutMs = 120_000) {
  const start = Date.now()
  for (;;) {
    const { data: a } = await admin.from('media_assets').select('id,status,has_audio,metadata').eq('id', assetId).maybeSingle()
    if (a && (a.status === 'ready' || a.status === 'rejected')) return a
    if (Date.now() - start > timeoutMs) return a
    await sleep(1500)
  }
}

let worker = null
function startWorker() {
  worker = spawn('node', ['dist/index.js'], {
    cwd: 'worker',
    env: {
      ...process.env,
      SUPABASE_URL: URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      // validate_source ONLY — editor_v2 has NO handler in Phase 2 and the
      // queued job must remain untouched. That absence is itself under test.
      WORKER_JOB_TYPES: 'validate_source',
      WORKER_POLL_MS: '500',
      WORKER_VISIBILITY_SECS: '20',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  worker.stdout.on('data', (d) => process.stdout.write(`[worker] ${d}`))
  worker.stderr.on('data', (d) => process.stderr.write(`[worker!] ${d}`))
}
function killWorker() { if (worker) { worker.kill('SIGTERM'); worker = null } }

async function projectsFor(field, value) {
  const { data } = await admin.from('edit_projects').select('*').eq(field, value)
  return data ?? []
}
async function editorJobs(projectId) {
  const { data } = await admin.from('jobs').select('id,status,dedup_key').like('dedup_key', `editor_v2:${projectId}:%`)
  return data ?? []
}

async function makeFixtures(dir) {
  const ff = (args) => execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 120_000 })
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libvorbis', '-shortest', join(dir, 'good.webm')])
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=640x1138:rate=30:duration=6', '-c:v', 'libvpx', '-b:v', '400k', '-an', join(dir, 'noaudio.webm')])
  return {
    good: await readFile(join(dir, 'good.webm')),
    noaudio: await readFile(join(dir, 'noaudio.webm')),
  }
}

// =====================================================================
async function main() {
  console.log('== setup: identities, fixtures, ready sources via the REAL chain ==')
  const dir = await mkdtemp(join(tmpdir(), 'phase2-'))
  const [fix, owner, peer, outsider, rateUser] = await Promise.all([
    makeFixtures(dir), makeUser('p2owner'), makeUser('p2peer'), makeUser('p2out'), makeUser('p2rate'),
  ])
  {
    const { error } = await admin.from('workspace_members').insert({ owner_id: owner.id, member_id: peer.id })
    if (error) throw new Error(`workspace_members: ${error.message}`)
  }
  const cOwner = await login(owner.email)
  const cPeer = await login(peer.email)
  const cOutsider = await login(outsider.email)
  const cRate = await login(rateUser.email)
  const cAnon = createClient(URL, ANON, { auth: { persistSession: false } })

  // Credits baseline — Phase 2 must not charge anything.
  const { count: creditsBefore } = await admin.from('credit_events').select('id', { count: 'exact', head: true })

  startWorker()
  // Mint through the real chain: two good sources (main + concurrency-cap gen),
  // a no-audio ready source, a corrupt rejected source, plus an in-flight one.
  const genA = await newGen(owner.id)
  const genB = await newGen(owner.id)
  const genNoAudio = await newGen(owner.id)
  const genRejected = await newGen(owner.id)
  const genValidating = await newGen(owner.id)
  const srcA = await sourceFlow(cOwner, genA, fix.good, 'video/webm')
  const srcB = await sourceFlow(cOwner, genB, fix.good, 'video/webm')
  const srcNoAudio = await sourceFlow(cOwner, genNoAudio, fix.noaudio, 'video/webm')
  // Genuinely unprobeable bytes (a truncated WEBM still probes — its headers
  // are at the front — so use random data, which no demuxer can parse).
  const { randomBytes } = await import('node:crypto')
  const srcRejected = await sourceFlow(cOwner, genRejected, randomBytes(50_000), 'video/webm')
  const a = await waitTerminal(srcA)
  const b = await waitTerminal(srcB)
  const na = await waitTerminal(srcNoAudio)
  const rj = await waitTerminal(srcRejected)
  check('setup: source A ready', a?.status === 'ready', a?.status)
  check('setup: source B ready', b?.status === 'ready', b?.status)
  check('setup: no-audio source ready with has_audio=false', na?.status === 'ready' && na?.has_audio === false, JSON.stringify(na))
  check('setup: corrupt source rejected', rj?.status === 'rejected', rj?.status)
  // In-flight (validating) source: create + upload + finalize with the worker
  // OFF for this one — kill the worker first so it stays validating.
  killWorker()
  await sleep(800)
  const srcValidating = await sourceFlow(cOwner, genValidating, fix.good, 'video/webm')
  const { data: sv } = await admin.from('media_assets').select('status').eq('id', srcValidating).maybeSingle()
  check('setup: in-flight source is validating', sv?.status === 'validating', sv?.status)

  // ---------- G1: the idempotency gate ----------
  console.log('== G1: repeated + concurrent same-key requests → ONE project, ONE queued job ==')
  const key1 = randomUUID()
  {
    const results = await Promise.all(Array.from({ length: 5 }, () => startEdit(cOwner, genA, srcA, key1)))
    check('G1 all 5 concurrent starts succeed', results.every((r) => r.status === 200), results.map((r) => r.status).join(','))
    const ids = new Set(results.map((r) => r.body.projectId))
    check('G1 every caller got the SAME project', ids.size === 1, [...ids].join(','))
    const again = await startEdit(cOwner, genA, srcA, key1) // sequential repeat
    check('G1 sequential repeat returns the same project', again.status === 200 && again.body.projectId === [...ids][0])
    const projs = await projectsFor('source_asset_id', srcA)
    check('G1 exactly one edit_projects row', projs.length === 1, `rows=${projs.length}`)
    check('G1 project status is queued', projs[0]?.status === 'queued', projs[0]?.status)
    const jobs = await editorJobs(projs[0].id)
    check('G1 exactly one editor_v2 job, still queued', jobs.length === 1 && jobs[0].status === 'queued', JSON.stringify(jobs))
  }
  const projectA = (await projectsFor('source_asset_id', srcA))[0]

  // Two browser sessions (same user, fresh login) with the SAME key → the
  // same project. This is the refresh / second-device / timeout-after-commit
  // retry shape: the commit survived, the retry converges.
  {
    const session2 = await login(owner.email)
    const r = await startEdit(session2, genA, srcA, key1)
    check('G1 second session, same key → same project', r.status === 200 && r.body.projectId === projectA.id, JSON.stringify(r.body))
  }
  // Different key, same source, project still active → converge on the SAME
  // active project (no second project/job, nothing charged twice).
  {
    const r = await startEdit(cOwner, genA, srcA, randomUUID())
    check('G1 different key on an ACTIVE source converges on the same project',
      r.status === 200 && r.body.projectId === projectA.id, JSON.stringify(r.body))
    check('G1 still one project row', (await projectsFor('source_asset_id', srcA)).length === 1)
    check('G1 still one job', (await editorJobs(projectA.id)).length === 1)
    // ...including under CONCURRENCY: 4 simultaneous different-key requests.
    // (G1 makes 13 start calls total against the 10/min limit under test —
    // reset the window here so the limiter can't trip the convergence tests.)
    console.log('   (waiting out the rate window…)')
    await sleep(61_000)
    const burst = await Promise.all(Array.from({ length: 4 }, () => startEdit(cOwner, genA, srcA, randomUUID())))
    check('G1 concurrent different keys all converge (active-source uniqueness)',
      burst.every((r2) => r2.status === 200 && r2.body.projectId === projectA.id), burst.map((r2) => r2.status).join(','))
    check('G1 still exactly one project + one job', (await projectsFor('source_asset_id', srcA)).length === 1 && (await editorJobs(projectA.id)).length === 1)
  }
  // KEY-REUSE CONFLICT: the same key with DIFFERENT inputs must 409, never
  // silently answer with the unrelated project.
  {
    const rGen = await startEdit(cOwner, genB, srcB, key1) // key1 is bound to genA/srcA
    check('G1 key reused with different generation+source → 409/idempotency_key_conflict',
      rGen.status === 409 && rGen.body.code === 'idempotency_key_conflict', `status=${rGen.status} code=${rGen.body.code}`)
    const rSrc = await startEdit(cOwner, genA, srcB, key1) // same gen, different source
    check('G1 key reused with different source → 409/idempotency_key_conflict',
      rSrc.status === 409 && rSrc.body.code === 'idempotency_key_conflict', `status=${rSrc.status} code=${rSrc.body.code}`)
    check('G1 conflict created no project for source B', (await projectsFor('source_asset_id', srcB)).length === 0)
  }
  // Job payload is IDs ONLY — no paths, URLs, cuts, prompts, or options.
  {
    const [job] = await editorJobs(projectA.id)
    const { data: full } = await admin.from('jobs').select('payload').eq('id', job.id).maybeSingle()
    const keys = Object.keys(full?.payload ?? {}).sort()
    const UUIDISH = /^[0-9a-f-]{36}$/i
    check('G1 job payload keys are exactly {generation_id, project_id, source_asset_id}',
      JSON.stringify(keys) === JSON.stringify(['generation_id', 'project_id', 'source_asset_id']), keys.join(','))
    check('G1 job payload values are bare IDs', Object.values(full?.payload ?? {}).every((v) => UUIDISH.test(String(v))))
  }
  // Job-loss reconciliation: delete the queued job, repeat the same key → the
  // job is re-inserted, never duplicated.
  {
    await admin.from('jobs').delete().like('dedup_key', `editor_v2:${projectA.id}:%`)
    const r = await startEdit(cOwner, genA, srcA, key1)
    check('G1 reconcile: lost job re-inserted on repeat', r.status === 200 && (await editorJobs(projectA.id)).length === 1)
  }

  // The owner's start_editor rate window (10/min) is itself under test in G3 —
  // let it reset between sections so it can't trip incidentally.
  console.log('   (waiting out the rate window…)')
  await sleep(61_000)

  // ---------- G2: every rejection path, BEFORE any project exists ----------
  console.log('== G2: rejection matrix ==')
  {
    const cases = [
      ['unready (validating) source', genValidating, srcValidating, 409, 'source_not_ready'],
      ['rejected source', genRejected, srcRejected, 409, 'source_rejected'],
      ['no-audio source', genNoAudio, srcNoAudio, 409, 'source_not_editor_eligible'],
      ['generation/source mismatch', genB, srcA, 409, 'generation_mismatch'],
    ]
    for (const [label, g, s, wantStatus, wantCode] of cases) {
      const r = await startEdit(cOwner, g, s, randomUUID())
      check(`G2 ${label} → ${wantStatus}/${wantCode}`, r.status === wantStatus && r.body.code === wantCode,
        `status=${r.status} code=${r.body.code}`)
      const projs = await projectsFor('generation_id', g)
      check(`G2 ${label} created NO project`, projs.length === 0, `rows=${projs.length}`)
    }
    // uploading source: an intent with no bytes/finalize stays 'uploading'
    const genUp = await newGen(owner.id)
    const up = await callEdge(cOwner, 'source-asset', {
      action: 'create', generation_id: genUp, recording_attempt_id: randomUUID(),
      content_type: 'video/webm', size_bytes: 100_000,
    })
    const rUp = await startEdit(cOwner, genUp, up.body.assetId, randomUUID())
    check('G2 uploading source → 409/source_not_ready', rUp.status === 409 && rUp.body.code === 'source_not_ready',
      `status=${rUp.status} code=${rUp.body.code}`)
    // missing source
    const rMiss = await startEdit(cOwner, genA, randomUUID(), randomUUID())
    check('G2 missing source → 404/source_not_found', rMiss.status === 404 && rMiss.body.code === 'source_not_found',
      `status=${rMiss.status} code=${rMiss.body.code}`)
    // asset of a kind other than source (service-minted music asset)
    const { data: musicRow, error: musicErr } = await admin.from('media_assets').insert({
      owner_id: owner.id, generation_id: genA, kind: 'music', bucket: 'takes',
      storage_path: `${owner.id}/music/${randomUUID()}.mp3`, status: 'ready',
    }).select('id').single()
    check('G2 setup: non-source asset minted', !musicErr && !!musicRow, musicErr?.message)
    if (musicRow) {
      const rKind = await startEdit(cOwner, genA, musicRow.id, randomUUID())
      check('G2 non-source kind → 409/not_a_source', rKind.status === 409 && rKind.body.code === 'not_a_source',
        `status=${rKind.status} code=${rKind.body.code}`)
    }
    // deleted source
    await admin.from('media_assets').update({ status: 'deleted' }).eq('id', srcRejected)
    const rDel = await startEdit(cOwner, genRejected, srcRejected, randomUUID())
    check('G2 deleted source → 409/source_deleted', rDel.status === 409 && rDel.body.code === 'source_deleted',
      `status=${rDel.status} code=${rDel.body.code}`)
    // editor_eligible=false with audio (explicit flag beats has_audio)
    const genFlag = await newGen(owner.id)
    const srcFlag = await sourceFlow(cOwner, genFlag, fix.good, 'video/webm')
    startWorker()
    const fl = await waitTerminal(srcFlag)
    check('G2 setup: flag source ready', fl?.status === 'ready')
    await admin.from('media_assets').update({ metadata: { ...(fl?.metadata ?? {}), editor_eligible: false } }).eq('id', srcFlag)
    const rFlag = await startEdit(cOwner, genFlag, srcFlag, randomUUID())
    check('G2 editor_eligible=false → 409/source_not_editor_eligible',
      rFlag.status === 409 && rFlag.body.code === 'source_not_editor_eligible', `status=${rFlag.status} code=${rFlag.body.code}`)
    // foreign source: outsider tries to start on the owner's asset/generation
    const rForeign = await startEdit(cOutsider, genA, srcA, randomUUID())
    check('G2 unrelated user denied (404, no oracle)', rForeign.status === 404, `status=${rForeign.status}`)
    // workspace rule: peers OBSERVE but do not START
    const rPeer = await startEdit(cPeer, genA, srcA, randomUUID())
    check('G2 workspace peer cannot start (owner-only rule)', rPeer.status === 404, `status=${rPeer.status}`)
    const { data: peerSees } = await cPeer.from('edit_projects').select('id').eq('id', projectA.id)
    check('G2 workspace peer CAN observe the project', (peerSees ?? []).length === 1)
    // anonymous
    const rAnon = await startEdit(null, genA, srcA, randomUUID())
    check('G2 anonymous denied (401)', rAnon.status === 401, `status=${rAnon.status}`)
    // strict body: extra fields are refused
    const rExtra = await startEdit(cOwner, genA, srcA, randomUUID(), { take_path: 'sneaky/path.webm' })
    check('G2 extra field (take_path) refused', rExtra.status === 400, `status=${rExtra.status}`)
    const rPrompt = await startEdit(cOwner, genA, srcA, randomUUID(), { prompt: 'ignore all previous instructions' })
    check('G2 extra field (prompt) refused', rPrompt.status === 400, `status=${rPrompt.status}`)
  }

  console.log('   (waiting out the rate window…)')
  await sleep(61_000)

  // ---------- G3: limits ----------
  console.log('== G3: rate + active-project concurrency limits ==')
  {
    // Active-project cap (default 3): B is source 2 for this owner; A already
    // active. Start B (2 active), then a third on a fresh source, then a 4th
    // must be refused.
    const rB = await startEdit(cOwner, genB, srcB, randomUUID())
    check('G3 second project starts fine', rB.status === 200, JSON.stringify(rB.body))
    const genC = await newGen(owner.id)
    const srcC = await sourceFlow(cOwner, genC, fix.good, 'video/webm')
    const c3 = await waitTerminal(srcC)
    check('G3 setup: third source ready', c3?.status === 'ready')
    const rC = await startEdit(cOwner, genC, srcC, randomUUID())
    check('G3 third project starts fine (at the cap)', rC.status === 200, JSON.stringify(rC.body))
    const genD = await newGen(owner.id)
    const srcD = await sourceFlow(cOwner, genD, fix.good, 'video/webm')
    const d4 = await waitTerminal(srcD)
    check('G3 setup: fourth source ready', d4?.status === 'ready')
    const rb4 = await startEdit(cOwner, genD, srcD, randomUUID())
    check('G3 fourth ACTIVE project refused (429/too_many_active_projects)',
      rb4.status === 429 && rb4.body.code === 'too_many_active_projects', `status=${rb4.status} code=${rb4.body.code}`)
    // Rate limit (10/min): dedicated user hammers with an ineligible call so
    // nothing is created; expect a 429 with the rate-limit message.
    let sawRate = false
    for (let i = 0; i < 14 && !sawRate; i++) {
      const r = await startEdit(cRate, genA, srcA, randomUUID()) // 404s (not their gen) but each call counts
      if (r.status === 429) sawRate = true
    }
    check('G3 per-user rate limit trips', sawRate)
  }

  // ---------- G4: client write-denial on all four editor tables ----------
  console.log('== G4: clients cannot mutate project/analysis/plan/event state ==')
  {
    const tries = [
      ['edit_projects insert', cOwner.from('edit_projects').insert({ owner_id: owner.id, generation_id: genA, source_asset_id: srcA, idempotency_key: randomUUID() })],
      ['edit_projects update', cOwner.from('edit_projects').update({ status: 'completed' }).eq('id', projectA.id)],
      ['edit_projects delete', cOwner.from('edit_projects').delete().eq('id', projectA.id)],
      ['media_analyses insert', cOwner.from('media_analyses').insert({ owner_id: owner.id, source_asset_id: srcA, source_hash: 'x', schema_version: 1, analyzer_bundle_version: 'v1', result: {} })],
      ['edit_plans insert', cOwner.from('edit_plans').insert({ owner_id: owner.id, edit_project_id: projectA.id, version: 1, schema_version: 1, plan: {}, plan_hash: 'x' })],
      ['edit_events insert', cOwner.from('edit_events').insert({ project_id: projectA.id, stage: 'fake', message_code: 'FAKE' })],
    ]
    for (const [label, q] of tries) {
      const { error } = await q
      check(`G4 ${label} denied`, error !== null, error?.message ?? 'no error!')
    }
    const { data: after } = await admin.from('edit_projects').select('status').eq('id', projectA.id).maybeSingle()
    check('G4 project untouched after all attempts', after?.status === 'queued', after?.status)
    const anonRead = await cAnon.from('edit_projects').select('id').limit(1)
    check('G4 anonymous cannot read edit_projects', anonRead.error !== null || (anonRead.data ?? []).length === 0)
    // Privileged RPCs are not client-callable by ANY identity.
    const rpcArgs = { p_owner: owner.id, p_generation: genA, p_source: srcA, p_idempotency: randomUUID() }
    for (const [who, cl] of [['owner', cOwner], ['workspace peer', cPeer], ['unrelated user', cOutsider], ['anonymous', cAnon]]) {
      const { error: rpcErr } = await cl.rpc('editor_start_project', rpcArgs)
      check(`G4 ${who} cannot execute editor_start_project directly`, rpcErr !== null, rpcErr?.message ?? 'rpc succeeded!')
    }
    // Identity columns are immutable even for the SERVICE role (trigger).
    const { error: immErr } = await admin.from('edit_projects').update({ owner_id: outsider.id }).eq('id', projectA.id)
    check('G4 ownership cannot change (immutable even for service role)', immErr !== null, immErr?.message ?? 'update succeeded!')
    const { error: immErr2 } = await admin.from('edit_projects').update({ source_asset_id: srcB }).eq('id', projectA.id)
    check('G4 source cannot change after creation', immErr2 !== null, immErr2?.message ?? 'update succeeded!')
    // An unrelated user cannot even observe that the project EXISTS.
    const { data: outObs } = await cOutsider.from('edit_projects').select('id').eq('id', projectA.id)
    check('G4 unrelated user cannot observe project existence (0 rows)', (outObs ?? []).length === 0)
    const { data: outEv } = await cOutsider.from('edit_events').select('id').eq('project_id', projectA.id)
    check('G4 unrelated user cannot observe events either', (outEv ?? []).length === 0)
  }

  // ---------- G5: the Phase-2 boundary ----------
  console.log('== G5: nothing beyond the queued job exists ==')
  {
    await sleep(4000) // give the (validate_source-only) worker time to misbehave if it were going to
    const jobs = await editorJobs(projectA.id)
    check('G5 editor_v2 job is STILL queued (no handler claimed it)', jobs.length === 1 && jobs[0].status === 'queued', JSON.stringify(jobs))
    // Boundary counts are scoped to THIS RUN's identities. The staging DB is
    // persistent and append-only history survives by design — the Phase-3
    // matrix (which runs after this one, and on earlier heads) legitimately
    // writes edit_events for its own projects, so a global zero would be
    // asserting something Phase 2 never claimed.
    const runUsers = [owner.id, peer.id, outsider.id, rateUser.id]
    const { count: analyses } = await admin.from('media_analyses').select('id', { count: 'exact', head: true }).in('owner_id', runUsers)
    const { count: plans } = await admin.from('edit_plans').select('id', { count: 'exact', head: true }).in('owner_id', runUsers)
    const { data: runProjects } = await admin.from('edit_projects').select('id').in('owner_id', runUsers)
    const { count: events } = await admin.from('edit_events').select('id', { count: 'exact', head: true })
      .in('project_id', (runProjects ?? []).map((p) => p.id))
    check('G5 zero media_analyses rows for this run', analyses === 0, `rows=${analyses}`)
    check('G5 zero edit_plans rows for this run', plans === 0, `rows=${plans}`)
    check('G5 zero edit_events rows for this run’s projects', events === 0, `rows=${events}`)
    const { count: outputs } = await admin.from('media_assets').select('id', { count: 'exact', head: true })
      .in('kind', ['output', 'thumbnail']).in('owner_id', runUsers)
    check('G5 zero output/thumbnail assets for this run', outputs === 0, `rows=${outputs}`)
    const { count: creditsAfter } = await admin.from('credit_events').select('id', { count: 'exact', head: true })
    check('G5 zero credits charged (baseline unchanged)', creditsAfter === creditsBefore, `before=${creditsBefore} after=${creditsAfter}`)
  }

  // ---------- G6: DB-enforced append-only event history ----------
  console.log('== G6: edit_events is append-only AT THE DATABASE ==')
  {
    const { data: ev, error: insErr } = await admin.from('edit_events')
      .insert({ project_id: projectA.id, stage: 'queued', message_code: 'TEST_EVENT' })
      .select('id, seq').single()
    check('G6 service role can append an event', !insErr && !!ev, insErr?.message)
    const { data: ev2 } = await admin.from('edit_events')
      .insert({ project_id: projectA.id, stage: 'queued', message_code: 'TEST_EVENT_2' })
      .select('id, seq').single()
    check('G6 event order is deterministic (seq strictly increases)',
      Number.isInteger(Number(ev?.seq)) && Number(ev2?.seq) > Number(ev?.seq), `${ev?.seq} → ${ev2?.seq}`)
    // Clients cannot append at all (no INSERT grant/policy).
    const { error: cliIns } = await cOwner.from('edit_events').insert({ project_id: projectA.id, stage: 'fake', message_code: 'X' })
    check('G6 client insert fails', cliIns !== null, cliIns?.message ?? 'insert succeeded!')
    const { error: cliUpd } = await cOwner.from('edit_events').update({ message_code: 'HACKED' }).eq('id', ev.id)
    check('G6 client update fails', cliUpd !== null, cliUpd?.message ?? 'update succeeded!')
    const { error: cliDel } = await cOwner.from('edit_events').delete().eq('id', ev.id)
    check('G6 client delete fails', cliDel !== null, cliDel?.message ?? 'delete succeeded!')
    const { error: updErr } = await admin.from('edit_events').update({ message_code: 'REWRITTEN' }).eq('id', ev.id)
    check('G6 UPDATE raises even for service role', updErr !== null, updErr?.message ?? 'update succeeded!')
    const { error: tsErr } = await admin.from('edit_events').update({ created_at: new Date(0).toISOString() }).eq('id', ev.id)
    check('G6 timestamp rewrite raises', tsErr !== null, tsErr?.message ?? 'update succeeded!')
    const { error: delErr } = await admin.from('edit_events').delete().eq('id', ev.id)
    check('G6 direct DELETE raises even for service role', delErr !== null, delErr?.message ?? 'delete succeeded!')
    const { data: still } = await admin.from('edit_events').select('id, message_code').eq('id', ev.id).maybeSingle()
    check('G6 event survived all mutation attempts, unmodified', still?.message_code === 'TEST_EVENT')
    // The ONE sanctioned deletion path: retention via the project cascade.
    // Deleting genA cascades edit_projects → edit_events; the trigger's
    // trigger-depth carve-out must let the cascade through.
    const { error: cascadeErr } = await admin.from('generations').delete().eq('id', genA)
    check('G6 retention cascade (generation → project → events) is permitted', cascadeErr === null, cascadeErr?.message)
    const { count: evLeft } = await admin.from('edit_events').select('id', { count: 'exact', head: true }).eq('project_id', projectA.id)
    const { count: projLeft } = await admin.from('edit_projects').select('id', { count: 'exact', head: true }).eq('id', projectA.id)
    check('G6 cascade removed project and events together', evLeft === 0 && projLeft === 0, `events=${evLeft} projects=${projLeft}`)
  }

  killWorker()

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
