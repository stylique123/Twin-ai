// ⚠️ DERIVED FROM `packages/shared/src/visualExtraction.ts` AND THE VISUAL TYPES
// IN `packages/shared/src/referenceProfile.ts`. The worker has NO runtime
// dependency on @twinai/shared (the Docker build copies worker/ alone), so the
// rules that decide whether a visual claim is believable had to be copied — the
// same arrangement `referenceExtraction.ts` already lives under.
//
// ⚖️ PARITY IS ENFORCED BY TEST, character for character. If you are fixing a
// rule, fix the shared file and re-derive this one; a fix applied only here
// fails `referenceExtractionParity.test.ts`, which is the point. A copy without
// a parity check is how the rule quietly stops matching the rule the tests cover.

// WHAT TWIN SAW, READ WITH THE SAME SUSPICION AS WHAT TWIN HEARD.
//
// ⚠️ THE VISUAL PASS IS EASIER TO FAKE THAN THE CONTENT PASS, WHICH IS WHY THIS
// FILE IS STRICTER. A transcript at least constrains the content model — it can
// only lie about what a real sentence means. A model handed frames can produce
// "two people, changing locations, product in hand" from a static talking-head
// because those words go together, and every field looks equally certain in a
// database row afterwards.
//
// ── THE FOUR INVARIANTS, STATED SO THEY CAN BE ARGUED WITH ────────────────
//
//   1. NO EVIDENCE POINTER, NO CLAIM. Evidence lives INSIDE the observation, so
//      downstream code cannot read a visual claim without its proof.
//   2. `false` IS DATA; `null` IS ABSENCE OF KNOWLEDGE. Never a default.
//   3. FRAMES ARE RANGE-CHECKED AGAINST THE SAMPLE WE SENT, not against the
//      video's own frame universe. "frame 9" of a four-frame sample is the model
//      describing something it was never shown.
//   4. THE EVIDENCE MUST BE ABLE TO SUPPORT THE CLAIM CLASS. One still cannot
//      establish "changes location"; citing frame 3 for it is a citation that
//      passes while the claim is fiction.
//
// ⚖️ AND "NOTHING REQUIRED" IS A SUCCESSFUL ASSESSMENT, not an empty one. A video
// that needs no second person, no props and no location change is the case that
// lets the gallery say something IS recreatable — the only reason this pass
// earns its cost.
//
// ⚠️ NO FRAMES MEANS THE RESPONSE IS DISCARDED ENTIRELY. A visual model answering
// with nothing to look at is answering from the caption, and that is not
// degraded evidence — it is the WRONG EPISTEMIC SOURCE. Caption- and
// transcript-derived inference belongs to the content pass, which is built to
// weigh it.

/** ⚠️ `other_unsupported` IS A REAL MEMBER AND NOT A FALLBACK. A cinematic
 *  multi-camera piece is not a mode Twin can help somebody recreate, and saying
 *  so is more useful than filing it under the nearest supported thing. */
export const PRODUCTION_MODES = [
  'talking_head', 'walk_and_talk', 'pov_skit', 'review_comparison',
  'product_led', 'screen_software', 'podcast_interview', 'other_unsupported',
] as const
export type ProductionMode = (typeof PRODUCTION_MODES)[number]


/**
 * Everything Twin learned from LOOKING at the reference.
 *
 * ⚖️ THIS IS THE PASS-2 TARGET AND IT IS ENTIRELY UNASSESSED TODAY. It ships now,
 * empty, because the content pass needs somewhere to NOT put its findings — a
 * transcript that says "let me show you" is not a screen recording observed, and
 * without a separate home for the visual claim there is nowhere to draw that
 * line.
 */
/**
 * ⚠️ EVIDENCE IS PART OF THE FIELD, NOT METADATA BESIDE IT. An earlier draft put
 * the frame citation next to the claim, which is exactly how a claim gets read
 * without its proof: one destructuring, one `?? ` and the observation is loose
 * in the codebase with nothing attached. Making the value unreachable except
 * through the object that carries its frames means downstream code CANNOT
 * accidentally use a visual claim it has not been shown the basis for.
 */
export type FrameCitation = readonly [number] | readonly [number, number]

export interface VisualObservation<T> {
  value: T
  evidence: { frames: FrameCitation }
}

