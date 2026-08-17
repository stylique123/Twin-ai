// PHASE 0 — WHO IS ALLOWED TO DECIDE WHAT.
//
// ⚠️ THIS FILE EXISTS BECAUSE EVERY STAGE WAS RECONSTRUCTING THE CREATOR FROM RAW
// ONBOARDING FIELDS. The writer read `workKind`, the meter read `commercialTies`,
// the suggestion filter read them again, and each one decided for itself what
// they meant. Three interpretations of one person is how a system drifts while
// every individual PR is correct, tested and green.
//
// ⚖️ SO THE RULE IS: EVERY SOURCE OWNS A NARROW KIND OF TRUTH, EVERY DECISION IS
// MADE ONCE, AND EVERY DOWNSTREAM COMPONENT READS THE SAME CONTRACT. Anything
// missing is resolved BEFORE writing, never guessed during it.
//
// ── THE SPINE ─────────────────────────────────────────────────────────────
//
//   RAW INPUTS → AUTHORITY TYPES → PROFILE ASSEMBLER → CANONICAL PROFILE
//     → CDP → VALIDATION → CONTAINERS → RESEARCH → WRITER → JUDGE
//     → DIRECTOR → EDITOR
//
// Everything before the Creative Decision Plan ESTABLISHES TRUTH.
// Everything after it EXECUTES DECISIONS.
//
// That boundary is testable rather than decorative: a stage before CDP that
// makes a creative choice, or a stage after it that discovers a fact, is in the
// wrong place.
//
// ── THE AUTHORITIES, AND WHAT THEY MAY NOT CLAIM ──────────────────────────
//
// The `NO` lists are the load-bearing half. A type that merely lacks a field
// invites someone to add it; a type documented as forbidden to carry it does
// not. Where the compiler can express the refusal, it does — see the views
// below.
//
//   CreatorProfile   OWNS identity, audience, audience level, goal defaults,
//                    format preferences, voice, POV, commercial RELATIONSHIPS.
//                    NEVER price, product features, product claims, product
//                    availability. A creator is not a product record.
//
//   ProductProfile   OWNS product identity, relationship, features, pricing,
//                    approved and forbidden claims, evidence, assets,
//                    availability while filming.
//                    NEVER creator voice, POV, or audience preference except
//                    where genuinely product-specific.
//
//   VideoIntent      OWNS this video's goal, focus, any audience override, the
//                    selected product, the CTA, the reference-transfer
//                    preference. Per video, never standing truth.
//
//   ReferenceAnalysis OWNS observed mechanics only — hook, structure, pacing,
//                    and (later, separately) visual mechanics.
//                    NEVER product truth, creator identity, personal history.
//                    A reference is evidence about a video, not about a person.
//
//   Research         OWNS verified external information, each fact carrying its
//                    source and retrieval time.
//                    NEVER the creator's story, opinions, or whether they
//                    personally use a thing.
//
//   CreativeDecisionPlan OWNS the final decision. Every downstream stage obeys
//                    it and none re-litigates it.

import type { DnaSource } from './dnaProvenance'

/** Where an IMPORTED fact can be gone and looked at.
 *
 *  ⚖️ INSPECTABLE, NOT DESCRIPTIVE. "from their website" is not a source; a URL
 *  a person can open is. The whole value of imported provenance is that a
 *  disputed fact can be checked rather than argued about. */
export type SourceRef =
  | { kind: 'url'; url: string }
  | { kind: 'image'; assetId: string }
  | { kind: 'document'; assetId: string }

/** How often an OBSERVED trait was actually seen.
 *
 *  ⚠️ A COUNT, DELIBERATELY, NOT A SCORE — the rule `dnaProvenance` already
 *  established and this reuses rather than restates. `0.87` looks precise and
 *  says nothing checkable: nobody can reproduce it, and nobody can say what
 *  would make it `0.79`. `{ seen: 9, of: 12 }` is a claim somebody can verify by
 *  going and counting.
 *
 *  ⚖️ IT ALSO MAKES THRESHOLDS ARGUABLE. `confidence > 0.8` is a number somebody
 *  picked; `seen >= 3` is a standard somebody can defend. */
export interface EvidenceCount { seen: number; of: number }

/**
 * A value that remembers who asserted it.
 *
 * ⚠️ A DISCRIMINATED UNION, NOT ONE INTERFACE WITH OPTIONAL EVERYTHING. The
 * whole point is that the compiler refuses the invalid combinations:
 *
 *   - `observed` WITHOUT evidence is not representable. An observation nobody
 *     counted is an inference wearing a better word.
 *   - `imported` WITHOUT a source is not representable. An imported fact you
 *     cannot go and check is indistinguishable from one we made up.
 *   - `user_answer` needs neither, because a person said it.
 *
 * ⚠️ AND `rawValue` IS KEPT FOR CONFIRMED ANSWERS SO THE ASSEMBLER IS TESTABLE.
 * Assembly may normalise REPRESENTATION — "Expert" becomes `EXPERT` — and may
 * never reinterpret MEANING. Keeping the original is what makes that assertion
 * checkable rather than a promise.
 */
export type Provenanced<T> =
  | { value: T; rawValue?: unknown; source: 'user_answer'; updatedAt: string }
  | { value: T; source: 'observed'; evidence: EvidenceCount; updatedAt: string }
  /** ⚖️ `derivedFrom` NAMES THE FIELD IT WAS COMPUTED FROM, and it is the
   *  difference between an inference somebody can audit and one they must take
   *  on trust. A primary role derived from a stated work kind is recomputable —
   *  change the answer, change the role — where a free-floating `inferred` is a
   *  value with no way back to its cause. Optional, because not every inference
   *  has a single named parent. */
  | { value: T; source: 'inferred'; derivedFrom?: string; updatedAt: string }
  | { value: T; source: 'imported'; sourceRef: SourceRef; updatedAt: string }

