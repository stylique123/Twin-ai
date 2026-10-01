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
  | 'PHYSICAL_PRODUCT' | 'DIGITAL_PRODUCT' | 'SAAS' | 'APP' | 'SERVICE' | 'OTHER'

/** Whether it can appear on camera at all. Mirrors `product_entities.showability`. */
export type Showability = 'ALWAYS' | 'SOMETIMES' | 'NEVER' | 'UNKNOWN'

/** What the object physically IS, when a photo has been read. Narrows the set:
 *  a jar twists, a garment is worn, a card sits flat on an open palm. */
export type ObjectShape =
  | 'jar' | 'bottle' | 'tube' | 'bag' | 'box' | 'flat' | 'garment' | 'device' | 'food' | 'vessel' | 'unknown'

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
  { id: 'hold_up', does: 'Hold it up to chest height, steady, its front facing the lens', bestFor: 'A first look or the beat that names it — once or twice, not every beat. Say "label" only if it has one.' },
  { id: 'rotate', does: 'Turn it slowly to show another side', bestFor: 'Printed information, a seam, a texture worth seeing.' },
  { id: 'twist_open', does: 'Twist the cap off / unzip it / flip the lid', bestFor: 'Anything with a closure — and only if it HAS one.' },
  { id: 'point_at', does: 'Point one finger at a specific spot on it', bestFor: 'A detail the viewer would otherwise miss.' },
  { id: 'demonstrate', does: 'Use it the way it is meant to be used — pump, pour, apply, wear, click', bestFor: 'Anything with an action verb built into how it works.' },
  { id: 'unbox', does: 'Box, then packaging, then the item — in that order', bestFor: 'First-impression and what-is-inside beats.' },
  // ⚠️ AUDIT 2026-09-25: this line closed almost every script on every account
  // (chef, leatherworker, candles, bandanas, ceramics) — a fallback wearing the
  // look of a choice. It is now a last resort, used at most once.
  { id: 'set_down', does: 'Put it down deliberately and look back at the lens', bestFor: 'LAST RESORT, at most once per script: only when the next beat is talking with empty hands and nothing specific to this product fits. Never the default ending.' },
  // ⚖️ THE SHOW-ONLY MOMENT. The audit found no way to tell her to stop talking
  // and let the object carry the beat. It is a held shot AFTER her line, not an
  // empty beat — an empty spoken line is what desynced teleprompter and shot list.
  { id: 'show_silent', does: 'Finish the line, then stop talking and hold the shot on it for two full seconds — let the viewer look', bestFor: 'A visual payoff words would only weaken: a finish, a reveal, the detail the beat just named.' },
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
  // ⚠️ AUDIT 2026-10-01 ("SHOWN SCRIPT"): only gestures that PICTURE the words
  // (a size, a distance, a comparison, a sequence) lift how competent and
  // persuasive a speaker reads; generic movement does nothing. These cues are
  // the illustrator gestures, and they work for every creator, product or not.
  { id: 'show_size', does: 'Show the size or distance you are describing with your hands', bestFor: 'A word like big, tiny, far, close, a little, a lot.' },
  { id: 'two_sides', does: 'Hold one hand out for each side, then weigh them', bestFor: 'A before/after, this-versus-that, or two options.' },
  { id: 'mark_steps', does: 'Mark each step in the air, left to right', bestFor: 'A sequence, a process, first-then-finally.' },
  { id: 'fingertips', does: 'Bring your fingertips together, precise', bestFor: 'The exact detail, the one thing that matters.' },
]

/** Shape narrows the physical set — a bag has no cap to twist, a flat card has
 *  nothing to rotate. Absent shape means "do not narrow", never "none apply". */
const SHAPE_ACTIONS: Readonly<Record<ObjectShape, readonly string[]>> = {
  jar: ['hold_up', 'rotate', 'twist_open', 'demonstrate', 'point_at', 'show_silent', 'set_down'],
  bottle: ['hold_up', 'rotate', 'twist_open', 'demonstrate', 'point_at', 'show_silent', 'set_down'],
  tube: ['hold_up', 'twist_open', 'demonstrate', 'point_at', 'show_silent', 'set_down'],
  bag: ['hold_up', 'rotate', 'twist_open', 'point_at', 'show_silent', 'demonstrate', 'set_down'],
  box: ['hold_up', 'rotate', 'unbox', 'point_at', 'show_silent', 'set_down'],
  flat: ['palm', 'hold_up', 'point_at', 'show_silent', 'rotate'],
  garment: ['hold_up', 'demonstrate', 'rotate', 'point_at', 'show_silent', 'compare'],
  device: ['hold_up', 'demonstrate', 'point_at', 'show_silent', 'rotate', 'set_down'],
  food: ['hold_up', 'demonstrate', 'point_at', 'show_silent', 'compare', 'set_down'],
  // ⚠️ AUDIT 2026-09-26: a bowl or a mug fitted none of the shapes above, so a
  // ceramics shop got the unnarrowed set — including "twist the cap off".
  // A vessel is held, turned to show the glaze, filled or used, never unscrewed.
  vessel: ['hold_up', 'rotate', 'demonstrate', 'point_at', 'show_silent', 'compare', 'set_down'],
  unknown: PHYSICAL_ACTIONS.map((a) => a.id),
}