/**
 * ⚠️ WHAT A SINGLE STILL CAN AND CANNOT ESTABLISH. Without this, a model can cite
 * "frame 3" for "the creator walks toward the camera" — a claim no one frame can
 * support — and the citation check passes while the claim is fiction.
 *
 * ⚖️ `temporal` AND `transition` IMPOSE THE SAME ARITY TODAY, and the labels are
 * kept apart anyway because the CLAIMS differ and the checks will diverge the
 * moment frames carry timestamps: a transition needs two samples close enough
 * together for motion between them to be observable, and "changes location" does
 * not. Collapsing them now would mean re-deriving that distinction later from
 * field names, which is how a rule gets rebuilt wrong.
 */
export const CLAIM_CLASSES = ['static', 'temporal', 'transition'] as const
export type ClaimClass = (typeof CLAIM_CLASSES)[number]

/**
 * What the frames pass can answer.
 *
 * ⚠️ EVERY FIELD IS `VisualObservation<T> | null`, AND null MEANS NO KNOWLEDGE.
 * Not false, not "fine", not a default. A parser failure, a missing field and a
 * claim whose evidence did not support it all land here identically, because
 * they are the same fact downstream: we do not know.
 *
 * ⚖️ "NOTHING REQUIRED" IS A SUCCESSFUL ASSESSMENT, and it is the common case. A
 * `requirements.secondPerson` of `{ value: false, evidence: … }` is a real
 * finding that lets the gallery say a video IS recreatable — which is the only
 * reason this pass earns its cost.
 */
export interface ReferenceVisualProfile {
  primaryMode: VisualObservation<ProductionMode> | null
  people: {
    /** More than one person on camera is the single biggest recreation blocker
     *  for a solo creator, so it is its own field rather than folded into a
     *  score that can average it away. */
    count: VisualObservation<'one' | 'multiple'> | null
  }
  setting: {
    changes: VisualObservation<boolean> | null
    complexity: VisualObservation<'simple' | 'moderate' | 'complex'> | null
  }
  performance: {
    talkingHead: VisualObservation<boolean> | null
    walking: VisualObservation<boolean> | null
    acting: VisualObservation<boolean> | null
    productInteraction: VisualObservation<boolean> | null
    screenInteraction: VisualObservation<boolean> | null
  }
  camera: {
    framingChanges: VisualObservation<boolean> | null
    /** How close the framing is. Recorded ALONGSIDE performance.talkingHead,
     *  which stays deliberately loose about distance. */
    shotType: VisualObservation<'close' | 'medium' | 'wide'> | null
    positionChanges: VisualObservation<boolean> | null
  }
  requirements: {
    physicalProduct: VisualObservation<boolean> | null
    secondPerson: VisualObservation<boolean> | null
    multipleLocations: VisualObservation<boolean> | null
    unusualProps: VisualObservation<boolean> | null
  }
  // ── FOUR COUNTERS, BECAUSE "COMPLETED" AND "INFORMATIVE" ARE NOT THE SAME ──
  //
  // ⚠️ ONE `framesSampled: boolean` CONFLATED ALL OF THESE, and the conflation is
  // the bug: a pass that ran on four frames and could read nothing looks exactly
  // like a pass that ran well, and both look like a pass that never happened.
  /** The pass executed. Says nothing about what it learned. */
  visualPassRan: boolean
  /** How many frames the model was actually shown. `0` with `visualPassRan` true
   *  is a contradiction this type permits and `extractVisualProfile` never
   *  produces — no frames means the response is discarded. */
  framesSampled: number
  /** Fields that came back with a value AND evidence that supports it. */
  fieldsObserved: number
  /** Fields the response could not answer usably. Worth asking again. */
  fieldsUnreadable: number
  /** ⚖️ ASKED, AND THE FRAMES GENUINELY CANNOT SAY. Field paths the model
   *  explicitly reported as undeterminable. Separated from `fieldsUnreadable`
   *  because re-running these costs a call to reach the same nothing, and
   *  without the distinction the batch pays forever for questions already
   *  settled. */
  indeterminate: readonly string[]
}

export function emptyVisualProfile(): ReferenceVisualProfile {
  return {
    primaryMode: null,
    people: { count: null },
    setting: { changes: null, complexity: null },
    performance: {
      talkingHead: null,
      walking: null,
      acting: null,
      productInteraction: null,
      screenInteraction: null,
    },
    camera: { framingChanges: null, positionChanges: null, shotType: null },
    requirements: {
      physicalProduct: null,
      secondPerson: null,
      multipleLocations: null,
      unusualProps: null,
    },
    visualPassRan: false,
    framesSampled: 0,
    fieldsObserved: 0,
    fieldsUnreadable: 0,
    indeterminate: [],
  }
}

