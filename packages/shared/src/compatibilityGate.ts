// CAN THIS REFERENCE ACTUALLY BE ADAPTED FOR THIS PERSON?
//
// §16b. One stage, between Reference DNA and the Creative Decision Plan, asking
// exactly that — and able to answer no.
//
// ── THE RUN THIS EXISTS FOR ───────────────────────────────────────────────
//
// A "Show the product" scene was generated for a COACH WITH NO PRODUCT. The
// scene type came from the reference, where there genuinely was one — a $70
// framed keepsake — and it transferred without anyone asking whether it could be
// filled. `workKind` was coaching and the CTA was "apply for my one-on-one
// coaching program", so every fact needed to refuse it was already in the
// system. Nothing was holding a place to do the refusing.
//
// The creator discovered it while standing in a bedroom holding a phone.
//
// ── WHY A SEPARATE STAGE, AND NOT A LINE IN THE WRITING PROMPT ────────────
//
// ⚖️ Folded into the writing prompt, the model rationalises every reference into
// compatibility — because a writer asked to write will always find a way. "Show
// the product" becomes "show something representing your coaching", and the
// output looks like an adaptation rather than a defect. A gate that runs FIRST,
// and whose legitimate answer set includes REJECT on most dimensions, is what
// makes "this reference is wrong for you" a thing the system can say.
//
// The verdicts become an INPUT to the plan. They are not re-derived by it.
//
// ── NOT OBSERVED IS NOT A FAILURE ────────────────────────────────────────
//
// The reference reader sees transcripts and derived structure, never pixels, and
// honestly emits nine visual facts as `unknown` rather than guessing them. A
// dimension we never measured must come back NOT_OBSERVED — not REJECT, which
// would refuse things that might be fine, and not TRANSFER, which would carry
// across something nobody saw. It is the honest fourth answer and it is why
// there are four.

import type { EntityRelationship, Showability } from './productEntity'

export const TRANSFER_VERDICTS = ['TRANSFER', 'ADAPT', 'REJECT', 'NOT_OBSERVED'] as const
export type TransferVerdict = (typeof TRANSFER_VERDICTS)[number]

/**
 * The reference dimensions the gate rules on.
 *
 * Deliberately a CLOSED list. An open one would let a new dimension appear
 * downstream with no verdict attached, which is the state this gate exists to
 * end — "product demonstration" was exactly that: present in the output,
 * ruled on by nobody.
 */
export const REFERENCE_DIMENSIONS = [
  'hook_mechanism',
  'structure',
  'sequencing',
  'pacing',
  'performance_energy',
  'product_demonstration',
  'b_roll_density',
  'setting',
  'camera_work',
  'product_claims',
  'creator_identity',
] as const
export type ReferenceDimension = (typeof REFERENCE_DIMENSIONS)[number]

export interface DimensionVerdict {
  dimension: ReferenceDimension
  verdict: TransferVerdict
  /** Why, in a sentence a person can disagree with. A verdict without a reason
   *  is indistinguishable from a default, and defaults are what this replaces. */
  reason: string
}

/**
 * What the gate needs to know. Every field is something the system already
 * holds — the gate adds a decision, not a data requirement.
 */
export interface CompatibilityInput {
  /** Dimensions the reference read genuinely OBSERVED. Anything absent is
   *  NOT_OBSERVED, which is why this is a list of what was seen rather than a
   *  list of what was missing: the reader knows what it read. */
  observed: readonly ReferenceDimension[]
  /** Does the reference demonstrate a product on screen? */
  referenceShowsProduct?: boolean
  /** Does the reference make claims about that product? */
  referenceMakesProductClaims?: boolean
  /** Is the reference's b-roll load heavy enough that the format depends on it? */
  referenceIsBRollHeavy?: boolean
  /** The creator's owned entity, if they have one. */
  entity?: { relationship: EntityRelationship; showability: Showability } | null
  /** Can this creator supply b-roll? Three-state; unanswered is not a yes. */
  canProduceBRoll?: boolean | null
  /** The reference's delivery energy vs the creator's, when both are known. */
  referenceEnergy?: 'high' | 'calm' | null
  creatorEnergy?: 'high' | 'calm' | null
}

/**
 * Rule on every dimension. Always returns one verdict per dimension, in order —
 * a gate that silently omits a dimension has not ruled on it.
 */