/** ⚖️ THE VOCABULARY IS `dnaProvenance`'s, EXTENDED BY EXACTLY ONE MEMBER. Two
 *  near-identical truth systems is how a codebase ends up with one check
 *  guarding the front door while the other leaves a window open. `imported`
 *  is new because URLs and photographs became sources this week. */
export type AuthoritySource = DnaSource | 'imported'

// ── PROVENANCE DETERMINES PERMISSION, NOT MERELY CONFIDENCE ───────────────
//
// ⚠️ THESE ARE DIFFERENT QUESTIONS AND CONFLATING THEM IS THE BUG THIS FILE
// EXISTS TO PREVENT. Evidence answers "how strongly is this attested?".
// Provenance answers "may this KIND of fact authorize this KIND of decision?".
//
// An INFERRED commercial relationship is useful — it can rank a product, prompt
// a question, populate a suggestion. It may never authorize the sentence "our
// product", because nobody asserted it. That is the line between DISCOVERY and
// PERMISSION, and it is the same line the palette, the CTA and the product
// photograph each landed on this week.

/** May a script say "we built this", "our product"?
 *
 *  ⚠️ ONLY ON A PERSON'S WORD. An extractor that saw a creator's name on a
 *  pricing page has found evidence, not an assertion — and ownership language is
 *  the most expensive thing in the system to get wrong, because the creator
 *  reads it aloud in their own voice. */
export function mayUseOwnershipLanguage(
  relationship: Provenanced<string> | null | undefined,
): boolean {
  if (!relationship) return false
  return relationship.source === 'user_answer'
    && (relationship.value === 'OWN_PRODUCT' || relationship.value === 'OWN_SERVICE')
}

/** May a script say "I use this", "I've been using it for a year"?
 *
 *  ⚖️ ASKED SEPARATELY FROM OWNERSHIP, ON PURPOSE. Owning a thing does not
 *  establish having used it, and a commission establishes less still. Neither
 *  answer may be inferred from the other — the rule `productEntity` already
 *  enforces, restated here because CDP validation is where it now applies. */
export function mayClaimPersonalUse(
  personalUse: Provenanced<string> | null | undefined,
): boolean {
  if (!personalUse) return false
  return personalUse.source === 'user_answer' && personalUse.value === 'CONFIRMED'
}

/** May the writer adapt to an observed stylistic trait?
 *
 *  ⚖️ A STANDARD, NOT A SCORE. Three sightings is a pattern; one is a coincidence
 *  that would have the writer imitating a single video. The number is arguable —
 *  which is the point. Nobody can argue with `0.8`. */
export function mayAdaptObservedTrait(
  trait: Provenanced<unknown> | null | undefined,
  minSeen = 3,
): boolean {
  if (!trait || trait.source !== 'observed') return false
  return trait.evidence.seen >= minSeen
}

/** May a stated figure be spoken as fact?
 *
 *  ⚠️ AN IMPORTED FIGURE IS SPEAKABLE ONLY IF IT CAN BE INSPECTED. The union
 *  already guarantees `sourceRef` exists; this states the rule that depends on
 *  it, so a future loosening of the type breaks a named permission rather than
 *  silently widening what a script may assert. */
export function mayStateFigure(
  fact: Provenanced<string> | null | undefined,
): boolean {
  if (!fact) return false
  if (fact.source === 'user_answer') return true
  if (fact.source === 'imported') return Boolean(fact.sourceRef)
  // Observed and inferred figures are not assertions about the world. A number
  // seen in nine videos is still a number nobody stood behind.
  return false
}

// ── CONSUMERS RECEIVE TYPED PROJECTIONS, NEVER THE CANONICAL OBJECT ───────
//
// ⚠️ TWO FAILURES, ONE MECHANISM. Handing a prompt builder a `Provenanced<T>`
// interpolates as `[object Object]` straight into a model call — silently, in a
// codebase that builds most of its prompts by interpolation. And handing the
// writer the WHOLE profile lets it read fields it has no authority over.
//
// ⚖️ A PROJECTION SOLVES BOTH AT ONCE. The view carries plain values, so there is
// nothing to interpolate wrongly, and it carries only the fields that stage may
// know, so there is nothing to leak. What a stage is allowed to see becomes a
// type rather than a convention.

/** ⚖️ THE ONLY SANCTIONED WAY OUT OF THE WRAPPER. Reaching for `.value` directly
 *  is fine in a projector; doing it in a prompt builder is the bug above. This
 *  exists so projectors read declaratively and so a search for who unwraps
 *  provenance returns one answer. */
export function readValue<T>(p: Provenanced<T>): T {
  return p.value
}

/** What the WRITER is allowed to know about the creator.
 *
 *  ⚠️ NO COMMERCIAL RELATIONSHIP FIELD, AND THAT IS DELIBERATE. Whether a script
 *  may use ownership language is decided ONCE, by the planner, and arrives as a
 *  restriction in the plan. A writer that could see the relationship would be a
 *  writer that could reason about it — which is the second interpretation this
 *  file exists to abolish. */
export interface WriterProfileView {
  identity: string
  audience: string
  audienceLevel: string
  voice: string
}

/** What the PLANNER is allowed to know. Strictly more than the writer, because
 *  the planner is where commercial permission is decided. */
export interface PlannerProfileView {
  identity: string
  audience: string
  audienceLevel: string
  goals: readonly string[]
  formats: readonly string[]
  mayUseOwnershipLanguage: boolean
  mayClaimPersonalUse: boolean
}
