// FIND THE PRODUCT INSIDE ITS BRAND'S SHOP — AND READ ITS REAL PRICES.
//
// ⚠️ REPORTED 2026-09-22, from the screen: "why can't you actually search for
// this product inside that brand or through that link?" Measured on the row:
// "Reversible Scrunchie Bandana" was linked to the shop's HOMEPAGE, so every
// read returned the brand's story, the site's cart buttons and three OTHER
// products' prices — and nothing about the bandana (see factPlacement.ts).
//
// ⚖️ THE SHOP ALREADY ANSWERS THIS, WITHOUT A MODEL. Shopify storefronts (the
// platform behind the reported shop and most small product brands) publish two
// public, documented endpoints:
//   /search/suggest.json?q=…&resources[type]=product  → the product's own URL
//   /products/<handle>.json                           → title, description,
//                                                       every variant and price
// So a homepage link plus the product's NAME is enough to find its own page,
// and its variants arrive as data — "€28 and €13" become "Small — 28.51" and
// "Large — 13.94", attributed to the product they belong to.
//
// ⚖️ NOT A WEB SEARCH, AND IT SAYS SO. This searches the product's OWN shop,
// never the open internet. A shop on another platform, or no shop at all,
// returns null and the old path runs exactly as before.
//
// Pure except for the injected `fetchJson`, so it is testable with the
// platform's documented shapes. The worker never imports @twinai/shared; the
// homepage test mirrors `pageKindOf` there.

export interface ShopVariant { title: string; price: string }
export interface ShopProduct {
  url: string
  title: string
  description: string | null
  variants: ShopVariant[]
  /** The option names, e.g. ["Size", "Colour"], when the product has any. */
  options: string[]
}

type FetchJson = (url: string) => Promise<unknown | null>

/** Is this link the shop's front page rather than a product's own page? */
export function isShopFront(url: string | null | undefined): boolean {
  const raw = String(url ?? '').trim()
  if (raw === '') return false
  try {
    const p = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).pathname.replace(/\/+$/, '').toLowerCase()
    return p === '' || /^\/(index\.html?|home|shop|store)$/.test(p) || /^\/collections?(\/|$)/.test(p)
  } catch { return false }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** How well a shop title matches the name she gave, 0..1. Word overlap, so
 *  "Reversible Scrunchie Bandana" finds "Reversible Scrunchie Bandana - Plaid". */
export function nameMatch(wanted: string, title: string): number {
  const w = new Set(norm(wanted).split(' ').filter((x) => x.length > 1))
  const t = new Set(norm(title).split(' ').filter((x) => x.length > 1))
  if (w.size === 0) return 0
  let hit = 0
  for (const x of w) if (t.has(x)) hit++
  return hit / w.size
}

/** Below this overlap the best hit is not treated as her product. A wrong
 *  product read confidently is worse than no product read at all. */
export const MIN_NAME_MATCH = 0.6

const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/** Read one product from its `.json` endpoint. */
export function readShopProduct(url: string, raw: unknown): ShopProduct | null {
  const p = (raw as { product?: Record<string, unknown> } | null)?.product
  if (!p || typeof p.title !== 'string') return null
  const variants = Array.isArray(p.variants) ? p.variants : []
  const options = Array.isArray(p.options)
    ? p.options.map((o) => String((o as { name?: unknown }).name ?? '')).filter((n) => n !== '' && n !== 'Title')
    : []
  return {
    url,
    title: p.title.trim(),
    description: typeof p.body_html === 'string' && stripHtml(p.body_html) !== '' ? stripHtml(p.body_html).slice(0, 600) : null,
    variants: variants.map((v) => ({
      title: String((v as { title?: unknown }).title ?? '').trim(),
      price: String((v as { price?: unknown }).price ?? '').trim(),
    })).filter((v) => v.price !== ''),
    options,
  }
}

/**
 * Find her product on her own shop by name, and read it.
 * Returns null — and the caller falls back to the old path — whenever the
 * shop does not answer, is not a Shopify shop, or nothing matches well enough.
 */
export async function findShopProduct(
  shopUrl: string,
  productName: string,
  fetchJson: FetchJson,
): Promise<ShopProduct | null> {
  let origin: string
  try {
    origin = new URL(/^https?:\/\//i.test(shopUrl) ? shopUrl : `https://${shopUrl}`).origin
  } catch { return null }
  if (!origin.startsWith('https://') || productName.trim() === '') return null

  const q = encodeURIComponent(productName.trim())
  const suggest = await fetchJson(`${origin}/search/suggest.json?q=${q}&resources[type]=product&resources[limit]=5`)
  const found = (suggest as { resources?: { results?: { products?: Array<{ title?: string; url?: string }> } } } | null)
    ?.resources?.results?.products ?? []
  const best = found
    .map((r) => ({ r, score: nameMatch(productName, String(r.title ?? '')) }))
    .sort((a, b) => b.score - a.score)[0]
  if (!best || best.score < MIN_NAME_MATCH || typeof best.r.url !== 'string') return null

  const path = best.r.url.split('?')[0]
  if (!/^\/products\/[^/]+$/.test(path)) return null
  const productUrl = `${origin}${path}`
  return readShopProduct(productUrl, await fetchJson(`${productUrl}.json`))
}

/** Variant lines for the product's facts: "Small / Plaid — 28.51". */
export function variantPriceLines(p: ShopProduct): string[] {
  const priced = p.variants.filter((v) => v.price !== '')
  if (priced.length === 0) return []
  if (priced.length === 1 || priced.every((v) => v.title === 'Default Title')) return [priced[0].price]
  return priced.slice(0, 12).map((v) => `${v.title} — ${v.price}`)
}
