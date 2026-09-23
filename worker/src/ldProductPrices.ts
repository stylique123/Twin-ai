// PRICES AND OPTIONS FROM THE PAGE'S OWN PRODUCT DATA — ANY SHOP PLATFORM.
//
// ⚠️ ONLY SHOPIFY GOT REAL PRICES. shopProductLookup.ts reads Shopify's product
// JSON; every other shop (WooCommerce, Squarespace, Wix, BigCommerce, …) had
// its prices guessed by the model from page text, which is how one product
// ends up carrying another's price.
//
// ⚖️ THOSE SHOPS PUBLISH IT ANYWAY. Almost every storefront emits a schema.org
// Product block (application/ld+json) for search engines, with each offer's
// price, currency and — on a ProductGroup — each variant's name. That is data
// the shop states about itself, so it is read as data.
//
// ⚖️ ONE PRODUCT OR NOTHING. A page describing several products (a homepage,
// a collection) returns [] — those prices belong to other products, which is
// exactly the mistake this exists to prevent.

type Node = Record<string, unknown>

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

function priceOf(offer: Node): string | null {
  const cur = typeof offer.priceCurrency === 'string' ? ` ${offer.priceCurrency}` : ''
  if (isType(offer, 'AggregateOffer') && offer.lowPrice != null) {
    const low = String(offer.lowPrice), high = offer.highPrice != null ? String(offer.highPrice) : low
    return low === high ? `${low}${cur}` : `From ${low} to ${high}${cur}`
  }
  const spec = offer.priceSpecification as Node | undefined
  const p = offer.price ?? spec?.price
  return p != null && String(p).trim() !== '' ? `${String(p).trim()}${cur}` : null
}

function offersOf(product: Node): Node[] {
  return nodesOf(product.offers).filter((o) => typeof o === 'object')
}

export function ldPriceLines(html: string): string[] {
  const nodes: Node[] = []
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { nodesOf(JSON.parse(m[1].trim()), nodes) } catch { /* malformed block: skip it */ }
  }
  const products = nodes.filter((n) => isType(n, 'Product') || isType(n, 'ProductGroup'))
  if (products.length !== 1) return []
  const p = products[0]
  const parent = typeof p.name === 'string' ? p.name.trim() : ''
  const lines: string[] = []
  const variants = nodesOf(p.hasVariant)
  if (variants.length > 0) {
    for (const v of variants) {
      const name = typeof v.name === 'string' ? v.name.trim() : ''
      const label = parent && name.startsWith(parent) ? name.slice(parent.length).replace(/^[\s\-–—:|]+/, '') : name
      for (const o of offersOf(v)) {
        const price = priceOf(o)
        if (price) lines.push(label ? `${label} — ${price}` : price)
      }
    }
  } else {
    const offers = offersOf(p)
    for (const o of offers) {
      const price = priceOf(o)
      const name = typeof o.name === 'string' ? o.name.trim() : ''
      if (price) lines.push(name && offers.length > 1 ? `${name} — ${price}` : price)
    }
  }
  return [...new Set(lines)].slice(0, 12)
}
