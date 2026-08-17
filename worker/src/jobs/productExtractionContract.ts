// MIRROR of `packages/shared/src/productExtraction.ts`.
//
// ⚠️ THE WORKER HAS NO RUNTIME DEPENDENCY ON @twinai/shared — same arrangement as
// `scanTarget.ts`, `transcriptSelection.ts` and `brandSnapshot.ts`. It ships as
// its own Docker image built from `worker/` alone, so an import would either
// pull the whole package into the image or break the build.
//
// ⚖️ SO THIS FILE IS A COPY, AND A PARITY TEST READS BOTH. The rule that matters
// is that the CLASSIFIER cannot drift: if the shared side tightens what counts
// as a measured number and this side does not, the worker grades a claim
// `usable` that the rest of the system would have held — and the grade is
// STORED, so the disagreement outlives the deploy that caused it.
//
// Everything below this line is copied verbatim. Change the shared file first.

// WHAT A PRODUCT PAGE MAY TELL TWIN, AND WHAT IT MAY NOT TELL A SCRIPT.
//
// ── THE PROBLEM EXTRACTION CREATES ────────────────────────────────────────
//
// Every other source in this system is either the creator speaking (transcript),
// the creator answering (user), or something they published (caption). A pasted
// product URL is the first source that is SOMEONE ELSE'S MARKETING COPY, and
// marketing copy is written to be believed rather than to be true.
//
// ⚠️ SO THE FAILURE MODE IS NEW AND SPECIFIC: a landing page says "clinically
// proven", Twin extracts it as a product fact, and a creator says it on camera
// about their own product. Nobody lied — the page said it, the extractor read it
// correctly, and the script quoted it faithfully. The claim still arrived in
// someone's mouth without anyone checking it.
//
// ── THE SPLIT ─────────────────────────────────────────────────────────────
//
// ⚖️ NOT EVERY EXTRACTED FIELD CARRIES THAT RISK, AND TREATING THEM ALIKE MAKES
// THE FEATURE POINTLESS. §26 already ranks an authoritative product source
// second only to the creator themselves, so refusing to use a product's own NAME
// until someone retypes it turns "paste a link" into "paste a link and then do
// all the work anyway".
//
// The line is drawn at what a false value would COST:
//
//     IDENTITY / DESCRIPTION     wrong ⇒ embarrassing. "It's a scheduling tool"
//                                when it's an analytics tool is caught by the
//                                creator the first time they read a script.
//
//     NUMBERS AND OUTCOMES       wrong ⇒ a false claim in someone's mouth.
//                                "$29/month" when it is $39, "4× faster",
//                                "10,000 customers", "clinically proven". These
//                                are the two shapes that become a script saying
//                                something untrue about the world.
//
// So identity and capability are usable on extraction; anything carrying a
// number or asserting an outcome waits for the creator to confirm it.
//
// ⚠️ THE CLASSIFIER LOOKS AT THE VALUE, NOT ONLY THE FIELD. A `description` is
// normally safe — but "The only tool that doubles your revenue" is a description
// that contains an outcome claim, and filing it as identity because of where it
// was found would walk straight past the whole point. Field kind sets the
// default; the text can only ever make it stricter.

/** Where an extracted value came from. Distinct from `basis` on creator
 *  knowledge: that grades how strongly a CREATOR attested something, this grades
 *  how authoritative a PAGE is about a product. */
export const EXTRACTION_SOURCES = [
  /** The product's own site, for a product the creator says they own. */
  'official_product_page',
  /** Its documentation — usually the most literal and least promotional. */
  'documentation',
  /** A pricing page. Authoritative, and the fastest thing in the system to go stale. */
  'pricing_page',
  /** A marketplace or retailer listing. Authoritative about the offer, less so
   *  about the product. */
  'listing',
  /** Promotional prose from anywhere. Correct about what is being sold and
   *  unreliable about what it achieves. */
  'marketing_copy',
  /** The creator told us directly. Outranks every page. */
  'user_confirmed',
  // ── A PHOTOGRAPH THE CREATOR SUPPLIED ──────────────────────────────────
  //
  // ⚖️ A THIRD KIND OF EVIDENCE, NOT A STRONGER PAGE. An image establishes that
  // a thing EXISTS and WHAT IT LOOKS LIKE — which is precisely what the Director
  // Plan needs to decide whether a scene may show it. It establishes nothing
  // about price, benefit or result.
  //
  // ⚠️ AND A VISION MODEL WILL HAPPILY READ "$29/mo" OFF A SCREENSHOT. That
  // figure is a reading of a picture, not a stated price, and letting it through
  // as a fact would put a number in a script that no page and no person ever
  // asserted. It is the palette defect again — a machine's reading promoted to
  // an assertion — so `imageFactAllowed` below refuses those fields outright
  // rather than merely marking them for confirmation.
  'creator_image',
] as const
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number]

