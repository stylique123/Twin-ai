// A DIGITAL PRODUCT'S OTHER PAGES — pricing, features, how it works.
//
// ⚠️ AUDIT 2026-09-26: only the one pasted page was ever read, so for an app or
// a course the plans, the feature list and the demo — the things a creator is
// told to point a camera at — were invisible unless they happened to sit on
// that page. This finds at most two same-site pages the product page itself
// LINKS to by those names. Never guessed URLs, never another site.
//
// Pure: finding the links. The job does the fetching.
const WANTED = /\/(?:pricing|prices|plans?|features?|how-it-works|product|demo|tour)(?:[/?#]|$)/i

export function subpageLinks(html: string, pageUrl: string, max = 2): string[] {
  let base: URL
  try { base = new URL(pageUrl) } catch { return [] }
  const seen = new Set<string>([base.origin + base.pathname.replace(/\/$/, '')])
  const out: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#][^"']*)["']/gi)) {
    let u: URL
    try { u = new URL(m[1].replace(/&amp;/g, '&'), base) } catch { continue }
    const strip = (h: string) => h.toLowerCase().replace(/^www\./, '')
    if (u.protocol !== 'https:' || strip(u.host) !== strip(base.host)) continue
    if (!WANTED.test(u.pathname)) continue
    const key = u.origin + u.pathname.replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= max) break
  }
  return out
}

/** Only for things that live on a screen or are sold as a plan. */
export function wantsSubpages(type: string | null | undefined): boolean {
  return ['DIGITAL_PRODUCT', 'SAAS', 'SERVICE'].includes(String(type ?? '').toUpperCase())
}
