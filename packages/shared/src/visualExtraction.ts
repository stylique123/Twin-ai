// WHAT TWIN SAW, READ WITH THE SAME SUSPICION AS WHAT TWIN HEARD.
//
// ⚠️ THE VISUAL PASS IS EASIER TO FAKE THAN THE CONTENT PASS, WHICH IS WHY THIS
// FILE IS STRICTER. A transcript at least constrains the content model — it can
// only lie about what a real sentence means. A model handed frames can produce
// "two people, changing locations, product in hand" from a static talking-head
// because those words go together, and every field will look equally certain in
// the database afterwards.
//
// ⚖️ SO EVIDENCE HERE MUST NAME A FRAME. The content pass requires a quote; the
// visual pass requires "frame 3" or "frames 2–5". Free prose like "the video
// shows" is exactly what a model produces when it is generalising rather than
// looking, and accepting it would make `basis: 'observed'` mean nothing on half
// the rows in the table.
//
// ── TWO LESSONS FROM THE CONTENT PASS, BUILT IN RATHER THAN RETROFITTED ────
//
// ⚠️ FIRST: A LEGAL ANSWER MUST NOT COLLIDE WITH A REJECTION SIGNAL. In
// `referenceExtraction`, `null` was both "no re-hook" and "this field failed to
// parse", and 15 of 35 rejections turned out to be the model being right. Every
// parser here returns a BOXED result — `{ v: T } | null` — so "the answer is
// false" and "I could not read this" can never be the same value.
//
// ⚠️ SECOND: AN EMPTY ANSWER CAN BE THE TRUE ANSWER. `contentSlots: []` was
// rejected as malformed when it was a correct observation about a video that
// needs nothing supplied. `requirements` here is the same shape: a video that
// requires nothing is the COMMON case, not a broken response.
//
// ── WHAT THIS PASS IS FOR ─────────────────────────────────────────────────
//
// ⚖️ ONE QUESTION: CAN THIS CREATOR PHYSICALLY SHOOT THIS? Not "is it good", not
// "will it perform". A second person on camera and a location change are hard
// blockers for a solo creator with a phone, and they are the reason the gallery
// can honestly refuse a card instead of recommending a video nobody can make.

import type { Assessed } from './assessed'
import { unchecked, indeterminate } from './assessed'
import {
  PRODUCTION_MODES, emptyVisualProfile,
  type ProductionMode, type ReferenceVisualProfile,
} from './referenceProfile'
import { NOT_DETERMINED, type Rejection } from './referenceExtraction'

export interface VisualExtractionResult {
  profile: ReferenceVisualProfile
  rejections: readonly Rejection[]
  fieldsAccepted: number
  /** ⚠️ SEPARATE FROM `fieldsAccepted`, AND NOT DERIVABLE FROM IT. Zero accepted
   *  fields from four frames is a model that could not read them; zero from no
   *  frames is a pass that never ran. `framesSampled` on the profile carries the
   *  same distinction downstream. */
  framesSeen: number
}

/** Every field this pass can answer, named once so a caller cannot silently
 *  drift from the count a report is divided by. */
export const VISUAL_FIELDS = [
  'primaryMode',
  'people.count',
  'setting.changes', 'setting.complexity',
  'performance.talkingHead', 'performance.walking', 'performance.acting',
  'performance.productInteraction', 'performance.screenInteraction',
  'camera.framingChanges', 'camera.positionChanges',
  'requirements.physicalProduct', 'requirements.secondPerson',
  'requirements.multipleLocations', 'requirements.unusualProps',
] as const
export const VISUAL_FIELD_COUNT = VISUAL_FIELDS.length

