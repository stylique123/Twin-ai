// THE POLICY DECIDED WHETHER TO PAGE, AND NOTHING CARRIED THE MESSAGE.
//
// ⚠️ MEASURED BEFORE BUILDING, per the standing trace-first rule. Grepped the
// whole repository for `email|smtp|resend|sendgrid|postmark|mailgun|nodemailer|
// hooks.slack`: ZERO matches. `scripts/ops/heartbeat.mjs` ended in
// `process.exit(2)`. So the heartbeat's decision half was complete and fully
// tested, and its delivery half did not exist — the defect class this session
// keeps finding, in its purest form: a module that is correct and unreachable.
//
// ⚖️ AND THE OWNER'S GATE IS BEHAVIOURAL, WHICH IS WHY THESE TESTS ARE NOT THE
// WHOLE STORY AND SAY SO. "Run one cycle manually and confirm an email arrives.
// If it can't page you on demand, it can't page you at 3am." Unit tests prove
// the RULE; `heartbeat.mjs --page-test` proves ARRIVAL against the real API.
// Neither substitutes for the other, and a green file here is not evidence that
// anything was ever delivered.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  pageBody, digestMarkdown, pageAction, PAGE_LABEL, PAGE_TITLE,
} from '../ops/heartbeatMessage'

const base = { mode: 'reference' as const, failed: 'non-2xx from generate-blueprint: 503', durationMs: null, at: 0 }

describe('one open page per outage, and the transport enforces it too', () => {
  it('opens when nothing is open, comments when something is', () => {
    // ⚠️ THIS IS "PAGE ONCE" EXPRESSED IN THE MEDIUM. Opening a fresh issue per
    // run would restore 24-pages-a-day in the transport with `decideHeartbeat`
    // still green — the policy and the delivery have to agree.
    expect(pageAction('started_failing', false)).toBe('opened')
    expect(pageAction('started_failing', true)).toBe('commented')
    expect(pageAction('still_failing', true)).toBe('commented')
    expect(pageAction('still_failing', false)).toBe('opened')
  })

  it('recovery closes the open page and never opens a new one', () => {
    expect(pageAction('recovered', true)).toBe('closed')
    // ⚖️ A RECOVERY WITH NOTHING OPEN MEANS THE PAGER AND THE WORLD DISAGREE.
    // Filing a cheerful "we're back" issue would be noise stacked on a state
    // bug; skipping it leaves the disagreement visible.
    expect(pageAction('recovered', false)).toBe('skipped_no_open_page')
  })

  it('no reason ever produces an unhandled action', () => {
    for (const reason of ['started_failing', 'still_failing', 'recovered'] as const) {
      for (const open of [true, false]) {
        expect(['opened', 'commented', 'closed', 'skipped_no_open_page'])
          .toContain(pageAction(reason, open))
      }
    }
  })
})

describe('the page says what broke, first', () => {
  it('leads with the finding, not with who sent it', () => {
    // ⚠️ SOMEBODY IS READING THIS ON A PHONE AT 3AM. The first line has to be
    // the thing that is wrong.
    const body = pageBody({ ...base, reason: 'started_failing' })
    expect(body.split('\n')[0]).toMatch(/Twin stopped producing scripts/)
    expect(body).toContain('non-2xx from generate-blueprint: 503')
  })

  it('a slow run says it produced a script and how long it took', () => {
    // ⚖️ "IT IS SLOW" AND "IT IS DEAD" NEED DIFFERENT RESPONSES, so the page
    // must not describe them in the same words.
    const body = pageBody({ ...base, reason: 'started_failing', failed: null, durationMs: 200_000 })
    expect(body).toMatch(/produced a script but took 200s/)
    expect(body).not.toMatch(/non-2xx/)
  })

  it('tells the reader the cadence, so a second page is not a second outage', () => {
    // ⚠️ WITHOUT THIS A READER CANNOT TELL A REMINDER FROM A NEW BREAK, and
    // will either over-react to the second page or learn to ignore the first.
    expect(pageBody({ ...base, reason: 'still_failing' })).toMatch(/one more of these an hour from now/)
    expect(pageBody({ ...base, reason: 'still_failing' })).toMatch(/Not one per run/)
  })

  it('recovery brings good news and asks for nothing', () => {
    // ⚖️ A PAGER THAT ONLY EVER BRINGS BAD NEWS IS ONE YOU LEARN TO DREAD.
    const body = pageBody({ ...base, reason: 'recovered', failed: null, durationMs: 42_000 })
    expect(body).toMatch(/producing scripts again/)
    expect(body).toMatch(/Nothing to do/)
    // And it must not carry the reminder promise — there is nothing to remind.
    expect(body).not.toMatch(/an hour from now/)
  })

  it('links the run when there is one, and says nothing when there is not', () => {
    expect(pageBody({ ...base, reason: 'started_failing', runUrl: 'https://x/run/1' }))
      .toContain('(https://x/run/1)')
    expect(pageBody({ ...base, reason: 'started_failing', runUrl: null }))
      .not.toMatch(/\[The run that decided this\]/)
  })

  it('never renders undefined into a message somebody has to act on', () => {
    for (const reason of ['started_failing', 'still_failing', 'recovered'] as const) {
      for (const failed of [null, 'boom']) {
        for (const durationMs of [null, 1000]) {
          const body = pageBody({ ...base, reason, failed, durationMs })
          expect(body, `${reason}/${failed}/${durationMs}`).not.toMatch(/undefined|NaN|\[object/)
        }
      }
    }
  })
})

describe('the digest cannot page anybody', () => {
  it('renders findings as text and nothing else', () => {
    const md = digestMarkdown([
      { kind: 'wrong_voice', detail: 'produced by someone-else' },
      { kind: 'paid_path_used', detail: 'free path failed' },
    ])
    expect(md).toContain('`wrong_voice`')
    expect(md).toContain('`paid_path_used`')
  })

  it('says so when there is nothing, rather than rendering an empty bullet', () => {
    expect(digestMarkdown([])).toBe('_No digest findings._')
  })

  // ⚠️⚠️ THE LOAD-BEARING ASSERTION OF THE WHOLE SPLIT. The owner's rule is that
  // digest findings NEVER page. This is enforced structurally — the module that
  // formats digests has no transport in it — and asserted here so that adding
  // one fails the build rather than quietly muting the pager.
  it('the message module contains no transport for digests', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'ops', 'heartbeatMessage.ts'), 'utf8')
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/fetch\(|axios|https?:\/\/api\./)
  })
})

