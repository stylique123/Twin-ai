// WHICH PRODUCT DID THIS SCRIPT USE, AND WHAT WAS IT ALLOWED TO SAY?
//
// ⚠️ THE AGENCY'S REPORT, AND IT IS AN AUDIT LINE RATHER THAN A NICETY: "Product
// Mode per client. But I need to know which product each script used, or I'll
// send a client the wrong one." A finished script names no product and states no
// rules, so the one fact a person needs before forwarding it to a brand is the
// one fact the page does not carry.
//
// ⚖️ THE RULES SENTENCE IS NOT REWRITTEN HERE. `productChoiceConstraint` already
// composes it from `claimRulesFor`, and it is what the picker shows at the
// moment of choosing. Restating it in different words would be two derivations
// of one policy, which is the defect the capability question and the fidelity
// slider both paid for. The creator reads the SAME sentence before the script
// and after it, because there is only one sentence.
//
// ⚠️ AND THE ORIGIN HALF IS DELIBERATELY SMALLER THAN THE SPEC ASKED FOR. The
// spec wants "From your idea", "From your reference", "About <product>" as four
// distinguishable doors. Only ONE of those is currently knowable after the
// fact: `door` is not stored on any row — it exists for the duration of one
// request and is discarded, as migration 0191 records. A reference URL is
// ground truth; "idea" versus "browse" versus "product with no reference" is
// not separable today, so this says the true thing rather than the fuller one.
import { productChoiceConstraint } from './productSelection'
import type { EntityRelationship, PersonalUse } from './productEntity'

/** ⚠️ ONE AUTHORITY FOR "IS THERE A REFERENCE", shared with `Result.tsx`'s own
 *  `cameFromAReference`: the URL, because `reference_read` and `fidelity` are
 *  present on generations that have no reference and cannot tell them apart. */
export const hasReferenceUrl = (url: string | null | undefined): boolean =>
  typeof url === 'string' && url.trim() !== ''

export interface ScriptOriginInput {
  referenceUrl: string | null
  /** The product this generation was built about, where one was chosen. */
  product: {
    name: string | null
    relationship: EntityRelationship
    personalUse: PersonalUse
  } | null
}

export interface ScriptOrigin {
  /** Where the shape came from. One short sentence. */
  source: string
  /** What the script was about and what it was allowed to claim — null when no
   *  product was chosen, because there is then nothing to disclose. */
  product: string | null
}

/**
 * What a person forwarding this script needs to know about it.
 *
 * ⚖️ TWO LINES, NOT ONE, because they answer different questions and one of
 * them is often absent. Joining them would produce a sentence with a dangling
 * clause on every non-commercial video.
 */
export function scriptOrigin(input: ScriptOriginInput): ScriptOrigin {
  const source = hasReferenceUrl(input.referenceUrl)
    ? 'Built from the reference link you gave.'
    // ⚠️ "No reference" IS THE HONEST STATEMENT, and "from your idea" is not —
    // a product build and a browse build also arrive with no URL, and claiming
    // an idea for them would be a guess wearing a fact's clothes.
    : 'Written from your own material. No reference was read.'

  const p = input.product
  if (!p) return { source, product: null }

  // ⚠️ THE NAME MAY BE ABSENT AND THE RULES STILL APPLY. A product registered
  // without a name is rare and legitimate; dropping the whole line because the
  // label is missing would remove the disclosure notice with it.
  const named = (p.name ?? '').trim()
  const subject = named === '' ? 'the product you chose' : named
  return {
    source,
    product: `About ${subject}. ${productChoiceConstraint(p.relationship, p.personalUse)}`,
  }
}
