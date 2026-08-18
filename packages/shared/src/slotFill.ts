// "3 OF 3 READY" — THE SENTENCE THE GALLERY EXISTS TO BE ABLE TO SAY.
//
// ⚠️ THE RANKER ALREADY CONSUMES `slotsFillable` / `slotsRequired` AND NOTHING
// EVER PRODUCED THEM. They were caller-supplied inputs with no producer, so the
// signal `content_availability` has been dark since the day it was declared.
// This is the missing half.
//
// ⚖️ AND IT IS THE DIFFERENCE BETWEEN A RECOMMENDATION AND A NICHE LABEL.
// "Same niche as yours" is a statement about a video. "Your library already
// fills all three items" is a statement about whether a finished script exists
// on the other side of the click — which is the only question a creator staring
// at a gallery is actually asking.
//
// ── WHAT A LIBRARY CAN AND CANNOT SUPPLY ──────────────────────────────────
//
// ⚠️ A PERSONAL-EXPERIENCE SLOT IS NEVER FILLABLE, AT ANY LIBRARY SIZE. "The
// three biggest mistakes I made" needs something only the creator can assert;
// counting it as ready would promise a video Twin cannot honestly write, which
// is the founding defect wearing a progress bar. It is reported as an
// obligation, never as a shortfall to be closed by adding products.
//
// ⚖️ AND ONE PRODUCT CANNOT FILL THREE SLOTS. "3 AI tools every founder needs"
// needs three DISTINCT tools; a creator with one would get a script that
// recommends the same thing three times. The assignment here is one entity to
// one slot, which is why this is a matching problem rather than a comparison of
// two counts.

import type { ContentSlot, ContentSlotKind, ReferenceContentProfile } from './referenceContentProfile'
import { isKnown } from './assessed'
import type { EntityType, EntityRelationship } from './productEntity'

/** The entity fields this decision actually reads.
 *
 *  ⚖️ DELIBERATELY NOT `ProductEntityRecord`. A matcher that took the whole
 *  record would have to change every time an unrelated column moved, and would
 *  invite reading fields that have nothing to do with whether a thing can fill a
 *  hole in a script. */
export interface FillableEntity {
  id: string
  type: EntityType
  relationship: EntityRelationship
  /** Null means live. A withdrawn product must not fill a slot. */
  archivedAt: string | null
}

/** Which entity types are a "tool or software" for slot purposes.
 *
 *  ⚠️ NARROWER THAN "a product", ON PURPOSE. A reference recommending three apps
 *  cannot be filled by three candles. Getting this wrong in the generous
 *  direction produces the most embarrassing possible output: a confident
 *  recommendation of something that is not the kind of thing being asked for. */
const TOOL_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  'SAAS', 'APP', 'MARKETPLACE', 'DIGITAL_PRODUCT',
])

/** ⚖️ `NONE` IS NOT A THING TO TALK ABOUT. Every other relationship — including
 *  `REVIEW_ONLY` — is a real tie the creator can honestly speak from; what
 *  differs is what they may CLAIM about it, which `cta.ts` and the writer decide
 *  rather than this file. */
const usable = (e: FillableEntity): boolean =>
  e.archivedAt === null && e.relationship !== 'NONE'

const canFill = (kind: ContentSlotKind, e: FillableEntity): boolean => {
  if (!usable(e)) return false
  if (kind === 'tool_or_software') return TOOL_TYPES.has(e.type)
  if (kind === 'product') return true
  return false
}

/** ⚠️ THE KINDS A LIBRARY CAN EVER SUPPLY. The rest are obligations of a
 *  different sort and must not be counted as shortfalls: adding a product does
 *  not make a creator's personal failure available, and it does not research a
 *  current price either. */
const LIBRARY_KINDS: ReadonlySet<ContentSlotKind> = new Set<ContentSlotKind>([
  'product', 'tool_or_software',
])

