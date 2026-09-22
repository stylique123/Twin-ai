// WHAT THE PAGE ACTUALLY SAYS, AND WHERE IT GOES.
//
// ⚠️ THE POLICY DECIDED *WHETHER* TO PAGE AND NOTHING CARRIED THE MESSAGE.
// `decideHeartbeat` has been correct and fully tested since the first draft of
// this PR; `scripts/ops/heartbeat.mjs` ended in `process.exit(2)`. Grepped
// across the whole repository for `email|smtp|resend|sendgrid|postmark|mailgun|
// nodemailer|hooks.slack`: ZERO matches. There was no delivery mechanism
// anywhere in this product, so this is not a wiring job — the transport did not
// exist to wire.
//
// ── WHY GITHUB AND NOT EMAIL DIRECTLY ────────────────────────────────────
//
// ⚠️ EVERY MAIL API NEEDS A KEY, AND A KEY IS EXACTLY WHAT THIS PR MUST NOT
// WAIT FOR. The owner's objection to merging it was precise: "a heartbeat that
// merges without wired credentials is worse than no heartbeat, because you'd
// believe you were being watched and you wouldn't be." A Resend or SendGrid
// path would ship in that same state — correct, untested against a real send,
// and gated on a secret nobody has set. The next stale note, written by me.
//
// ⚖️ `GITHUB_TOKEN` IS ALREADY IN EVERY WORKFLOW RUN. It needs no setup, no
// rotation and no secret this repository does not already have, and GitHub's
// own notification system delivers an issue to the watcher's inbox — which is
// what "an email arrives" means in practice. The delivery path can therefore be
// exercised ON DEMAND, today, which is the merge gate the owner set: "if it
// can't page you on demand, it can't page you at 3am."
//
// ⚠️⚠️ AND THE MEDIUM ENFORCES THE POLICY A SECOND TIME. "Page once, not
// twenty-four times an hour" is `decideHeartbeat`'s job, but an issue makes it
// structural: ONE open issue per outage, reminders as comments on it, closed on
// recovery. Even if the policy regressed, the owner would get one thread rather
// than twenty-four, and the thread would show its own history.
//
// ⚖️ THE DIGEST IS NOT DELIVERED HERE, ON PURPOSE. A digest finding must never
// notify — that is the whole point of the split — and a comment on a watched
// issue notifies. So the digest goes to the run summary and to `ops_events`,
// the table an operator already watches, and NOTHING in this module can send
// it. See `digestMarkdown`, which returns text for those two sinks and has no
// transport at all.
import type { DigestFinding, PageReason } from './heartbeatPolicy'

/** ⚠️ THE LABEL IS THE DEDUPLICATION KEY, so it must be stable and must not be
 *  a word anybody would reasonably use on a hand-filed issue. If this ever
 *  matches an unrelated issue the heartbeat will comment on it forever. */
export const PAGE_LABEL = 'heartbeat-page'

/** The single open issue per outage. Constant, because the SEARCH for an
 *  existing page relies on it — a title carrying a timestamp or a run id would
 *  open a fresh issue every hour and reinvent the 24-pages-a-day problem in the
 *  transport, with the policy still green. */
export const PAGE_TITLE = 'heartbeat: Twin is not producing scripts'

export interface PageContext {
  reason: PageReason
  /** Which variant produced the verdict. */
  mode: 'reference' | 'idea'
  /** Why it failed, or null when it failed by being too slow. */
  failed: string | null
  durationMs: number | null
  /** Epoch ms. Passed in rather than read from the clock so the body is pure. */
  at: number
  /** Link back to the run that decided this, when there is one. */
  runUrl?: string | null
}

function whatWentWrong(ctx: PageContext): string {
  if (ctx.failed !== null) return ctx.failed
  if (ctx.durationMs !== null) {
    return `it produced a script but took ${Math.round(ctx.durationMs / 1000)}s`
  }
  // ⚠️ NOT REACHABLE FROM `runIsBad` TODAY — a run with no failure and no
  // measured duration is not bad — but stated rather than left to render as
  // "undefined" if the policy ever widens.
  return 'the run was judged bad without recording why'
}

/**
 * The body of a page.
 *
 * ⚠️ IT LEADS WITH WHAT BROKE AND WHAT TO DO, NOT WITH WHO SENT IT. Somebody is
 * reading this on a phone at 3am. The first line has to be the finding.
 */