export interface DirectionContext {
  readonly kind?: ProductKind | null
  readonly showability?: Showability | null
  /** From a product photo, when one was read. Overrides the category default. */
  readonly shape?: ObjectShape | null
  /** Named sections actually FOUND on the product's own pages. Never guessed. */
  readonly sections?: readonly string[] | null
  /** The product's name and what she said about it — only read to tell a
   *  consumable from a made-by-hand object (phase 3). Never quoted. */
  readonly productText?: string | null
}

// ── PHASE 3 (owner spec 2026-10-01): WHAT KIND OF THING IS BEING SHOWN ─────
//
// The demonstration that sells a candle is not the one that sells a jacket or
// an app. The category is read from what is already stored — the type, the
// shape read from a photo, the words she used — never asked again.
export type ProductCategory = 'consumable' | 'wearable_handled' | 'craft' | 'software' | 'service' | 'unknown'

const CONSUMABLE_WORDS = /\b(food|drink|coffee|tea|bean|roast|sauce|snack|bread|cake|cookie|candle|wax|soap|skincare|serum|cream|lotion|balm|oil|scrub|spice|honey|jam|wine|beer|juice|supplement|vitamin|perfume|fragrance)\w*/i
const CRAFT_WORDS = /\b(handmade|hand-made|hand made|handcrafted|made by hand|leather|ceramic|pottery|woodwork|knit|crochet|sewn|stitched|forged|carved|thrown|glaze)\w*/i

export function productCategory(ctx: Pick<DirectionContext, 'kind' | 'shape' | 'productText'>): ProductCategory {
  const kind = ctx.kind ?? null
  if (kind === 'SAAS' || kind === 'APP' || kind === 'DIGITAL_PRODUCT') return 'software'
  if (kind === 'SERVICE') return 'service'
  const text = String(ctx.productText ?? '')
  if (CRAFT_WORDS.test(text)) return 'craft'
  const shape = ctx.shape ?? null
  if (shape === 'food' || CONSUMABLE_WORDS.test(text)) return 'consumable'
  if (shape === 'jar' || shape === 'bottle' || shape === 'tube') return 'consumable'
  if (shape === 'garment' || shape === 'device' || shape === 'bag' || shape === 'vessel' || shape === 'box' || shape === 'flat') return 'wearable_handled'
  return kind === 'PHYSICAL_PRODUCT' ? 'wearable_handled' : 'unknown'
}

