// HOW A PRODUCT ACTUALLY APPEARS IN A VIDEO, BEAT BY BEAT.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The script could already say a product's NAME and its verified FACTS. What it
// could never say is what the creator should DO with it: when to pick it up,
// where to hold it, what to point at, which screen to open next, and what to be
// saying while any of that happens. So a "product video" came out as a talking
// head who mentions a product, which is the same video with a noun in it.
//
// ⚠️ AND THE TWO KINDS ARE NOT ONE KIND. A book is an object in the room: it is
// held, angled to the light, put down. A SaaS product is a sequence of screens:
// landing page, then the one feature that matters, then the result. Guidance
// that says "show the product" covers both and helps with neither.
//
// ⚖️ SO THE UNIT IS A SHOW MOMENT, and every moment answers three questions a
// person holding a phone actually has: what is on screen, what do I do with my
// hands, and what am I saying while I do it. A moment missing any of the three
// is the vague direction this module exists to replace.
//
// ⚠️ CAPABILITY IS CHECKED BEFORE ANY OF THIS IS OFFERED. A creator who cannot
// film objects gets no moments that require holding one -- not softened ones,
// NONE -- because a plan someone is following with a phone in their hand must
// not contain a shot they already told us they cannot take.
//
// ⚠️ AND NO B-ROLL. That is an explicit product scope decision, not an omission:
// every moment here is something the creator RECORDS THEMSELVES, in one take,
// on the camera they already have. Nothing here asks for stock footage or a
// second source.

import type { EntityType, Showability } from './productEntity'

/** What the creator is looking at, doing, and saying — all three, or it is not
 *  a moment. */
export interface ShowMoment {
  /** What the viewer sees. Plain, concrete, one thing. */
  onScreen: string
  /** What the creator physically does. The half that vague direction omits. */
  doThis: string
  /** What the words are FOR here. Not a script -- the writer supplies the
   *  sentence in the creator's voice; this says what the sentence must achieve. */
  sayWhat: string
  /** The scene type this becomes. Never `b_roll`. */
  sceneType: 'product_demo' | 'screen_recording' | 'talking_head'
}

/** Everything the writer and director need for one product in one video. */
export interface ProductSceneGuidance {
  /** ⚠️ FALSE MEANS WRITE NO DEPENDENT SHOT. Not "be careful" -- none. */
  mayShow: boolean
  /** Why, in the creator's language, when it is false. Null when it is true. */
  cannotShowBecause: string | null
  moments: readonly ShowMoment[]
  /** Where to film, when the product changes the answer. Null when it does not. */
  background: string | null
  /** ⚠️ WHAT THE TELEPROMPTER MUST NOT SWALLOW. A show moment has words AND an
   *  action, and a teleprompter that scrolls the words while the creator is
   *  holding something up desynchronises the two. These scenes pause. */
  pauseAfterShowMoment: boolean
}

const HELD_IN_HAND: EntityType[] = ['PHYSICAL_PRODUCT']
const ON_A_SCREEN: EntityType[] = ['SAAS', 'APP', 'DIGITAL_PRODUCT', 'COURSE', 'COMMUNITY', 'MARKETPLACE']
/** ⚖️ A SERVICE HAS NOTHING TO POINT A CAMERA AT, and pretending otherwise is
 *  how a consultant ends up asked to screen-record a conversation. It is shown
 *  by describing the work, which is a talking scene and honestly so. */
const NOTHING_TO_FILM: EntityType[] = ['SERVICE']

/** ⚠️ THE OBJECT MOMENTS. Ordered, because "hold it up" before "here is the bit
 *  that matters" is the sequence that reads as a demonstration rather than a
 *  prop being waved. */
const OBJECT_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'The product held up beside your face, still, for a beat.',
    doThis: 'Pick it up and hold it steady at chest height, angled slightly toward the lens so the front reads clearly. Do not move it while you talk.',
    sayWhat: 'Name it and say what it is, once, in one sentence — the viewer needs to know what they are looking at before anything else lands.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'Your hand pointing at the one part that matters.',
    doThis: 'Bring the product closer to the lens and point directly at the specific part you are about to talk about. Hold the point for a full second before you carry on.',
    sayWhat: 'Say what that specific part does for the viewer — the concrete benefit, not the feature name.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'The product set down; you back to camera.',
    doThis: 'Put it down out of frame and return to your normal talking position.',
    sayWhat: 'Say the thing the product was evidence FOR. The object made the point; now land it.',
    sceneType: 'talking_head',
  }),
])

/** ⚠️ THE SCREEN MOMENTS, AND THIS IS THE HALF THE OWNER ASKED FOR BY NAME. A
 *  URL is not a demonstration. "Now show the landing page, point at the one line
 *  that says what it does, then move to the dashboard" is. */
