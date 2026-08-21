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

/**
 * ⚠️ THE FOUR ANSWERS, AND WHY THERE ARE FOUR. Three would collapse the two ways
 * a claim fails: a claim the frames CONTRADICT and a claim whose cited frame was
 * simply the wrong one are different defects with different fixes -- the first
 * is the model seeing wrongly, the second is the citation machinery. Merging
 * them would leave "the model is 30% wrong" hiding a prompt bug.
 *
 * ⚖️ AND INDETERMINATE IS NOT A SKIP. It is the finding that four frames cannot
 * settle this question, which is exactly what the pilot needs to know before
 * anyone spends 332 downloads.
 */
export const LABELS = Object.freeze({
  SUPPORTED: 'The frames show this.',
  UNSUPPORTED: 'The frames contradict this.',
  INDETERMINATE: 'These frames cannot settle it.',
  WRONG_EVIDENCE: 'The claim may be right, but this is not the frame that shows it.',
})

/** ⚠️ DECLARED, NOT WALKED. Reflecting over the object would silently stop
 *  covering a field the model returned as null, and a claim that is absent is
 *  exactly the thing worth noticing. The totality selftest holds this against
 *  the type. */
export const CLAIM_PATHS = Object.freeze([
  'primaryMode',
  'people.count',
  'setting.changes', 'setting.complexity',
  'performance.talkingHead', 'performance.walking', 'performance.acting',
  'performance.productInteraction', 'performance.screenInteraction',
  'camera.framingChanges', 'camera.positionChanges',
  'requirements.physicalProduct', 'requirements.secondPerson',
  'requirements.multipleLocations', 'requirements.unusualProps',
])

/** For the categorical fields the human may also supply the correct value.
 *  ⚖️ A BOOLEAN NEEDS NO PICKER: UNSUPPORTED on `walking: true` already says
 *  false, and offering a second control to say it again invents disagreement
 *  between two answers to one question. */
export const CANONICAL_VALUES = Object.freeze({
  primaryMode: ['talking_head', 'demo', 'voiceover_broll', 'screen_capture', 'skit', 'other'],
  'people.count': ['one', 'multiple'],
  'setting.complexity': ['simple', 'moderate', 'complex'],
})

const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

/**
 * Turn one reference's visual profile into the list of things a human answers.
 *
 * ⚠️ A NULL FIELD IS A ROW, NOT A GAP. "The model did not answer this" is a
 * finding about the prompt, and dropping those rows would make the pass look
 * more complete the worse it did.
 */
export function flattenClaims(url, visualProfile) {
  return CLAIM_PATHS.map((path) => {
    const obs = at(visualProfile, path)
    const answered = obs != null && typeof obs === 'object' && 'value' in obs
    return {
      url,
      path,
      answered,
      value: answered ? obs.value : null,
      // ⚖️ THE CITATION IS THE WHOLE POINT OF SHOWING A FRAME. A claim with no
      // citation cannot be WRONG_EVIDENCE, because there is no evidence to be
      // wrong -- it can only be unanswered.
      frames: answered && obs.evidence?.frames ? [...obs.evidence.frames] : [],
      canonical: CANONICAL_VALUES[path] ?? null,
    }
  })
}

/** ⚠️ STABLE ACROSS RUNS. The order a human sees claims in changes how they
 *  answer, so a packet that reshuffled between sessions would make two sessions
 *  incomparable. Digest order, same reasoning as the cohort draw. */
export function orderClaims(claims) {
  return [...claims].sort((a, b) =>
    createHash('sha256').update(`${a.url}|${a.path}`).digest('hex')
      .localeCompare(createHash('sha256').update(`${b.url}|${b.path}`).digest('hex')))
}

export const isLabel = (l) => Object.prototype.hasOwnProperty.call(LABELS, l)

/**
 * ⚠️ REFUSES ON AN OPEN SESSION, AND THAT IS THE FEATURE. Seeing the running
 * accuracy while labels remain is how the last few start agreeing with the
 * first few. The lock is what makes the number evidence rather than a mood.
 */
export function aggregate(session) {
  if (session?.locked !== true) {
    return { refused: 'session is not locked — lock it before looking at the numbers' }
  }
  const labels = (session.labels ?? []).filter((l) => isLabel(l.label))
  const dist = {}
  for (const k of Object.keys(LABELS)) dist[k] = 0
  for (const l of labels) dist[l.label]++

  const answered = labels.filter((l) => l.answered)
  // ⚠️ THE DENOMINATOR EXCLUDES NOTHING IT SHOULD COUNT. A claim the model never
  // made is not a claim it got right, and a denominator that quietly drops
  // non-answers turns a thin pass into a good one.
  const supported = dist.SUPPORTED
  return {
    claims_shown: session.labels?.length ?? 0,
    claims_labelled: labels.length,
    claims_unlabelled: (session.labels?.length ?? 0) - labels.length,
    model_answered: answered.length,
    distribution: dist,
    // ⚖️ TWO RATES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. Against everything
    // the model was ASKED is "how much of the visual pass is usable". Against
    // what it ANSWERED is "when it speaks, is it right". Reporting only the
    // second is how a pass that answers three fields out of fifteen scores 100%.
    supported_of_all_asked: labels.length === 0 ? null : supported / labels.length,
    supported_of_answered: answered.length === 0 ? null : supported / answered.length,
    // The citation machinery is a separate defect from the seeing.
    wrong_evidence_rate: labels.length === 0 ? null : dist.WRONG_EVIDENCE / labels.length,
  }
}

/**
 * What the session cost the human, from the event log.
 *
 * ⚖️ THIS IS THE ONLY INPUT TO #69. The requirements come from what was slow and
 * repetitive, not from a design memo written before anyone had done it once.
 */
export function friction(events) {
  const answers = events.filter((e) => e.kind === 'label')
  const gaps = []
  for (let i = 0; i < answers.length; i++) {
    const prev = i === 0 ? events.find((e) => e.kind === 'session_start') : answers[i - 1]
    if (prev) gaps.push(answers[i].at - prev.at)
  }
  const sorted = [...gaps].sort((a, b) => a - b)
  return {
    claims_answered: answers.length,
    // ⚠️ MEDIAN, NOT MEAN. One interruption -- a phone call mid-session -- moves
    // a mean enough to invent a usability problem that was a lunch break.
    median_ms_per_claim: sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)],
    slowest_ms: sorted.length === 0 ? null : sorted[sorted.length - 1],
    // A claim answered twice is a claim the packet made hard to answer once.
    backtracks: events.filter((e) => e.kind === 'relabel').length,
    // Reaching for a different frame means the packet showed the wrong one first.
    evidence_frame_changes: events.filter((e) => e.kind === 'frame_change').length,
    skipped: events.filter((e) => e.kind === 'skip').length,
  }
}

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

