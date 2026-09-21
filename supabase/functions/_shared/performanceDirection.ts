// GENERATED FROM packages/shared/src/script/performanceDirection.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// WHAT THE CREATOR DOES WITH HER HANDS, CHOSEN RATHER THAN INVENTED.
//
// ⚠️ THE FIELD ALREADY EXISTS AND IS ALREADY WRONG. `action_posing` is asked for
// in free text with two generic examples, and it produced, for a creator selling
// a MEAL-PREP SERVICE, the direction "Hold a clean glass of water in one hand".
// A prop she does not sell, invented because the instruction had nothing real to
// draw on and a blank is not an option the model will take. This is not a
// missing field; it is an unconstrained one.
//
// ⚖️ SO THE FIX IS A CLOSED SET, NOT A BETTER ADJECTIVE. Every cue is picked
// from a fixed taxonomy, narrowed by facts already stored on `product_entities`
// — and when those facts say the product cannot be shown, the correct number of
// product-handling cues is ZERO. That case is the glass of water.
//
// ⚖️ AND THE COMPETITORS' MECHANISM DOES NOT TRANSFER, WHICH IS WHY THIS IS
// TEXT. Nextify and MakeUGC pick a MODE and a video model synthesises the hand
// motion; nothing is ever written down because no human is being directed.
// TwinAI's output is instructions for a real person in her own kitchen, so the
// direction has to survive as words she can read.

/** What kind of thing is being sold. Mirrors `product_entities.type`. */
export type ProductKind =
  | 'PHYSICAL_PRODUCT' | 'DIGITAL_PRODUCT' | 'SAAS' | 'SERVICE' | 'OTHER'

/** Whether it can appear on camera at all. Mirrors `product_entities.showability`. */
export type Showability = 'ALWAYS' | 'SOMETIMES' | 'NEVER' | 'UNKNOWN'

/** What the object physically IS, when a photo has been read. Narrows the set:
 *  a jar twists, a garment is worn, a card sits flat on an open palm. */
export type ObjectShape =
  | 'jar' | 'bottle' | 'tube' | 'bag' | 'box' | 'flat' | 'garment' | 'device' | 'food' | 'unknown'

/** The industry-converged UGC formats. Same five recur across every competitor
 *  surveyed, so they are the vocabulary the category already reads in — used as
 *  the top-level frame before drilling into a specific action. */
export const NAMED_FORMATS = [
  'Talking Review', 'Product in Hand', 'Unboxing POV', 'App Showcase', 'B-Roll Showcase',
] as const
export type NamedFormat = (typeof NAMED_FORMATS)[number]

export interface DirectionOption {
  readonly id: string
  /** What the creator actually does, in her language. */
  readonly does: string
  /** When this one is the right choice. */
  readonly bestFor: string
}

/** Physical handling. Only ever offered when the product can be shown. */
export const PHYSICAL_ACTIONS: readonly DirectionOption[] = [
  { id: 'hold_up', does: 'Hold it up to chest height, steady, label facing the lens', bestFor: 'The default. Almost any beat that names the product.' },
  { id: 'rotate', does: 'Turn it slowly to show another side', bestFor: 'Printed information, a seam, a texture worth seeing.' },
  { id: 'twist_open', does: 'Twist the cap off / unzip it / flip the lid', bestFor: 'Anything with a closure — and only if it HAS one.' },
  { id: 'point_at', does: 'Point one finger at a specific spot on it', bestFor: 'A detail the viewer would otherwise miss.' },
  { id: 'demonstrate', does: 'Use it the way it is meant to be used — pump, pour, apply, wear, click', bestFor: 'Anything with an action verb built into how it works.' },
  { id: 'unbox', does: 'Box, then packaging, then the item — in that order', bestFor: 'First-impression and what-is-inside beats.' },
  { id: 'set_down', does: 'Put it down deliberately and look back at the lens', bestFor: 'Marks the turn from showing to talking.' },
  { id: 'compare', does: 'Hold the two things side by side', bestFor: 'Before-and-after, old vs new, this vs the cheap one.' },
  { id: 'palm', does: 'Rest it flat on an open palm', bestFor: 'Small things — jewellery, a card, a small tool.' },
]

/** Screen handling, for products that live on a screen. */
export const SCREEN_DIRECTIONS: readonly DirectionOption[] = [
  { id: 'point_camera_at', does: 'Point the camera at a NAMED part of the screen', bestFor: 'One specific thing worth seeing — name it.' },
  { id: 'screen_record', does: 'Screen-record and talk over it', bestFor: 'Walkthroughs and how-it-works beats.' },
  { id: 'scroll_to', does: 'Scroll deliberately to a NAMED section', bestFor: 'Something further down the page.' },
  { id: 'click_through', does: 'Click through a NAMED flow', bestFor: 'Signup, checkout, one feature end to end.' },
  { id: 'cut_face_screen_face', does: 'Cut face → screen → face', bestFor: 'Keeps a UGC feel; stops it becoming a flat screencast.' },
]

