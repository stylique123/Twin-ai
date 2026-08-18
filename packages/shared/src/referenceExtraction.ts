// TURNING A MODEL'S ANSWER INTO A PROFILE, WITHOUT BELIEVING IT ON SIGHT.
//
// ⚠️ THE EXTRACTION IS THE ONLY PLACE THE BATCH CAN LIE, and it will be run
// ~3,943 times where nobody is watching any individual result. A prompt that
// says "include evidence" is a request; this file is the part that can refuse.
// Every rule below is a CONTRACT CHECK on the response rather than an
// instruction in the prompt, because the defect is decidable from the response
// alone — which is exactly the case where a check beats a rule.
//
// ⚖️ AND THE FAILURE MODE IS ALWAYS "WE DID NOT LEARN THIS", NEVER A COERCION.
// A container the model invented, an audience with no quote behind it, a rehook
// pointing at a beat that does not exist — each drops the FIELD and records why.
// It never repairs the value, because a repaired field is indistinguishable from
// an observed one the moment it is written to the database.
//
// ── THE THREE OUTCOMES A FIELD CAN HAVE ───────────────────────────────────
//
//   observed        the model gave a value AND a quote to stand on
//   indeterminate   the model explicitly said the transcript does not say
//   not_checked     the response was unusable here — so try again later
//
// ⚠️ A REJECTED FIELD MUST LAND ON `not_checked`, NOT `indeterminate`. The second
// means "asked and answered, stop paying to ask"; a malformed response has not
// answered anything, and filing it as finished would silently retire a question
// nobody has actually put to the transcript.

import type { Assessed } from './assessed'
import { unchecked, indeterminate } from './assessed'
import {
  CONTAINER_TYPES, HOOK_MECHANISMS, PAYOFF_TYPES, SOPHISTICATION, LIKELY_GOALS,
  REQUIREMENT, CONTENT_SLOT_KINDS, BEAT_ROLES,
  emptyContentProfile,
  type ReferenceContentProfile, type Beat, type ContentSlot,
} from './referenceContentProfile'
import { CTA_MECHANISMS } from './cta'

/** The literal the model must use when the source does not answer a field.
 *  ⚖️ SPELLED OUT RATHER THAN INFERRED FROM AN EMPTY STRING, because "" is what a
 *  truncated response also produces, and those are different events. */
export const NOT_DETERMINED = 'NOT_DETERMINED'

/** Why one field did not make it. Kept per field so a pilot can be read as
 *  "which parts of this schema does the model struggle with" rather than as a
 *  single pass/fail. */
export interface Rejection {
  field: string
  reason:
    | 'missing'
    | 'not_in_vocabulary'
    | 'no_evidence'
    | 'out_of_range'
    | 'wrong_type'
    | 'contradicts_slots'
  /** What arrived, truncated. Present so a failing pilot is diagnosable without
   *  re-running it. */
  saw: string
}

export interface ExtractionResult {
  profile: ReferenceContentProfile
  rejections: readonly Rejection[]
  /** ⚠️ COUNTED SEPARATELY FROM `rejections.length` because one malformed field
   *  and seventeen are different qualities of response, and a pilot that reports
   *  only "some rejections" cannot tell you whether the schema is wrong. */
  fieldsAccepted: number
}

const brief = (v: unknown): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return (s ?? 'undefined').slice(0, 80)
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Read one field the model was asked to answer with a value plus evidence.
 *
 * ⚠️ NO EVIDENCE MEANS NO VALUE, AND THAT IS THE WHOLE POINT OF THIS FUNCTION.
 * The single most likely failure at 3,943 calls is a confident container type
 * with nothing behind it, and it is invisible once stored — every field looks
 * equally certain in a database row. Requiring the quote makes the lie
 * structurally impossible rather than discouraged.
 */
