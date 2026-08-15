// THE STRUCTURE TRANSFERS. THE AUTOBIOGRAPHY DOES NOT.
//
// ⚠️ THE REFERENCE IS HANDED TO THE WRITER AS ONE UNDIFFERENTIATED THING —
// transcript, structure, URL, fidelity — with the instruction to adapt it. So
// when a reference opens "5 things I stopped doing at 30", the writer may take
// the whole shape, including the part that says the creator did those things.
// Nothing in the prompt separates the mechanism from the claim it is wrapped in,
// and the safety checks downstream catch the lie only after it has been written.
//
// ⚖️ CATCHING IT AFTERWARDS IS THE WRONG END. A premise chosen on a false
// autobiography does not have one bad sentence in it — every beat descends from
// it, so the repair either rewrites the video or leaves the lie load-bearing.
// The decision belongs before the premise, where it costs nothing:
//
//     TRANSFER  the 5-item negative-list structure
//     ADAPT     the negative framing ("things to stop") to the second person
//     REJECT    "I stopped", which this creator never did
//
//   → "5 things founders should stop doing" — and the lie never exists.
//
// ── WHAT THIS DECIDES, AND WHAT IT REFUSES TO ─────────────────────────────
//
// ⚠️ IT DECIDES ONE THING: does the reference's premise REST ON THE NARRATOR'S
// OWN EXPERIENCE, and can this creator supply experience at all. Both halves are
// decidable — the first from the reference's own opening text, the second from
// `evidenceLevel`, which already exists and already knows that a `demonstrated`
// opinion is coverage rather than a stance.
//
// ⚠️ IT DELIBERATELY DOES NOT MATCH TOPICS. "Has this creator specifically
// stopped doing THESE five things" is a judgement, and a matcher that claimed it
// would return a confident verdict on every reference — the failure mode named in
// `editClassification`. Having no first-hand experience at all is decidable and
// is the case that matters: it is exactly the creator for whom the reference's
// autobiography is pure invention.
//
// ⚖️ SO A CREATOR WITH EXPERIENCE GETS `adapt`, NOT `transfer`. The verdict says
// the premise MAY rest on their own experience, never that this particular
// experience is theirs. The writer still has to ground it in a supplied item, and
// the substance checks still hold it to that.
import type { KnowledgeItem } from './creatorKnowledge'
import { evidenceLevel } from './knowledgeResolver'

/** What the reference's premise requires of whoever presents it. */
export type PremiseDemand =
  /** The premise is a first-person account: "I stopped", "how I built", "I tried". */
  | 'narrator_experience'
  /** The premise addresses the viewer or states a claim; anyone can present it. */
  | 'none'
  /** ⚠️ NOT `none`. Too little reference text to read, which is a different
   *  thing from a reference that makes no personal claim. */
  | 'unknown'

/** What to do about it. */
export type PremiseVerdict =
  /** Take the premise as it stands. */
  | 'transfer'
  /** Keep the mechanism, move the claim off the creator's biography. */
  | 'adapt'
  /** The premise cannot be presented by this creator in any form — nothing here
   *  returns this today; it is named so the third option is not silently absent
   *  and a later caller has somewhere honest to put it. */
  | 'reject'

/** ⚠️ FIRST PERSON ALONE IS NOT AN AUTOBIOGRAPHY. "I think most people are
 *  wrong" is an opinion anyone can hold; "I quit my job" is an event that either
 *  happened to this person or did not. The pairing of a first-person subject with
 *  a COMPLETED ACT is what makes a premise unusable by someone else. */
const EXPERIENTIAL_VERB = [
  'stopped', 'quit', 'started', 'built', 'made', 'tried', 'tested', 'bought',
  'sold', 'launched', 'failed', 'learned', 'spent', 'lost', 'earned', 'hired',
  'fired', 'left', 'moved', 'switched', 'deleted', 'cancelled', 'canceled',
  'ran', 'used', 'wrote', 'shipped', 'raised', 'grew', 'doubled',
].join('|')

