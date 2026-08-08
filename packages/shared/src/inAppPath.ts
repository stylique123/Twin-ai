// A STRING FROM THE DATABASE IS NOT A ROUTE.
//
// `NotificationBell` calls `navigate(n.link)` with a value read straight out of
// `notifications.link`. Today that column is server-written — 0047 gives the
// client no INSERT and 0052 narrows its UPDATE to the `read` flag alone — so
// nothing a user controls reaches it, and the open-redirect advisory against
// react-router (GHSA-wrjc-x8rr-h8h6, "backslash in <Link> and useNavigate")
// has no way in.
//
// That is a fact about the CURRENT writers, not about the call. Notifications
// are created by edge functions, one of which will eventually build a link from
// something a person typed — a brand handle, a review note, a campaign name.
// Nobody writing that function will connect it to a router advisory from 2026,
// and the failure it produces is a creator clicking their own notification and
// landing on someone else's site while the URL bar still says it came from us.
//
// So the rule is enforced where the value is USED rather than trusted where it
// is written. A guard at the boundary survives every future writer; a
// convention about writers survives until the next one.
//
// ── WHY NOT JUST UPGRADE REACT-ROUTER ─────────────────────────────────────
//
// There is no fixed 6.x. The advisory range is `6.0.0 - 7.17.0`, so the fix is
// a MAJOR upgrade of the router on every routed screen in the product — which
// is a real change with real regression surface, and not one to make in the
// same breath as a security note that describes an exposure this app does not
// currently have.
//
// This guard removes the exposure at the one dynamic call site regardless of
// the router's version, which makes the upgrade a scheduling decision instead
// of an incident.
//
// The second advisory in the same range (GHSA-337j-9hxr-rhxg, constructor
// injection via `deserializeErrors()` in SSR hydration) does not apply at all:
// the web app mounts with `ReactDOM.createRoot`, there is no hydration, no
// `StaticRouter`, and no `@react-router/node`.

/**
 * The path to navigate to, or null if the value is not an in-app path.
 *
 * NULL IS THE ANSWER, not an exception and not a sanitised guess. A caller that
 * gets null renders the notification without making it clickable, which is the
 * honest outcome: we do not know where this was meant to go, and inventing a
 * destination is how a guard becomes the bug.
 */
export function inAppPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null

  // MUST START WITH EXACTLY ONE FORWARD SLASH.
  //
  // `//evil.com` is protocol-relative and leaves the site. `/\evil.com` is the
  // backslash form the advisory is about — some parsers normalise `\` to `/`,
  // so it becomes protocol-relative after the router has already decided it
  // looked internal. Both are rejected by requiring the second character to be
  // neither a slash nor a backslash.
  if (value[0] !== '/') return null
  if (value[1] === '/' || value[1] === '\\') return null

  // NO BACKSLASH ANYWHERE. A legitimate in-app path in this product never
  // contains one, and allowing it would mean reasoning about which parser
  // normalises it and when — a question with a different answer per browser.
  if (value.includes('\\')) return null

  // A scheme cannot appear in something that starts with `/`, but a CONTROL
  // CHARACTER can, and a newline or a NUL inside a destination is a classic
  // filter bypass — the guard sees one string and the consumer parses another.
  //
  // Written as an explicit escape range rather than as literal characters
  // between the brackets. The first version of this line pasted the raw bytes
  // in, which made the source file BINARY to grep and invisible in review — the
  // exact property being defended against, reproduced in the defence.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null

  return value
}

/** Whether a stored link can be offered as a destination at all. */
export function isInAppPath(raw: string | null | undefined): boolean {
  return inAppPath(raw) !== null
}