const brief = (v: unknown): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return (s ?? 'undefined').slice(0, 80)
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * ⚠️ EVIDENCE MUST POINT AT A FRAME. `frame 3`, `frames 2-5`, `f4` — a citation
 * a human can go and check. Prose that never names one is the shape of a guess,
 * and the whole value of `basis: 'observed'` is that somebody could verify it.
 *
 * ⚖️ THE INDEX IS RANGE-CHECKED AGAINST WHAT WE ACTUALLY SENT. "frame 9" from a
 * four-frame sample is a model describing a video it was not shown — the visual
 * equivalent of a rehook pointing at a beat that does not exist.
 */
export function framesCited(evidence: string, framesSeen: number): number[] {
  const out: number[] = []
  const re = /\b(?:frames?|f)\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/gi
  for (const m of evidence.matchAll(re)) {
    const a = Number(m[1])
    const b = m[2] === undefined ? a : Number(m[2])
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) continue
    for (let i = a; i <= b; i++) {
      if (i >= 1 && i <= framesSeen && !out.includes(i)) out.push(i)
    }
  }
  return out.sort((x, y) => x - y)
}

/** ⚠️ BOXED. `{ v: false }` is an answer; `null` is a failure to read one. The
 *  bug this shape prevents cost 15 wrongly-rejected fields in the content pass. */
type Parsed<T> = { v: T } | null

const asBoolean = (v: unknown): Parsed<boolean> =>
  typeof v === 'boolean' ? { v } : null

const oneOf = <T extends string>(vocab: readonly T[]) => (v: unknown): Parsed<T> =>
  typeof v === 'string' && (vocab as readonly string[]).includes(v) ? { v: v as T } : null

const asMode = oneOf(PRODUCTION_MODES)
const asCount = oneOf(['one', 'multiple'] as const)
const asComplexity = oneOf(['simple', 'moderate', 'complex'] as const)

const NEEDS = 'a visual pass over sampled frames of the video'

/**
 * Read one visually-assessed field.
 *
 * ⚠️ A REJECTED FIELD LANDS ON `not_checked`, NEVER `indeterminate`. The second
 * means "we looked and the frames cannot tell you", which retires the question
 * and stops us paying to ask again. A malformed response has not looked at
 * anything, and filing it as finished would lose the field permanently.
 */
function readVisualField<T>(
  raw: unknown,
  field: string,
  assessedAt: string,
  framesSeen: number,
  parse: (v: unknown) => Parsed<T>,
  rejections: Rejection[],
): Assessed<T> {
  if (raw === undefined || raw === null) {
    rejections.push({ field, reason: 'missing', saw: brief(raw) })
    return unchecked(NEEDS)
  }
  if (raw === NOT_DETERMINED) return indeterminate(`model reported ${NOT_DETERMINED}`, assessedAt)
  if (!isRecord(raw)) {
    rejections.push({ field, reason: 'wrong_type', saw: brief(raw) })
    return unchecked(NEEDS)
  }
  if (raw.value === NOT_DETERMINED) {
    const ev = typeof raw.evidence === 'string' ? raw.evidence : `model reported ${NOT_DETERMINED}`
    return indeterminate(ev, assessedAt)
  }
  const parsed = parse(raw.value)
  if (parsed === null) {
    rejections.push({ field, reason: 'not_in_vocabulary', saw: brief(raw.value) })
    return unchecked(NEEDS)
  }
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : ''
  if (evidence.length === 0) {
    rejections.push({ field, reason: 'no_evidence', saw: brief(raw.value) })
    return unchecked(NEEDS)
  }
  // ⚠️ THE CHECK THAT MAKES THIS PASS DIFFERENT FROM THE CONTENT PASS.
  const cited = framesCited(evidence, framesSeen)
  if (cited.length === 0) {
    rejections.push({ field, reason: 'no_evidence', saw: brief(evidence) })
    return unchecked(NEEDS)
  }
  return { value: parsed.v, basis: 'observed', evidence, assessedAt }
}

/**
 * Turn one visual response into a profile.
 *
 * ⚠️ RETURNS THE EMPTY PROFILE WHEN NO FRAMES WERE SAMPLED, and does not read
 * the response at all. A model that answers without being shown anything is
 * answering from the caption, and that belongs to the content pass or to
 * nobody — laundering it into `observed` here is the exact confusion the two
 * profiles were split apart to prevent.
 */