/** No product in shot at all. The ONLY set available when nothing can be shown.
 *  ⚠️ THIS LIST IS WHY THE GLASS OF WATER CANNOT COME BACK: a service beat now
 *  has real options, so the model is not choosing between inventing a prop and
 *  leaving the field blank. */
export const SELF_DIRECTIONS: readonly DirectionOption[] = [
  { id: 'lean_in', does: 'Lean in toward the lens and hold eye contact', bestFor: 'The line you most want believed.' },
  { id: 'count_fingers', does: 'Count the points off on your fingers', bestFor: 'Two or three things in a row.' },
  { id: 'open_hands', does: 'Open both hands, palms up', bestFor: 'Making something sound simple or obvious.' },
  { id: 'step_back', does: 'Step back and let your hands drop', bestFor: 'Releasing tension after the hard part.' },
  { id: 'still', does: 'Stop moving entirely and just say it', bestFor: 'A single sentence that should land on its own.' },
  { id: 'gesture_offscreen', does: 'Gesture off-camera toward the thing you are naming', bestFor: 'Referring to something real that is not in shot.' },
]

/** Shape narrows the physical set — a bag has no cap to twist, a flat card has
 *  nothing to rotate. Absent shape means "do not narrow", never "none apply". */
const SHAPE_ACTIONS: Readonly<Record<ObjectShape, readonly string[]>> = {
  jar: ['hold_up', 'rotate', 'twist_open', 'demonstrate', 'point_at', 'set_down'],
  bottle: ['hold_up', 'rotate', 'twist_open', 'demonstrate', 'point_at', 'set_down'],
  tube: ['hold_up', 'twist_open', 'demonstrate', 'point_at', 'set_down'],
  bag: ['hold_up', 'rotate', 'twist_open', 'point_at', 'demonstrate', 'set_down'],
  box: ['hold_up', 'rotate', 'unbox', 'point_at', 'set_down'],
  flat: ['palm', 'hold_up', 'point_at', 'rotate'],
  garment: ['hold_up', 'demonstrate', 'rotate', 'point_at', 'compare'],
  device: ['hold_up', 'demonstrate', 'point_at', 'rotate', 'set_down'],
  food: ['hold_up', 'demonstrate', 'point_at', 'compare', 'set_down'],
  unknown: PHYSICAL_ACTIONS.map((a) => a.id),
}

export interface DirectionContext {
  readonly kind?: ProductKind | null
  readonly showability?: Showability | null
  /** From a product photo, when one was read. Overrides the category default. */
  readonly shape?: ObjectShape | null
  /** Named sections actually FOUND on the product's own pages. Never guessed. */
  readonly sections?: readonly string[] | null
}

export interface DirectionSet {
  readonly format: NamedFormat
  readonly options: readonly DirectionOption[]
  /** Sections the writer may name. Empty means it may name none. */
  readonly nameableSections: readonly string[]
  /** Why this set and not another — rendered into the prompt so the rule is
   *  visible to the model rather than implied by the contents of a list. */
  readonly because: string
}

const byId = (pool: readonly DirectionOption[], ids: readonly string[]): readonly DirectionOption[] =>
  pool.filter((o) => ids.includes(o.id))

/**
 * The whole decision, in one place: which cues may be offered for this product.
 *
 * ⚖️ MOST SPECIFIC SOURCE WINS — shape (a photo was read) beats kind (a category
 * was stored) beats nothing. And `showability` is a GATE rather than another
 * signal: NEVER means no amount of category knowledge licenses a prop.
 */
export function directionsFor(ctx: DirectionContext): DirectionSet {
  const kind = ctx.kind ?? null
  const showability = ctx.showability ?? 'UNKNOWN'
  const sections = (ctx.sections ?? []).filter((s) => typeof s === 'string' && s.trim() !== '')

  // ⚠️ THE GATE, AND THE GLASS OF WATER. A product recorded as never showable
  // gets NO handling cue — not a softened one, not a generic one. Seven of the
  // products in production are services marked NEVER.
  if (showability === 'NEVER') {
    return {
      format: 'Talking Review',
      options: SELF_DIRECTIONS,
      nameableSections: sections,
      because: 'This product is recorded as never showable on camera, so there is nothing '
        + 'to hold and no screen to point at. Direct the body and the face only. Never '
        + 'invent a prop to fill the gap — that is how a meal-prep creator was once told '
        + 'to hold a glass of water.',
    }
  }

  const onScreen = kind === 'SAAS' || kind === 'DIGITAL_PRODUCT'
  if (onScreen) {
    // ⚠️ A SCREEN CUE THAT NAMES NOTHING REAL IS THE SAME BUG IN A DIFFERENT
    // COSTUME. Without a section map, "show the dashboard" is a guess about a
    // page nobody read, so the screen options are withheld entirely.
    if (!sections.length) {
      return {
        format: 'Talking Review',
        options: SELF_DIRECTIONS,
        nameableSections: [],
        because: 'This is a screen product, but NO named sections were extracted from its '
          + 'own pages. Directing the creator to show a "dashboard" or a "pricing table" '
          + 'nobody confirmed exists is an invention. Direct the body and face only until '
          + 'a section map exists.',
      }
    }
    return {
      format: 'App Showcase',
      options: SCREEN_DIRECTIONS,
      nameableSections: sections,
      because: 'This is a screen product and these sections were actually found on its own '
        + 'pages. Name ONLY these. Any other screen you name is one nobody confirmed.',
    }
  }

  const allowed = SHAPE_ACTIONS[ctx.shape ?? 'unknown'] ?? SHAPE_ACTIONS.unknown
  const options = byId(PHYSICAL_ACTIONS, allowed)
  const shaped = ctx.shape && ctx.shape !== 'unknown'
  return {
    format: shaped || kind === 'PHYSICAL_PRODUCT' ? 'Product in Hand' : 'Talking Review',
    options: options.length ? options : SELF_DIRECTIONS,
    nameableSections: sections,
    because: shaped
      ? `A product photo was read and it is a ${ctx.shape}. These are the actions that make `
        + 'physical sense for that shape — a bag has no cap to twist, a flat card has no side to turn.'
      : showability === 'SOMETIMES'
        ? 'This product can sometimes be shown, so a handling cue is allowed but should not '
          + 'carry every beat. Mix in body and face direction.'
        : 'No product photo was read, so the full physical set is offered. Prefer the plainest '
          + 'action that fits the sentence, and never describe a part you have not been told exists.',
  }
}

