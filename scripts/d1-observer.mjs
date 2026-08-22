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

// ⚠️ THE LOGIC MOVED, IT WAS NOT COPIED. See scripts/d1-core.mjs — this file
// runs a CLI at module scope, so anything that wants to REUSE the taxonomy
// cannot import it from here without being killed by the exit below.
import {
  BLOCKERS, REQUIRED_EVENTS, reconstruct, missingInstrumentation,
  prefill, validateObservation, CONSENT,
} from './d1-core.mjs'

export { BLOCKERS, REQUIRED_EVENTS, reconstruct, missingInstrumentation, prefill, validateObservation, CONSENT }


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

