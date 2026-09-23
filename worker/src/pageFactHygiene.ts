// WHAT A PAGE READ MUST NOT HAND THE WRITER AS IF IT WERE ABOUT THE PRODUCT.
//
// ⚠️ THE WORKER MAY NOT IMPORT @twinai/shared, so the site-button list below is
// a deliberate copy of `SHOP_BUTTON` in packages/shared/src/factPlacement.ts.
// The shared classifier still sets these aside at read time; this drops them at
// the source so a stored `cta` is never "View cart" / "Check out" / "SHOP HERE".
// Keep the two lists in step (pageFactHygiene.test.ts pins the reported cases).

const SHOP_BUTTON = new RegExp(
  '^(?:'
  + 'view (?:cart|bag|basket)|(?:go to |your )?(?:cart|bag|basket)|check ?out(?: now)?|checkout(?: now)?'
  + '|continue shopping|keep shopping|shop (?:here|now|all|the collection|more)|shop'
  + '|add to (?:cart|bag|basket)|buy (?:it )?now|order now'
  + '|sign ?in|log ?in|sign ?up|register|create (?:an )?account|my account'
  + '|subscribe|join (?:the )?(?:list|newsletter)|menu|search|close|next|previous|back'
  + '|learn more|read more|see more|view (?:all|more|details|product)|quick ?view|select options?|choose options?'
  + ')(?:\\s*\\(\\d+\\))?[.!\\s→›»>]*$',
  'i',
)

export function isSiteButton(value: string): boolean {
  return SHOP_BUTTON.test(String(value ?? '').trim())
}

interface FactLike { field?: string; value?: string }

/** Drop `cta` facts that are the site's own buttons. A page with only such
 *  buttons has NO spoken CTA, and storing none is the honest answer. */
export function withoutSiteButtons<T extends FactLike>(facts: readonly T[]): { kept: T[]; dropped: number } {
  const kept: T[] = []
  let dropped = 0
  for (const f of facts) {
    if (f.field === 'cta' && isSiteButton(String(f.value ?? ''))) { dropped++; continue }
    kept.push(f)
  }
  return { kept, dropped }
}

const BARE_PRICE = /^\s*(?:from\s+)?[€$£¥]\s?\d[\d.,]*(?:\s*[A-Z]{3})?\s*$|^\s*\d[\d.,]*\s?(?:[€$£¥]|[A-Z]{3})\s*$/i

/** ⚠️ REPORTED 2026-09-23: several prices per product, none saying which size or
 *  style it belongs to. The shop lookup and schema.org paths label variants;
 *  the model's reading of a page often cannot. When two or more bare prices come
 *  back, each is marked as an unlabeled option so neither the panel nor the
 *  writer treats "$28" as THE price. A single price is left alone. */
export function labelUnlabeledPrices<T extends FactLike>(facts: readonly T[]): T[] {
  const bare = facts.filter((f) => f.field === 'price' && BARE_PRICE.test(String(f.value ?? '')))
  if (bare.length < 2) return [...facts]
  const n = bare.length
  return facts.map((f) => (bare.includes(f)
    ? { ...f, value: `${String(f.value).trim()} (one of ${n} prices on the page — which size or style is not stated)` }
    : f))
}