function readField<T>(
  raw: unknown,
  field: string,
  assessedAt: string,
  parse: (v: unknown) => T | null,
  rejections: Rejection[],
): Assessed<T> {
  const needs = 'a transcript or caption for this video'
  if (raw === undefined || raw === null) {
    rejections.push({ field, reason: 'missing', saw: brief(raw) })
    return unchecked(needs)
  }
  // The model may answer the whole field with the sentinel.
  if (raw === NOT_DETERMINED) return indeterminate(`model reported ${NOT_DETERMINED}`, assessedAt)
  if (!isRecord(raw)) {
    rejections.push({ field, reason: 'wrong_type', saw: brief(raw) })
    return unchecked(needs)
  }
  if (raw.value === NOT_DETERMINED) {
    const ev = typeof raw.evidence === 'string' ? raw.evidence : `model reported ${NOT_DETERMINED}`
    return indeterminate(ev, assessedAt)
  }
  const value = parse(raw.value)
  if (value === null) {
    rejections.push({ field, reason: 'not_in_vocabulary', saw: brief(raw.value) })
    return unchecked(needs)
  }
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : ''
  if (evidence.length === 0) {
    // ⚠️ REJECTED EVEN THOUGH THE VALUE PARSED. A plausible answer with nothing
    // behind it is worse than no answer: it is the one that gets believed.
    rejections.push({ field, reason: 'no_evidence', saw: brief(raw.value) })
    return unchecked(needs)
  }
  return { value, basis: 'observed', evidence, assessedAt }
}

const oneOf = <T extends string>(vocab: readonly T[]) => (v: unknown): T | null =>
  typeof v === 'string' && (vocab as readonly string[]).includes(v) ? (v as T) : null

const nonEmptyString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null

const wholeNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null

const goalList = (v: unknown): readonly typeof LIKELY_GOALS[number][] | null => {
  if (!Array.isArray(v) || v.length === 0) return null
  const out = v.filter((g): g is typeof LIKELY_GOALS[number] =>
    typeof g === 'string' && (LIKELY_GOALS as readonly string[]).includes(g))
  // ⚖️ ALL-OR-NOTHING. Keeping the two goals a model got right out of five
  // silently converts a partly-wrong answer into a confident short one.
  return out.length === v.length ? out : null
}

const beatList = (v: unknown): readonly Beat[] | null => {
  if (!Array.isArray(v) || v.length === 0) return null
  const out: Beat[] = []
  for (const b of v) {
    if (!isRecord(b)) return null
    const role = oneOf(BEAT_ROLES)(b.role)
    if (role === null) return null
    const num = (x: unknown): number | null =>
      x === null || x === undefined ? null
        : typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : NaN
    const startSec = num(b.startSec)
    const endSec = num(b.endSec)
    if (Number.isNaN(startSec) || Number.isNaN(endSec)) return null
    // A beat that ends before it starts is a parse error wearing a number.
    if (startSec !== null && endSec !== null && endSec < startSec) return null
    out.push({
      role,
      startSec,
      endSec,
      summary: typeof b.summary === 'string' ? b.summary.trim() : '',
    })
  }
  return out
}

const slotList = (v: unknown): readonly ContentSlot[] | null => {
  if (!Array.isArray(v) || v.length === 0) return null
  const out: ContentSlot[] = []
  for (const [i, s] of v.entries()) {
    if (!isRecord(s)) return null
    const kind = oneOf(CONTENT_SLOT_KINDS)(s.kind)
    const label = nonEmptyString(s.label)
    if (kind === null || label === null) return null
    out.push({
      id: nonEmptyString(s.id) ?? String(i + 1),
      kind,
      label,
      required: s.required !== false,
    })
  }
  return out
}

/**
 * Validate one model response into a profile.
 *
 * ⚖️ THE INPUT IS `unknown` ON PURPOSE. It arrives from a model over a wire; the
 * type system cannot help here, so nothing in this file may assume a shape it
 * has not checked.
 */
