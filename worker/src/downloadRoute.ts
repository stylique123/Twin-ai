// THE LADDER, AS A VALUE RATHER THAN A PILE OF CONDITIONALS.
//
// ⚠️ THE ALTERNATIVE IS WHAT USUALLY HAPPENS: `if (isTikTok && err.includes(
// 'Unexpected response'))` sprinkled through the download path, growing a branch
// per incident until nobody can say what the network policy IS. Routing is one
// decision, made once, expressed as a value the caller passes in.
//
// ⚖️ AND THE ROUTE IS AN INPUT, NOT A GUESS. `downloadArgsFor` does not decide
// whether to pay — it renders whatever route it is handed. Deciding is a
// separate job (`downloadFailure.mayRetryViaProxy`), so the cheap thing and the
// expensive thing cannot be confused by a future edit.
//
// ⚠️ TIKTOK ONLY. YouTube and Instagram have their own routes for their own
// reasons. One datacenter IP being bullied is not an argument for one grand
// "everything via Apify" abstraction.
import { createHash } from 'node:crypto'

export type DownloadRoute =
  | { kind: 'local_impersonated' }
  | { kind: 'residential_proxy'; sessionId: string }
  | { kind: 'apify_actor' }

/** Mirrors the DB check constraint on `reference_content_profiles.download_route`. */
export function routeName(r: DownloadRoute): string {
  return r.kind
}

/**
 * ⚠️ ONE STICKY SESSION PER ATTEMPT, AND THAT IS A CORRECTNESS REQUIREMENT.
 * Apify keeps a session on the same residential IP; requests WITHOUT one rotate
 * freely. TikTok's challenge spans several requests, so an extraction that
 * starts on IP A and finishes on IP B looks precisely like the distributed
 * evasion anti-bot systems are built to catch — a new failure mode invented by
 * being clever.
 *
 * ⚖️ DERIVED, BOUNDED, URL-SAFE, NON-SECRET. A hash of the seed rather than the
 * seed itself, so a session id can be logged beside a result without leaking a
 * URL or anything else; 12 hex characters is far inside Apify's length limit and
 * far outside collision range for one night's canaries.
 */
export function stickySessionId(seed: string): string {
  const h = createHash('sha256').update(String(seed)).digest('hex').slice(0, 12)
  return `twin_${h}`
}

/**
 * ⚠️ THE PASSWORD IS READ HERE AND NEVER RETURNED. The caller gets argv, not a
 * URL — so there is no credential-bearing string sitting in a variable that
 * somebody later logs "just to debug it". `redactProxy` exists for the same
 * reason: the only proxy string that ever reaches a log is the redacted one.
 */
export function downloadArgsFor(route: DownloadRoute, proxyPassword: string): string[] {
  if (route.kind !== 'residential_proxy') return []
  const pw = String(proxyPassword ?? '').trim()
  // ⚖️ NO PASSWORD, NO PROXY, AND NO SILENT DOWNGRADE. Returning [] here would
  // quietly run the LOCAL route while the row records `residential_proxy`, which
  // is worse than failing: it would poison the one measurement this exists for.
  if (pw === '') throw new Error('residential_proxy requested but APIFY_PROXY_PASSWORD is not set')
  // ⚠️ NO COUNTRY TARGETING. The experiment changes exactly one variable — IP
  // reputation. Adding geography narrows the pool and confounds the result.
  const user = `groups-RESIDENTIAL,session-${route.sessionId}`
  return ['--proxy', `http://${user}:${pw}@proxy.apify.com:8000`]
}

/** ⚠️ THE ONLY FORM OF A PROXY STRING THAT MAY BE LOGGED OR STORED. */
export function redactProxy(s: string): string {
  return String(s ?? '').replace(/\/\/[^@\s]+@/g, '//***:***@')
}

export function parseRoute(raw: unknown): DownloadRoute {
  if (raw && typeof raw === 'object' && 'kind' in raw) {
    const k = (raw as { kind?: unknown }).kind
    if (k === 'residential_proxy') {
      const sid = (raw as { sessionId?: unknown }).sessionId
      if (typeof sid === 'string' && /^twin_[0-9a-f]{6,32}$/.test(sid)) {
        return { kind: 'residential_proxy', sessionId: sid }
      }
      throw new Error('residential_proxy route requires a valid sessionId')
    }
    if (k === 'apify_actor') return { kind: 'apify_actor' }
  }
  // ⚖️ THE FREE RUNG IS THE DEFAULT. An unreadable route must never fall through
  // to the one that costs money.
  return { kind: 'local_impersonated' }
}
