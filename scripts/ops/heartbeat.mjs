#!/usr/bin/env node
// THE THING THAT ACTUALLY USES THE PRODUCT, ON A SCHEDULE.
//
// ⚠️ EVERY GUARD WE HAD ASKED A QUESTION ABOUT THE CODE. None asked whether
// the product still works. `generate-blueprint` could not boot for two days;
// the deploy said SUCCESS, CI was green throughout, and a person found it.
//
// ⚖️ TWO VARIANTS EVERY HOUR, AND THE SECOND IS NOT DECORATION.
//   reference  a generation from a FIXED FILE ON OUR OWN STORAGE
//   idea       a generation from a FIXED SENTENCE, no reference at all
// The idea variant is what would have caught this outage on the path that has
// no reference to blame. It shares the run's setup, so it costs one more call.
//
// ⚠️ THE REFERENCE IS OUR OWN FILE, NOT A TIKTOK URL, AND THAT IS DELIBERATE.
// A public URL can be deleted, geo-blocked or rate-limited, and then the
// heartbeat alerts on somebody else's platform. Paging yourself at 3am about
// TikTok's availability is how you learn to ignore the pager.
//
// ⚠️⚠️ AND THE SUPPLIED REFERENCE IS A YOUTUBE SHORT, SO THAT WARNING IS NOT
// HYPOTHETICAL — IT IS MEASURED. The real assess job against it on 2026-09-08
// returned `outcome: assessed`, `rejected: 0`, 18 fields accepted (the speech
// gate takes it) alongside `visual_ran: false`,
// `visual_failure_code: UNKNOWN_DOWNLOAD_FAILURE` and
// `paid_because: free_path_failed`. Two consequences are wired rather than
// remembered:
//   · a download failure is DIGEST, never a page — see `runFromAssess`;
//   · the run must never fall through to the PAID transcript path, because a
//     monitor that can spend money spends it hourly, forever.

import {
  decideHeartbeat, runIsBad, INITIAL_PAGE_STATE, PAGE_IF_SLOWER_THAN_MS,
  wrongVoiceFinding, sponsoredSpokenAsLivedFinding, lengthBandFinding,
  downloadFailureFinding, paidPathFinding, runFromAssess,
} from '../../packages/shared/src/ops/heartbeatPolicy.ts'
import {
  pageBody, digestMarkdown, pageAction, PAGE_LABEL, PAGE_TITLE,
} from '../../packages/shared/src/ops/heartbeatMessage.ts'
import { appendFile } from 'node:fs/promises'

const SELFTEST = process.argv.includes('--selftest')
const DRY_RUN = process.argv.includes('--dry-run')
// ⚠️ THE MERGE GATE, MADE RUNNABLE. The owner's condition for merging this was
// behavioural, not a checkbox: "run one cycle manually and confirm an email
// arrives. If it can't page you on demand, it can't page you at 3am." This flag
// sends a REAL page through the REAL transport without generating anything, so
// the claim can be tested today rather than asserted.
//
// ⚖️ IT IS DELIBERATELY NOT A MOCK. A test that exercises a fake transport
// proves the formatting and nothing about whether a message arrives, which is
// the only thing in doubt.
const PAGE_TEST = process.argv.includes('--page-test')

// The frozen store. Set up once, never edited — see 0190's header for why.
export const FROZEN_STORE = {
  voiceId: process.env.HEARTBEAT_VOICE_ID ?? 'twin-heartbeat-voice',
  ownedProductName: 'Ledger Notebook',
  sponsoredNeverUsedProductName: 'Northwind Serum',
  lengthBand: { min: 90, max: 160 },
}

export const IDEA_SENTENCE =
  'Why I stopped keeping three notebooks and went back to one.'

/** Findings the frozen store makes decidable, gathered in one place so the
 *  runner cannot check some and forget others. */
export function inspect(script, producedVoiceId, run = {}) {
  return [
    wrongVoiceFinding(FROZEN_STORE, producedVoiceId),
    sponsoredSpokenAsLivedFinding(FROZEN_STORE, script),
    lengthBandFinding(FROZEN_STORE, script),
    // ⚖️ THE TWO PLATFORM FACTS, IN THE SAME LIST AS THE SCRIPT FACTS, so the
    // runner cannot check some and forget others — the reason this function
    // exists at all.
    downloadFailureFinding(run),
    paidPathFinding(run),
  ].filter(Boolean)
}

