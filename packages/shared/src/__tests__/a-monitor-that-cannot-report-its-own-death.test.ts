// THE MONITOR SPENT ITS WHOLE LIFE DEAD, AND NOTHING SAID SO.
//
// ⚠️⚠️ MEASURED FIRST, per the standing trace-before-building rule, on
// 2026-09-21:
//
//   heartbeat workflow runs ........ 75 of 75 FAILED (every run the API retains)
//   cause, every time .............. heartbeat could not sign in: Invalid login credentials
//   production cross-check ......... select count(*) filter (where is_heartbeat)
//                                    from generations  ->  0   (of 154 total)
//
// So this is not a hypothesis about a failure mode. The monitor that exists to
// notice a two-day outage had never, in its entire existence, reached the
// product — and the only evidence anywhere was a red run in a tab nobody opens.
//
// ⚖️ THE CAUSE IS STRUCTURAL, WHICH IS WHY A CREDENTIAL FIX ALONE WOULD NOT
// CLOSE IT. `heartbeatToken()` threw during module setup, before the page state
// was loaded and before the transport was reachable, so a monitor that could
// not log in could not page. The next misconfiguration would be just as silent.
//
// ⚠️ WHAT THESE TESTS DO NOT PROVE. Same standing caveat as the pager's own
// file: a rule can be unit-tested, an ARRIVAL cannot. `heartbeat.mjs
// --page-test` sends a real message through the real transport, and a green
// file here is not evidence that anything was ever delivered.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  monitorBody, monitorAction, MONITOR_LABEL, MONITOR_TITLE, PAGE_LABEL, PAGE_TITLE,
} from '../ops/heartbeatMessage'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNNER_PATH = join(HERE, '..', '..', '..', '..', 'scripts', 'ops', 'heartbeat.mjs')
const RUNNER = readFileSync(RUNNER_PATH, 'utf8')

/** Whole-line comments only — never everything after `//`, or a real call
 *  sitting after a string containing a url disappears and the guard stops
 *  catching the thing it exists for. */
const CODE = RUNNER.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('one issue for a dead monitor, not twenty-four a day', () => {
  it('opens once and then stays quiet while nothing changes', () => {
    // ⚠️ THE HOURLY SCHEDULE IS THE WHOLE RISK HERE. A configuration error does
    // not fix itself, so "report it every run" is 24 notifications a day saying
    // one unchanged thing — and a pager that cries 24 times a day is muted, at
    // which point we are back to silence with extra steps.
    expect(monitorAction('down', false)).toBe('opened')
    expect(monitorAction('down', true)).toBe('skipped_already_open')
  })

  it('closes its own issue when a cycle finally gets through', () => {
    expect(monitorAction('up', true)).toBe('closed')
    // ⚖️ AND NEVER FILES A CHEERFUL "we're back" NOBODY ASKED FOR — the same
    // rule `pageAction` already follows for the product channel.
    expect(monitorAction('up', false)).toBe('skipped_no_open_page')
  })
})

describe('a dead monitor is a different fact from a dead product', () => {
  it('uses its own label and title, never the product pager’s', () => {
    // ⚠️ SHARING THE LABEL WOULD LET A TWIN RECOVERY CLOSE A MONITOR ISSUE THAT
    // NOTHING HAS FIXED. The label IS the deduplication key for both channels,
    // so two channels need two keys.
    expect(MONITOR_LABEL).not.toBe(PAGE_LABEL)
    expect(MONITOR_TITLE).not.toBe(PAGE_TITLE)
  })

  it('refuses to imply Twin is broken, and says the hour went unmeasured', () => {
    // ⚖️ `heartbeatToken()`'S OWN COMMENT HAS THIS RIGHT AND IS NOT SOFTENED BY
    // THIS CHANGE: "Paging 'Twin is broken' when the truth is 'the monitor's
    // password expired' is how a pager loses its credibility." The fix is not to
    // route this to that issue — it is to say the true thing somewhere else.
    const body = monitorBody({ detail: 'Invalid login credentials', at: 0, runUrl: null })
    expect(body).toContain("Twin's health is unknown")
    expect(body).toContain('nothing was measured')
    expect(body).not.toContain(PAGE_TITLE)
    // ⚠️ THE ONLY MENTION OF TWIN BEING BROKEN IS THE ONE DENYING IT, and a
    // naive substring ban would forbid exactly that sentence. So the assertion
    // is that every occurrence is negated, not that the words never appear —
    // the difference between a guard that reads and one that greps.
    for (const m of body.matchAll(/Twin is broken/g)) {
      expect(body.slice(Math.max(0, (m.index ?? 0) - 40), m.index)).toMatch(/not a report that $/)
    }
  })

  it('leads with the consequence a reader can act on', () => {
    // ⚠️ THE FINDING THAT MATTERS IS NOT "a script failed" — it is that the
    // watching has stopped. A real outage during this window would look
    // identical to a healthy one.
    const body = monitorBody({ detail: 'SUPABASE_URL is not set', at: 0, runUrl: null })
    expect(body).toContain('nobody is watching')
    expect(body).toContain('SUPABASE_URL is not set')
    expect(body).toContain('--page-test')
  })

  it('carries the run link when there is one, and no empty link when there is not', () => {
    const withLink = monitorBody({ detail: 'x', at: 0, runUrl: 'https://example.invalid/run/1' })
    expect(withLink).toContain('https://example.invalid/run/1')
    expect(monitorBody({ detail: 'x', at: 0, runUrl: null })).not.toContain('](')
  })
})