const FIRST_PERSON_ACT = new RegExp(
  String.raw`\b(?:i|we)\s+(?:just\s+|finally\s+|actually\s+|once\s+)?(?:${EXPERIENTIAL_VERB})\b`, 'i')

/** "5 things I stopped…", "what I learned…", "how we built…" — the act arrives
 *  after the object, so the plain adjacency test above misses it. */
const FIRST_PERSON_ACT_INVERTED = new RegExp(
  String.raw`\b(?:things?|ways?|lessons?|mistakes?|reasons?|what|how|why)\b[^.?!]{0,40}?` +
  String.raw`\b(?:i|we)\s+(?:${EXPERIENTIAL_VERB})\b`, 'i')

/** ⚠️ ONLY THE OPENING IS READ, and that is a decision rather than a shortcut. A
 *  forty-five second script says "I" somewhere no matter what it is about; the
 *  PREMISE is what the first breath establishes. Scanning the whole transcript
 *  would mark almost every reference as autobiographical and make the verdict
 *  meaningless by always firing. */
export const PREMISE_WINDOW_CHARS = 400

/** Below this there is not enough reference to read a premise out of. */
export const MIN_PREMISE_CHARS = 40

/** Read what the reference's premise demands of its presenter. */
export function premiseDemand(referenceText: string | null | undefined): PremiseDemand {
  const text = String(referenceText ?? '').replace(/\s+/g, ' ').trim()
  if (text.length < MIN_PREMISE_CHARS) return 'unknown'
  const opening = text.slice(0, PREMISE_WINDOW_CHARS)
  if (FIRST_PERSON_ACT.test(opening) || FIRST_PERSON_ACT_INVERTED.test(opening)) {
    return 'narrator_experience'
  }
  return 'none'
}

export interface CompatibilityDecision {
  demand: PremiseDemand
  verdict: PremiseVerdict
  /** Whether the creator has ANY first-hand experience on record. */
  creatorHasExperience: boolean
  /** ⚠️ THE LINE THAT GOES TO THE WRITER, or the empty string. */
  instruction: string
}

/**
 * Decide before the premise is chosen.
 *
 * ⚖️ AN UNKNOWN DEMAND PRODUCES NO INSTRUCTION. A reference we could not read is
 * not a reference that makes no personal claim, and emitting "this premise is
 * safe to transfer" on the strength of a missing transcript would be this system
 * telling the writer something nobody checked.
 */
export function decidePremise(
  referenceText: string | null | undefined,
  knowledge: readonly KnowledgeItem[],
): CompatibilityDecision {
  const demand = premiseDemand(referenceText)
  const creatorHasExperience = knowledge.some((k) => evidenceLevel(k) === 'experience')

  if (demand !== 'narrator_experience') {
    return { demand, verdict: 'transfer', creatorHasExperience, instruction: '' }
  }
  if (creatorHasExperience) {
    return {
      demand, verdict: 'adapt', creatorHasExperience,
      instruction:
        'REFERENCE PREMISE — IT IS A FIRST-PERSON ACCOUNT.\n'
        + 'Transfer its STRUCTURE and its framing. Its autobiography is NOT transferable: '
        + 'you may write the creator into it only where a supplied knowledge item says they '
        + 'did that thing. Where none does, move the claim off their biography — '
        + '"5 things I stopped doing" becomes "5 things to stop doing" — and keep the count '
        + 'and the shape intact.',
    }
  }
  return {
    demand, verdict: 'adapt', creatorHasExperience,
    instruction:
      'REFERENCE PREMISE — IT IS A FIRST-PERSON ACCOUNT, AND THIS CREATOR HAS NO '
      + 'FIRST-HAND EXPERIENCE ON RECORD.\n'
      + 'Transfer the STRUCTURE only. Do NOT write any sentence claiming the creator did, '
      + 'tried, quit, built or bought the thing — there is nothing on record to ground it '
      + 'and inventing it is the worst failure available here. Rewrite the premise in the '
      + 'second person or as a claim about the world, keeping the count and the shape: '
      + '"5 things I stopped doing" becomes "5 things founders should stop doing".',
  }
}
