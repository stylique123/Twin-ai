// ⚠️ BLIND SET 2 (owner 2026-10-05): "Fresh beans." released an empty
// product's block, and a 4-word rule would release "Nothing specific keep it
// general" too. An answer about an empty product must FILL A NAMED SLOT:
// what it is, its size, its price, or how to use it. Word count is not a slot.

export type ProductSlot = 'what' | 'size' | 'price' | 'use'

const SLOT_PATTERNS: Record<ProductSlot, RegExp> = {
  price: /\$\s?\d|\b\d+(?:\.\d+)?\s?(?:dollars?|usd|bucks)\b/i,
  size: /\b\d+(?:\.\d+)?\s?(?:-\s?)?(?:oz|fl\.? ?oz|ounces?|ml|l|liters?|litres?|gallons?|lbs?|pounds?|g|grams?|kg|cups?|servings?|bottles?|bags?|packs?|count|pieces?)\b/i,
  use: /\b(?:mix(?:ed)?|dilute[ds]?|pour|cut (?:it|with)|steep(?:ed)?|serve[ds]?|heat|apply|shake|over ice|with (?:water|milk|ice)|to (?:make|brew|drink|use))\b/i,
  what: /\b(?:it'?s an?|it is an?|this is an?|made (?:from|with|of)|brewed (?:from|with)|consists of|contains|a (?:bottle|bag|jar|blend|box|kit|call|course|pack|tin|can) of)\b/i,
}

/** The slots an answer fills. Empty = it does not say what the product is. */
export function filledProductSlots(answer: string): ProductSlot[] {
  const t = String(answer ?? '')
  return (Object.keys(SLOT_PATTERNS) as ProductSlot[]).filter((k) => SLOT_PATTERNS[k].test(t))
}
