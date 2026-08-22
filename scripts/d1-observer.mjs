#!/usr/bin/env node
// WATCH ONE PERSON USE TWIN. THE MACHINE WRITES DOWN WHAT HAPPENED; YOU ASK WHY.
//
// ⚠️ THE ONE THING THAT CANNOT BE AUTOMATED IS THE ONLY THING THAT MATTERS.
// Telemetry can say a creator opened the camera and closed it without
// recording. It cannot say whether the script was wrong, the premise was wrong,
// the shot was too hard, or their flatmate walked in. Those have completely
// different fixes and the difference is invisible in the event stream. So this
// file reconstructs the timeline and refuses to guess the cause.
//
// ⚖️ AND IT NAMES ITS OWN BLIND SPOTS. After the session it reports which
// required events never arrived, because "the creator did not do that" and "we
// never instrumented that" look identical in a timeline and lead to opposite
// conclusions. That list is the input to #71.
//
// ⚠️ MEASURED BEFORE BUILDING. Production analytics_events today carries
// page_view, signup, onboarding_completed, voice_built, blueprint_generated,
// gallery_remix, edit_rendered, thumbnail_generated and render_cost -- and
// nothing about script editing, the camera, recording attempts, retries, errors
// or where someone stopped. The observed timeline in the plan ("spent 74s on
// the script, edited the hook twice, opened the camera, closed before
// recording") is not reconstructible from what exists. This says so out loud
// rather than rendering a confident, half-empty timeline.
//
//   node scripts/d1-observer.mjs --selftest
//   node scripts/d1-observer.mjs --consent          # print the consent script
//   node scripts/d1-observer.mjs --serve --user <id>
//   node scripts/d1-observer.mjs --lock
import { createHash } from 'node:crypto'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? true) }
const flag = (n) => process.argv.includes(`--${n}`)

/**
 * ⚠️ FROZEN BEFORE THE SESSION, NOT AFTER IT. A taxonomy invented while watching
 * is a taxonomy shaped by the first creator, and every later session gets
 * squeezed into one person's afternoon.
 *
 * ⚖️ OTHER IS NOT A FAILURE OF THE LIST, IT IS THE PRESSURE GAUGE ON IT. If OTHER
 * wins twice, the taxonomy is wrong and that is a finding — which is why the
 * verbatim note is required whenever it is chosen.
 */
export const BLOCKERS = Object.freeze({
  SCRIPT_REJECTION: 'The words were wrong — they would not say that.',
  PREMISE_REJECTION: 'The idea was wrong — not a video they would make.',
  PRODUCTION_TOO_HARD: 'They would say it, but not shoot it.',
  CAMERA_FRICTION: 'The recording step itself got in the way.',
  TIME_CONSTRAINT: 'They ran out of time, not out of willingness.',
  BROWSING_ONLY: 'They were never going to record today.',
  TECHNICAL_FAILURE: 'Something broke.',
  OTHER: 'None of these fit — say what it was.',
})

/**
 * The events a reconstructable session needs, and what each one lets the
 * observer see. ⚠️ Declared, so their ABSENCE is reportable. An uninstrumented
 * step and a step the creator skipped are indistinguishable in a timeline and
 * point at opposite fixes.
 */
export const REQUIRED_EVENTS = Object.freeze({
  page_view: 'where they were, and for how long',
  gallery_remix: 'which reference they chose',
  blueprint_generated: 'the script arrived',
  camera_opened: 'they got as far as the camera',
  recording_started: 'they actually rolled',
  recording_aborted: 'they rolled and stopped',
  edit_rendered: 'Twin produced a video',
  client_error: 'something broke in front of them',
  session_abandoned: 'where they stopped',
})

/** ⚖️ SORTED BY TIME, AND TIES BROKEN DETERMINISTICALLY. Two events in the same
 *  millisecond are common on a click that fires both; a wobbling order would
 *  make two readings of one session disagree. */
export function reconstruct(events) {
  const rows = [...events]
    .map((e) => ({ ...e, at: new Date(e.created_at ?? e.at).getTime() }))
    .filter((e) => Number.isFinite(e.at))
    .sort((a, b) => a.at - b.at
      || createHash('sha256').update(JSON.stringify(a)).digest('hex')
        .localeCompare(createHash('sha256').update(JSON.stringify(b)).digest('hex')))

  const start = rows.length ? rows[0].at : null
  return rows.map((e, i) => ({
    event: e.event,
    at: e.at,
    since_start_ms: start === null ? null : e.at - start,
    // ⚠️ THE DWELL IS UNTIL THE NEXT EVENT, and the LAST one has none. Reporting
    // zero there would say they left instantly; reporting "now minus then" would
    // grow every time somebody re-reads the session.
    dwell_ms: i + 1 < rows.length ? rows[i + 1].at - e.at : null,
    props: e.props ?? {},
  }))
}

/** What the timeline could not see. ⚠️ THIS IS THE #71 SCOPE, generated rather
 *  than remembered. */
export function missingInstrumentation(events) {
  const seen = new Set(events.map((e) => e.event))
  return Object.entries(REQUIRED_EVENTS)
    .filter(([k]) => !seen.has(k))
    .map(([k, why]) => ({ event: k, blind_to: why }))
}