export interface SlotVerdict {
  id: string
  kind: ContentSlotKind
  label: string
  /** The entity assigned to this slot, or null when nothing could fill it. */
  filledBy: string | null
}

export interface SlotFill {
  /** Library-fillable slots only — the denominator of "3 of 3". */
  required: number
  fillable: number
  slots: readonly SlotVerdict[]
  /** ⚠️ SEPARATE FROM THE COUNT, BECAUSE IT CANNOT BE CLOSED BY SHOPPING. A
   *  reference needing the creator's own story is not "1 of 3 ready"; it is a
   *  different kind of ask entirely. */
  needsPersonalExperience: boolean
  /** Facts that go stale — a price, a model name, "as of this year". Twin must
   *  research these rather than recall them. */
  needsResearch: boolean
}

/**
 * How much of this reference could Twin actually fill from what the creator has?
 *
 * ⚠️ RETURNS `null` WHEN THE REFERENCE'S SLOTS ARE UNKNOWN, WHICH IS EVERY CARD
 * TODAY. A zero here would read as "your library fills none of this" — a
 * confident negative about a video nobody has looked at, and precisely the
 * fabricated certainty the whole assessment layer exists to prevent. The ranker
 * already treats a null ratio as "no opinion".
 */
export function slotFill(
  profile: ReferenceContentProfile,
  entities: readonly FillableEntity[],
): SlotFill | null {
  const declared = profile.requirements.contentSlots
  if (!isKnown(declared)) return null

  const slots = declared.value
  const libSlots = slots.filter((s) => LIBRARY_KINDS.has(s.kind))

  // ⚖️ NARROWEST SLOTS FIRST. A tool slot can only take a tool; a product slot
  // can take anything usable. Assigning the permissive slots first would let a
  // SaaS product get spent on a generic slot and leave the tool slot empty while
  // a valid assignment existed — reporting "2 of 3" for a library that fills 3.
  const order = [...libSlots].sort((a, b) =>
    (a.kind === 'tool_or_software' ? 0 : 1) - (b.kind === 'tool_or_software' ? 0 : 1))

  const taken = new Set<string>()
  const assigned = new Map<string, string>()
  for (const slot of order) {
    const match = entities.find((e) => !taken.has(e.id) && canFill(slot.kind, e))
    if (match) {
      taken.add(match.id)
      assigned.set(slot.id, match.id)
    }
  }

  const verdicts: SlotVerdict[] = slots.map((s: ContentSlot) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    filledBy: assigned.get(s.id) ?? null,
  }))

  return {
    required: libSlots.length,
    fillable: assigned.size,
    slots: verdicts,
    needsPersonalExperience: slots.some((s) => s.kind === 'personal_experience'),
    needsResearch: slots.some((s) => s.kind === 'current_fact'),
  }
}

/**
 * The one line a card shows about readiness.
 *
 * ⚠️ PLAIN ENGLISH, AND IT NEVER SAYS A NUMBER IT CANNOT STAND BEHIND. A card
 * with nothing measured says nothing rather than "0 of 0", and a reference
 * needing the creator's own story says THAT rather than reporting a fraction
 * that implies shopping would fix it.
 */
export function slotFillSummary(f: SlotFill | null): string | null {
  if (f === null) return null
  if (f.needsPersonalExperience) return 'Needs a story only you can tell'
  if (f.required === 0) return null
  if (f.fillable >= f.required) {
    if (f.required === 1) {
      return f.needsResearch
        ? 'You have it — Twin will check the current details'
        : 'You already have what this needs'
    }
    return f.needsResearch
      ? `You have all ${f.required} — Twin will check the current details`
      : `Your products cover all ${f.required}`
  }
  if (f.fillable === 0) {
    // ⚖️ ONE IS NOT "1 things". A creator reads this line, and the plain-English
    // rule does not stop applying because the sentence was generated.
    return f.required === 1
      ? 'Needs something of yours to talk about'
      : `Needs ${f.required} things to talk about`
  }
  return `You have ${f.fillable} of ${f.required}`
}
