// IS IT STILL FOR SALE? — read from the shop's own live stock data.
//
// ⚠️ AUDIT 2026-09-25 (Sort Of Ceramics): a script told viewers to buy a bowl
// whose listing was SOLD OUT, and nothing anywhere in Twin knew — availability
// was never extracted. Shopify's public `/products/<handle>.js` carries
// `available` for the product and for every variant, so it is read from there,
// never guessed from page copy.
//
// Pure: parsing only. The sweep does the I/O.

export type Availability = 'in_stock' | 'sold_out' | 'partly_sold_out'

export interface AvailabilityRead {
  availability: Availability
  soldOutVariants: string[]
}

/** The Shopify product .js url for a product page url, or null if it is not one. */
export function shopifyJsUrl(productUrl: string | null | undefined): string | null {
  if (!productUrl) return null
  try {
    const u = new URL(productUrl)
    const m = u.pathname.match(/^(?:\/collections\/[^/]+)?\/products\/([^/]+)\/?$/)
    if (!m || u.protocol !== 'https:') return null
    return `${u.origin}/products/${m[1].replace(/\.(js|json)$/, '')}.js`
  } catch { return null }
}

export function readAvailability(raw: unknown): AvailabilityRead | null {
  const p = raw as { available?: unknown; variants?: Array<{ title?: unknown; available?: unknown }> } | null
  if (!p || typeof p !== 'object' || typeof p.available !== 'boolean') return null
  const variants = Array.isArray(p.variants) ? p.variants : []
  const sold = variants.filter((v) => v && v.available === false)
    .map((v) => String(v.title ?? '').trim()).filter((t) => t !== '' && t !== 'Default Title')
  if (!p.available) return { availability: 'sold_out', soldOutVariants: [] }
  if (sold.length > 0 && sold.length < variants.length) return { availability: 'partly_sold_out', soldOutVariants: sold.slice(0, 12) }
  return { availability: 'in_stock', soldOutVariants: [] }
}