export function pageBody(ctx: PageContext): string {
  const when = new Date(ctx.at).toISOString()
  const head = ctx.reason === 'recovered'
    ? `**Twin is producing scripts again.** The \`${ctx.mode}\` variant succeeded at ${when}.`
    : ctx.reason === 'started_failing'
      ? `**Twin stopped producing scripts.** The \`${ctx.mode}\` variant failed at ${when}: ${whatWentWrong(ctx)}.`
      : `**Still failing.** The \`${ctx.mode}\` variant failed again at ${when}: ${whatWentWrong(ctx)}.`

  const next = ctx.reason === 'recovered'
    ? 'Closing this. Nothing to do.'
    : [
      'What this means: a real generation, against a frozen store, produced nothing a creator could use.',
      'It is not a code question — every other guard already passed. Check that `generate-blueprint` boots.',
    ].join(' ')

  // ⚖️ THE REMINDER CADENCE IS STATED IN THE MESSAGE. A reader who does not
  // know the pager reminds hourly cannot tell a new outage from a continuing
  // one, and will either over-react to the second page or ignore the first.
  const cadence = ctx.reason === 'recovered'
    ? ''
    : '\n\nYou will get one more of these an hour from now if it is still broken, and one when it recovers. Not one per run.'

  const link = ctx.runUrl ? `\n\n[The run that decided this](${ctx.runUrl})` : ''
  return `${head}\n\n${next}${cadence}${link}`
}

/**
 * The digest, as text for the run summary and the `ops_events` row.
 *
 * ⚠️ THIS FUNCTION CANNOT NOTIFY ANYBODY AND THAT IS THE DESIGN. Everything it
 * describes is a finding the owner classified as digest — length outside the
 * band, a claim restriction, the wrong voice, a download failure, the paid
 * fallthrough. Routing any of them to the pager is how a pager gets muted, and
 * a muted pager is the same silence with the belief that somebody is watching.
 */
export function digestMarkdown(findings: readonly DigestFinding[]): string {
  if (findings.length === 0) return '_No digest findings._'
  return findings.map((f) => `- \`${f.kind}\` — ${f.detail}`).join('\n')
}

/** What the transport should do, given the reason and whether a page is
 *  already open. */
export type PageAction = 'opened' | 'commented' | 'closed' | 'skipped_no_open_page'

/**
 * The transport's whole decision, as a pure function.
 *
 * ⚠️ EXTRACTED SO IT CAN BE TESTED WITHOUT A MOCK GITHUB. The alternative — a
 * fake transport asserting on calls — proves the shape of a thing I wrote and
 * nothing about whether the rule is right. This way the RULE is unit-tested and
 * the ARRIVAL is tested by `--page-test` against the real API. Neither
 * substitutes for the other.
 *
 * ⚖️ A RECOVERY WITH NO OPEN PAGE IS NOT A NEW ISSUE. It means the pager and
 * the world disagree — somebody closed the outage by hand, or state was lost.
 * Filing a cheerful "we're back" issue nobody asked for would be noise on top
 * of a state bug; skipping it and saying so leaves the disagreement visible.
 */
export function pageAction(reason: PageReason, hasOpenPage: boolean): PageAction {
  if (reason === 'recovered') return hasOpenPage ? 'closed' : 'skipped_no_open_page'
  return hasOpenPage ? 'commented' : 'opened'
}

