// TWIN MAY IMITATE A CREATOR'S VOICE. IT MAY NEVER INVENT THEIR LIFE.
//
// ── WHY THIS IS A MODULE AND NOT MORE PHRASES ─────────────────────────────
//
// `claimStrength` sorts a sentence into discussion / position / history. That is
// the right first cut and it has been widened five times. The last widening
// found the wall: over 2,857 beats, 34 (1.19%) assert something about the
// creator's own life and score `discussion` — but only 4 are catchable
// lexically. The rest are "my electric bike", "my proof", "my smart home
// projects", and no regex separates those from "my approach", "my goals", "my
// audience", "my experience" without an open-ended list of concrete nouns.
//
// Lexical detection has reached its limit. What replaces it is not a bigger
// pattern but a different question: WHOSE FACT IS THIS, and what exactly does
// the sentence assert about them?
//
// ── THE CATEGORY, NAMED PROPERLY ──────────────────────────────────────────
//
// Ownership is one subtype of a larger thing. A CREATOR-STATE CLAIM is any
// assertion about this specific person's life:
//
//   ownership     "my WHOOP", "my electric bike"
//   use           "I use Notion every day"
//   purchase      "I bought one last year"
//   experience    "when I tried the beta"
//   result        "this saved me four hours a week"
//   history       "I've used this for years"
//   relationship  "my team runs on it"
//
// Each is checkable against a real person, and each is read ALOUD by that
// person into a camera. That is what makes this different from ordinary model
// error. A chatbot inventing "WHOOP has feature X" is wrong. A creator tool
// writing "I've been using my WHOOP for six months" and handing it to someone
// who has never owned one is asking them to lie about themselves on their own
// channel.
//
// ── AND IT IS SEPARATE FROM KNOWLEDGE DEPTH, PERMANENTLY ──────────────────
//
// ⚖️ A creator with extremely rich DNA may still never have said whether they
// own a WHOOP. `creator_knowledge_depth = HIGH` does not entitle "my WHOOP".
//
//   depth      how much Twin knows about this creator OVERALL
//   grounding  whether Twin knows THIS PARTICULAR THING
//
// Collapsing them would let a well-scanned creator be handed any autobiography
// at all, which is the failure mode most likely to look fine in aggregate
// metrics and be catastrophic for one person.

/** What a sentence asserts about the creator's own life. */
export const CREATOR_STATE_KINDS = [
  'ownership', 'use', 'purchase', 'experience', 'result', 'history', 'relationship',
  /** ⚠️ ADDED AFTER THE MODULE FAILED ITS OWN HEADLINE EXAMPLE. "I stopped
   *  doing these 5 things that are keeping you poor" — the line quoted all
   *  session as the worst fabrication in the corpus — produced NO CLAIM,
   *  because every pattern here looked for owning, using or buying and none
   *  looked for DOING. A taxonomy that misses the case it was written about is
   *  a taxonomy with a hole in it. */
  'action',
] as const
export type CreatorStateKind = (typeof CREATOR_STATE_KINDS)[number]

export interface CreatorStateClaim {
  kind: CreatorStateKind
  /** The thing the claim is about, when one can be named. */
  entity: string | null
  /**
   * Can the personal claim be removed while leaving a usable sentence?
   *
   * ⚖️ THIS IS THE FIELD THAT KEEPS THE GUARD FROM FEELING LIKE IMMIGRATION.
   * "My WHOOP tracks recovery" carries its fact in the PREDICATE — strip the
   * possessive and "WHOOP tracks recovery" is still true and still useful. But
   * "I've been using my WHOOP for six months" IS the personal claim; there is
   * nothing left after removing it. The first should be quietly rewritten, and
   * only the second is worth interrupting a creator for.
   */
  rewritable: boolean
}

/** Possessive determiners on things that are NOT concrete possessions.
 *  ⚖️ "my approach", "my goals", "my audience" are how anyone talks about their
 *  own work. Treating them as ownership claims would fire on nearly every
 *  first-person sentence and teach everyone to ignore the guard. */
const ABSTRACT_POSSESSIONS = new Set([
  'approach', 'opinion', 'take', 'answer', 'verdict', 'advice', 'view', 'goal',
  'goals', 'strategy', 'process', 'point', 'guess', 'life', 'audience', 'viewers',
  'subscribers', 'channel', 'video', 'videos', 'content', 'experience', 'journey',
  'story', 'mind', 'head', 'time', 'day', 'week', 'favourite', 'favorite', 'best',
])

/** The verb itself asserts the creator did/does something. Not rewritable:
 *  removing it removes the sentence. */
