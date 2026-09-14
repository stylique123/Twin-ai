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

/**
 * ⚠️⚠️ A DENIAL MATCHED THE PHRASE IT DENIED, AND THAT MADE THIS CHECK REPORT
 * SUCCESS ON THE WORST SENTENCE IN THE PRODUCT.
 *
 * `DISCLOSURE_PHRASES` holds 'sponsored', 'affiliate' and 'commission', and the
 * old body was a bare `t.includes(p)`. So every one of these returned TRUE —
 * measured, not reasoned:
 *
 *   "This is not a sponsored recommendation."      -> counted as a disclosure
 *   "This is not sponsored."                       -> counted as a disclosure
 *   "I am not affiliated with them in any way."    -> counted as a disclosure
 *   "I earn no commission on this."                -> counted as a disclosure
 *
 * And `scriptDiscloses` on a four-beat script whose second beat denied the tie
 * returned TRUE, so `disclosure_missing` never fired and the script shipped.
 *
 * ⚖️ THE FIX IS A WINDOW, NOT A PHRASE LIST. Adding "not sponsored" to a list of
 * forbidden strings would need every spelling of every negator against every
 * phrase. Instead each MATCH is examined: if a negator sits in the few words
 * before it, that occurrence is not a disclosure. A text discloses only when at
 * least one match survives that test.
 *
 * ⚠️ LIMIT, STATED RATHER THAN HIDDEN: a double negative ("I am not going to
 * pretend this isn't sponsored") reads as negated here and returns false. That
 * is the SAFE direction — it under-counts disclosure, so the script is refused
 * rather than shipped, and a creator who phrased it that way is told why.
 */
const NEGATORS: readonly string[] = [
  'not', 'no', 'never', 'without', "isn't", "isnt", "aren't", "arent",
  "wasn't", "wasnt", "don't", "dont", "doesn't", "doesnt", 'neither', 'nor',
]

/** How many words before a match are searched for a negator. Three covers
 *  "is not a sponsored", "earn no commission", "am not affiliated with". */
const NEGATION_LOOKBACK_WORDS = 3

function occurrenceIsNegated(haystack: string, index: number): boolean {
  const before = haystack.slice(0, index)
  const words = before.split(/[^a-z']+/).filter((w) => w !== '')
  return words.slice(-NEGATION_LOOKBACK_WORDS).some((w) => NEGATORS.includes(w))
}

/** Does this text disclose the commercial tie?
 *
 *  ⚖️ A NEGATED MATCH DOES NOT COUNT. See the block above. */
export function textDiscloses(textValue: string | null | undefined): boolean {
  const t = String(textValue ?? '').toLowerCase()
  if (t.trim() === '') return false
  return DISCLOSURE_PHRASES.some((p) => {
    let from = 0
    for (;;) {
      const at = t.indexOf(p, from)
      if (at === -1) return false
      if (!occurrenceIsNegated(t, at)) return true
      from = at + p.length
    }
  })
}

/**
 * Does this text DENY the commercial tie — an affirmative false statement?
 *
 * ⚠️ THIS IS A SEPARATE FACT FROM "DOES NOT DISCLOSE", AND IT IS WORSE. Silence
 * is an omission a creator can fix. "This is not a sponsored recommendation" on
 * a commissioned product is a statement the video makes on her behalf, and a
 * creator running brand deals said plainly it would end the relationship — an
 * FTC problem, not a tone problem. So the two get different names, different
 * messages and different refusal reasons; folding a denial into "missing" would
 * hide the sharper failure inside the softer one.
 */
export function textDeniesTie(textValue: string | null | undefined): boolean {
  const t = String(textValue ?? '').toLowerCase()
  if (t.trim() === '') return false

  // (a) a phrase MATCHED and a negator sits just before it.
  const negatedMatch = DISCLOSURE_PHRASES.some((p) => {
    let from = 0
    for (;;) {
      const at = t.indexOf(p, from)
      if (at === -1) return false
      if (occurrenceIsNegated(t, at)) return true
      from = at + p.length
    }
  })
  if (negatedMatch) return true

  // ⚠️ (b) AND THE CASE (a) CANNOT SEE, WHICH A TEST CAUGHT. Two entries in
  // `DISCLOSURE_PHRASES` embed the verb being negated — 'this is an ad' and
  // 'paid to talk about'. In "this is not an ad" the negator sits INSIDE the
  // phrase, so the phrase never matches and there is no occurrence to test.
  // Stripping the negators and asking whether that CREATES a match catches it
  // generally, without a second list of negated spellings to keep in step.
  //
  // ⚖️ A NEW MATCH IS THE SIGNAL, NOT A MATCH. "I do not usually do this, but I
  // earn a commission" matches before and after stripping, so nothing is new
  // and it is correctly not a denial.
  const deNegated = t.split(/[^a-z']+/)
    .filter((w) => w !== '' && !NEGATORS.includes(w))
    .join(' ')
  return DISCLOSURE_PHRASES.some((p) => deNegated.includes(p) && !t.includes(p))
}

/** Does any beat of the script deny the tie? Position is irrelevant: a denial
 *  anywhere is a false statement, unlike a disclosure, which must be early. */
export function scriptDeniesTie(beats: readonly DisclosureBeat[] | null | undefined): boolean {
  const rows = Array.isArray(beats) ? beats : []
  return rows.some((b) => textDeniesTie(typeof b?.line === 'string' ? b.line : ''))
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
