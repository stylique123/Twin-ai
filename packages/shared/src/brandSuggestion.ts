// WHAT TWIN THINKS YOUR BRAND IS — OFFERED, NEVER ASSUMED.
//
// ⚠️ THE OWNER'S CONDITION, VERBATIM: "every time you pre-fill something, it's
// not the right one. So … make sure it is the right one and I can properly
// edit it." So this returns a SUGGESTION the screen shows as "please check
// this", stored with `confirmed = false`, and nothing downstream reads an
// unconfirmed brand.
//
// ⚖️ AND IT ONLY SUGGESTS FROM WHAT A BRAND'S OWN PAGE SAID. The source is the
// facts `placeFacts` already moved OFF a product because they were read from
// the shop's homepage — the brand's name and its description, in its own words.
// Nothing here is a model's summary of the creator, which is what the owner has
// seen go wrong. No such facts, no suggestion: the box is left empty for her.

import { placeFacts } from './factPlacement'
import type { ProductEntityRecord } from './productEntity'

export interface Brand {
  id: string
  name: string
  website: string | null
  description: string | null
  /** False until she pressed "Yes, that's right" or edited it. */
  confirmed: boolean
}

export interface BrandSuggestion {
  name: string
  website: string | null
  description: string | null
}

const OWNED = new Set(['OWN_PRODUCT', 'OWN_SERVICE'])

/** The shop's address, from a product link on it. */
function siteOf(url: string | null | undefined): string | null {
  const raw = String(url ?? '').trim()
  if (raw === '') return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Suggest the creator's brand from her own products' pages, or return null.
 *
 * ⚖️ ONLY HER OWN PRODUCTS. An affiliate product's homepage is somebody else's
 * brand, and suggesting it as hers is exactly the wrong pre-fill.
 */
export function suggestBrand(
  products: readonly ProductEntityRecord[],
): BrandSuggestion | null {
  for (const p of products) {
    if (!OWNED.has(String(p.relationship)) || p.archivedAt) continue
    const placed = placeFacts(p.knowledge ?? [], { url: p.productUrl, productName: p.name })
    const name = placed.brand.find((f) => f.field === 'name')?.value?.trim()
    if (!name) continue
    const description = placed.brand.find((f) => f.field === 'description')?.value?.trim() ?? null
    return { name: name.replace(/\.$/, ''), website: siteOf(p.productUrl), description }
  }
  return null
}