/** The prompt block. Rendered next to the existing `action_posing` instruction. */
export function renderDirectionGuidance(ctx: DirectionContext): string {
  const set = directionsFor(ctx)
  const lines = set.options.map((o) => `  - ${o.id}: ${o.does} — ${o.bestFor}`)
  const sections = set.nameableSections.length
    ? `\nSECTIONS YOU MAY NAME (these were actually found; naming any other is an invention):\n`
      + set.nameableSections.map((s) => `  - ${s}`).join('\n')
    : ''
  return [
    `PHYSICAL DIRECTION — CHOOSE, DO NOT INVENT.`,
    `Format for this product: ${set.format}.`,
    `Why this set: ${set.because}`,
    `For every beat's action_posing, pick ONE id from this list and write ONLY the direction`,
    `in the creator's own words. NEVER write the id itself — "hold_up:" is a key for choosing,`,
    `not something a person can do. If none of them fits the sentence, use the plainest one`,
    `rather than inventing a prop, a gesture or a screen that is not listed.`,
    `And "it" below is a BLANK, not a word to copy: name the actual thing in their hands`,
    `("the cracked tin", "the finished candle"), because "point at a specific spot on it" tells`,
    `a creator holding three objects nothing at all.`,
    ...lines,
    sections,
  ].filter(Boolean).join('\n')
}

// ── THE MENU LEAKED ONTO THE CREATOR'S SCREEN ───────────────────────────────
//
// ⚠️⚠️ MEASURED 2026-09-21 across all 154 stored generations. Five beats — one
// whole run of three, all on 2026-09-20 — shipped `action_posing` values that
// begin with the taxonomy's own key:
//
//   "hold_up: Hold it up to chest height, steady, label facing the lens."
//   "point_at: Point one finger at a specific spot on it to highlight..."
//   "set_down: Put it down deliberately and look back at the lens."
//
// `renderDirectionGuidance` prints the menu as `- <id>: <does> — <bestFor>` and
// asks the writer to "pick ONE id from this list and write it in the creator's
// own words". Sometimes it writes the id too. An internal enum key is not a
// direction a person can act on, and it appears under a heading that promises
// one.
//
// ⚖️ STRIPPED RATHER THAN RE-PROMPTED, AND BOTH. A prompt can always drift
// back; a pure function at the boundary cannot. The guidance below is also
// clearer now, which should lower the rate — but this is what makes the rate
// irrelevant.
//
// ⚠️ THE PREFIX MUST LOOK LIKE A KEY AND NOTHING ELSE. "Hold it up: label to
// the lens" is a real sentence a director would write, and its first word is
// not an id. Matching only lowercase `snake_case` with no spaces, and only when
// it is one of the ids this module actually defines, is what keeps a legitimate
// clause from being eaten.
const DIRECTION_IDS: ReadonlySet<string> = new Set(
  [...PHYSICAL_ACTIONS, ...SCREEN_DIRECTIONS, ...SELF_DIRECTIONS].map((d) => d.id),
)

/**
 * `action_posing` as a creator should read it: the direction, never the key
 * that selected it.
 *
 * ⚖️ IDEMPOTENT, and safe on text that never leaked — which is the overwhelming
 * majority. A value with no key prefix is returned trimmed and otherwise
 * untouched.
 */
export function cleanActionPosing(text: unknown): string {
  const s = typeof text === 'string' ? text.trim() : ''
  if (s === '') return ''
  const m = /^([a-z][a-z0-9_]*):\s+(\S.*)$/s.exec(s)
  if (!m || !DIRECTION_IDS.has(m[1]!)) return s
  return m[2]!.trim()
}