const SCREEN_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'The landing page, top of the page, nothing scrolled yet.',
    doThis: 'Open the page fresh and leave it still for a beat before you move anything. Do not scroll while you are introducing it.',
    sayWhat: 'Say what this thing is for, in the words a stranger would use — not the tagline on the page.',
    sceneType: 'screen_recording',
  }),
  Object.freeze({
    onScreen: 'The one line or section that states what it actually does.',
    doThis: 'Move the cursor to that line and leave it there. A cursor that keeps moving reads as searching; a cursor that stops reads as pointing.',
    sayWhat: 'Say the promise in your own words and why it matters to the person watching.',
    sceneType: 'screen_recording',
  }),
  Object.freeze({
    onScreen: 'The main screen people actually use — the dashboard, the editor, the feed.',
    doThis: 'Go there directly. Do not narrate the navigation; cut straight to the screen that matters.',
    sayWhat: 'Say what a person does here, as a sequence: they open this, they do that, they get this.',
    sceneType: 'screen_recording',
  }),
  Object.freeze({
    onScreen: 'The result — the finished thing, the output, the number that changed.',
    doThis: 'Show the end state, held still long enough to read.',
    sayWhat: 'Say what changed for them. This is the payoff the whole walkthrough was building to.',
    sceneType: 'screen_recording',
  }),
])

const SERVICE_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'You, talking.',
    doThis: 'Nothing to hold and nothing to open. Stay in your normal position.',
    sayWhat: 'Describe the work as a before and after for one real client — what they came with, what they left with. A service is shown by the change it makes, not by footage.',
    sceneType: 'talking_head',
  }),
])

/** ⚠️ THE BACKGROUND ONLY CHANGES WHEN THE PRODUCT CHANGES IT. Inventing a
 *  setting for every video is how every script starts telling creators to
 *  rearrange their room for no reason. */
function backgroundFor(type: EntityType): string | null {
  if (HELD_IN_HAND.includes(type)) {
    return 'Somewhere the product reads clearly against the background — a plain wall or a tidy surface behind you. Busy shelves make a held object disappear.'
  }
  if (ON_A_SCREEN.includes(type)) {
    return 'Wherever you normally film. The screen recording carries the product, so the room behind you does not have to.'
  }
  return null
}

/**
 * ⚠️ CAPABILITY FIRST, ALWAYS. `UNKNOWN` yields NO show moments, exactly like
 * `NEVER` -- because a plan that asks for a shot nobody confirmed is a plan the
 * creator discovers is impossible while recording. This is the same rule
 * `inferShowability` follows one layer down: silence is not permission.
 *
 * ⚖️ BUT UNKNOWN AND NEVER SAY DIFFERENT THINGS TO THE CREATOR. "You told us you
 * cannot" and "we never asked" are different facts, and the second one has a fix.
 */
export function productSceneGuidance(
  type: EntityType,
  showability: Showability,
): ProductSceneGuidance {
  // A service is talking-only whatever the capability answer says, and that is a
  // fact about the kind of thing it is, not a restriction on the creator.
  if (NOTHING_TO_FILM.includes(type)) {
    return {
      mayShow: false,
      cannotShowBecause: 'A service has nothing to point a camera at, so this one is told rather than shown.',
      moments: SERVICE_MOMENTS,
      background: null,
      pauseAfterShowMoment: false,
    }
  }

  if (showability === 'NEVER') {
    return {
      mayShow: false,
      cannotShowBecause: 'You told us this one cannot go on camera, so the script stays talking-only.',
      moments: [],
      background: null,
      pauseAfterShowMoment: false,
    }
  }

  if (showability === 'UNKNOWN') {
    return {
      mayShow: false,
      cannotShowBecause: 'We do not know yet whether you can show this one, so no scene depends on it. Tell us in your Product Library and the next script can use it.',
      moments: [],
      background: null,
      pauseAfterShowMoment: false,
    }
  }

  const moments = HELD_IN_HAND.includes(type) ? OBJECT_MOMENTS
    : ON_A_SCREEN.includes(type) ? SCREEN_MOMENTS
      // ⚖️ `OTHER` TAKES THE SCREEN BRANCH, matching `inferShowability`'s own
      // choice: a screen recording is the capability more creators have, so an
      // unclassified product asks for the easier thing.
      : SCREEN_MOMENTS

  return {
    mayShow: true,
    cannotShowBecause: null,
    // ⚠️ `SOMETIMES` KEEPS THE OPENING MOMENT AND DROPS THE REST. The rule from
    // the prompt is that a scene must not DEPEND on the product being visible;
    // one optional beat satisfies that, four do not.
    moments: showability === 'SOMETIMES' ? moments.slice(0, 1) : moments,
    background: backgroundFor(type),
    // ⚠️ A SHOW MOMENT ALWAYS PAUSES. The creator is doing something with their
    // hands; a teleprompter that keeps scrolling makes them choose between the
    // words and the action.
    pauseAfterShowMoment: true,
  }
}

/** The prompt lines for `generate-blueprint`. Rendered here so the wording lives
 *  beside the rules that produced it, rather than being rebuilt in a template
 *  literal that no test can reach. */
export function productSceneDirection(name: string, g: ProductSceneGuidance): string {
  if (!g.mayShow) {
    return `\n- ${name.toUpperCase()}: ${g.cannotShowBecause} Write NO shot that requires showing, holding or demonstrating it.`
  }
  const lines = g.moments.map((m, i) =>
    `\n  ${i + 1}. ON SCREEN: ${m.onScreen}\n     THE CREATOR DOES: ${m.doThis}\n     THE WORDS MUST: ${m.sayWhat}`,
  ).join('')
  const bg = g.background ? `\n  WHERE TO FILM: ${g.background}` : ''
  return `\n- SHOWING ${name.toUpperCase()}, BEAT BY BEAT:${lines}${bg}`
}