/** What kind of thing was extracted. Sets the DEFAULT risk; the value can raise
 *  it but never lower it. */
export const EXTRACTED_FIELDS = [
  'name', 'category', 'description', 'audience', 'feature', 'use_case',
  'integration', 'benefit', 'claim', 'price', 'plan', 'guarantee', 'cta',
] as const
export type ExtractedField = (typeof EXTRACTED_FIELDS)[number]

/** Usable now, or waiting on the creator. Two states on purpose: a third like
 *  `probably_fine` would be decided by nobody and read as permission. */
export type ExtractionTrust = 'usable' | 'needs_confirmation'

/** Fields whose DEFAULT is to wait, because their whole purpose is to assert
 *  something measurable about the world. */
const RISKY_FIELDS: ReadonlySet<ExtractedField> = new Set([
  'benefit', 'claim', 'price', 'plan', 'guarantee',
])

/** A number that asserts a magnitude. Deliberately not "any digit" — "Version 2",
 *  "iPhone 15", "Python 3" and "Node 22" are names, and refusing them would make
 *  the classifier fire on half of all products, so everything would need
 *  confirming and nothing would get read.
 *
 *  Three shapes count, and the third was missing until a test caught it:
 *
 *    1. a currency amount              "$29", "£1,200"
 *    2. a number attached to a unit    "40%", "4x", "12 months", "500 users"
 *    3. a LARGE number, unit or not    "10,000 rows a second", "50000 downloads"
 *
 *  ⚠️ (3) EXISTS BECAUSE A UNIT LIST CAN NEVER BE COMPLETE. The first version
 *  required a known unit and passed "Exports 10,000 rows a second" as safe —
 *  "rows" simply was not on the list, and no list would have had it. Magnitude
 *  is carried by the NUMBER, so comma-grouping or four-plus digits is enough on
 *  its own. That threshold is what keeps "iPhone 15" out. */
const MEASURED = /(?:[$£€]\s?[\d,]|\d[\d,]*\s?(?:%|x\b|×|k\b|m\b|hours?|hrs?|mins?|minutes?|days?|weeks?|months?|years?|customers?|users?|downloads?|reviews?|stars?)|\b\d[\d,]*\s*(?:times|fold)\b|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b)/i

/** Language that promises a result rather than describing a capability. The
 *  distinction §6 of the spec draws between a FEATURE and a CLAIM: "automatic
 *  captions" is a feature, "produces videos 4× faster" is a claim. */
