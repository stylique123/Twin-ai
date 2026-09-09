// A PAID BRAND WITH NO DISCLOSURE IS NOT A STYLE PROBLEM.
//
// ⚠️ MEASURED IN A REAL SESSION. Three of four idea-mode runs named a sponsor
// the creator never mentioned; one asserted an efficacy claim about a product
// she has never used, invented a price, and carried NO DISCLOSURE — on a paid
// relationship. #746 closed the naming half by giving the writer one entity or
// none. This closes the other half.
//
// ⚠️ AND UNTIL NOW THE RULE COULD NOT FIRE AT ALL. `generate-blueprint` computes
// `disclosureRequired` from a relationship read out of a query filtered to
// OWN_PRODUCT/OWN_SERVICE — so it was structurally always false, a live-looking
// branch guarding a state the system could not enter. Making sponsored and
// affiliate products selectable is what turns it into a real obligation, and a
// real obligation needs a check rather than an instruction.
//
// ── WHY THIS FAILS CLOSED ─────────────────────────────────────────────────
//
// ⚖️ THE SPEC SAYS "DISCLOSURE REQUIRED OR THE BRAND IS ABSENT", and stripping a
// brand out of finished prose is not a safe mechanical edit: the sentences
// around it stop making sense, and a half-edited script is worse than either
// outcome. So the enforcement is the honest one — a script that names a paid
// product without disclosing the relationship is not returned.
//
// ⚠️ THIS IS A REFUSAL, NOT A REPAIR, AND IT IS DELIBERATE. A creator who is
// told plainly what happened can regenerate or change the relationship; a
// creator handed a silently-patched script cannot know it was patched, and a
// disclosure Twin inserted on its own is a legal statement nobody chose to
// make.

import { claimRulesFor, type EntityRelationship, type PersonalUse } from './productEntity'

/** Does this relationship oblige the script to say it is paid?
 *
 *  ⚖️ IT ASKS `claimRulesFor` RATHER THAN LISTING RELATIONSHIPS. That module
 *  already owns the entitlement table; a second list here would be a second
 *  answer to one question — the defect the capability question just had. */
export function disclosureRequiredFor(
  relationship: EntityRelationship,
  personalUse: PersonalUse = 'NOT_CONFIRMED',
): boolean {
  return claimRulesFor(relationship, personalUse).disclosureRequired
}

/**
 * Phrases that DO disclose a commercial relationship, in a creator's own words.
 *
 * ⚠️ A BOUNDED LIST, AND THE LIMIT IS STATED RATHER THAN HIDDEN. Recognising
 * disclosure in general is a judgement; recognising these is decidable. A
 * creator who discloses in words outside this list gets a false refusal, which
 * is why the message says exactly what Twin looked for — a refusal that cannot
 * be understood is one people route around.
 *
 * ⚖️ AND IT IS DELIBERATELY NOT THE WORD "AD" ALONE. "ad" appears inside
 * "ready", "already" and "advice"; a bare substring test would report every
 * second script as disclosed, which is the failure mode that makes a compliance
 * check worthless.
 */
export const DISCLOSURE_PHRASES: readonly string[] = [
  'paid partnership',
  'sponsored',
  'sponsor',
  'they sent me',
  'they sent this',
  'gifted',
  'i earn a commission',
  'commission',
  'affiliate',
  'this is an ad',
  'paid to talk about',
  'paid me to',
  'working with them',
  'partnered with',
]

/** Does this text disclose the commercial tie? */
export function textDiscloses(textValue: string | null | undefined): boolean {
  const t = String(textValue ?? '').toLowerCase()
  if (t.trim() === '') return false
  return DISCLOSURE_PHRASES.some((p) => t.includes(p))
}

export interface DisclosureBeat {
  line?: unknown
}

/**
 * Does the SCRIPT disclose, and early enough to count?
 *
 * ⚠️ "EARLY AND OUT LOUD" IS PART OF THE OBLIGATION, not a stylistic preference
 * — a disclosure in the last beat is one most viewers never reach. The rule the
 * prompt already states is "early, not buried at the very end", so the check
 * reads the same way: it must appear before the final beat of a script long
 * enough for that to mean anything.
 *
 * ⚖️ A ONE- OR TWO-BEAT SCRIPT IS EXEMPT FROM THE POSITION RULE, because "not
 * last" is not a meaningful constraint when there is nowhere else to put it.
 */
export function scriptDiscloses(beats: readonly DisclosureBeat[] | null | undefined): boolean {
  const rows = Array.isArray(beats) ? beats : []
  const lines = rows.map((b) => (typeof b?.line === 'string' ? b.line : ''))
  if (lines.length === 0) return false
  const at = lines.findIndex((l) => textDiscloses(l))
  if (at === -1) return false
  if (lines.length <= 2) return true
  return at < lines.length - 1
}

// ⚠️ A `disclosureVerdict` HELPER LIVED HERE AND NOTHING CALLED IT. The edge
// composes the two checks inline (it cannot import this module) and the client
// only needs the refusal words, so a third function that merely bundled
// `disclosureRequiredFor` with `scriptDiscloses` was a convenience with no
// caller — deleted rather than registered as a known-unreached export, because
// "written and never read" is the defect this whole rule exists to end.

/** What the creator is told. Plain words, and it names what Twin looked for so
 *  a creator who DID disclose differently can see why it was not recognised. */
export function disclosureRefusalMessage(productName: string | null): string {
  const name = (productName ?? '').trim()
  return `This script talks about ${name === '' ? 'a product you are paid to feature' : name}`
    + ` and never says that you are paid to feature it. That has to be said out loud in the video,`
    + ` early — not only in the caption — so Twin will not hand you a script that leaves it out.`
    + ` Try again and it will include it. Twin looks for words like "sponsored", "paid partnership",`
    + ` "they sent me this" or "I earn a commission"; if you say it another way, say it in your own`
    + ` words and it will still be true — this check is only about the script Twin writes.`
}