// ── AND THE RUNNER ACTUALLY USES ALL OF IT ────────────────────────────────
//
// ⚖️ A FORMATTER NOTHING CALLS IS THE SAME DEFECT AS A POLICY NOTHING CALLS,
// which is the defect this entire PR exists to close. #731 was trimmed for it.
const RUNNER = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'scripts', 'ops', 'heartbeat.mjs'), 'utf8')

describe('the runner reaches the transport, not merely the policy', () => {
  it('imports and calls every piece of the message module', () => {
    for (const symbol of ['pageBody', 'digestMarkdown', 'pageAction', 'PAGE_LABEL', 'PAGE_TITLE']) {
      expect(RUNNER, symbol).toContain(symbol)
    }
    expect(RUNNER).toMatch(/deliverPage\(/)
    expect(RUNNER).toMatch(/deliverDigest\(/)
  })

  it('has a live path that actually calls generate-blueprint', () => {
    // ⚠️ THE THING THAT WAS MISSING. Before this change the file ended in
    // `process.exit(2)` — every guard green, nothing ever sent.
    expect(RUNNER).toMatch(/functions\/v1\/generate-blueprint/)
    expect(RUNNER).not.toMatch(/heartbeat: live mode needs HEARTBEAT_REFERENCE_URL/)
  })

  it('offers the on-demand page test the merge gate needs', () => {
    // ⚖️ "IF IT CAN'T PAGE YOU ON DEMAND, IT CAN'T PAGE YOU AT 3AM."
    expect(RUNNER).toMatch(/--page-test/)
    // And it must not need the generation context to do it, or the gate is
    // blocked on exactly the credentials it was meant to test independently.
    const block = RUNNER.slice(RUNNER.indexOf('if (PAGE_TEST)'), RUNNER.indexOf('// ── LIVE'))
    expect(block).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|HEARTBEAT_REFERENCE_URL/)
  })

  it('the page test says it is a test, in the failure line itself', () => {
    // ⚠️ A PAGE INDISTINGUISHABLE FROM A REAL OUTAGE teaches the reader to
    // distrust the next real one.
    const block = RUNNER.slice(RUNNER.indexOf('if (PAGE_TEST)'), RUNNER.indexOf('// ── LIVE'))
    expect(block).toMatch(/PAGE TEST/)
  })

  it('both variants always run — a healthy reference cannot hide a dead idea path', () => {
    // ⚠️ THE IDEA VARIANT IS THE ONE THAT WOULD HAVE CAUGHT THE ORIGINAL
    // OUTAGE, on the path with no reference to blame. Short-circuiting on a
    // healthy reference run would skip it.
    const ref = RUNNER.indexOf("await runVariant('reference')")
    const idea = RUNNER.indexOf("await runVariant('idea')")
    expect(ref).toBeGreaterThan(-1)
    expect(idea).toBeGreaterThan(ref)
    const between = RUNNER.slice(ref, idea)
    expect(between).not.toMatch(/\bif\s*\(|return|process\.exit/)
  })

  it('the worse of the two decides, and the digest sees both', () => {
    expect(RUNNER).toMatch(/runIsBad\(reference\.run\) \? reference : idea/)
    expect(RUNNER).toMatch(/inspect\(reference\.script[\s\S]{0,200}inspect\(idea\.script/)
  })

  it('exits 0 even when it paged, so GitHub does not notify a second time', () => {
    // ⚖️ A RED RUN WOULD EMAIL THE OWNER THROUGH GITHUB'S OWN MACHINERY — the
    // exact duplicate the policy exists to prevent.
    expect(RUNNER).toMatch(/EXIT 0 EVEN WHEN IT PAGED/)
  })

  it('writes the digest to ops_events, the table that exists', () => {
    // ⚠️ NOT `ops_alerts`, which has never existed in any migration and is the
    // precise mistake `check_table_names_exist` was written for.
    expect(RUNNER).toMatch(/from\('ops_events'\)/)
    const code = RUNNER.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    expect(code).not.toMatch(/from\('ops_alerts'\)/)
  })
})

describe('the constants that make deduplication work', () => {
  it('the label is stable and not a word anybody would file by hand', () => {
    expect(PAGE_LABEL).toBe('heartbeat-page')
  })

  it('the title carries no timestamp, run id or counter', () => {
    // ⚠️ A TITLE THAT VARIES OPENS A FRESH ISSUE EVERY HOUR. The dedup relies
    // on one stable open issue per outage.
    expect(PAGE_TITLE).not.toMatch(/\d/)
  })
})

// ── THE COLUMN THAT HAD READERS AND NO WRITER ─────────────────────────────
//
// ⚠️ FOUND BY GREP, NOT BY A FAILING TEST. 0190 added `generations.is_heartbeat`,
// every corpus reader filters on it, and `check_heartbeat_excluded_from_corpus`
// fails the build if one stops — while `generate-blueprint` contained the string
// `is_heartbeat` ZERO times. The guard was protecting a value nobody wrote, so
// the corpus poisoning it exists to prevent would have happened regardless, with
// every check green. The mirror of the defect this session keeps finding.
const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the heartbeat flag is actually written', () => {
  it('the generations insert carries it', () => {
    expect(EDGE).toMatch(/is_heartbeat: isHeartbeat,/)
  })

  it('it is derived from identity, never from the request body', () => {
    // ⚠️⚠️ A BODY FLAG WOULD LET ANY CALLER HIDE THEIR GENERATIONS FROM EVERY
    // CORPUS SAMPLE — a quiet way to bias the product's own measurements. The
    // heartbeat is an account; only that account's rows carry the flag.
    expect(EDGE).toMatch(/const isHeartbeat = heartbeatUserId !== '' && user\.id === heartbeatUserId/)
    const decl = EDGE.slice(EDGE.indexOf('const heartbeatUserId'), EDGE.indexOf('const isHeartbeat'))
    expect(decl).toMatch(/Deno\.env\.get\('HEARTBEAT_USER_ID'\)/)
    // The derivation must not consult the body at all.
    expect(EDGE.slice(EDGE.indexOf('const heartbeatUserId'), EDGE.indexOf('const isHeartbeat') + 200))
      .not.toMatch(/body\./)
  })

  it('an unset env flags nothing, rather than flagging everything', () => {
    // ⚖️ THE SAFE DIRECTION IS EXPLICIT. An unflagged heartbeat is visible
    // noise in the corpus; a flagged creator is invisible loss. The empty-string
    // guard is what makes a missing env fall the harmless way.
    expect(EDGE).toMatch(/heartbeatUserId !== ''/)
  })

  it('the runner does not ask to be excluded', () => {
    // ⚠️ IT USED TO SEND `heartbeat: true` AND AN `x-twin-heartbeat` HEADER,
    // both of which the edge ignored — a request that can ask to be excluded is
    // a request anyone can make.
    expect(RUNNER).not.toMatch(/x-twin-heartbeat|heartbeat: true/)
  })

  it('the runner authenticates as the account, not as the service role', () => {
    // ⚠️ `generate-blueprint` CALLS `auth.getUser()` AND 401s WITHOUT A USER.
    // A service-key request would measure the 401 path forever and report the
    // product healthy the whole time.
    expect(RUNNER).toMatch(/authorization: `Bearer \$\{ACCESS_TOKEN\}`/)
    const call = RUNNER.slice(RUNNER.indexOf('functions/v1/generate-blueprint'))
    expect(call.slice(0, 600)).not.toMatch(/SERVICE_KEY/)
  })

  it('a monitor that cannot log in does not page "Twin is broken"', () => {
    // ⚖️ PAGING A PRODUCT OUTAGE WHEN THE TRUTH IS "the monitor's password
    // expired" is how a pager loses its credibility.
    expect(RUNNER).toMatch(/heartbeat could not sign in/)
  })
})
