#!/usr/bin/env node
// EVERY VISUAL CLAIM, BESIDE THE FRAME IT CITES, WITH FOUR BUTTONS.
//
// ⚠️ THE HUMAN DOES ONE THING HERE: decide whether the frames support the claim.
// Everything else -- finding the claims, fetching the frames it cited, keeping
// the order stable, storing the answer, counting the disagreement -- is machine
// work, and doing any of it by hand is how a labelling session turns into an
// afternoon of scrolling JSON.
//
// ⚖️ AND THE JUDGEMENT IS NEVER GENERATED. Nothing in this file infers a label,
// suggests one, or pre-fills one. A packet that guessed would be measuring its
// own guess against the model's, and the whole point is an outside opinion.
//
// ⚠️ LOCAL, NOT DEPLOYED, AND THAT IS THE SECURITY POSTURE. The frames are
// thousands of other creators' videos. This serves them from localhost using
// credentials the operator already holds, so no signed URL is minted, nothing
// is published, and no new authenticated surface exists to get wrong. The
// packet is a page on your own machine that dies when you close it.
//
// ⚠️ LOCK BEFORE AGGREGATE. --aggregate REFUSES on an open session. Seeing the
// running accuracy while you still have labels to give is how the last few
// labels start agreeing with the first few.
//
//   node scripts/label-packet.mjs --selftest    # no credentials needed
//   node scripts/label-packet.mjs --serve       # label at localhost:7358
//   node scripts/label-packet.mjs --lock
//   node scripts/label-packet.mjs --aggregate
import { createHash } from 'node:crypto'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? true) }
const flag = (n) => process.argv.includes(`--${n}`)

// ⚠️ THE LOGIC LIVES IN pilot-core.mjs, AND THIS FILE HAD A COPY OF IT.
//
// The commit that created pilot-core said the functions were "moved, not
// retyped" -- and that was wrong. They were COPIED, and this file kept its
// originals. The 500% supported-rate defect was then fixed in pilot-core only,
// so `label-packet.mjs --aggregate` went on dividing every supported label by
// the answered ones and would have reported a rate above 100% to anyone using
// the older path, which is still wired into pr-checks.
//
// ⚖️ TWO AUTHORITIES ON WHAT A PASS RATE MEANS IS THE EXACT THING THE
// EXTRACTION CLAIMED TO PREVENT. Re-exporting is what makes the claim true.
export {
  LABELS, CLAIM_PATHS, CANONICAL_VALUES,
  flattenClaims, orderClaims, isLabel, aggregate, friction, supportedRate,
} from './pilot-core.mjs'
import {
  LABELS, CLAIM_PATHS, flattenClaims, orderClaims, isLabel, aggregate, friction,
} from './pilot-core.mjs'