/**
 * ⚠️ A MONITOR MUST NOT BE ABLE TO SPEND MONEY, AND THIS IS THE GUARD.
 *
 * The assess path falls through to a PAID transcript service when the free one
 * fails — measured on this very URL. Hourly, that is 24 paid fetches a day for
 * a monitor, growing silently until an invoice explains it.
 *
 * ⚖️ IT REFUSES THE FALLTHROUGH RATHER THAN BUDGETING IT. A cap would still
 * spend, would need tuning, and would fail open the week the free path breaks.
 * The run uses what the free path returned; if that is nothing, the REFERENCE
 * variant says so in the digest — and the idea variant, which needs no download
 * at all, still answers the question the heartbeat is asking.
 */
export const ASSESS_OPTIONS = Object.freeze({ allow_paid_transcript: false })

// ── THE PAGER'S MEMORY, READ AND WRITTEN ──────────────────────────────────
//
// ⚠️ WITHOUT THIS THE POLICY CANNOT BE "PAGE ONCE". `decideHeartbeat` is a pure
// function of the PREVIOUS state; if nothing loads and stores that state, every
// run starts from INITIAL_PAGE_STATE, every failure looks like the first one,
// and the thing pages 48 times a day. The table (0190) existed in the first
// draft of this PR and nothing read it — `check_column_readers` caught exactly
// that and was right to.

/** DB row → policy state.
 *
 *  ⚠️ `last_paged_at` NULL MEANS "NEVER PAGED", AND MUST STAY null. Coercing it
 *  to 0 or Date.now() would each be a different lie: 0 makes the reminder
 *  arithmetic say "an hour has passed" on a state that never paged, and now()
 *  says the opposite. The policy handles null explicitly — it pages — so the
 *  mapping's only job is to not destroy the distinction.
 */
export function rowToState(row) {
  if (!row) return INITIAL_PAGE_STATE
  return {
    failing: row.failing === true,
    lastPagedAt: row.last_paged_at == null ? null : Date.parse(row.last_paged_at),
  }
}

/** Policy state → the columns 0190 declares. */
export function stateToRow(state) {
  return {
    id: true,
    failing: state.failing,
    last_paged_at: state.lastPagedAt === null ? null : new Date(state.lastPagedAt).toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export async function loadPageState(db) {
  const { data, error } = await db
    .from('heartbeat_page_state')
    .select('failing, last_paged_at')
    .maybeSingle()
  // A read that FAILED is not a state that says "healthy". Throwing here is
  // deliberate: continuing on a failed read would silently reset the pager to
  // "never paged" and re-page on a break we already reported.
  if (error) throw new Error(`heartbeat_page_state unreadable: ${error.message}`)
  return rowToState(data)
}

export async function savePageState(db, state) {
  const { error } = await db.from('heartbeat_page_state').upsert(stateToRow(state))
  if (error) throw new Error(`heartbeat_page_state unwritable: ${error.message}`)
}

// ── THE TRANSPORT ─────────────────────────────────────────────────────────
//
// ⚠️ ONE OPEN ISSUE PER OUTAGE, FOUND BY LABEL. Creating a new issue each time
// would reinvent 24-pages-a-day in the transport with the policy still green —
// so the search comes first and the create is the fallback, never the default.
//
// ⚖️ AND THE SEARCH IS BY LABEL, NOT BY TITLE. A title is prose somebody will
// eventually reword; the label is the key, and `PAGE_LABEL` is a string nobody
// would put on a hand-filed issue by accident.

const GH = 'https://api.github.com'

function ghHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  }
}

/** ⚠️ A NON-2XX FROM THE PAGER IS ITSELF A PAGE-WORTHY EVENT, and there is
 *  nowhere left to send it — so it throws, the workflow step goes red, and
 *  GitHub emails the owner about the failed run. The delivery failing loudly is
 *  the last line of defence against silence that looks like health. */
async function gh(token, method, path, body) {
  const res = await fetch(`${GH}${path}`, {
    method, headers: ghHeaders(token), body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`github ${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`)
  }
  return res.json()
}

/** The one open page issue, or null. */
export async function findOpenPage(token, repo) {
  const issues = await gh(token, 'GET',
    `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(PAGE_LABEL)}&per_page=1`)
  return Array.isArray(issues) && issues.length > 0 ? issues[0] : null
}