// ⚠️ THE SENTINEL AND THE REJECTION SHAPE COME FROM THE WORKER'S OWN COPY OF THE
// EXTRACTION RULES, NOT FROM A THIRD TRANSCRIPTION HERE. A first draft of this
// file re-declared `NOT_DETERMINED = 'not_determined'`; the real value is
// 'NOT_DETERMINED', and the difference is not cosmetic — the sentinel is what a
// model returns to say "the frames cannot answer this". A mismatched copy would
// have filed every honest refusal as a malformed answer, turning the schema's
// most useful response into a rejection statistic. Importing is what makes that
// class of error impossible rather than merely tested for.
import { NOT_DETERMINED, type Rejection } from './referenceExtraction.js'

export interface VisualExtractionResult {
  profile: ReferenceVisualProfile
  rejections: readonly Rejection[]
}

/**
 * Every field, with what a single still is allowed to establish about it.
 *
 * ⚠️ THE CLASSIFICATION IS THE LOAD-BEARING PART OF THIS FILE. `setting.changes`
 * as `static` would let one frame prove a location change; `people.count` as
 * `temporal` would reject a correct reading of a single frame. Both errors are
 * silent, so each entry is a decision rather than a default.
 */
export const VISUAL_FIELDS: readonly (readonly [string, ClaimClass])[] = [
  // A claim about the video as a whole — one frame cannot characterise it.
  ['primaryMode', 'temporal'],
  // "One person is visible" is exactly the user's worked example of static.
  ['people.count', 'static'],
  ['setting.changes', 'temporal'],
  ['setting.complexity', 'static'],
  ['performance.talkingHead', 'static'],
  // Movement. A still shows a person mid-stride; it does not show walking.
  ['performance.walking', 'transition'],
  ['performance.acting', 'temporal'],
  ['performance.productInteraction', 'static'],
  ['performance.screenInteraction', 'static'],
  ['camera.framingChanges', 'temporal'],
  ['camera.positionChanges', 'temporal'],
  // ⚠️ SEPARATELY TRACKED, NOT A REDEFINITION OF talkingHead. talkingHead stays
  // loose ("talking towards the camera, at ANY distance") and shotType records
  // the distance alongside it, so a later reader can ask "how would a
  // close-up-only definition have scored?" WITHOUT re-running anything. Folding
  // distance into talkingHead instead would have destroyed the looser reading.
  // `static` because it describes the framing of the frame being cited, exactly
  // like setting.complexity.
  ['camera.shotType', 'static'],
  // Requirements are about what must EXIST, and one frame can show a thing.
  ['requirements.physicalProduct', 'static'],
  ['requirements.secondPerson', 'static'],
  ['requirements.multipleLocations', 'temporal'],
  ['requirements.unusualProps', 'static'],
] as const
export const VISUAL_FIELD_COUNT = VISUAL_FIELDS.length

const brief = (v: unknown): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return (s ?? 'undefined').slice(0, 80)
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Read a frame citation, or refuse.
 *
 * ⚠️ RANGE-CHECKED AGAINST `framesSampled` — THE EXACT SAMPLE SENT. The model is
 * shown N frames and numbers them 1..N; anything outside that is a description
 * of a video it did not see. Checking against the source video's real frame
 * count would accept exactly the hallucination this exists to catch.
 *
 * ⚖️ AND ORDER IS PART OF VALIDITY. `[4, 2]` is not a range, it is a response
 * that has stopped tracking what it is describing.
 */
export function readCitation(raw: unknown, framesSampled: number): FrameCitation | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) return null
  const nums = raw.map((n) => (typeof n === 'number' && Number.isInteger(n) ? n : null))
  if (nums.some((n) => n === null)) return null
  const ns = nums as number[]
  if (ns.some((n) => n < 1 || n > framesSampled)) return null
  if (ns.length === 1) return [ns[0]] as const
  if (ns[1] <= ns[0]) return null
  return [ns[0], ns[1]] as const
}