if (flag('selftest')) {
  let failed = 0
  const ok = (name, cond) => { if (cond === true) console.log(`  ok: ${name}`); else { console.error(`selftest: ${name} — FAILED`); failed++ } }

  const obs = (value, frames) => ({ value, evidence: { frames } })
  const profile = {
    primaryMode: obs('demo', [2]),
    people: { count: obs('one', [1]) },
    setting: { changes: obs(false, [1, 3]), complexity: null },
    performance: { talkingHead: obs(true, [1]), walking: null, acting: null,
      productInteraction: obs(true, [2]), screenInteraction: null },
    camera: { framingChanges: null, positionChanges: null },
    requirements: { physicalProduct: obs(true, [2]), secondPerson: null,
      multipleLocations: null, unusualProps: null },
  }

  const claims = flattenClaims('u', profile)
  ok('one row per declared claim path, answered or not', claims.length === CLAIM_PATHS.length)
  // ⚠️ THE FINDING THAT DROPPING NULLS WOULD HIDE.
  ok('an unanswered field is a ROW, not a gap',
    claims.filter((c) => !c.answered).length === 9
    && claims.filter((c) => c.answered).length === 6)
  ok('carries the cited frames', claims.find((c) => c.path === 'primaryMode').frames.join() === '2')
  ok('carries a two-frame citation intact',
    claims.find((c) => c.path === 'setting.changes').frames.join() === '1,3')
  ok('an unanswered claim cites nothing', claims.find((c) => c.path === 'camera.framingChanges').frames.length === 0)
  ok('offers canonical values only where a picker means something',
    claims.find((c) => c.path === 'primaryMode').canonical !== null
    && claims.find((c) => c.path === 'performance.walking').canonical === null)

  ok('claim order is stable across runs',
    JSON.stringify(orderClaims(claims)) === JSON.stringify(orderClaims([...claims].reverse())))

  ok('only the four labels are labels',
    isLabel('SUPPORTED') && isLabel('WRONG_EVIDENCE') && !isLabel('MAYBE') && !isLabel(''))

  // ⚠️ THE LOCK IS THE FEATURE.
  ok('aggregate REFUSES an open session', aggregate({ locked: false, labels: [] }).refused !== undefined)
  ok('aggregate refuses a session with no lock field at all', aggregate({ labels: [] }).refused !== undefined)

  const session = {
    locked: true,
    labels: [
      { path: 'a', answered: true, label: 'SUPPORTED' },
      { path: 'b', answered: true, label: 'UNSUPPORTED' },
      { path: 'c', answered: true, label: 'WRONG_EVIDENCE' },
      { path: 'd', answered: false, label: 'INDETERMINATE' },
      { path: 'e', answered: true, label: null },
    ],
  }
  const agg = aggregate(session)
  ok('an unlabelled claim is counted, not dropped',
    agg.claims_shown === 5 && agg.claims_labelled === 4 && agg.claims_unlabelled === 1)
  // ⚖️ THE DENOMINATOR RULE THIS REPO HAS ALREADY PAID FOR ONCE.
  ok('reports BOTH rates, so a thin pass cannot score 100%',
    agg.supported_of_all_asked === 0.25 && agg.supported_of_answered === 1 / 3)
  ok('separates the citation defect from the seeing defect',
    agg.wrong_evidence_rate === 0.25)
  ok('an empty locked session reports null rates, not zero',
    aggregate({ locked: true, labels: [] }).supported_of_all_asked === null)

  const ev = [
    { kind: 'session_start', at: 0 },
    { kind: 'label', at: 1000 }, { kind: 'label', at: 3000 },
    { kind: 'label', at: 60000 },
    { kind: 'relabel', at: 61000 }, { kind: 'frame_change', at: 62000 },
    { kind: 'skip', at: 63000 },
  ]
  const f = friction(ev)
  ok('counts the repetitive actions #69 would remove',
    f.backtracks === 1 && f.evidence_frame_changes === 1 && f.skipped === 1)
  // ⚠️ ONE LUNCH BREAK MUST NOT INVENT A USABILITY PROBLEM.
  ok('uses the median, so one interruption does not become a finding',
    f.median_ms_per_claim === 2000 && f.slowest_ms === 57000)
  ok('an empty log reports null, not zero', friction([]).median_ms_per_claim === null)

  // ⚠️ THE SAFEGUARD AGAINST THE NEXT FIELD. Somebody adds a visual field, the
  // model starts answering it, and the packet silently never asks a human about
  // it -- so the pass looks exactly as accurate as it was before, on a question
  // nobody checked. Declared lists need a totality check or they rot.
  {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../packages/shared/src/referenceProfile.ts', import.meta.url), 'utf8')
    const block = src.slice(src.indexOf('interface ReferenceVisualProfile'),
      src.indexOf('visualPassRan: boolean'))
    const fields = [...block.matchAll(/^\s*(\w+):\s*VisualObservation</gm)].map((m) => m[1])
    const leaves = new Set(CLAIM_PATHS.map((p) => p.split('.').pop()))
    const missing = fields.filter((f) => !leaves.has(f))
    ok(`every VisualObservation field is asked about (missing: ${missing.join(', ') || 'none'})`,
      fields.length > 0 && missing.length === 0)
  }

  if (failed) process.exit(1)
  console.log('label-packet selftest: all cases passed')
  process.exit(0)
}

// ─────────────────────────── the serving half ───────────────────────────────
//
// ⚠️ EVERYTHING BELOW TOUCHES CREDENTIALS AND THE NETWORK, WHICH IS EXACTLY WHY
// THE LOGIC ABOVE DOES NOT. The parts that decide anything -- which claims are
// asked, in what order, what counts as a label, when a number may be looked at
// -- are pure and covered by the selftest, so the untestable part is only
// plumbing.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const DIR = '.twinai-labels'
const SESSION = join(DIR, 'session.json')

const load = () => (existsSync(SESSION) ? JSON.parse(readFileSync(SESSION, 'utf8')) : null)
/** ⚠️ WRITTEN ON EVERY ANSWER, NOT AT THE END. A session lost to a closed laptop
 *  is a session the human does twice, and the second pass is not independent of
 *  the first. */
const save = (s) => { mkdirSync(DIR, { recursive: true }); writeFileSync(SESSION, JSON.stringify(s, null, 2)) }