export function extractVisualProfile(
  raw: unknown,
  opts: { assessedAt: string; framesSeen: number },
): VisualExtractionResult {
  const { assessedAt, framesSeen } = opts
  const rejections: Rejection[] = []
  const empty = emptyVisualProfile()

  if (framesSeen <= 0 || !isRecord(raw)) {
    if (framesSeen > 0) rejections.push({ field: 'response', reason: 'wrong_type', saw: brief(raw) })
    return { profile: empty, rejections, fieldsAccepted: 0, framesSeen: Math.max(0, framesSeen) }
  }

  const at = <T>(path: string, parse: (v: unknown) => Parsed<T>): Assessed<T> => {
    let cur: unknown = raw
    for (const part of path.split('.')) {
      cur = isRecord(cur) ? cur[part] : undefined
    }
    return readVisualField(cur, path, assessedAt, framesSeen, parse, rejections)
  }

  const profile: ReferenceVisualProfile = {
    primaryMode: at<ProductionMode>('primaryMode', asMode),
    people: { count: at('people.count', asCount) },
    setting: {
      changes: at('setting.changes', asBoolean),
      complexity: at('setting.complexity', asComplexity),
    },
    performance: {
      talkingHead: at('performance.talkingHead', asBoolean),
      walking: at('performance.walking', asBoolean),
      acting: at('performance.acting', asBoolean),
      productInteraction: at('performance.productInteraction', asBoolean),
      screenInteraction: at('performance.screenInteraction', asBoolean),
    },
    camera: {
      framingChanges: at('camera.framingChanges', asBoolean),
      positionChanges: at('camera.positionChanges', asBoolean),
    },
    requirements: {
      physicalProduct: at('requirements.physicalProduct', asBoolean),
      secondPerson: at('requirements.secondPerson', asBoolean),
      multipleLocations: at('requirements.multipleLocations', asBoolean),
      unusualProps: at('requirements.unusualProps', asBoolean),
    },
    // ⚖️ TRUE BECAUSE FRAMES WERE LOOKED AT, REGARDLESS OF WHAT WAS LEARNED. It
    // records that the pass RAN. A video whose every field was rejected has still
    // been sampled, and re-queueing it belongs to `worthChecking`, not to a flag
    // that quietly means "went well".
    framesSampled: true,
  }

  const accepted = VISUAL_FIELD_COUNT - rejections.filter((r) => r.field !== 'response').length
  return { profile, rejections, fieldsAccepted: Math.max(0, accepted), framesSeen }
}

/**
 * ⚠️ THE ONE ANSWER THE GALLERY ACTUALLY ACTS ON. A second person on camera or a
 * location change is a hard blocker for a solo creator with a phone, and this is
 * how a card can honestly say so.
 *
 * ⚖️ IT REFUSES TO GUESS FROM SILENCE. An unassessed video blocks nobody —
 * `null` means "we have not looked", which the caller must not read as "fine".
 * Treating unknown as safe is how 97% of an unassessed library would start
 * making promises nobody checked.
 */
export function recreationBlockers(v: ReferenceVisualProfile): readonly string[] | null {
  if (!v.framesSampled) return null
  const out: string[] = []
  const on = (a: Assessed<boolean>) => a.basis === 'observed' && a.value === true
  if (v.people.count.basis === 'observed' && v.people.count.value === 'multiple') {
    out.push('Someone else has to be on camera.')
  } else if (on(v.requirements.secondPerson)) {
    out.push('Someone else has to be on camera.')
  }
  if (on(v.requirements.multipleLocations)) out.push('It moves between places.')
  if (on(v.requirements.unusualProps)) out.push('It needs props you may not have.')
  if (on(v.requirements.physicalProduct)) out.push('You need the product in your hands.')
  return out
}