const ASSERTED_USE = /\bI(?:'ve| have)?\s+(?:use|used|been using|run|ran|wear|wore|tried|test|tested)\b/i
/** ⚠️ `got` IS NOT A PURCHASE. It matched "I've got proof" and "I've got four
 *  more" — neither is a transaction, and asking a creator "did you buy proof
 *  yourself?" is the kind of question that teaches people to ignore the guard. */
const ASSERTED_PURCHASE = /\bI(?:'ve| have)?\s+(?:bought|purchased|ordered|paid for|picked up)\b/i
const ASSERTED_RESULT = /\b(?:saved|earned|made|cost|took)\s+me\b|\bfor me,? (?:it|this|that)\b/i
/** ⚠️ SPELLED-OUT DURATIONS COUNT. The first version asked for `for \d+` and
 *  missed "for three years" and "for six months" — a script is SPOKEN, and a
 *  creator says "three years", not "3 years". The same mistake the traceability
 *  statistic pattern made. */
const ASSERTED_HISTORY = /\bI(?:'ve| have)\s+[\w ]{0,30}?\bfor\s+(?:\d+|a|an|several|many|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen)\b|\bI used to\b/i
const ASSERTED_EXPERIENCE = /\bwhen I (?:tried|used|got|bought|switched|tested)\b/i
const ASSERTED_RELATIONSHIP = /\bmy (?:team|company|clients?|students?|staff|agency)\b/i
/** Something the creator DID: started, stopped, switched, quit, built.
 *  ⚖️ Deliberately about deliberate acts. "I saw", "I thought" are not choices
 *  a creator can be held to, and condemning them would fail ordinary narration. */
const ASSERTED_ACTION =
  /\bI (?:\w+ly |just |recently |finally |once )*(?:stopped|started|switched|quit|ditched|dropped|cancelled|canceled|built|made|launched|deleted|swapped)\b/i

/** A possessive on something concrete: "my WHOOP", "my electric bike".
 *  The capture is the thing itself, so a caller can resolve it as an entity.
 *
 *  ⚠️ CASE-INSENSITIVE, AND THE FIRST VERSION WAS NOT. Without the flag,
 *  "My WHOOP tracks recovery" — a possessive at the start of a sentence, which
 *  is where possessives most often sit — matched nothing at all.
 *
 *  ⚖️ AT MOST TWO WORDS, AND IT STOPS AT A FUNCTION WORD. Capturing three
 *  greedily produced the entity "WHOOP for six" out of "my WHOOP for six
 *  months", which would then be asked about by name. An entity nobody could
 *  answer for is worse than no entity. */
const POSSESSIVE = /\bmy ([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*)?)\b/i
/** Words that end an entity: what follows them belongs to the sentence, not the thing. */
const ENTITY_STOP = /^(?:for|to|is|was|are|were|has|have|and|or|but|that|which|with|from|in|on|at|of|the|a|an|tracks?|helps?|lets?|makes?|gives?|does?|costs?)$/i

/**
 * What, if anything, does this sentence assert about the creator's own life?
 *
 * ⚠️ RETURNS `null` GENEROUSLY. This decides whether to interrupt a creator, so
 * a false positive costs a question they should never have been asked. The
 * abstract-possession list exists entirely to keep that from happening, and it
 * is the first thing to extend when this over-fires.
 */
export function creatorStateClaim(line: string): CreatorStateClaim | null {
  const s = String(line ?? '')
  if (s.trim() === '') return null

  const poss = s.match(POSSESSIVE)
  // Trim the capture back to the thing itself: "WHOOP for" -> "WHOOP".
  const words = poss ? poss[1].trim().split(/\s+/).filter(Boolean) : []
  while (words.length > 1 && ENTITY_STOP.test(words[words.length - 1])) words.pop()
  const possHead = words.length ? words.join(' ') : null
  // ⚖️ ANY abstract word in the head disqualifies it. Checking only the FIRST
  // word let "my whole strategy" through as a possession, because "whole" is
  // not abstract and "strategy" never got looked at.
  const possIsConcrete = possHead !== null
    && !words.some((w) => ABSTRACT_POSSESSIONS.has(w.toLowerCase()))
    && possHead.toLowerCase() !== 'own'

  // ── VERB-ASSERTED STATES FIRST, because they are not rewritable and the
  // possessive branch below would otherwise claim them and offer a rewrite that
  // deletes the actual claim.
  if (ASSERTED_RELATIONSHIP.test(s)) {
    return { kind: 'relationship', entity: possHead, rewritable: false }
  }
  if (ASSERTED_HISTORY.test(s)) {
    return { kind: 'history', entity: possIsConcrete ? possHead : null, rewritable: false }
  }
  if (ASSERTED_EXPERIENCE.test(s)) {
    return { kind: 'experience', entity: possIsConcrete ? possHead : null, rewritable: false }
  }
  if (ASSERTED_PURCHASE.test(s)) {
    return { kind: 'purchase', entity: possIsConcrete ? possHead : null, rewritable: false }
  }
  if (ASSERTED_USE.test(s)) {
    return { kind: 'use', entity: possIsConcrete ? possHead : null, rewritable: false }
  }
  if (ASSERTED_ACTION.test(s)) {
    return { kind: 'action', entity: possIsConcrete ? possHead : null, rewritable: false }
  }
  if (ASSERTED_RESULT.test(s)) {
    return { kind: 'result', entity: possIsConcrete ? possHead : null, rewritable: false }
  }

  // ── OWNERSHIP LAST, and rewritable, because the sentence's real content is
  // usually about the THING rather than about owning it.
  if (possIsConcrete) {
    return { kind: 'ownership', entity: possHead, rewritable: true }
  }
  return null
}

/** What to do about a creator-state claim, given what is on record. */
export const CREATOR_STATE_RESOLUTIONS = ['grounded', 'rewrite', 'needs_user'] as const
export type CreatorStateResolution = (typeof CREATOR_STATE_RESOLUTIONS)[number]

/**
 * Resolve one creator-state claim.
 *
 * ⚖️ REWRITE BEFORE ASKING. "My WHOOP tracks recovery" becomes "WHOOP tracks
 * recovery" — the personal claim is gone, the script survives, and the creator
 * is never interrupted. Only a claim whose whole point IS the personal
 * relationship earns a question. A guard that asks about everything gets
 * clicked through, and then it guards nothing.
 *
 * ⚖️ `evidenceForEntity` IS THREE-STATE. `true` means something on record
 * establishes this creator's relationship to this entity; `false` means we
 * checked and found none; `null` means we did not or could not check, which is
 * NOT permission. An unchecked claim is treated exactly like an unsupported
 * one, because the alternative is that a lookup failure silently licenses an
 * autobiography.
 */
export function resolveCreatorState(
  claim: CreatorStateClaim,
  evidenceForEntity: boolean | null,
): CreatorStateResolution {
  if (evidenceForEntity === true) return 'grounded'
  return claim.rewritable ? 'rewrite' : 'needs_user'
}

/**
 * Strip the personal claim, leaving the sentence about the thing itself.
 *
 * ⚠️ DELETING "my" PRODUCES BROKEN ENGLISH, and the first version did exactly
 * that. Measured on the corpus it turned
 *
 *     "My electric bike, for instance, isn't the newest model."
 *  -> "electric bike, for instance, isn't the newest model."
 *     "…based on my review of their claims"
 *  -> "…based on review of their claims"
 *
 * A bare common noun needs a determiner. Shipping that would have handed a
 * creator a sentence that is visibly ungrammatical ON A TELEPROMPTER — worse
 * than the fabricated possessive it was fixing, because it is obvious to the
 * audience rather than only to the creator.
 *
 * ⚖️ SO: a PROPER noun loses the possessive outright ("my WHOOP" -> "WHOOP"),
 * and a common noun takes an article instead ("my electric bike" -> "the
 * electric bike"). Sentence-initial capitalisation is preserved either way.
 *
 * ⚠️ ONLY EVER CALLED FOR `rewritable` CLAIMS. Applied to "I've been using my
 * WHOOP for six months" it would produce "…using the WHOOP for six months",
 * which keeps the fabricated usage claim and merely launders the possessive —
 * a rewrite that looks like a fix and is not one.
 */
export function stripPersonalClaim(line: string): string {
  return String(line ?? '')
    .replace(/\b(My|my)\s+([A-Za-z][A-Za-z0-9-]*)/g, (_m, det: string, head: string) => {
      const proper = /^[A-Z]/.test(head) && head !== head.toUpperCase().slice(0, 1) + head.slice(1).toUpperCase()
        ? true
        : /^[A-Z]/.test(head)
      const sentenceStart = det === 'My'
      if (proper) return head
      return (sentenceStart ? 'The' : 'the') + ' ' + head
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** The question to ask when only the creator can settle it. */
export function creatorStateQuestion(claim: CreatorStateClaim): string {
  const thing = claim.entity ? `“${claim.entity}”` : 'this'
  switch (claim.kind) {
    case 'ownership': return `Do you personally own ${thing}?`
    case 'use': return `Do you actually use ${thing}?`
    case 'purchase': return `Did you buy ${thing} yourself?`
    case 'experience': return `Have you personally tried ${thing}?`
    case 'result': return 'This claims a result you personally got. What actually happened?'
    case 'history': return `How long have you really used ${thing}?`
    case 'relationship': return 'This speaks for your team or clients. Is that accurate?'
    case 'action': return 'This says you did something. Did you actually?'
  }
}

// ── RESOLVING THE ENTITY: MENTIONING IS NOT OWNING ───────────────────────────
//
// ⚠️ THE TRAP THIS EXISTS FOR. A scan returns `{kind: 'product', text: 'Samsung
// Z Fold 8', basis: 'demonstrated'}` — the creator NAMED it in a title. That is
// coverage-level evidence, and coverage proves a video was made. It does not
// prove a purchase, a drawer, or a wrist.
//
// So the obvious implementation — "does any supplied item mention this entity?"
// — would license "my WHOOP" from a title that merely says WHOOP, which is the
// exact fabrication the whole module exists to stop, arriving through the
// lookup meant to prevent it.
//
// ⚖️ WHAT LICENSES A CREATOR-STATE CLAIM: evidence at EXPERIENCE level naming
// the thing, or an explicit ownership relationship recorded against it. Nothing
// weaker. An affiliate tie, a sponsorship, or fifty mentions still do not make
// someone an owner.

/** Relationships that establish the creator actually has the thing.
 *  ⚖️ AFFILIATE AND SPONSOR ARE ABSENT ON PURPOSE. Earning from a product is
 *  not owning or using it, and a disclosure obligation is not a licence to say
 *  "mine". */
const OWNING_RELATIONSHIPS = new Set(['OWN_PRODUCT', 'OWN_SERVICE', 'PERSONAL_USE'])

export interface EntityEvidence {
  /** Supplied knowledge, already read/normalised by the caller. */
  items: readonly { kind: string; text: string; basis: string }[]
  /** Entities with a recorded relationship, e.g. from product_entities. */
  entities?: readonly { name: string; relationship?: string | null }[]
}

/** Loose containment both ways, so "WHOOP" matches "my WHOOP 4.0" and vice
 *  versa. Deliberately generous: the STRENGTH test below is what protects the
 *  claim, not the string match. */
function namesSameThing(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const y = b.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  if (!x || !y) return false
  return x.includes(y) || y.includes(x)
}

/**
 * Is there evidence that THIS creator has THIS relationship to THIS entity?
 *
 * Returns the three states `resolveCreatorState` expects:
 *   true   experience-level evidence, or a recorded owning relationship
 *   false  the entity is known but only at coverage/opinion level
 *   null   no entity to check, or nothing on record mentions it at all
 *
 * ⚖️ `false` AND `null` RESOLVE THE SAME WAY DOWNSTREAM, and they are still
 * distinguished here. "We looked and found only a title" is a different fact
 * from "we have never heard of this", and a caller reporting on why a beat was
 * rewritten needs to be able to tell an operator which one happened.
 */
export function entityEvidence(
  entity: string | null,
  evidence: EntityEvidence,
): boolean | null {
  if (!entity || !entity.trim()) return null

  // ⚠️ A KNOWN ENTITY COUNTS AS KNOWN EVEN WHEN THE TIE IS THE WRONG ONE. The
  // first version marked `mentioned` only from knowledge items, so an entity
  // recorded as AFFILIATE returned `null` — "never heard of it" — when the truth
  // is "we have it on record and the tie does not establish ownership". Both
  // resolve the same way downstream, but an operator asking WHY a beat was
  // rewritten needs those two answers distinguished.
  let mentioned = false
  for (const e of evidence.entities ?? []) {
    if (!namesSameThing(entity, e.name)) continue
    mentioned = true
    if (OWNING_RELATIONSHIPS.has(String(e.relationship ?? '').toUpperCase())) return true
  }

  for (const it of evidence.items) {
    if (!namesSameThing(entity, it.text)) continue
    mentioned = true
    // The evidence ladder, applied to one entity: only first-person speech
    // establishes that they have it.
    if (it.kind === 'experience' && it.basis === 'stated') return true
  }
  return mentioned ? false : null
}

// ── HOW SAFELY CAN THE PERSONAL CLAIM BE REMOVED? ────────────────────────────
//
// ⚠️ `rewritable: boolean` WAS TOO COARSE TO DEPLOY ON. It answers "can the
// possessive be stripped", which conflates three very different situations, and
// enforcement built on it would either destroy content or ask about everything.
//
//   SAFE_ERASURE      "My WHOOP tracks recovery."  ->  "WHOOP tracks recovery."
//                     The fact lives in the predicate. Removing the possessive
//                     removes an unsupported ownership claim and changes
//                     nothing else. Safe to do silently.
//
//   PERSONALITY_LOSS  "I've used WHOOP every day for a year."
//                     Erasing it yields "WHOOP is used every day", which is A
//                     DIFFERENT CLAIM — about people in general rather than
//                     this person. The rewrite would be a new fabrication
//                     wearing a fix's clothes.
//
//   PREMISE_DEPENDENT "5 things I stopped buying after I turned 30."
//                     The personal experience IS the concept. There is no
//                     version of this video without it, so rewriting the beat
//                     leaves a script whose own hook no longer pays off.
//
//   UNRESOLVABLE      Only the creator can settle it, and no rewrite avoids
//                     that.
//
// ⚖️ TRUTHFULNESS IS NOT THE ONLY THING BEING OPTIMISED. "I stopped paying for
// three tools" becoming "Three tools that may not be worth paying for" is more
// defensible and materially worse content. A guard that improves accuracy by
// deleting the reason anyone watches has not improved the product.

export const REWRITE_SAFETY = [
  'SAFE_ERASURE', 'PERSONALITY_LOSS', 'PREMISE_DEPENDENT', 'UNRESOLVABLE',
] as const
export type RewriteSafety = (typeof REWRITE_SAFETY)[number]

/** An enumerated promise carried by a personal experience — "5 things I
 *  stopped buying", "3 mistakes I made". The number and the first person
 *  together make the personal history the video's premise. */
const ENUMERATED_PREMISE =
  /\b(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,2}(?:I|that I|things I|mistakes I|reasons I)\b/i

export interface RewriteContext {
  /** True when the beat opens the script — a hook carries the promise. */
  isOpening?: boolean
}

/**
 * How safely can this claim's personal component be removed?
 *
 * ⚖️ ORDER MATTERS AND PREMISE WINS. A line can be both enumerated and
 * verb-asserted; when it is, the premise reading is the one that must hold,
 * because rewriting it breaks the whole script rather than one sentence.
 */
export function rewriteSafety(
  claim: CreatorStateClaim,
  line: string,
  ctx: RewriteContext = {},
): RewriteSafety {
  const s = String(line ?? '')
  if (ENUMERATED_PREMISE.test(s)) return 'PREMISE_DEPENDENT'
  // ⚖️ An opening line carrying a verb-asserted state is the promise itself.
  // A possessive in a hook is not — "My WHOOP is the first item" still works
  // as "WHOOP is the first item".
  if (ctx.isOpening && !claim.rewritable) return 'PREMISE_DEPENDENT'
  if (claim.rewritable) return 'SAFE_ERASURE'
  // Everything verb-asserted: erasing it re-attributes the claim to people in
  // general, which is a new assertion rather than a removal.
  return 'PERSONALITY_LOSS'
}

/** How much the pipeline is allowed to change. */
export const CREATOR_STATE_MODES = ['observe', 'safe_rewrite', 'enforce'] as const
export type CreatorStateMode = (typeof CREATOR_STATE_MODES)[number]

export interface CreatorStateAction {
  mode: CreatorStateMode
  safety: RewriteSafety
  /** What actually happens to the beat. */
  act: 'none' | 'rewrite' | 'ask'
}

/**
 * What the pipeline does, given how much it is allowed to do.
 *
 * ⚠️ THE DEFAULT IS `observe`, AND THAT IS A PRODUCT DECISION NOT A TIMIDITY.
 * On cohort 1 the resolver grounds 0 of 37 claims — not because the chain is
 * wrong but because every supplied knowledge item is coverage-level. Enforcing
 * against that supply would mean "whenever Twin writes something personal about
 * you, assume it cannot be proven", and would strip personal experience out of
 * scripts wholesale. The chain is exposing an upstream deficiency; enforcement
 * must wait until the knowledge pipeline gives it a fair chance.
 *
 * ⚖️ `safe_rewrite` IS THE USEFUL MIDDLE. It removes unsupported ownership
 * where meaning is provably preserved and observes everything else, which buys
 * real safety without letting weak upstream knowledge flatten the writing.
 */
export function creatorStateAction(
  safety: RewriteSafety,
  grounded: boolean,
  mode: CreatorStateMode = 'observe',
): CreatorStateAction {
  if (grounded) return { mode, safety, act: 'none' }
  if (mode === 'observe') return { mode, safety, act: 'none' }
  if (mode === 'safe_rewrite') {
    return { mode, safety, act: safety === 'SAFE_ERASURE' ? 'rewrite' : 'none' }
  }
  return { mode, safety, act: safety === 'SAFE_ERASURE' ? 'rewrite' : 'ask' }
}