/**
 * Send a page. Returns what it did, so the caller can print it and the
 * selftest can assert on it.
 *
 * ⚠️ RECOVERY CLOSES THE ISSUE RATHER THAN OPENING ONE. A "recovered" page with
 * no open issue means the pager and the world disagree — the outage was closed
 * by hand, or state was lost. It comments nowhere and says so rather than
 * filing a cheerful new issue nobody asked for.
 */
export async function deliverPage(ctx, { token, repo }) {
  const body = pageBody(ctx)
  const open = await findOpenPage(token, repo)
  // ⚖️ THE RULE IS `pageAction`'S, NOT THIS FUNCTION'S. Everything below is
  // transport; the decision is a pure function with its own tests.
  const action = pageAction(ctx.reason, open !== null)

  if (action === 'skipped_no_open_page') return { action }

  if (action === 'closed') {
    await gh(token, 'POST', `/repos/${repo}/issues/${open.number}/comments`, { body })
    await gh(token, 'PATCH', `/repos/${repo}/issues/${open.number}`, { state: 'closed' })
    return { action, number: open.number }
  }

  if (action === 'commented') {
    await gh(token, 'POST', `/repos/${repo}/issues/${open.number}/comments`, { body })
    return { action, number: open.number }
  }

  // ⚖️ THE LABEL IS CREATED IF IT DOES NOT EXIST, because a 422 on an unknown
  // label would fail the very first page this thing ever sends — the one run
  // where nobody is watching for a failure yet.
  await gh(token, 'POST', `/repos/${repo}/labels`,
    { name: PAGE_LABEL, color: 'b60205', description: 'Opened by the heartbeat. Closed on recovery.' })
    .catch(() => {})
  const made = await gh(token, 'POST', `/repos/${repo}/issues`,
    { title: PAGE_TITLE, body, labels: [PAGE_LABEL] })
  return { action, number: made.number }
}

/**
 * The digest. Two sinks, NEITHER of which notifies anybody.
 *
 * ⚠️ THIS IS THE HALF THAT MUST NOT REACH THE PAGER. Length outside the band, a
 * claim restriction, the wrong voice, a download failure, the paid fallthrough
 * — all real, none worth waking somebody for, and routing any of them to the
 * issue is how the pager gets muted. `heartbeatMessage.ts` has no transport for
 * digests at all, so this cannot drift by accident.
 */
export async function deliverDigest(findings, { db, summaryPath }) {
  const md = digestMarkdown(findings)
  if (summaryPath) {
    await appendFile(summaryPath, `\n### heartbeat digest\n\n${md}\n`)
  }
  if (db && findings.length > 0) {
    // `ops_events` is the table an operator already watches — NOT `ops_alerts`,
    // which has never existed in any migration and is the exact mistake
    // `check_table_names_exist` was written for.
    const { error } = await db.from('ops_events').insert({
      kind: 'heartbeat_digest',
      detail: { findings },
    })
    if (error) console.warn('digest row not written:', error.message)
  }
  return md
}