/** The spec's catalogs 3.1 / 3.2: how each category is demonstrated. */
export const CATEGORY_DEMO: Readonly<Record<ProductCategory, string | null>> = {
  consumable: [
    `HOW THIS PRODUCT IS DEMONSTRATED (a consumable):`,
    `  - One close, hands-only beat of it actually being used — poured, applied, lit, tasted.`,
    `  - One sensory beat held longer than a display shot (steam, the pour, a flame catching,`,
    `    texture on skin) — but only a quality she gave you; never claim a taste or smell she did not.`,
    `  - Show before, during or after, do not describe it.`,
  ].join('\n'),
  wearable_handled: [
    `HOW THIS PRODUCT IS DEMONSTRATED (worn or handled):`,
    `  - A close, point-of-view beat at the moment of contact — putting it on, picking it up.`,
    `  - When size or weight matters, a beat with it against her hand for scale.`,
    `  - When it is worn, show it moving, not standing still.`,
  ].join('\n'),
  craft: [
    `HOW THIS PRODUCT IS DEMONSTRATED (made by hand):`,
    `  - The making itself is the demonstration: her hands working on it in real time.`,
    `  - Honest imperfection while making it is fine and reads as real; do not stage a flawless sequence.`,
  ].join('\n'),
  software: [
    `HOW THIS PRODUCT IS DEMONSTRATED (an app or software):`,
    `  - Show the first-use PAYOFF, never a feature tour: name the moment of need first, then the`,
    `    one action and its result on screen (shown_job app_payoff), then a quick reaction.`,
    `  - Keep it short — about 25 seconds — with tighter lines per beat.`,
    `  - The ask removes the real reason not to try it (cost, sign-up, time) using only facts she`,
    `    gave about it; never invent "free" or "no account needed".`,
    `  - Film the phone or laptop screen to camera with her thumb or cursor visible; only ask for a`,
    `    screen recording if she said she can record her screen.`,
  ].join('\n'),
  service: null,
  unknown: null,
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

  // ⚠️ AUDIT 2026-10-01: NO PRODUCT USED TO GET THE FULL PRODUCT-HANDLING MENU.
  // A storytime, an opinion or a lesson fell through to "twist it open, hold it
  // up" — props that do not exist. With nothing to sell, the body and face ARE
  // the shown half of the video, and they get the presence cues.
  if (!kind && !ctx.shape) {
    return {
      format: 'Talking Review',
      options: SELF_DIRECTIONS,
      nameableSections: [],
      because: 'No product is in this video. The shown half is the creator: what the hands '
        + 'picture, where the eyes go, how the posture changes. Never invent a prop.',
    }
  }

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

  const onScreen = kind === 'SAAS' || kind === 'DIGITAL_PRODUCT' || kind === 'APP'
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
    `rather than inventing a prop or a screen that is not listed.`,
    `set_down is a LAST RESORT: at most once per script and never the automatic last move —`,
    `close on something specific to this product instead (a detail, a use, or show_silent).`,
    `And "it" below is a BLANK, not a word to copy: name the actual thing in their hands`,
    `("the cracked tin", "the finished candle"), because "point at a specific spot on it" tells`,
    `a creator holding three objects nothing at all.`,
    ...lines,
    sections,
    ctx.kind ? CATEGORY_DEMO[productCategory(ctx)] ?? '' : '',
    PRESENCE_RULES,
  ].filter(Boolean).join('\n')
}

/**
 * ⚠️ AUDIT 2026-10-01 ("SHOWN SCRIPT"): every beat has a spoken half and a
 * shown half, for every creator — a storytime or an opinion as much as a
 * product demo. These rules apply to all of them. None of them may add a fact,
 * a prop, a place or a sensory claim she did not give: they direct how to
 * deliver and where to stand, never what is true.
 */
export const PRESENCE_RULES = [
  `THE SHOWN HALF OF EVERY BEAT (every creator, product or not):`,
  `  - GESTURE: when a beat's words carry a size, a distance, a comparison or a sequence, the`,
  `    action_posing must PICTURE it (show_size, two_sides, mark_steps, fingertips) and say what`,
  `    it pictures ("hands a foot apart for 'a tiny batch'"). Never "gesture naturally"; never`,
  `    constant movement. Keep every gesture inside the frame.`,
  `  - EYES: "direction" says how to deliver the beat. Name direct eye contact with the lens on`,
  `    the hook, the strongest claim and the ask. A short look away (at the thing, or in a real`,
  `    reaction) belongs on a transition beat — say so where it fits.`,
  `  - POSTURE: open and upright by default; lean in on the strongest claim or a confession;`,
  `    relax on a personal moment. Do not give every beat the same posture.`,
  `  - WHERE: choose "location" by what the beat does, from places she has or can easily use —`,
  `    a plain spot for a confession, the real workspace for a process or a demonstration, an`,
  `    uncluttered spot for the ask. A beat that shows something happening must not share the`,
  `    exact framing of a beat that only talks.`,
  `  - DEMONSTRATION: if this video promotes a product she can show, at least one beat must SHOW`,
  `    it in use (hands in frame, close, ideally from her point of view), not only hold it up.`,
  `  - NO REPEATS: never give two beats the same action_posing sentence. Holding it up is a`,
  `    first look, not a default — the 2026-10 baseline had one script hold the bag up on 3 of 5`,
  `    beats. Each beat's action must follow what that beat says.`,
].join('\n')

// ── THE MENU LEAKED ONTO THE CREATOR'S SCREEN ───────────────────────────────
//
// ⚠️⚠️ MEASURED 2026-09-21 across all 154 stored generations. Five beats — one
// whole run of three, all on 2026-09-20 — shipped `action_posing` values that
// begin with the taxonomy's own key:
//
//   "hold_up: Hold it up to chest height, steady, its front facing the lens."
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