describe('the runner can actually reach that channel when setup dies', () => {
  it('reads the pager’s own credentials BEFORE anything that can fail', () => {
    // ⚠️⚠️ THIS ORDERING IS THE DEFECT, STATED AS A TEST. The file used to read
    // Supabase configuration first and exit inside it, which meant the process
    // was already gone before the one channel that could report it was opened.
    const token = CODE.indexOf("requireEnv('GITHUB_TOKEN')")
    const supabase = CODE.indexOf("needEnv('SUPABASE_URL')")
    expect(token).toBeGreaterThan(-1)
    expect(supabase).toBeGreaterThan(-1)
    expect(token).toBeLessThan(supabase)
  })

  it('puts the sign-in inside the block that reports, not above it', () => {
    // ⚖️ THE SIGN-IN IS THE ONE THAT ACTUALLY FAILED 75 TIMES. A guard that
    // only covered the env vars would have left the measured failure uncovered.
    const open = CODE.indexOf('try {')
    const close = CODE.indexOf('} catch (e) {')
    expect(open).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(open)
    expect(CODE.slice(open, close)).toMatch(/await heartbeatToken\(/)
    expect(CODE.slice(close)).toMatch(/deliverMonitorPage\(/)
  })

  it('logs the cause before attempting delivery, so a failed page still leaves a trace', () => {
    const block = CODE.slice(CODE.indexOf('} catch (e) {'))
    const logged = block.indexOf('heartbeat could not start')
    const delivered = block.indexOf('deliverMonitorPage(')
    expect(logged).toBeGreaterThan(-1)
    expect(logged).toBeLessThan(delivered)
  })

  it('goes red when it measured nothing, unlike the path that paged and did its job', () => {
    // ⚠️ THE PRODUCT PATH EXITS 0 ON PURPOSE so GitHub does not notify twice
    // about one outage. That reasoning does not transfer: this run produced no
    // measurement at all, and a green tick on it is the same lie in the Actions
    // tab that this file exists to stop telling.
    const block = CODE.slice(CODE.indexOf('} catch (e) {'), CODE.indexOf('// ⚠️ RECOVERY IS CLAIMED'))
    expect(block).toMatch(/process\.exit\(1\)/)
  })

  it('claims recovery only from its own setup succeeding', () => {
    // ⚖️ A BROKEN MONITOR CANNOT RECOVER BY TWIN GETTING BETTER — it is not
    // measuring Twin at all. So `state: 'up'` must be raised where setup
    // finished, not anywhere near the generation verdict.
    const up = CODE.indexOf("state: 'up'")
    expect(up).toBeGreaterThan(-1)
    expect(up).toBeLessThan(CODE.indexOf("runVariant('reference')"))
  })
})

describe('and it refuses to pretend when there is genuinely nowhere to report', () => {
  it('exits without inventing a channel when the pager’s own token is missing', () => {
    // ⚠️ THE ONE CASE A RED RUN REALLY IS ALL THAT IS LEFT. Reporting this
    // anywhere would require the credential that is missing; the honest
    // behaviour is to die naming it. Asserted by RUNNING it, not by reading it
    // — this is the only part of the setup path a test can exercise without a
    // network, and it is exercised.
    let status = 0
    let stderr = ''
    try {
      execFileSync(process.execPath, ['--experimental-strip-types', RUNNER_PATH], {
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
        encoding: 'utf8', stdio: 'pipe', timeout: 60_000,
      })
    } catch (e: unknown) {
      const err = e as { status?: number; stderr?: string }
      status = err.status ?? -1
      stderr = err.stderr ?? ''
    }
    expect(status).toBe(2)
    expect(stderr).toContain('GITHUB_TOKEN')
    // ⚖️ AND IT NAMES WHY, rather than exiting on a bare code somebody has to
    // go read the source to interpret.
    expect(stderr).toMatch(/reports health it never measured/)
  })
})
