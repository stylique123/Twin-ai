/**
 * A CALL TO ACTION MAY ONLY POINT AT SOMETHING THIS CREATOR OWNS.
 *
 * ⚠️ RUN C, MEASURED. goal="Get customers or leads" demanded a commercial CTA.
 * The creator skipped all three product questions, so `product_entities` was
 * empty. The writer still needed an offer, found none on file, and reached for
 * the nearest one in context — the REFERENCE's own business — because
 * fidelity="Close to the reference" told it to stay near the original. The
 * shipped line: "We partner with founders to scale their businesses at
 * Acquisition dot com, and we put all the education out for free. You just
 * have to apply it." First-person-plural, naming a real company (Acquisition.com)
 * this creator has no relationship to.
 *
 * ⚖️ TWO SEPARATE CHECKS, BECAUSE ONE IS NOT ENOUGH. A brand/domain name is a
 * decidable string match against `product_entities` — cheap, precise, and
 * blind to a claim that never spells out a name. "We partner with founders"
 * makes a first-person-plural BUSINESS CLAIM without a domain in sight, and
 * that claim is false about anything not on file whether or not it is named.
 * So the second check does not look for a brand at all: it asks whether the
 * line asserts "we run/operate/partner/serve/build/scale/help [a business]"
 * about a subject this creator's `product_entities` cannot back up.
 *
 * ⚖️ SKIPPING THE PRODUCT QUESTIONS IS AN ANSWER, NOT A BLANK. Empty
 * `product_entities` is a fact — "no offer on record" — not an invitation to
 * fill the gap with whatever is nearby in context (the reference's own
 * offer, closest at hand under a close-fidelity instruction). Both checks
 * below read directly off the entity list the creator actually supplied, so
 * an empty list can only ever produce "unowned", never a silent pass.
 */

export interface EntityLike {
  name?: unknown
  relationship?: unknown
}

/** A spoken-style domain ("Acquisition dot com") or a literal one
 *  ("acquisition.com"). Captures the brand token so it can be reported and
 *  matched against `product_entities`. */
const SPOKEN_DOMAIN = /\b([a-z][a-z0-9' -]{1,40}?)\s+dot\s+(com|io|co|net|org|ai|app)\b/i
const LITERAL_DOMAIN = /\b([a-z0-9-]{2,40})\.(com|io|co|net|org|ai|app)\b/i

/** "We partner with founders", "we help businesses scale", "we built this
 *  company" — a first-person-plural claim of running, owning or operating a
 *  business, not merely of doing an action ("we think", "we love"). */
const FIRST_PERSON_PLURAL_BUSINESS =
  /\bwe('re| are)?\s+(partner(s|ed|ing)?|help(s|ed|ing)?|serve(s|d)?|scale(s|d)?|built|build(s|ing)?|run(s)?|operate(s|d)?|offer(s|ed)?|provide(s|d)?)\b/i

function normalize(s: unknown): string {
  return String(s ?? '').toLowerCase().trim()
}

function ownedNames(entities: readonly EntityLike[] | null | undefined): string[] {
  if (!Array.isArray(entities)) return []
  return entities
    .map((e) => normalize(e?.name))
    .filter((n) => n !== '')
}

/** Is this brand/domain token traceable to something the creator owns?
 *  Substring either direction: an entity named "Acme" matches a spoken
 *  "acme dot com", and an entity named "Acme Coaching" matches a mention of
 *  just "Acme". */
function isOwnedMention(token: string, owned: readonly string[]): boolean {
  const t = normalize(token)
  if (t === '') return false
  return owned.some((n) => n !== '' && (t.includes(n) || n.includes(t)))
}

export type CtaEntityFailureReason = 'unowned_brand' | 'unowned_first_person_business'

export interface CtaEntityCheckResult {
  flagged: boolean
  reason: CtaEntityFailureReason | null
  /** The brand/domain token matched, when the failure is `unowned_brand`. */
  matched?: string
}

/**
 * Does this CTA line name, or first-person-plural claim, a business this
 * creator's `product_entities` cannot back up?
 *
 * ⚖️ PURE AND DECIDABLE. No model call — a CTA that fails this is replaced
 * deterministically by the caller (see `fallbackCta` in `craftBeats.ts`),
 * never rewritten by a second LLM pass that could reintroduce the same
 * failure in different words.
 */
export function checkCtaEntity(
  line: unknown,
  entities: readonly EntityLike[] | null | undefined,
): CtaEntityCheckResult {
  const text = String(line ?? '')
  if (text.trim() === '') return { flagged: false, reason: null }
  const owned = ownedNames(entities)

  // 1. A brand or domain named outright.
  const spoken = SPOKEN_DOMAIN.exec(text)
  const literal = LITERAL_DOMAIN.exec(text)
  const domainMatch = spoken ?? literal
  if (domainMatch) {
    const brand = spoken ? spoken[1] : literal![1]
    if (!isOwnedMention(brand, owned) && !isOwnedMention(domainMatch[0], owned)) {
      return { flagged: true, reason: 'unowned_brand', matched: domainMatch[0].trim() }
    }
  }

  // 2. A first-person-plural business claim, whether or not it names anyone.
  // ⚠️ STRONGER THAN #1 ON PURPOSE: this catches "we partner with founders"
  // even with no domain in the sentence at all.
  if (FIRST_PERSON_PLURAL_BUSINESS.test(text)) {
    // If the creator has no owned entity on record at all, the claim cannot
    // be about anything of theirs — flagged regardless of what it names.
    if (owned.length === 0) return { flagged: true, reason: 'unowned_first_person_business' }
    // If they DO have entities on record, the claim must actually mention
    // one of them; otherwise it is a business claim about something else.
    const mentionsOwned = owned.some((n) => text.toLowerCase().includes(n))
    if (!mentionsOwned) return { flagged: true, reason: 'unowned_first_person_business' }
  }

  return { flagged: false, reason: null }
}

export interface ScriptBeatLike {
  section?: unknown
  line?: unknown
}

export interface CtaEntityViolation {
  index: number
  section: string
  result: CtaEntityCheckResult
}

/** Which CTA beats name or first-person-plural-claim a business not on this
 *  creator's `product_entities`. Reports, does not rewrite — the caller
 *  decides the deterministic fallback (see `fallbackCta`). */
export function ctaEntityViolations(
  beats: readonly ScriptBeatLike[] | null | undefined,
  entities: readonly EntityLike[] | null | undefined,
): readonly CtaEntityViolation[] {
  if (!Array.isArray(beats)) return Object.freeze([])
  const out: CtaEntityViolation[] = []
  beats.forEach((b, index) => {
    const section = String(b?.section ?? '')
    if (!/cta|call to action/i.test(section)) return
    const result = checkCtaEntity(b?.line, entities)
    if (result.flagged) out.push({ index, section, result })
  })
  return Object.freeze(out)
}
