// WHERE A FACT READ OFF A PAGE ACTUALLY BELONGS.
//
// ⚠️ REPORTED 2026-09-22 FROM THE SCREEN, and measured on the row behind it.
// "Reversible Scrunchie Bandana" had twelve facts, and not one was about the
// bandana. Its link was `https://www.thedogdaysco.com` — the shop's HOMEPAGE —
// so the extractor faithfully read a homepage and every line was filed under
// the product:
//
//   name ........ "The Dog Days Co."               ← the BRAND's name
//   description . "Our Dog Days collars are made-to-order… BC-based company"
//                                                  ← the BRAND's story
//   cta ×4 ...... "View cart", "Check out", "Continue shopping", "SHOP HERE"
//                                                  ← the SITE's buttons
//   price ×3 .... €28.51 · From €13.94 · From €11.40
//                                                  ← THREE DIFFERENT PRODUCTS
//
// Every one of those was then eligible for a script: a video about a bandana
// that describes collars, tells viewers to "View cart", and quotes a price that
// belongs to something else. Nothing was wrong with any single value. What was
// missing was a decision about WHERE each one goes.
//
// ⚖️ DETERMINISTIC, AND FROM THE PAGE'S OWN SHAPE. The facts are already graded
// for trust (`readExtractedFact`) by a rule that deliberately keeps the model
// out of grading itself; placement follows the same principle. Whether a link
// is a homepage is a property of the URL, and whether "View cart" is a site
// button is a property of the words — neither needs a model to guess, and a
// guess is exactly what produced this row.
//
// ⚠️ THIS FILE IS MIRRORED BYTE FOR BYTE AT supabase/functions/_shared/, because
// generate-blueprint runs on Deno and cannot import this package. A parity test
// fails if the two copies differ in any character.

/** What kind of page a link points at. */
export type PageKind = 'homepage' | 'collection' | 'product' | 'unknown'

/** Where one fact belongs. */
export type FactPlace =
  /** True of THIS product; may be stated about it. */
  | 'product'
  /** True of the business that sells it: its story, its shipping, its rating. */
  | 'brand'
  /** A button on the website. Never a line a creator says on camera. */
  | 'shop_button'
  /** A price read from a page listing many things. Not this product's price. */
  | 'listing_price'

/**
 * Read the kind of page from the link alone.
 *
 * ⚖️ THE PATH, NOT THE HOST. `thedogdaysco.com/products/scrunchie` and
 * `thedogdaysco.com` are the same shop and entirely different pages; the only
 * difference is the path, and the common e-commerce platforms name their
 * product and listing paths the same way (Shopify, WooCommerce, Etsy, Squarespace).
 *
 * ⚠️ UNKNOWN IS AN ANSWER. A path this does not recognise is not assumed to be
 * a product page — that assumption is how a homepage's facts became a
 * product's. `unknown` keeps the old behaviour (facts stay on the product)
 * rather than inventing a stricter one for a site shape nobody measured.
 */
export function pageKindOf(url: string | null | undefined): PageKind {
  const raw = String(url ?? '').trim()
  if (raw === '') return 'unknown'
  let path: string
  try {
    path = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).pathname
  } catch {
    return 'unknown'
  }
  const p = path.replace(/\/+$/, '').toLowerCase()
  if (p === '' || /^\/(index\.html?|home|shop|store)$/.test(p)) return 'homepage'
  if (/\/(products?|listing|item|p|dp)\/[^/]+/.test(p)) return 'product'
  if (/\/(collections?|categor(y|ies)|product-category|shop|catalog)(\/|$)/.test(p)) return 'collection'
  return 'unknown'
}

/** The words that are a website's navigation, not something to say to camera.
 *
 *  ⚠️ A CALL TO ACTION IN A VIDEO IS THE CREATOR'S DECISION — "link in bio",
 *  "comment BANDANA" — and a site's cart buttons are never one. Measured on the
 *  reported row: four of four stored CTAs were site chrome. */
const SHOP_BUTTON = new RegExp(
  '^(?:'
  + 'view (?:cart|bag|basket)|(?:go to |your )?(?:cart|bag|basket)|check ?out|checkout'
  + '|continue shopping|keep shopping|shop (?:here|now|all|the collection|more)|shop'
  + '|add to (?:cart|bag|basket)|buy (?:it )?now|order now'
  + '|sign ?in|log ?in|sign ?up|register|create (?:an )?account|my account'
  + '|subscribe|join (?:the )?(?:list|newsletter)|menu|search|close|next|previous|back'
  + '|learn more|read more|see more|view (?:all|more|details|product)|quick ?view|select options?|choose options?'
  + ')[.!\\s]*$',
  'i',
)

export function isShopButton(value: string): boolean {
  return SHOP_BUTTON.test(value.trim())
}

/** "From €13,94" is a price with options behind it, not a price. */
export function priceSignalsVariants(value: string): boolean {
  return /^\s*(from|starting (at|from)|as low as)\b/i.test(value) || /\s[-–]\s*[€$£]/.test(value)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Decide where one fact belongs.
 *
 * ⚖️ ONLY THE PAGE'S KIND MOVES A FACT OFF THE PRODUCT, never the fact's own
 * wording alone — with one exception, site buttons, which are chrome on any page.
 * A product page's description IS the product's description; a homepage's is the
 * brand's. Same field, same kind of sentence, different owner, and the only
 * thing that tells them apart is where it was read.
 */
export function placeFact(
  fact: { field: string; value: string },
  ctx: { pageKind: PageKind; productName?: string | null },
): FactPlace {
  const field = String(fact.field ?? '')
  const value = String(fact.value ?? '').trim()
  if (field === 'cta' && isShopButton(value)) return 'shop_button'

  // Not read from a listing or homepage: it describes what the link points at.
  if (ctx.pageKind === 'product' || ctx.pageKind === 'unknown') return 'product'

  // ── A homepage or a collection page ──────────────────────────────────────
  // ⚠️ A PRICE HERE BELONGS TO SOMETHING ON THE PAGE, and there is no way to
  // know which. Three prices on the reported row were three products.
  if (field === 'price' || field === 'plan') return 'listing_price'
  // Any button on a page listing many things points at the site, not this one.
  if (field === 'cta') return 'shop_button'
  // The page's name is the shop's name unless it IS the product's name.
  if (field === 'name') {
    const pn = norm(String(ctx.productName ?? ''))
    return pn !== '' && norm(value) === pn ? 'product' : 'brand'
  }
  // Story, category, audience, shipping, ratings: true of the business.
  return 'brand'
}

/** One product's facts, split by where they belong. */
export interface PlacedFacts<F> {
  product: F[]
  brand: F[]
  /** Kept only so a screen can say what was set aside and why. */
  setAside: F[]
  pageKind: PageKind
}

export function placeFacts<F extends { field: string; value: string }>(
  facts: readonly F[],
  ctx: { url?: string | null; productName?: string | null },
): PlacedFacts<F> {
  const pageKind = pageKindOf(ctx.url)
  const out: PlacedFacts<F> = { product: [], brand: [], setAside: [], pageKind }
  for (const f of facts) {
    const place = placeFact(f, { pageKind, productName: ctx.productName })
    if (place === 'product') out.product.push(f)
    else if (place === 'brand') out.brand.push(f)
    else out.setAside.push(f)
  }
  return out
}
