// A DIGITAL PRODUCT'S OTHER PAGES — pricing, features, how it works.
//
// ⚠️ AUDIT 2026-09-26: only the one pasted page was ever read, so for an app or
// a course the plans, the feature list and the demo — the things a creator is
// told to point a camera at — were invisible unless they happened to sit on
// that page. This finds at most two same-site pages the product page itself
// LINKS to by those names. Never guessed URLs, never another site.
//
// Pure: finding the links. The job does the fetching.
// OWNER BLUEPRINT 2026-10-03 (Part 2): an app's dashboard and screenshots, a
// course's curriculum, a community's join/members page are the screens a
// creator points the camera at — read them too when the page links to them.
const WANTED = /\/(?:pricing|prices|plans?|features?|how-it-works|product|demo|tour|app|dashboard|screenshots?|gallery|curriculum|courses?|lessons?|modules?|syllabus|members?|community|join|membership)(?:[/?#]|$)/i

export function subpageLinks(html: string, pageUrl: string, max = 3): string[] {
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
  return ['DIGITAL_PRODUCT', 'SAAS', 'APP', 'COURSE', 'COMMUNITY', 'SERVICE'].includes(String(type ?? '').toUpperCase())
}

// v3.1 1.2 — UP TO FIVE PAGES, ONE PER ROLE. The first-three-matches rule
// above could spend all three reads on /plans, /pricing and /prices. Each
// role answers a different slot (offer, how it works, what she can show,
// what's inside, what people ask), so take the first link for each role.
const ROLES: Array<[string, RegExp]> = [
  ['offer', /\/(?:pricing|prices|plans?|membership|join)(?:[/?#]|$)/i],
  ['how', /\/(?:features?|how-it-works|product|tour)(?:[/?#]|$)/i],
  ['screens', /\/(?:demo|app|dashboard|screenshots?|gallery)(?:[/?#]|$)/i],
  ['inside', /\/(?:curriculum|courses?|lessons?|modules?|syllabus|members?|community)(?:[/?#]|$)/i],
  ['questions', /\/(?:faqs?|reviews?|testimonials?|customers?|case-studies)(?:[/?#]|$)/i],
]

export function subpagesByRole(html: string, pageUrl: string, max = 5): Array<{ role: string; url: string }> {
  let base: URL
  try { base = new URL(pageUrl) } catch { return [] }
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, '')
  const self = base.origin + base.pathname.replace(/\/$/, '')
  const got = new Map<string, string>()
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#][^"']*)["']/gi)) {
    let u: URL
    try { u = new URL(m[1].replace(/&amp;/g, '&'), base) } catch { continue }
    if (u.protocol !== 'https:' || strip(u.host) !== strip(base.host)) continue
    const key = u.origin + u.pathname.replace(/\/$/, '')
    if (key === self || [...got.values()].includes(key)) continue
    const role = ROLES.find(([r, re]) => !got.has(r) && re.test(u.pathname))?.[0]
    if (role) got.set(role, key)
  }
  return ROLES.filter(([r]) => got.has(r)).map(([r]) => ({ role: r, url: got.get(r)! })).slice(0, max)
}