export function compatibilityVerdicts(input: CompatibilityInput): DimensionVerdict[] {
  const seen = new Set(input.observed)
  const out: DimensionVerdict[] = []
  const add = (dimension: ReferenceDimension, verdict: TransferVerdict, reason: string) =>
    out.push({ dimension, verdict, reason })

  for (const dimension of REFERENCE_DIMENSIONS) {
    // NOT OBSERVED WINS OVER EVERY OTHER RULE. We cannot rule on what we never
    // measured, and pretending otherwise is the `unknown` evidence kind being
    // quietly upgraded to a fact.
    if (!seen.has(dimension)) {
      add(dimension, 'NOT_OBSERVED', 'The reference read never measured this, so there is no opinion to carry across.')
      continue
    }

    switch (dimension) {
      // The mechanics that make a reference work, and the reason anyone chose
      // it. These transfer unless something specific refuses them.
      case 'hook_mechanism':
      case 'structure':
      case 'sequencing':
        add(dimension, 'TRANSFER', 'A structural mechanism, independent of who is performing it or what they sell.')
        break

      case 'pacing':
        // Pacing transfers as a MECHANISM and adapts as an EXECUTION: the same
        // escalation at the creator's own speed.
        add(dimension, 'ADAPT', 'Keep the escalation; run it at the creator’s own speed rather than the reference’s.')
        break

      case 'performance_energy': {
        const ref = input.referenceEnergy
        const mine = input.creatorEnergy
        if (ref && mine && ref !== mine) {
          add(dimension, 'REJECT',
            `The reference performs ${ref} and this creator is ${mine}. Copying the delivery makes them sound like someone else, which is the one thing the voice layer exists to prevent.`)
        } else {
          add(dimension, 'ADAPT', 'Deliver at the creator’s own energy, not the reference’s.')
        }
        break
      }

      // ── THE ONE THIS GATE EXISTS FOR ────────────────────────────────────
      case 'product_demonstration': {
        if (!input.referenceShowsProduct) {
          add(dimension, 'NOT_OBSERVED', 'The reference does not demonstrate a product, so there is nothing to transfer.')
          break
        }
        const rel = input.entity?.relationship
        if (!rel || rel === 'NONE') {
          // The coach. Every fact needed to refuse this was already in the
          // system; nothing was holding a place to do the refusing.
          add(dimension, 'REJECT', 'The reference shows a product and this creator has none. A "show the product" scene cannot be filled, and would be discovered while standing in a room holding a phone.')
          break
        }
        if (input.entity?.showability !== 'ALWAYS') {
          add(dimension, 'REJECT', 'The reference shows a product this creator cannot dependably put on screen. A script is written once and filmed later, so a scene that depends on it is a scene that may not be filmable.')
          break
        }
        add(dimension, 'TRANSFER', 'The creator has a product and can put it on screen.')
        break
      }

      case 'product_claims': {
        if (!input.referenceMakesProductClaims) {
          add(dimension, 'NOT_OBSERVED', 'The reference makes no product claims.')
          break
        }
        // ALWAYS REJECTED, without exception. The reference's claims are about
        // the reference's product, and no relationship makes them true of a
        // different one. This is the dimension whose failure mode is regulatory
        // rather than aesthetic.
        add(dimension, 'REJECT', 'Claims belong to the product they were made about. Nothing carries a claim from one product to another.')
        break
      }

      case 'b_roll_density': {
        if (!input.referenceIsBRollHeavy) {
          add(dimension, 'TRANSFER', 'The reference does not lean on b-roll, so nothing here depends on footage.')
          break
        }
        if (input.canProduceBRoll === true) {
          add(dimension, 'ADAPT', 'Keep the cutaway rhythm, at a volume one person with a phone can actually shoot.')
          break
        }
        // Unanswered refuses, for the same reason `showability` does: this
        // decides whether beats DEPEND on footage that may never arrive.
        add(dimension, 'REJECT', 'The format leans on b-roll this creator has not said they can produce. A renovation timelapse handed to someone holding a phone is a beat that silently will not exist.')
        break
      }

      case 'setting':
        add(dimension, 'ADAPT', 'Take the intent — clean, or lived-in, or busy — never the reference’s actual room. Nobody has confirmed what this creator’s room contains.')
        break

      case 'camera_work':
        add(dimension, 'ADAPT', 'Achievable framing only: a phone, at a height and distance a person can set up alone.')
        break

      case 'creator_identity':
        // The reference's jokes, catchphrases, persona. Never transferable, and
        // carrying them is how a script becomes a re-shoot of someone else's.
        add(dimension, 'REJECT', 'The reference creator’s identity is theirs. Carrying it across makes this a re-shoot of their video with a different face.')
        break
    }
  }
  return out
}

/**
 * The `DO NOT USE` block (§17), derived rather than written.
 *
 * ⚖️ Not decoration: it is the list of things the reference contributed that
 * must NOT transfer, and it is what stops the script becoming a re-shoot of
 * someone else's video. Derived from the verdicts so it cannot disagree with
 * them — a hand-written list would be a second authority on the same decision.
 */
export function doNotUse(verdicts: readonly DimensionVerdict[]): DimensionVerdict[] {
  return verdicts.filter((v) => v.verdict === 'REJECT')
}

/** Is any scene type this reference implies unfillable for this creator?
 *  The question the Gallery needs answered BEFORE a remix is spent. */
export function hasBlockingRejection(verdicts: readonly DimensionVerdict[]): boolean {
  return verdicts.some((v) =>
    v.verdict === 'REJECT'
    && (v.dimension === 'product_demonstration' || v.dimension === 'b_roll_density'))
}

/** The verdicts as prompt text, so the writer receives decisions rather than
 *  re-deriving them. Empty when there is nothing to refuse. */
export function compatibilityPromptLine(verdicts: readonly DimensionVerdict[]): string {
  const rejected = doNotUse(verdicts)
  if (rejected.length === 0) return ''
  return '\n- DO NOT USE — these were ruled out before writing began, and a reason to include them anyway is not one you may find:\n'
    + rejected.map((v) => `  * ${v.dimension.replace(/_/g, ' ')}: ${v.reason}`).join('\n')
}