if (flag('lock')) {
  const s = load()
  if (!s) { console.error('no session'); process.exit(1) }
  if (s.locked) { console.log('already locked at ' + s.lockedAt); process.exit(0) }
  const open = s.labels.filter((l) => !isLabel(l.label)).length
  // ⚖️ LOCKING WITH CLAIMS UNANSWERED IS ALLOWED AND RECORDED. Refusing would
  // push a tired labeller into answering rather than stopping, and a forced
  // label is worse than a missing one. The count is reported so the denominator
  // never quietly shrinks.
  s.locked = true
  s.lockedAt = new Date().toISOString()
  save(s)
  console.log(`locked. ${s.labels.length - open} of ${s.labels.length} claims answered.`)
  process.exit(0)
}

if (flag('aggregate')) {
  const s = load()
  if (!s) { console.error('no session'); process.exit(1) }
  const out = aggregate(s)
  if (out.refused) { console.error(out.refused); process.exit(3) }
  console.log(JSON.stringify({ ...out, friction: friction(s.events ?? []) }, null, 2))
  process.exit(0)
}

if (!flag('serve')) {
  console.error('use --selftest, --serve, --lock or --aggregate')
  process.exit(2)
}

const { createClient } = await import('@supabase/supabase-js')
const SB = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB || !KEY) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2) }
const db = createClient(SB, KEY, { auth: { persistSession: false } })

let session = load()
if (session?.locked) { console.error('this session is locked; aggregate it or move the file aside'); process.exit(3) }

if (!session) {
  const { data: rows, error } = await db.from('reference_content_profiles')
    .select('url, visual_profile').not('visual_profile', 'is', null)
  if (error) { console.error(error.message); process.exit(1) }
  if (!rows.length) {
    // ⚠️ AN EMPTY PACKET IS A REFUSAL, NOT AN EMPTY PAGE. A page showing nothing
    // reads as "the model made no mistakes".
    console.error('no reference has a visual profile yet — run the pilot first')
    process.exit(4)
  }
  const claims = orderClaims(rows.flatMap((r) => flattenClaims(r.url, r.visual_profile)))
  session = {
    startedAt: new Date().toISOString(),
    references: rows.length,
    locked: false,
    labels: claims.map((c) => ({ ...c, label: null, correctedValue: null })),
    events: [{ kind: 'session_start', at: Date.now() }],
  }
  save(session)
}

const frameCache = new Map()
async function frameBytes(url, index) {
  const k = `${url}|${index}`
  if (frameCache.has(k)) return frameCache.get(k)
  const { data: row } = await db.from('reference_frames')
    .select('storage_path').eq('url', url).eq('frame_index', index).maybeSingle()
  if (!row) return null
  const { data, error } = await db.storage.from('reference-frames').download(row.storage_path)
  if (error || !data) return null
  const buf = Buffer.from(await data.arrayBuffer())
  frameCache.set(k, buf)
  return buf
}

const page = readFileSync(new URL('./label-packet.html', import.meta.url), 'utf8')
const PORT = Number(arg('port', 7358))

createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  if (u.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(page)
  }
  if (u.pathname === '/claims') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ labels: session.labels, locked: session.locked }))
  }
  if (u.pathname === '/frame') {
    const bytes = await frameBytes(u.searchParams.get('url'), Number(u.searchParams.get('i')))
    if (!bytes) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': 'image/jpeg' })
    return res.end(bytes)
  }
  if (u.pathname === '/label' && req.method === 'POST') {
    let body = ''
    for await (const c of req) body += c
    const { index, label, correctedValue, kind } = JSON.parse(body || '{}')
    const row = session.labels[index]
    if (!row || (label !== null && !isLabel(label))) { res.writeHead(400); return res.end() }
    // ⚖️ A SECOND ANSWER IS A BACKTRACK, AND IT IS RECORDED AS ONE. That number
    // is a direct input to #69: a claim answered twice is a claim the packet
    // made hard to answer once.
    if (isLabel(row.label)) session.events.push({ kind: 'relabel', at: Date.now(), index })
    row.label = label
    row.correctedValue = correctedValue ?? null
    session.events.push({ kind: kind === 'skip' ? 'skip' : 'label', at: Date.now(), index })
    save(session)
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ saved: true }))
  }
  if (u.pathname === '/event' && req.method === 'POST') {
    let body = ''
    for await (const c of req) body += c
    const e = JSON.parse(body || '{}')
    if (e.kind === 'frame_change') { session.events.push({ kind: 'frame_change', at: Date.now() }); save(session) }
    res.writeHead(200); return res.end()
  }
  res.writeHead(404); res.end()
}).listen(PORT, '127.0.0.1', () => {
  const left = session.labels.filter((l) => !isLabel(l.label)).length
  console.log(`labelling ${session.labels.length} claims across ${session.references} references`)
  console.log(`${left} left. open http://localhost:${PORT}`)
  console.log('when you are done:  node scripts/label-packet.mjs --lock')
})

