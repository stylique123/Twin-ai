// CUSTOMER REVIEWS FROM THE PAGE'S OWN PRODUCT DATA (24-ideas #14).
//
// ⚖️ THE SHOP STATES THEM, SO THEY ARE READ AS DATA. The same schema.org
// Product block that carries prices (ldProductPrices.ts) usually carries an
// `aggregateRating` and a few `review` bodies. Read deterministically — no model
// summarises or "improves" a customer's sentence.
//
// ⚠️ THEY ARE NEVER HER WORDS. What is stored here is labelled as customers',
// and the writer is told to attribute any quote to "a customer" and never to
// turn it into her own experience or an outcome she promises.
//
// ⚖️ ONE PRODUCT OR NOTHING, as with prices: a page with several products
// returns null, because those reviews belong to other products.

type Node = Record<string, unknown>

export interface CustomerReviews { rating: number | null; count: number | null; quotes: string[] }

const isType = (n: Node, t: string) => {
  const ty = n['@type']
  return ty === t || (Array.isArray(ty) && ty.includes(t))
}
function nodesOf(v: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(v)) { for (const x of v) nodesOf(x, out); return out }
  if (v && typeof v === 'object') {
    const n = v as Node
    if (Array.isArray(n['@graph'])) nodesOf(n['@graph'], out)
    else out.push(n)
  }
  return out
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function ldReviews(html: string): CustomerReviews | null {
  const nodes: Node[] = []
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { nodesOf(JSON.parse(m[1].trim()), nodes) } catch { /* malformed block: skip it */ }
  }
  const products = nodes.filter((n) => isType(n, 'Product') || isType(n, 'ProductGroup'))
  if (products.length !== 1) return null
  const p = products[0]
  const agg = (p.aggregateRating && typeof p.aggregateRating === 'object' ? p.aggregateRating : {}) as Node
  const best = num(agg.bestRating) ?? 5
  const raw = num(agg.ratingValue)
  const rating = raw !== null && best > 0 && raw >= 0 && raw <= best ? Math.round((raw / best) * 5 * 10) / 10 : null
  const count = num(agg.reviewCount) ?? num(agg.ratingCount)
  const quotes = [...new Set(nodesOf(p.review)
    .map((r) => String(r.reviewBody ?? r.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 20 && t.length <= 240))].slice(0, 3)
  if (rating === null && quotes.length === 0) return null
  return { rating, count: count !== null && count >= 1 ? Math.round(count) : null, quotes }
}
