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
  /** Each option's values, e.g. { Size: ["Small", "Large"] }. */
  optionValues?: Record<string, string[]>
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
// "bandanas" and "bandana" are one word for matching purposes.
const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)

/** How well a shop title matches the name she gave, 0..1. Word overlap, so
 *  "Reversible Scrunchie Bandana" finds "Reversible Scrunchie Bandana - Plaid". */
export function nameMatch(wanted: string, title: string): number {
  const w = new Set(norm(wanted).split(' ').filter((x) => x.length > 1).map(stem))
  const t = new Set(norm(title).split(' ').filter((x) => x.length > 1).map(stem))
  if (w.size === 0) return 0
  let hit = 0
  for (const x of w) if (t.has(x)) hit++
  return hit / w.size
}

/** EVERY WORD OF HER NAME MUST BE IN THE SHOP'S TITLE.
 *  ⚠️ IT WAS 0.6, AND THAT PICKED THE WRONG PRODUCT IN PRODUCTION (2026-09-23):
 *  "Reversible Scrunchie Bandana" matched "Scrunchie Bandana Mystery Packs" on
 *  two words of three, and the card filled with another product's facts. The
 *  word she typed that the title lacks ("Reversible") is exactly the word that
 *  tells two products apart. Extra words in the title are fine. */
export const MIN_NAME_MATCH = 1

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
    optionValues: Array.isArray(p.options)
      ? Object.fromEntries(p.options
        .map((o) => [String((o as { name?: unknown }).name ?? ''),
          Array.isArray((o as { values?: unknown }).values) ? ((o as { values: unknown[] }).values).map(String) : []] as const)
        .filter(([n, v]) => n !== '' && n !== 'Title' && v.length > 0))
      : {},
  }
}

/** "Size: Mini, Small, Large" lines — the options, said once, not per price. */
export function optionLines(p: ShopProduct): string[] {
  return Object.entries(p.optionValues ?? {}).map(([n, v]) => `${n}: ${v.join(', ')}`)
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
  /** Told the closest titles the shop has when nothing matched — logged, so a
   *  miss can be diagnosed from production without reaching the shop. */
  onMiss?: (closest: string[]) => void,
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
  let best = found
    .map((r) => ({ r, score: nameMatch(productName, String(r.title ?? '')) }))
    .sort((a, b) => b.score - a.score)[0]

  // ⚠️ THE QUICK SEARCH RETURNS ITS TOP FIVE BY ITS OWN RANKING, not ours.
  // Measured 2026-09-23: "Reversible Scrunchie Bandana" returned no full match
  // from suggest.json. The shop's full catalogue (/products.json, up to 250)
  // is the same public data, so check it before giving up.
  if (!best || best.score < MIN_NAME_MATCH) {
    const all = await fetchJson(`${origin}/products.json?limit=250`)
    const list = (all as { products?: Array<{ title?: string; handle?: string }> } | null)?.products ?? []
    const hit = list
      .map((p) => ({ r: { title: p.title, url: p.handle ? `/products/${p.handle}` : undefined }, score: nameMatch(productName, String(p.title ?? '')) }))
      .sort((a, b) => b.score - a.score)[0]
    if (hit && hit.score >= MIN_NAME_MATCH) best = hit
    else {
      onMiss?.([...found.map((r) => String(r.title ?? '')), ...list.map((p) => String(p.title ?? ''))]
        .filter(Boolean).sort((x, y) => nameMatch(productName, y) - nameMatch(productName, x)).slice(0, 5))
      return null
    }
  }
  if (typeof best.r.url !== 'string') return null

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
  // ⚠️ ONE LINE PER PRICE, NOT PER VARIANT. 6 sizes × 3 styles at one price
  // was eighteen identical "That's right" rows (reported 2026-09-23). Group
  // by price; name what each price covers by its first option.
  const byPrice = new Map<string, Set<string>>()
  for (const v of priced) {
    const first = v.title.split(' / ')[0].trim()
    if (!byPrice.has(v.price)) byPrice.set(v.price, new Set())
    byPrice.get(v.price)!.add(first)
  }
  if (byPrice.size === 1) return [`${priced[0].price} (every option)`]
  return [...byPrice].slice(0, 8).map(([price, firsts]) => `${[...firsts].join(', ')} — ${price}`)
}
