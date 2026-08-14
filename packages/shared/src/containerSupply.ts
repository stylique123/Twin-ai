// DOES THE CREATOR HAVE ENOUGH REAL MATERIAL TO FILL WHAT THE REFERENCE PROMISES?
//
// ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
//
// `referenceMechanism` already reads the reference's promise — "3 AI tools",
// "5 mistakes" — and `blueprintCountIssues` checks that the finished script
// DELIVERS that many. Both are about the OUTPUT.
//
// Nothing checks the INPUT. So a reference promising three tools, handed to a
// creator whose knowledge and product library between them support one, produces
// three confidently-worded items — and the count contract PASSES, because it
// counted three. The two that were invented are indistinguishable from the one
// that was real, in exactly the register the real one used.
//
// §18a of the intelligence spec names this and says what it costs:
//
//     An unresolved container handed to a writer does not come back empty; it
//     comes back INVENTED, phrased with the same confidence as the resolved
//     ones. That is how a tech reviewer ends up promoting three products that
//     do not exist.
//
// ── WHY THIS SHIPS AS A MEASUREMENT FIRST ─────────────────────────────────
//
// ⚖️ §18a SAYS `UNRESOLVED` IS A STOP, NOT A WARNING, AND IT IS RIGHT — but a
// stop shipped before anyone knows how often it fires is a stop that may refuse
// most generations on its first day. Nobody has ever counted how many enumerated
// references a creator can actually supply, because nothing has ever asked.
//
// So this computes the shortfall and the caller LOGS it. When the counter says
// how common a shortfall is, the refusal is a decision with a number behind it
// rather than a guess — the same order `beat_substance` shipped in, and the
// opposite of the enforcement that had to be walked back for shipping without
// measurement.

/** What a reference demands, as `readMechanism` reports it. */
export interface EnumerationDemand {
  isEnumerated: boolean
  count: number | null
  /** What the REFERENCE was counting. A reading of their video, never a word for
   *  this creator's script — see the count contract's own warning. */
  unit: string | null
}

/** One thing the creator could actually build an item out of. Deliberately loose:
 *  the caller decides what counts as material, because "what can fill a slot"
 *  differs between a product round-up and a mistakes list. */
export interface SupplyItem {
  kind: string
  text: string
}

/** Kinds that can carry ONE ITEM OF AN ENUMERATION on their own.
 *
 *  ⚠️ NARROWER THAN `SUBSTANCE_KINDS`, AND FOR A DIFFERENT REASON. An `opinion`
 *  is substance — it can carry a beat — but "megapixels are oversold" cannot be
 *  item two of "three phones I'd buy". An enumerated item needs a THING: a named
 *  product, a concrete case, something they did.
 *
 *  ⚖️ `product` IS IN HERE AND NOT IN THE SUBSTANCE SET. The two lists answer
 *  different questions and that difference is the point: "they mentioned the Z
 *  Fold 8" cannot assert anything, but it can absolutely be one of five phones. */
export const ENUMERABLE_KINDS: ReadonlySet<string> = new Set([
  'product', 'example', 'experience', 'claim', 'framework', 'fact',
])

export interface SupplyCheck {
  /** How many items the reference promises. Null when it promises none. */
  demand: number | null
  /** How many distinct things the creator has that could BE an item. */
  supply: number
  /** Items the writer would have to invent. 0 when demand is met or absent. */
  shortfall: number
  /** How many of the supply are BARE PRODUCT MENTIONS.
   *
   *  ⚠️ 302 OF 302. Measured on caption-derived stores — 17 real creators, the
   *  store every established account actually has — every single enumerable item
   *  was a `product` row. Not one example, experience, claim, framework or fact.
   *
   *  ⚖️ SO `supply` ALONE OVERSTATES WHAT CAN FILL A SLOT. "They mentioned the Z
   *  Fold 8" is genuinely enumerable — it can be one of five phones — but ten of
   *  them cannot carry "the 10 products I'd sell right now", because the creator
   *  has no view on any of them. A shortfall of zero built entirely out of these
   *  is a container that will still come back invented, and reporting only the
   *  total makes that indistinguishable from a creator who has ten real cases. */
  bareProduct: number
  /** True when the reference enumerates and the creator cannot fill it.
   *
   *  ⚠️ THIS IS THE §18a CONDITION. Not "the script is wrong" — the script has
   *  not been written yet. It is "writing now produces invention", which is a
   *  fact about the inputs and is knowable BEFORE spending a generation. */
  wouldInvent: boolean
}

/** A key that treats two phrasings of the same thing as one item.
 *
 *  ⚠️ WITHOUT THIS THE SUPPLY IS INFLATED BY REPETITION. A creator who mentioned
 *  the same phone in four captions has one phone, and counting four would report
 *  a container as fillable that is not. */
function itemKey(i: SupplyItem): string {
  return `${i.kind}:${String(i.text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()}`
}

/**
 * Compare what the reference promises against what the creator can supply.
 *
 * `available` is everything the caller was going to hand the writer — knowledge
 * items and product facts alike. Only `ENUMERABLE_KINDS` are counted, because a
 * slot in a list needs a thing rather than a position.
 *
 * ⚖️ A NON-ENUMERATED REFERENCE HAS NO DEMAND AND CANNOT BE SHORT. Reporting a
 * shortfall of zero for it would be true but useless; `demand: null` says the
 * question does not apply, which is different from "it applies and the answer is
 * none" — the same three-state discipline the rest of this system uses.
 */
export function checkSupply(
  demand: EnumerationDemand | null | undefined,
  available: readonly SupplyItem[],
): SupplyCheck {
  const enumerated = Boolean(demand?.isEnumerated)
  const count = enumerated && typeof demand?.count === 'number' && demand.count > 0
    ? demand.count : null
  const eligible = available.filter(
    (i) => ENUMERABLE_KINDS.has(i.kind) && String(i.text).trim() !== '')
  const usable = new Set(eligible.map(itemKey))
  const supply = usable.size
  const bareProduct = new Set(
    eligible.filter((i) => i.kind === 'product').map(itemKey)).size
  if (count === null) {
    return { demand: null, supply, bareProduct, shortfall: 0, wouldInvent: false }
  }
  const shortfall = Math.max(0, count - supply)
  return { demand: count, supply, bareProduct, shortfall, wouldInvent: shortfall > 0 }
}

/** What to tell a creator whose reference asks for more than they have.
 *
 *  ⚖️ NAMES THE TRADE RATHER THAN REFUSING FLATLY. "We cannot make this" is not
 *  actionable; "this format wants five and you have two" tells them they can
 *  supply three or pick a different reference, and both are real options. */
export function describeShortfall(c: SupplyCheck, unit: string | null): string {
  if (!c.wouldInvent || c.demand === null) return ''
  const thing = (unit ?? '').trim() || 'items'
  return `This format promises ${c.demand} ${thing} and we can support ${c.supply}.`
    + ` Writing it now would invent ${c.shortfall}.`
}