export function parseContentExtraction(
  raw: unknown,
  ctx: { referenceId: string; niche?: string | null; assessedAt: string; transcriptAvailable: boolean },
): ExtractionResult {
  const base = emptyContentProfile(ctx.referenceId, ctx.niche ?? null)
  const rejections: Rejection[] = []
  const at = ctx.assessedAt

  if (!isRecord(raw)) {
    rejections.push({ field: '(root)', reason: 'wrong_type', saw: brief(raw) })
    return { profile: base, rejections, fieldsAccepted: 0 }
  }

  const audience = isRecord(raw.audience) ? raw.audience : {}
  const hook = isRecord(raw.hook) ? raw.hook : {}
  const structure = isRecord(raw.structure) ? raw.structure : {}
  const requirements = isRecord(raw.requirements) ? raw.requirements : {}
  const transfer = isRecord(raw.transfer) ? raw.transfer : {}

  const beats = readField(structure.beats, 'structure.beats', at, beatList, rejections)
  const contentSlots = readField(
    requirements.contentSlots, 'requirements.contentSlots', at, slotList, rejections)

  // ⚠️ A REHOOK MUST POINT AT A BEAT THAT EXISTS. An index into a list the same
  // response failed to produce is not a position, and stored as one it would
  // make the teleprompter's beat-deletion bug reachable from data.
  let rehook = readField<number | null>(
    structure.rehookPosition, 'structure.rehookPosition', at,
    (v) => (v === null ? null : wholeNumber(v)), rejections)
  if (rehook.basis === 'observed' && typeof rehook.value === 'number') {
    const n = beats.basis === 'observed' ? beats.value.length : 0
    if (rehook.value >= n) {
      rejections.push({
        field: 'structure.rehookPosition',
        reason: 'out_of_range',
        saw: `index ${rehook.value} of ${n} beats`,
      })
      rehook = unchecked('the beats, which is what a position indexes into')
    }
  }

  let productsRequired = readField(
    requirements.productsRequired, 'requirements.productsRequired', at, wholeNumber, rejections)
  // ⚖️ THE COUNT AND THE SLOTS MUST AGREE, and where they do not the SLOTS WIN.
  // The slots are the primary observation — each one is a named hole the model
  // had to point at — while the count is a summary of them, and a summary that
  // disagrees with its own detail is the half that is wrong.
  if (productsRequired.basis === 'observed' && contentSlots.basis === 'observed') {
    const supplied = contentSlots.value.filter(
      (s) => s.kind === 'product' || s.kind === 'tool_or_software').length
    if (productsRequired.value > supplied) {
      rejections.push({
        field: 'requirements.productsRequired',
        reason: 'contradicts_slots',
        saw: `says ${productsRequired.value}, slots name ${supplied}`,
      })
      productsRequired = unchecked('a transcript or caption for this video')
    }
  }

  const profile: ReferenceContentProfile = {
    ...base,
    topic: readField(raw.topic, 'topic', at, nonEmptyString, rejections),
    subtopic: readField(raw.subtopic, 'subtopic', at, nonEmptyString, rejections),
    audience: {
      likelySegment: readField(
        audience.likelySegment, 'audience.likelySegment', at, nonEmptyString, rejections),
      sophistication: readField(
        audience.sophistication, 'audience.sophistication', at, oneOf(SOPHISTICATION), rejections),
    },
    likelyGoals: readField(raw.likelyGoals, 'likelyGoals', at, goalList, rejections),
    hook: {
      mechanism: readField(hook.mechanism, 'hook.mechanism', at, oneOf(HOOK_MECHANISMS), rejections),
      promise: readField(hook.promise, 'hook.promise', at, nonEmptyString, rejections),
    },
    structure: {
      containerType: readField(
        structure.containerType, 'structure.containerType', at, oneOf(CONTAINER_TYPES), rejections),
      beats,
      rehookPosition: rehook,
      payoffType: readField(
        structure.payoffType, 'structure.payoffType', at, oneOf(PAYOFF_TYPES), rejections),
      ctaMechanism: readField(
        structure.ctaMechanism, 'structure.ctaMechanism', at,
        oneOf([...CTA_MECHANISMS, 'implicit', 'none'] as const), rejections),
    },
    requirements: {
      contentSlots,
      personalExperienceRequired: readField(
        requirements.personalExperienceRequired, 'requirements.personalExperienceRequired', at,
        oneOf(REQUIREMENT), rejections),
      productsRequired,
      externalFactsRequired: readField(
        requirements.externalFactsRequired, 'requirements.externalFactsRequired', at,
        oneOf(REQUIREMENT), rejections),
    },
    transfer: {
      structureTransferability: oneOf(['high', 'medium', 'low'] as const)(transfer.structureTransferability)
        ?? 'not_checked',
      topicDependence: readField(
        transfer.topicDependence, 'transfer.topicDependence', at,
        oneOf(['low', 'medium', 'high'] as const), rejections),
      reasons: Array.isArray(transfer.reasons)
        ? transfer.reasons.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
        : [],
    },
    transcriptAvailable: ctx.transcriptAvailable,
  }

  const accepted = [
    profile.topic, profile.subtopic, profile.audience.likelySegment,
    profile.audience.sophistication, profile.likelyGoals, profile.hook.mechanism,
    profile.hook.promise, profile.structure.containerType, profile.structure.beats,
    profile.structure.rehookPosition, profile.structure.payoffType,
    profile.structure.ctaMechanism, profile.requirements.contentSlots,
    profile.requirements.personalExperienceRequired, profile.requirements.productsRequired,
    profile.requirements.externalFactsRequired, profile.transfer.topicDependence,
  ].filter((f) => f.basis === 'observed').length

  return { profile, rejections, fieldsAccepted: accepted }
}
