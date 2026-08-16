// EVERY ROUTE INSIDE THE SHELL MUST SHARE THE SHELL'S ANIMATION KEY.
//
// ⚠️ THE DEFECT, AS A CREATOR EXPERIENCED IT. "The Products tab is completely
// blank, black screen and glitches." Nothing was wrong with the page: the route
// was registered, the 777-line component rendered loading, empty and error
// states, every column it selects exists in production, and the deployed bundle
// was current. It never got to mount.
//
// `inApp` in App.tsx is a hand-maintained list of the routes that live inside
// the sidebar shell. Routes in the list share one AnimatePresence key ('app');
// routes outside it key on the pathname. Under `mode="wait"` a key change makes
// the outgoing page finish an exit animation BEFORE the incoming page may
// mount — and a nav click during that exit strands the screen on the
// background. `/products` and `/edit/:projectId/review` both render inside
// <Protected><AppShell><Page> and neither was in the list.
//
// ⚖️ THE COMMENT ABOVE `inApp` ALREADY DESCRIBED THIS BUG. It was written when
// /v2 had it — "can interrupt the exit animation and strand the screen black
// until a refresh" — and the fix at the time was to add /v2 to the list. That
// fixed one route and left the mirror hand-maintained, so it drifted twice
// more. A prose warning is not a guard.
//
// This derives the expectation from the ROUTES THEMSELVES rather than restating
// the list, so a route added tomorrow is covered without anyone remembering
// this file exists.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'),
  'utf8',
)

/** Routes wrapped in AppShell — the ones that must share the 'app' key. */
function shellRoutes(): string[] {
  const out: string[] = []
  // Each <Route …/> element, however it is line-wrapped.
  for (const m of APP.matchAll(/<Route\b[\s\S]*?\/>/g)) {
    const el = m[0]
    if (!el.includes('<AppShell>')) continue
    const path = el.match(/path="([^"]+)"/)?.[1]
    if (path) out.push(path)
  }
  return out
}

/** The prefixes `inApp` tests, read out of the function body. */
function inAppPrefixes(): string[] {
  const body = APP.slice(APP.indexOf('const inApp ='), APP.indexOf('return (', APP.indexOf('const inApp =')))
  return [...body.matchAll(/startsWith\('([^']+)'\)/g)].map((m) => m[1])
}

describe('the AnimatePresence key covers every in-shell route', () => {
  it('finds the shell routes and the prefix list at all', () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuously true — the failure mode this whole file exists to prevent.
    expect(shellRoutes().length).toBeGreaterThan(5)
    expect(inAppPrefixes().length).toBeGreaterThan(5)
  })

  it('leaves no AppShell route outside inApp', () => {
    const prefixes = inAppPrefixes()
    const stranded = shellRoutes().filter((p) => !prefixes.some((pre) => p.startsWith(pre)))
    // Named in the message so the next failure says WHICH route, not just that
    // a count moved.
    expect(stranded, `AppShell routes missing from inApp: ${stranded.join(', ')}`).toEqual([])
  })

  it('still covers the two that were actually reported broken', () => {
    // Regression pins. The generic assertion above would catch these, but if
    // someone rewrites the extraction these keep the known cases honest.
    const prefixes = inAppPrefixes()
    expect(prefixes.some((p) => '/products'.startsWith(p))).toBe(true)
    expect(prefixes.some((p) => '/edit/x/review'.startsWith(p))).toBe(true)
  })

  it('does not sweep the public routes into the app key', () => {
    // ⚖️ THE OPPOSITE ERROR IS ALSO REAL. Landing, auth and the login-free
    // client links are deliberately keyed per-path; adding them here would give
    // marketing pages the app's transition and break the /r/:token report.
    const prefixes = inAppPrefixes()
    for (const pub of ['/auth', '/onboarding', '/r/', '/review/', '/join/']) {
      expect(prefixes.some((p) => pub.startsWith(p)), `${pub} must stay outside inApp`).toBe(false)
    }
  })
})