const OUTCOME = /\b(?:guarantee\w*|proven|clinically|scientifically|doubles?|triples?|boosts?|increases?|decreases?|reduces?|eliminates?|cures?|fastest|best|#1|number one|no\.? ?1|results? in|so you (?:can|will)|helps? you (?:earn|make|lose|gain|save|grow)|risk[- ]free|money[- ]back)\b/i

/**
 * Can this extracted value be spoken before the creator confirms it?
 *
 * ⚖️ `user_confirmed` SHORT-CIRCUITS EVERYTHING, because the creator saying it
 * is the top of the authority order in §26 — including for text that would
 * otherwise look risky. A creator IS allowed to promise a guarantee about their
 * own product; what they are not allowed to do is have us promise it for them.
 *
 * ⚠️ EVERY OTHER PATH CAN ONLY GET STRICTER. The field sets a default and the
 * text may escalate it, so a `description` containing "doubles your revenue"
 * waits. Nothing here can move a value from `needs_confirmation` back to
 * `usable` — that direction is what a permission escalation looks like.
 */
/** ⚖️ WHAT A PICTURE CAN AND CANNOT ESTABLISH. Identity and appearance only.
 *  Everything else — a price, a plan, a guarantee, a benefit, an outcome — needs
 *  a page that states it or a person who says it.
 *
 *  ⚠️ THIS IS A REFUSAL, NOT A DOWNGRADE. `needs_confirmation` would put the
 *  figure in front of the creator with a tick box, and a plausible number beside
 *  a photo of their own product is the easiest thing in the world to approve
 *  without checking. The honest treatment is that it never becomes a fact. */
const IMAGE_FIELDS: ReadonlySet<string> = new Set([
  'name', 'category', 'description',
])

export function imageFactAllowed(field: ExtractedField): boolean {
  return IMAGE_FIELDS.has(field)
}

export function extractionTrust(input: {
  field: ExtractedField
  value: string
  source: ExtractionSource
}): ExtractionTrust {
  if (input.source === 'user_confirmed') return 'usable'

  // ⚠️ A PHOTO NEVER ARRIVES AS `usable`, EVEN FOR WHAT IT CAN ESTABLISH. A
  // vision model naming a product from a box is usually right and sometimes
  // confidently wrong, and the cost of a wrong NAME is every later script
  // calling the thing something it is not. One tap fixes it; nothing catches it
  // afterwards.
  // ⚖️ FIELDS OUTSIDE `imageFactAllowed` should never reach here at all — the
  // extractor drops them — so this is the second line of defence rather than the
  // first, and it fails closed.
  if (input.source === 'creator_image') return 'needs_confirmation'

  // ⚠️ MARKETING COPY IS NEVER USABLE UNCONFIRMED, WHATEVER IT SAYS. It is the
  // one source whose PURPOSE is persuasion, so even its plain-looking sentences
  // are selected to flatter. Identity from a marketing page is still identity,
  // but it can wait for one tap rather than be taken on trust.
  if (input.source === 'marketing_copy') return 'needs_confirmation'

  if (RISKY_FIELDS.has(input.field)) return 'needs_confirmation'

  const text = String(input.value ?? '')
  if (MEASURED.test(text) || OUTCOME.test(text)) return 'needs_confirmation'

  return 'usable'
}

/** One extracted fact with everything needed to decide whether it may be used. */
export interface ExtractedFact {
  field: ExtractedField
  value: string
  source: ExtractionSource
  /** The page it came from, so a creator correcting it can go and look. */
  sourceUrl: string | null
  trust: ExtractionTrust
  /** When it was read. Pricing ages in weeks; a category does not — §27. */
  extractedAt: string
}

/** Build a fact with its trust DECIDED rather than supplied.
 *
 *  ⚠️ THE ARGUMENT TYPE DELIBERATELY HAS NO `trust` FIELD. If callers could pass
 *  one, the extractor — a model reading a web page — would eventually be asked to
 *  grade its own output, and a model that has just read persuasive copy is the
 *  worst available judge of whether that copy is persuasive. */
export function readExtractedFact(input: {
  field: ExtractedField
  value: string
  source: ExtractionSource
  sourceUrl?: string | null
  now?: string
}): ExtractedFact | null {
  const value = String(input.value ?? '').trim()
  if (value === '') return null
  if (!EXTRACTED_FIELDS.includes(input.field)) return null
  // ⚖️ AN UNKNOWN SOURCE DEGRADES TO `marketing_copy`, THE WEAKEST ONE — never
  // to the strongest. Same rule as an absent `basis` reading as `inferred`.
  const source = EXTRACTION_SOURCES.includes(input.source) ? input.source : 'marketing_copy'
  return {
    field: input.field,
    value,
    source,
    sourceUrl: typeof input.sourceUrl === 'string' && input.sourceUrl.trim() !== ''
      ? input.sourceUrl.trim()
      : null,
    trust: extractionTrust({ field: input.field, value, source }),
    extractedAt: input.now ?? new Date().toISOString(),
  }
}

/** The facts a script may use right now. The reader that makes the split mean
 *  something — without it, `trust` is another stored field nobody consults. */
export function usableFacts(facts: readonly ExtractedFact[]): ExtractedFact[] {
  return facts.filter((f) => f.trust === 'usable')
}

/** The facts waiting on the creator, so the UI can ask for exactly those rather
 *  than making them re-read everything. */
export function factsNeedingConfirmation(facts: readonly ExtractedFact[]): ExtractedFact[] {
  return facts.filter((f) => f.trust === 'needs_confirmation')
}
