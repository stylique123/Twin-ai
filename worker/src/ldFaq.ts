// v3.1 1.2 — QUESTIONS PEOPLE ASK, FROM THE PAGE'S OWN STRUCTURED DATA.
//
// Many product pages publish a schema.org FAQPage block for search engines.
// The visible accordion is often collapsed or rendered by script, so the
// stripped page text misses it. Same rule as ldPriceLines: data the site
// states about itself, read as data; nothing invented.

type Node = Record<string, unknown>

function nodesOf(v: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(v)) { for (const x of v) nodesOf(x, out); return out }
  if (v && typeof v === 'object') {
    const n = v as Node
    if (Array.isArray(n['@graph'])) nodesOf(n['@graph'], out)
    else out.push(n)
    if (n.mainEntity) nodesOf(n.mainEntity, out)
  }
  return out
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')

export function ldFaqLines(html: string, max = 8): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown
    try { data = JSON.parse(m[1]) } catch { continue }
    for (const n of nodesOf(data)) {
      const ty = n['@type']
      if (!(ty === 'Question' || (Array.isArray(ty) && ty.includes('Question')))) continue
      const q = text(n.name)
      const a = text((n.acceptedAnswer as Node | undefined)?.text)
      if (q && a) out.push(`Q: ${q.slice(0, 200)} A: ${a.slice(0, 400)}`)
      if (out.length >= max) return out
    }
  }
  return out
}