/** ⚠️ CAN THIS CITATION CARRY THIS KIND OF CLAIM? A single frame cannot show a
 *  change, and a change is what `temporal` and `transition` both assert. */
export function citationSupports(cls: ClaimClass, frames: FrameCitation): boolean {
  if (cls === 'static') return true
  return frames.length === 2
}

/** ⚠️ BOXED. `{ v: false }` is an answer; `null` is a failure to read one. The
 *  collision between those two cost 15 wrongly-rejected fields in the content
 *  pass, and `false` is the most common CORRECT answer in this schema. */
type Parsed<T> = { v: T } | null

const asBoolean = (v: unknown): Parsed<boolean> => (typeof v === 'boolean' ? { v } : null)
const oneOf = <T extends string>(vocab: readonly T[]) => (v: unknown): Parsed<T> =>
  typeof v === 'string' && (vocab as readonly string[]).includes(v) ? { v: v as T } : null

const PARSERS: Record<string, (v: unknown) => Parsed<unknown>> = {
  'primaryMode': oneOf(PRODUCTION_MODES),
  'people.count': oneOf(['one', 'multiple'] as const),
  'setting.complexity': oneOf(['simple', 'moderate', 'complex'] as const),
  'camera.shotType': oneOf(['close', 'medium', 'wide'] as const),
}
const parserFor = (path: string) => PARSERS[path] ?? asBoolean

interface FieldOutcome {
  observation: VisualObservation<unknown> | null
  /** Asked, and the frames genuinely cannot say. Not worth asking again. */
  settled: boolean
}

function readField(
  raw: unknown,
  path: string,
  cls: ClaimClass,
  framesSampled: number,
  rejections: Rejection[],
): FieldOutcome {
  const miss = (reason: Rejection['reason'], saw: unknown): FieldOutcome => {
    rejections.push({ field: path, reason, saw: brief(saw) })
    return { observation: null, settled: false }
  }
  if (raw === undefined || raw === null) return miss('missing', raw)
  if (raw === NOT_DETERMINED) return { observation: null, settled: true }
  if (!isRecord(raw)) return miss('wrong_type', raw)
  // ⚖️ AN EXPLICIT "THE FRAMES CANNOT SAY" IS A FINDING, and it retires the
  // question. It is NOT a rejection: nothing was malformed.
  if (raw.value === NOT_DETERMINED) return { observation: null, settled: true }

  const parsed = parserFor(path)(raw.value)
  if (parsed === null) return miss('not_in_vocabulary', raw.value)

  const ev = raw.evidence
  if (!isRecord(ev)) return miss('no_evidence', ev)
  const frames = readCitation(ev.frames, framesSampled)
  if (frames === null) return miss('no_evidence', ev.frames)
  // ⚠️ THE CHECK THAT SEPARATES OBSERVATION FROM FAN FICTION.
  if (!citationSupports(cls, frames)) return miss('out_of_range', ev.frames)

  return { observation: { value: parsed.v, evidence: { frames } }, settled: false }
}

/**
 * Turn one visual response into a profile.
 *
 * ⚠️ RETURNS THE EMPTY PROFILE WHEN NO FRAMES WERE SAMPLED, WITHOUT READING THE
 * RESPONSE. See the header: an answer produced from no frames is not weak
 * visual evidence, it is content-pass evidence wearing the wrong label, and
 * admitting it here would make `visualPassRan` mean nothing.
 */