/** Facts the observer should not have to retype. ⚖️ FACTS ONLY — counts and
 *  timings. Nothing here characterises WHY, because a prefilled cause is a
 *  cause the observer will accept. */
export function prefill(timeline, scriptEdits = null) {
  const count = (e) => timeline.filter((t) => t.event === e).length
  const first = (e) => timeline.find((t) => t.event === e) ?? null
  const scriptArrived = first('blueprint_generated')
  const cameraOpened = first('camera_opened')
  return {
    events_seen: timeline.length,
    reference_selected: count('gallery_remix') > 0,
    script_generated: count('blueprint_generated') > 0,
    // Time between the script arriving and the next thing they did.
    ms_on_script: scriptArrived?.dwell_ms ?? null,
    // ⚠️ FROM script_edits (0127), NOT FROM AN EVENT. That table already holds
    // the before and after text, which is strictly more than a counter. A second
    // thinner record of the same act would give two numbers that drift with no
    // way to say which is right. `null` means the table was not read, which is
    // not the same fact as zero edits.
    script_edits: scriptEdits,
    camera_opened: cameraOpened !== null,
    recordings_started: count('recording_started'),
    recordings_aborted: count('recording_aborted'),
    rendered: count('edit_rendered') > 0,
    errors: count('client_error'),
    // ⚠️ THE LAST EVENT IS WHERE THEY STOPPED, which is a fact. WHY they stopped
    // is the question this file exists to leave open.
    stopped_at: timeline.length ? timeline[timeline.length - 1].event : null,
  }
}

/** ⚠️ A BLOCKER WITHOUT THE CREATOR'S OWN WORDS IS A GUESS WITH A LABEL ON IT.
 *  The taxonomy is for counting; the verbatim is the evidence. OTHER without a
 *  note is refused outright, because OTHER is precisely the case where the
 *  category carries no information at all. */
export function validateObservation(o) {
  if (!Object.prototype.hasOwnProperty.call(BLOCKERS, o?.blocker ?? '')) {
    return 'choose a blocker from the frozen taxonomy'
  }
  const note = String(o.creatorReason ?? '').trim()
  if (o.blocker === 'OTHER' && note.length < 10) {
    return 'OTHER needs the creator\'s own words — the category says nothing on its own'
  }
  if (note.length === 0) {
    return 'record what the creator said, in their words, however short'
  }
  return null
}

export const CONSENT = `Before we start — is it OK if I watch you use this, and take notes?

  · I am watching what you do on screen and writing down the steps.
  · I will ask you why at a few points. You can say "I would rather not".
  · Nothing is recorded unless you say yes to that separately.
  · You can stop at any point and I will delete the notes.
  · There is no right way to use it. If it is confusing, that is the finding.

May I take notes?   [ yes / no ]
May I record the screen?   [ yes / no ]   (separate question, and optional)`

if (flag('consent')) { console.log(CONSENT); process.exit(0) }

if (flag('selftest')) {
  let failed = 0
  const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }
  const ev = (event, ms, props) => ({ event, created_at: new Date(ms).toISOString(), props })

  const events = [
    ev('gallery_remix', 1000), ev('blueprint_generated', 2000),
    ev('camera_opened', 90000),
  ]
  const t = reconstruct(events)
  ok('orders by time', t.map((x) => x.event).join(',')
    === 'gallery_remix,blueprint_generated,camera_opened')
  ok('is stable when input order changes',
    JSON.stringify(reconstruct(events)) === JSON.stringify(reconstruct([...events].reverse())))
  // ⚠️ THE LAST EVENT HAS NO DWELL. Zero would say they left instantly; a live
  // clock would grow every time the session is re-read.
  ok('the last event dwells for null, not zero', t[t.length - 1].dwell_ms === null)
  ok('measures time on the script as the gap after it arrived', t[1].dwell_ms === 88000)
  ok('an empty session reconstructs to nothing rather than throwing', reconstruct([]).length === 0)
  ok('drops an unparseable timestamp instead of sorting it to 1970',
    reconstruct([...events, { event: 'x', created_at: 'not a date' }]).length === events.length)

  const p = prefill(t, 2)
  ok('prefills the plan\'s example exactly',
    p.reference_selected === true && p.script_generated === true
    && p.ms_on_script === 88000 && p.script_edits === 2
    && p.camera_opened === true && p.recordings_started === 0)
  // ⚠️ NOT READ IS NOT ZERO. An observer told "0 edits" when nobody queried the
  // table would conclude the script was accepted as written.
  ok('an unread script_edits table reports null, not zero', prefill(t).script_edits === null)
  ok('says where they stopped, which is a fact', p.stopped_at === 'camera_opened')
  ok('prefill contains no cause', !JSON.stringify(p).includes('REJECTION'))

  const missing = missingInstrumentation(events)
  // ⚠️ THE GAP THAT MAKES A HALF-EMPTY TIMELINE LOOK CONFIDENT.
  ok('names what it could not see', missing.some((m) => m.event === 'session_abandoned')
    && missing.some((m) => m.event === 'client_error')
    && missing.some((m) => m.event === 'recording_started'))
  ok('does not name what it did see', !missing.some((m) => m.event === 'camera_opened'))

  ok('refuses a blocker outside the frozen taxonomy',
    validateObservation({ blocker: 'VIBES', creatorReason: 'x' }) !== null)
  ok('refuses OTHER with no words',
    validateObservation({ blocker: 'OTHER', creatorReason: 'idk' }) !== null)
  ok('refuses any blocker with no words at all',
    validateObservation({ blocker: 'SCRIPT_REJECTION', creatorReason: '  ' }) !== null)
  ok('accepts a real observation',
    validateObservation({ blocker: 'SCRIPT_REJECTION', creatorReason: 'It sounds like an ad' }) === null)
  ok('accepts OTHER when the words carry it',
    validateObservation({ blocker: 'OTHER', creatorReason: 'her flatmate came home' }) === null)

  ok('consent asks about notes and recording SEPARATELY',
    CONSENT.includes('May I take notes?') && CONSENT.includes('May I record the screen?')
    && CONSENT.includes('separate question'))
  ok('consent says they can stop and the notes go', CONSENT.includes('delete the notes'))

  if (failed) process.exit(1)
  console.log('d1-observer selftest: all cases passed')
  process.exit(0)
}