// ── THE MONITOR'S OWN DEATH, WHICH IS A DIFFERENT FACT ────────────────────
//
// ⚠️⚠️ MEASURED, NOT IMAGINED. On 2026-09-21 this workflow had failed 75 runs
// out of 75 since it landed — every scheduled run, for as long as the API
// retains them — on `heartbeat could not sign in: Invalid login credentials`.
// Production agreed and was blunter: `count(*) filter (where is_heartbeat)` was
// ZERO across 154 generations. The monitor had never once reached the product.
//
// ⚖️ AND NOTHING SAID SO, BY CONSTRUCTION. `heartbeatToken()` throws during
// module setup — before the page state is loaded, before `deliverPage` exists
// to be called — so a monitor that cannot log in cannot page. The only evidence
// was a red run in a tab nobody opens. That is precisely the silence-that-looks-
// like-health this whole workflow was built to end, reproduced one layer up.
//
// ⚠️ SO IT IS A SEPARATE ISSUE, WITH A SEPARATE LABEL, AND NOT A COMMENT ON THE
// PRODUCT PAGE. `heartbeatToken()`'s own comment has the rule right and should
// not be softened: paging "Twin is broken" when the truth is "the monitor's
// password expired" is how a pager loses its credibility. The fix is not to
// route this to that issue — it is to say the true thing in a place of its own:
// Twin's health this hour is UNKNOWN, and nobody is watching until a human acts.
//
// ⚖️ ITS DEDUPLICATION IS GITHUB'S, NOT SUPABASE'S, AND THAT IS THE POINT. The
// product pager remembers "already paged" in `heartbeat_page_state` — a table
// reached with the same configuration that just failed. Asking a dead monitor
// to consult its memory before reporting that it is dead is circular. An open
// issue with this label IS the memory, and it needs nothing to be working.
//
// ⚠️ AND IT NEVER COMMENTS. The product pager reminds hourly because an outage
// is news that decays. A broken monitor is not news — it is a standing task,
// and the open issue already carries it. Hourly reminders on a configuration
// error that will not fix itself are 24 notifications a day for one fact.

/** ⚠️ DELIBERATELY NOT `PAGE_LABEL`. Sharing the key would make the product's
 *  recovery close the monitor's issue, and a broken monitor cannot recover by
 *  Twin getting better — it is not measuring Twin at all. */
export const MONITOR_LABEL = 'heartbeat-monitor-down'

/** Constant for the same reason `PAGE_TITLE` is: the label finds the issue, and
 *  a title carrying a timestamp would open a fresh one every hour. */
export const MONITOR_TITLE = 'heartbeat: the monitor itself could not run'

export interface MonitorContext {
  /** What stopped it — the thrown message, verbatim. */
  detail: string
  /** Epoch ms, passed in so the body stays pure. */
  at: number
  runUrl?: string | null
}

/**
 * What a reader needs at 3am when the MONITOR is the broken thing.
 *
 * ⚠️ THE FIRST LINE REFUSES TO IMPLY ANYTHING ABOUT TWIN. A body that opened
 * with "the heartbeat failed" would be read as an outage, and the reader would
 * go looking at `generate-blueprint`, which may be perfectly healthy. The
 * honest report is that this hour was NOT MEASURED.
 */
export function monitorBody(ctx: MonitorContext): string {
  const when = new Date(ctx.at).toISOString()
  const link = ctx.runUrl ? `\n\n[The run that could not start](${ctx.runUrl})` : ''
  return [
    `**The heartbeat could not run, so Twin's health is unknown.** This is not a report `
      + `that Twin is broken — nothing was measured at ${when}.`,
    '',
    `It stopped here: \`${ctx.detail}\``,
    '',
    'What this means: until this is fixed, **nobody is watching**. A real outage would '
      + 'look exactly like this hour does — no page, no digest, no generation.',
    '',
    'It is configuration, not code: the scheduled run needs `SUPABASE_URL`, '
      + '`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `HEARTBEAT_REFERENCE_URL`, and a '
      + 'real Supabase auth account in `HEARTBEAT_USER_EMAIL` / `HEARTBEAT_USER_PASSWORD` '
      + 'whose id is set as `HEARTBEAT_USER_ID` on the edge function, so its generations are '
      + 'flagged `is_heartbeat` and stay out of the corpus.',
    '',
    '`heartbeat.mjs --page-test` proves the pager without spending a generation.',
    '',
    '_This issue is not reminded hourly. It stays open until a human closes the gap; '
      + 'the next successful run closes it._',
  ].join('\n') + link
}

export type MonitorAction = 'opened' | 'skipped_already_open' | 'closed' | 'skipped_no_open_page'

/**
 * The monitor channel's whole decision, as a pure function — same split as
 * `pageAction`, same reason: the rule gets unit-tested, the arrival does not
 * get faked.
 *
 * ⚖️ `skipped_already_open` IS THE HALF THAT KEEPS IT QUIET. Without it an
 * hourly schedule against a misconfigured secret is 24 notifications a day
 * saying the same unchanged thing.
 */
export function monitorAction(state: 'down' | 'up', hasOpenMonitorPage: boolean): MonitorAction {
  if (state === 'up') return hasOpenMonitorPage ? 'closed' : 'skipped_no_open_page'
  return hasOpenMonitorPage ? 'skipped_already_open' : 'opened'
}