export function extractVisualProfile(
  raw: unknown,
  opts: { framesSampled: number },
): VisualExtractionResult {
  const framesSampled = Math.max(0, Math.trunc(opts.framesSampled))
  const rejections: Rejection[] = []

  if (framesSampled === 0) return { profile: emptyVisualProfile(), rejections }
  if (!isRecord(raw)) {
    rejections.push({ field: 'response', reason: 'wrong_type', saw: brief(raw) })
    return {
      profile: { ...emptyVisualProfile(), visualPassRan: true, framesSampled, fieldsUnreadable: VISUAL_FIELD_COUNT },
      rejections,
    }
  }

  const observations = new Map<string, VisualObservation<unknown> | null>()
  const settled: string[] = []
  for (const [path, cls] of VISUAL_FIELDS) {
    let cur: unknown = raw
    for (const part of path.split('.')) cur = isRecord(cur) ? cur[part] : undefined
    const out = readField(cur, path, cls, framesSampled, rejections)
    observations.set(path, out.observation)
    if (out.settled) settled.push(path)
  }
  const get = <T>(path: string) => observations.get(path) as VisualObservation<T> | null

  const observed = [...observations.values()].filter((o) => o !== null).length
  const profile: ReferenceVisualProfile = {
    primaryMode: get<ProductionMode>('primaryMode'),
    people: { count: get<'one' | 'multiple'>('people.count') },
    setting: {
      changes: get<boolean>('setting.changes'),
      complexity: get<'simple' | 'moderate' | 'complex'>('setting.complexity'),
    },
    performance: {
      talkingHead: get<boolean>('performance.talkingHead'),
      walking: get<boolean>('performance.walking'),
      acting: get<boolean>('performance.acting'),
      productInteraction: get<boolean>('performance.productInteraction'),
      screenInteraction: get<boolean>('performance.screenInteraction'),
    },
    camera: {
      framingChanges: get<boolean>('camera.framingChanges'),
      positionChanges: get<boolean>('camera.positionChanges'),
      shotType: get<'close' | 'medium' | 'wide'>('camera.shotType'),
    },
    requirements: {
      physicalProduct: get<boolean>('requirements.physicalProduct'),
      secondPerson: get<boolean>('requirements.secondPerson'),
      multipleLocations: get<boolean>('requirements.multipleLocations'),
      unusualProps: get<boolean>('requirements.unusualProps'),
    },
    // ⚖️ TRUE BECAUSE FRAMES WERE LOOKED AT, REGARDLESS OF WHAT WAS LEARNED.
    visualPassRan: true,
    framesSampled,
    fieldsObserved: observed,
    fieldsUnreadable: rejections.filter((r) => r.field !== 'response').length,
    indeterminate: settled,
  }
  return { profile, rejections }
}

// ── WHAT THE GALLERY IS ALLOWED TO SAY ────────────────────────────────────

export const BLOCKER_CODES = [
  'requires_second_person', 'requires_multiple_locations',
  'requires_unusual_props', 'requires_physical_product',
] as const
export type BlockerCode = (typeof BLOCKER_CODES)[number]

export interface RecreationBlocker {
  blocker: BlockerCode
  /** ⚠️ PLAIN ENGLISH, CARRIED WITH THE BLOCKER RATHER THAN LOOKED UP LATER. A
   *  surface that maps a code to a sentence at render time is a surface that
   *  will one day invent a rationale the evidence never supported. */
  because: string
  /** The frames that established it, so the claim stays checkable at the point
   *  a creator reads it. */
  evidence: { frames: FrameCitation }
}

const BECAUSE: Record<BlockerCode, string> = {
  requires_second_person: 'Someone else has to be on camera.',
  requires_multiple_locations: 'It moves between places.',
  requires_unusual_props: 'It needs props you may not have.',
  requires_physical_product: 'You need the product in your hands.',
}

/**
 * ⚠️ `null` MEANS UNASSESSED; `[]` MEANS ASSESSED AND NOTHING FOUND. Those are
 * different sentences on a card — "we have not looked at this yet" and "you can
 * make this" — and 97% of the library is currently the first. Collapsing them
 * would have the gallery promise something nobody checked.
 */
export function recreationBlockers(v: ReferenceVisualProfile): readonly RecreationBlocker[] | null {
  if (!v.visualPassRan) return null
  const out: RecreationBlocker[] = []
  const add = (blocker: BlockerCode, o: VisualObservation<unknown> | null, hit: boolean) => {
    if (o !== null && hit && !out.some((b) => b.blocker === blocker)) {
      out.push({ blocker, because: BECAUSE[blocker], evidence: o.evidence })
    }
  }
  // ⚖️ TWO FIELDS CAN ESTABLISH THE SAME BLOCKER, and it is stated once. The
  // count on screen is "what stops me", not "how many ways we detected it".
  add('requires_second_person', v.people.count, v.people.count?.value === 'multiple')
  add('requires_second_person', v.requirements.secondPerson, v.requirements.secondPerson?.value === true)
  add('requires_multiple_locations', v.requirements.multipleLocations, v.requirements.multipleLocations?.value === true)
  add('requires_unusual_props', v.requirements.unusualProps, v.requirements.unusualProps?.value === true)
  add('requires_physical_product', v.requirements.physicalProduct, v.requirements.physicalProduct?.value === true)
  return out
}
