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