// ─────────────────────────── the serving half ───────────────────────────────
//
// ⚠️ EVERYTHING THAT DECIDES ANYTHING IS ABOVE THIS LINE AND COVERED BY THE
// SELFTEST. Below is plumbing: read events, serve a form on localhost, write the
// answer to a file.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const DIR = '.twinai-d1'
const FILE = join(DIR, 'session.json')
const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null)
const save = (s) => { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(s, null, 2)) }

if (flag('lock')) {
  const s = load()
  if (!s) { console.error('no session'); process.exit(1) }
  const bad = validateObservation(s.observation ?? {})
  // ⚖️ REFUSES TO SEAL AN UNANSWERED SESSION, unlike the label packet -- and the
  // difference is deliberate. There, a missing label is one claim out of many
  // and the denominator records it. Here the observation IS the session: sealing
  // without it would file a watched hour as a data point that says nothing.
  if (bad) { console.error(`cannot lock: ${bad}`); process.exit(3) }
  s.locked = true
  s.lockedAt = new Date().toISOString()
  save(s)
  console.log(JSON.stringify({
    blocker: s.observation.blocker,
    creator_said: s.observation.creatorReason,
    observed: s.prefill,
    // ⚠️ THE #71 SCOPE, GENERATED FROM THIS SESSION rather than remembered a
    // week later.
    build_next: s.missing,
  }, null, 2))
  process.exit(0)
}

if (!flag('serve')) { console.error('use --selftest, --consent, --serve or --lock'); process.exit(2) }

const userId = arg('user')
if (!userId) { console.error('--user <profile id> is required: which session are we watching'); process.exit(2) }

const { createClient } = await import('@supabase/supabase-js')
const SB = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB || !KEY) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2) }
const db = createClient(SB, KEY, { auth: { persistSession: false } })

const since = arg('since', new Date(Date.now() - 4 * 3600_000).toISOString())
const { data: events, error } = await db.from('analytics_events')
  .select('event, created_at, props').eq('user_id', userId).gte('created_at', since)
  .order('created_at', { ascending: true })
if (error) { console.error(error.message); process.exit(1) }

const timeline = reconstruct(events ?? [])
const session = load() ?? {}
session.userId = userId
session.since = since
session.timeline = timeline
const { count: editCount } = await db.from('script_edits')
  .select('id', { count: 'exact', head: true }).eq('owner_id', userId).gte('created_at', since)
session.prefill = prefill(timeline, editCount ?? null)
session.missing = missingInstrumentation(events ?? [])
session.locked = false
save(session)

// ⚠️ SAID AT THE TOP OF THE SESSION, NOT DISCOVERED AFTERWARDS. An observer who
// learns at the end that the camera was never instrumented has already written
// "they did not open the camera" in their head.
if (session.missing.length) {
  console.log('BLIND SPOTS in this timeline — these events do not exist yet:')
  for (const m of session.missing) console.log(`  ${m.event.padEnd(20)} cannot see: ${m.blind_to}`)
  console.log('')
}

const page = readFileSync(new URL('./d1-observer.html', import.meta.url), 'utf8')
const PORT = Number(arg('port', 7359))
createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page) }
  if (u.pathname === '/session') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ...session, blockers: BLOCKERS }))
  }
  if (u.pathname === '/observe' && req.method === 'POST') {
    let body = ''
    for await (const c of req) body += c
    const o = JSON.parse(body || '{}')
    const bad = validateObservation(o)
    if (bad) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: bad })) }
    session.observation = { ...o, at: new Date().toISOString() }
    save(session)
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ saved: true }))
  }
  res.writeHead(404); res.end()
}).listen(PORT, '127.0.0.1', () => {
  console.log(`${timeline.length} events. open http://localhost:${PORT}`)
  console.log('when the session ends:  node scripts/d1-observer.mjs --lock')
})