// ── The self-test: the policy, exercised THROUGH this runner ───────────────
//
// ⚖️ A POLICY UNIT-TESTED IN ISOLATION AND CALLED BY NOBODY IS THE DEFECT THIS
// REPOSITORY KEEPS PAYING FOR. This runs the same decisions the scheduled job
// will, with no network and no database, so the wiring is checked and not
// merely the arithmetic.
if (SELFTEST) {
  let fail = 0
  const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`)
    if (!ok) fail++
  }

  const dead = (at) => ({ at, mode: 'reference', failed: 'non-2xx from generate-blueprint', durationMs: null })
  const good = (at) => ({ at, mode: 'idea', failed: null, durationMs: 42_000 })

  let state = INITIAL_PAGE_STATE
  const pages = []
  for (let i = 0; i < 24; i++) {
    const d = decideHeartbeat(state, dead(i * 30 * 60_000))
    state = d.nextState
    if (d.page) pages.push({ at: i * 30, page: d.page })
  }
  // 24 runs over 12 hours: one page at the break, then one an hour.
  check('one page on the break, then hourly — never once per run',
    pages[0].page === 'started_failing' && pages.length === 12,
    `pages=${pages.length} first=${pages[0]?.page}`)

  const back = decideHeartbeat(state, good(99 * 60 * 60_000))
  check('recovery pages', back.page === 'recovered', String(back.page))
  check('and then goes quiet', decideHeartbeat(back.nextState, good(100 * 60 * 60_000)).page === null)

  check('a slow run pages even though a script arrived',
    runIsBad({ at: 0, mode: 'reference', failed: null, durationMs: PAGE_IF_SLOWER_THAN_MS + 1 }))
  check('an unmeasured duration does not read as fast',
    decideHeartbeat(INITIAL_PAGE_STATE, { at: 0, mode: 'idea', failed: null, durationMs: null })
      .digest.some((f) => f.kind === 'duration_not_measured'))

  // The frozen store's checks, through `inspect` — the function the scheduled
  // run calls, not the individual checkers.
  const wrong = inspect('word '.repeat(120), 'someone-else')
  check('a script from another voice is caught', wrong.some((f) => f.kind === 'wrong_voice'),
    JSON.stringify(wrong))
  const lived = inspect(`I have used ${FROZEN_STORE.sponsoredNeverUsedProductName} for months. ${'w '.repeat(110)}`, FROZEN_STORE.voiceId)
  check('testifying to the sponsored product is caught',
    lived.some((f) => f.kind === 'sponsored_product_spoken_as_lived'), JSON.stringify(lived))
  const clean = inspect('word '.repeat(120), FROZEN_STORE.voiceId)
  check('a healthy script produces no findings', clean.length === 0, JSON.stringify(clean))

  // ── THE TWO PLATFORM RULES, ON THE RESULT PRODUCTION ACTUALLY RETURNED ───
  //
  // ⚠️ ASSERTED THROUGH `runFromAssess`, WHERE THE DECISION IS MADE. A first
  // version checked a hand-built run and passed with the classification
  // DELETED — a run carrying a script was never bad in the first place, so the
  // assertion proved nothing. This is the exact shape the job came back in.
  const realResult = {
    status: 'done', error: '', script: 'word '.repeat(120), durationMs: 41000,
    visual_failure_code: 'UNKNOWN_DOWNLOAD_FAILURE', paid_because: 'free_path_failed',
  }
  const fromReal = runFromAssess(0, 'reference', realResult)
  check('the measured production result does NOT page', runIsBad(fromReal) === false)
  check('its download failure is carried, not dropped',
    fromReal.visualFailureCode === 'UNKNOWN_DOWNLOAD_FAILURE')
  check('and the paid fallthrough is carried too', fromReal.paidPath === true)

  // ⚠️ THE LIE A STATUS FIELD CAN TELL. Measured: one of the eight most recent
  // YouTube assess jobs reports `done` while carrying a 400.
  const lying = runFromAssess(0, 'reference',
    { status: 'done', error: 'YouTube transcript service error 400', script: '' })
  check('a job that says done with no script is a FAILURE', runIsBad(lying) === true)
  check('and the failure names what actually went wrong',
    (lying.failed ?? '').includes('400'), String(lying.failed))
  check('a done job with neither script nor error still fails, and says so',
    (runFromAssess(0, 'idea', { status: 'done', script: '' }).failed ?? '').includes('no script'))

  const downloaded = inspect('word '.repeat(120), FROZEN_STORE.voiceId, fromReal)
  check('a download failure reaches the digest',
    downloaded.some((f) => f.kind === 'reference_download_failed'), JSON.stringify(downloaded))
  check('and the paid fallthrough reaches it as well',
    downloaded.some((f) => f.kind === 'paid_path_used'), JSON.stringify(downloaded))
  check('the paid path is refused, not budgeted', ASSESS_OPTIONS.allow_paid_transcript === false)

  // The state mapping, which is where a null can quietly become a number.
  check('a never-paged row maps to null, not to zero',
    rowToState({ failing: true, last_paged_at: null }).lastPagedAt === null)
  check('a missing row is the initial state, not a failing one',
    rowToState(null).failing === false && rowToState(null).lastPagedAt === null)
  check('a stored timestamp round-trips',
    rowToState({ failing: true, last_paged_at: '2026-09-08T12:00:00.000Z' }).lastPagedAt
      === Date.parse('2026-09-08T12:00:00.000Z'))
  check('null survives the write mapping too',
    stateToRow({ failing: true, lastPagedAt: null }).last_paged_at === null)
  check('the write names the single-row id so two opinions cannot exist',
    stateToRow({ failing: false, lastPagedAt: 0 }).id === true)

  // ⚠️ THE WHOLE POINT, ASSERTED END TO END: state that round-trips through the
  // table keeps the pager quiet. A mapping bug here would restore the 48-pages-
  // a-day behaviour with every unit test still green.
  {
    const first = decideHeartbeat(INITIAL_PAGE_STATE, dead(0))
    const persisted = rowToState({
      failing: stateToRow(first.nextState).failing,
      last_paged_at: stateToRow(first.nextState).last_paged_at,
    })
    check('state survives a round-trip through the table and stays quiet',
      first.page === 'started_failing' && decideHeartbeat(persisted, dead(30 * 60_000)).page === null)
  }

  console.log(fail === 0 ? '\nheartbeat selftest: OK' : `\nheartbeat selftest: ${fail} FAILED`)
  process.exit(fail === 0 ? 0 : 1)
}

if (DRY_RUN) {
  console.log('heartbeat dry run — configuration only, no calls made')
  console.log(`  voice          ${FROZEN_STORE.voiceId}`)
  console.log(`  reference      ${process.env.HEARTBEAT_REFERENCE_URL ?? '(unset — set HEARTBEAT_REFERENCE_URL)'}`)
  console.log(`  idea sentence  ${IDEA_SENTENCE}`)
  console.log(`  pages if slower than  ${PAGE_IF_SLOWER_THAN_MS / 1000}s`)
  process.exit(0)
}

// ── PAGE TEST: the delivery path, on demand, spending nothing ─────────────
//
// ⚠️ THIS IS THE MERGE GATE. It sends a real page through the real transport
// with a synthetic cause, so "it can page you on demand" is something you have
// SEEN rather than something this file claims. It needs only GITHUB_TOKEN and
// GITHUB_REPOSITORY — no Supabase context, no voice, no reference, no
// generation — which is what makes it runnable before the rest is configured.
if (PAGE_TEST) {
  const token = requireEnv('GITHUB_TOKEN')
  const repo = requireEnv('GITHUB_REPOSITORY')
  const result = await deliverPage({
    reason: 'started_failing',
    mode: 'reference',
    // ⚖️ THE BODY SAYS IT IS A TEST, IN THE FIRST LINE OF THE FAILURE ITSELF.
    // A page indistinguishable from a real outage is a page that teaches the
    // reader to distrust the next real one.
    failed: 'PAGE TEST — no generation was attempted and nothing is actually broken',
    durationMs: null,
    at: Date.now(),
    runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  }, { token, repo })
  console.log(`page test: ${result.action}${result.number ? ` #${result.number}` : ''}`)
  console.log('If an email did not arrive, the pager does not work — do not merge on the code alone.')
  process.exit(0)
}

// ── LIVE ──────────────────────────────────────────────────────────────────
//
// ⚠️ EVERY PIECE OF CONFIGURATION IS REQUIRED EXPLICITLY, and the run dies
// naming the one that is missing. The alternative — defaulting a value and
// carrying on — produces a heartbeat that runs, reports success, and is
// measuring something other than the product. That is worse than not running.
function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`heartbeat: ${name} is not set. A heartbeat that runs without its `
      + `configuration reports health it never measured.`)
    process.exit(2)
  }
  return v
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const ANON_KEY = requireEnv('SUPABASE_ANON_KEY')
const REFERENCE_URL = requireEnv('HEARTBEAT_REFERENCE_URL')
const GH_TOKEN = requireEnv('GITHUB_TOKEN')
const GH_REPO = requireEnv('GITHUB_REPOSITORY')

const { createClient } = await import('@supabase/supabase-js')
// Service client: the pager's memory and the digest row. NOT the generation.
const db = createClient(SUPABASE_URL, SERVICE_KEY)

// ⚠️ THE HEARTBEAT IS A REAL ACCOUNT, NOT THE SERVICE ROLE, AND IT HAS TO BE.
// `generate-blueprint` calls `auth.getUser()` and returns 401 without a user —
// checked in the function rather than assumed — so a service-key request would
// measure the 401 path forever and report the product healthy the whole time.
//
// ⚖️ AND IT IS THE SAME ACCOUNT THE EDGE FLAGS AS THE HEARTBEAT. `is_heartbeat`
// is derived server-side from this user's id, so the corpus exclusion cannot be
// spoofed by any other caller and cannot be forgotten by this one.
async function heartbeatToken() {
  const auth = createClient(SUPABASE_URL, ANON_KEY)
  const { data, error } = await auth.auth.signInWithPassword({
    email: requireEnv('HEARTBEAT_USER_EMAIL'),
    password: requireEnv('HEARTBEAT_USER_PASSWORD'),
  })
  // A monitor that cannot log in has learned nothing about whether the product
  // works — so this throws rather than being classified as a product failure.
  // Paging "Twin is broken" when the truth is "the monitor's password expired"
  // is how a pager loses its credibility.
  if (error || !data?.session?.access_token) {
    throw new Error(`heartbeat could not sign in: ${error?.message ?? 'no session returned'}`)
  }
  return data.session.access_token
}

const ACCESS_TOKEN = await heartbeatToken()

/**
 * One variant, end to end.
 *
 * ⚠️ THE CLOCK STARTS BEFORE THE CALL AND STOPS AFTER IT, INCLUDING ON THE
 * FAILURE PATH. Timing only the successes would make "it got slow" invisible
 * exactly when it matters, because the slowest runs are the ones that time out.
 */
async function runVariant(mode) {
  const started = Date.now()
  const body = mode === 'reference'
    ? { reference_url: REFERENCE_URL, ...ASSESS_OPTIONS }
    : { idea: IDEA_SENTENCE, ...ASSESS_OPTIONS }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-blueprint`, {
      method: 'POST',
      headers: {
        // ⚖️ THE ACCOUNT'S OWN TOKEN. The corpus flag is set from this user's
        // id server-side — nothing here asks to be excluded, because a request
        // that can ask to be excluded is a request anyone can make.
        authorization: `Bearer ${ACCESS_TOKEN}`,
        apikey: ANON_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const durationMs = Date.now() - started
    if (!res.ok) {
      return { run: { at: Date.now(), mode, failed: `non-2xx from generate-blueprint: ${res.status}`, durationMs }, script: '', voiceId: null }
    }
    const json = await res.json()
    // ⚖️ CLASSIFIED BY THE POLICY, NOT HERE. `runFromAssess` already knows that
    // `status: done` with no script is a failure — measured on a real job that
    // reported done while carrying a 400 — and duplicating that judgement here
    // is how the two copies come to disagree.
    return {
      run: runFromAssess(Date.now(), mode, { ...json, durationMs }),
      script: typeof json.script === 'string' ? json.script : '',
      voiceId: json.voice_id ?? null,
    }
  } catch (e) {
    return {
      run: { at: Date.now(), mode, failed: `request threw: ${e instanceof Error ? e.message : String(e)}`, durationMs: Date.now() - started },
      script: '', voiceId: null,
    }
  }
}

const prev = await loadPageState(db)

// ⚠️ THE REFERENCE VARIANT IS EVALUATED FIRST AND THE IDEA VARIANT ALWAYS RUNS.
// Short-circuiting on a healthy reference run would skip the path that has no
// reference to blame — the one that would have caught the original outage.
const reference = await runVariant('reference')
const idea = await runVariant('idea')

// ⚖️ THE WORSE OF THE TWO DECIDES. If either variant cannot produce a script,
// the product is broken for somebody, and averaging them would let a working
// idea path hide a dead reference path.
const worst = runIsBad(reference.run) ? reference : idea
const other = worst === reference ? idea : reference

const findings = [
  ...inspect(reference.script, reference.voiceId, reference.run),
  ...inspect(idea.script, idea.voiceId, idea.run),
]

const decision = decideHeartbeat(prev, worst.run, findings)
await savePageState(db, decision.nextState)

const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${GH_REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null

if (decision.page) {
  const result = await deliverPage({
    reason: decision.page,
    mode: worst.run.mode,
    failed: worst.run.failed,
    durationMs: worst.run.durationMs,
    at: worst.run.at,
    runUrl,
  }, { token: GH_TOKEN, repo: GH_REPO })
  console.log(`page: ${decision.page} -> ${result.action}${result.number ? ` #${result.number}` : ''}`)
} else {
  console.log('no page — the policy decided this run does not warrant one')
}

const md = await deliverDigest(decision.digest, { db, summaryPath: process.env.GITHUB_STEP_SUMMARY })
console.log(`reference: ${reference.run.failed ?? 'ok'} (${reference.run.durationMs ?? 'unmeasured'}ms)`)
console.log(`idea:      ${idea.run.failed ?? 'ok'} (${idea.run.durationMs ?? 'unmeasured'}ms)`)
console.log(`other variant: ${other.run.failed ?? 'ok'}`)
console.log(md)

// ⚠️ EXIT 0 EVEN WHEN IT PAGED. A red workflow run would notify a SECOND time
// through GitHub's own machinery, which is precisely the duplicate the policy
// exists to prevent. The page is the signal; the run merely sent it.
process.exit(0)
