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

// ⚠️ DECLARED LOCALLY, NOT IMPORTED. Deno deploy cannot reach @twinai/shared, so
// the two type names are restated here and NOTHING ELSE in this file differs
// from packages/shared/src/productScenes.ts. A parity test compares the rest
// byte for byte, because a paraphrase is how the two copies come to disagree.
export type EntityType =
  | 'SAAS' | 'APP' | 'PHYSICAL_PRODUCT' | 'DIGITAL_PRODUCT'
  | 'SERVICE' | 'COURSE' | 'COMMUNITY' | 'MARKETPLACE' | 'OTHER'
export type Showability = 'ALWAYS' | 'SOMETIMES' | 'NEVER' | 'UNKNOWN'

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
  /** The scene type this becomes. Never `b_roll`.
   *
   *  ⚠️ AND NEVER `screen_recording` EITHER, WHICH IS WHY IT IS NOT IN THE TYPE.
   *  Twin used to direct screen recordings for everything that lives on a
   *  screen. A screen recording is a second piece of work: the creator has to
   *  capture it, find it, trim it and drop it into an edit, on a device that is
   *  usually not the one they are filming with. Most never do, so the beat is
   *  either missing or filled with a still. Everything Twin asks for is now a
   *  thing the creator does ON CAMERA, in the take, with the phone in their
   *  hand -- the screen appears INSIDE the shot rather than replacing it.
   *
   *  ⚖️ SO A SCREEN IS A `product_demo`. That type means "a physical object,
   *  handled, on camera", and a phone held up beside your face with your
   *  dashboard on it is exactly that. Nothing downstream had to widen. */
  sceneType: 'product_demo' | 'talking_head'
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
    onScreen: 'Your phone held up beside your face, open on the page people land on first.',
    doThis: 'Have the page already open BEFORE you start filming, then hold the phone up next to your head, screen turned to the camera, framed chest-up. Hold it still for a beat. A screen that wobbles reads as nervous.',
    sayWhat: 'Say what this thing is for, in the words a stranger would use — not the tagline on the page.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'The one line or section that states what it actually does.',
    doThis: 'Put a finger beside that line and leave it there. A finger that keeps moving reads as searching; a finger that stops reads as pointing.',
    sayWhat: 'Say the promise in your own words and why it matters to the person watching.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'The main screen people actually use — the dashboard, the editor, the feed.',
    doThis: 'Have that screen already open on the phone before the take. Do not film yourself tapping your way there -- nobody needs the journey.',
    sayWhat: 'Say what a person does here, as a sequence: they open this, they do that, they get this.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'The result — the finished thing, the output, the number that changed.',
    doThis: 'Hold the phone steady and close enough that the number is readable on a small screen. If it is tiny, pinch to zoom before you film.',
    sayWhat: 'Say what changed for them. This is the payoff the whole walkthrough was building to.',
    sceneType: 'product_demo',
  }),
])

/** ⚠️ THE SCREEN MOMENTS ABOVE WERE WRITTEN FOR A DASHBOARD, AND EVERY
 *  SCREEN-SHOWN TYPE WAS GETTING THEM. Measured before this existed: SAAS,
 *  COURSE, DIGITAL_PRODUCT, MARKETPLACE and OTHER returned byte-identical
 *  direction. "Go to the main screen people actually use — the dashboard, the
 *  editor, the feed" is good advice about software and nonsense about a course,
 *  where the thing people use is a lesson.
 *
 *  ⚖️ THESE ARE A JUDGEMENT ABOUT WHAT EACH PRODUCT'S SURFACES ARE, NOT A
 *  MEASUREMENT OF WHAT FILMS WELL. Knowing a course has a curriculum page and a
 *  lesson player needs no recording. Knowing whether holding on the lesson
 *  player for a beat reads as generous or slow DOES, and that is what the
 *  recordings revise. Shipping direction that is probably right beats shipping
 *  direction that is certainly wrong.
 */
const COURSE_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'The course contents — the list of modules or lessons, unscrolled.',
    doThis: 'Open the contents page and hold it still. This is the one shot that shows the size of what they get, so let it sit long enough to be read.',
    sayWhat: 'Say what someone can do at the end that they cannot do now. Not the module titles — the outcome.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'One lesson actually open — the video playing or the page of it people read.',
    doThis: 'Go into a real lesson, not the preview. Pick the one that proves the teaching is specific, and let a few seconds of it run.',
    sayWhat: 'Say what this particular lesson fixes. One concrete thing, the kind a person would recognise as their own problem.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'Whatever comes WITH the course — the workbook, the templates, the community tab.',
    doThis: 'Open the extras. A course looks like a video list until you show that it is not only videos.',
    sayWhat: 'Say what they use these for while they are working through it.',
    sceneType: 'product_demo',
  }),
])

const MARKETPLACE_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'The browse or search results — several real listings at once.',
    doThis: 'Show the breadth first. A marketplace is worth nothing to a viewer until they can see there is enough of it.',
    sayWhat: 'Say who is on the other side and roughly how much of it there is.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'One listing opened — the real detail page.',
    doThis: 'Open a genuine listing before the take, then hold the phone up and stop moving. Talk to the camera, not to the screen.',
    sayWhat: 'Say what a person is deciding at this point and what on the page decides it for them.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'The step where it actually happens — the booking, the basket, the message.',
    doThis: 'Show the moment of commitment, not the confirmation email. Stop before anything private appears.',
    sayWhat: 'Say how simple this step is, because the fear here is that it is not.',
    sceneType: 'product_demo',
  }),
])

const APP_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'The app open on a phone, held up beside your face — the first screen after opening.',
    doThis: 'Film the phone in your hand, not a laptop. An app shown on a desktop browser stops looking like an app. Have it already open before the take.',
    sayWhat: 'Say what someone opens this for, in the moment they would open it.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'One thing being done, thumb visible if you can.',
    doThis: 'Do the action at normal speed. A tap that is too fast to follow teaches nothing.',
    sayWhat: 'Narrate what you are doing as you do it, in the order you do it.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'The result on screen, held still long enough to read.',
    doThis: 'Stop and let the end state sit.',
    sayWhat: 'Say what just changed for them.',
    sceneType: 'product_demo',
  }),
])

const DIGITAL_PRODUCT_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'The thing itself, open — the template, the file, the preset applied.',
    doThis: 'Open the actual product rather than a picture of it. A screenshot of a template is not the template.',
    sayWhat: 'Say what it is and what it saves them doing.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'Before and after, side by side or one straight after the other.',
    doThis: 'Show the same thing without it and with it. This is the whole argument for a digital product and it is almost always skipped.',
    sayWhat: 'Say the difference out loud even though it is on screen. The viewer is often listening, not watching.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'What is actually inside — the file list, the pages, the number of them.',
    doThis: 'Show the contents so the size of it is not something they have to take on trust.',
    sayWhat: 'Say what they get, plainly.',
    sceneType: 'product_demo',
  }),
])

/** ⚠️ A COMMUNITY IS OTHER PEOPLE, AND THAT CHANGES THE INSTRUCTION RATHER THAN
 *  ONLY THE SHOT. Every other type here can be filmed freely; this one cannot,
 *  because the interesting part of it is somebody else's words. The direction
 *  says so at the point of filming, where it can still be acted on.
 *
 *  ⚖️ REACHABLE ONLY BY AN EXPLICIT ANSWER. `inferShowability` returns NEVER for
 *  COMMUNITY, so these appear only where a creator has gone into the Product
 *  Library and said they CAN show it — which is exactly the person who has
 *  thought about whether they may. */
const COMMUNITY_MOMENTS: readonly ShowMoment[] = Object.freeze([
  Object.freeze({
    onScreen: 'The channel or topic list — the shape of the place, no messages readable.',
    doThis: 'Hold the phone up beside your face with the place open on it. Before you film, cover member names with your thumb or crop them out of frame -- show the shape of the room, not the people in it.',
    sayWhat: 'Say what the place is for and who is in it.',
    sceneType: 'product_demo',
  }),
  Object.freeze({
    onScreen: 'One thread you have permission to show, or your own post.',
    doThis: 'Use your own words or something you have been given permission to show. Do not film other people\'s messages to prove a point about your product.',
    sayWhat: 'Say what kind of question gets answered here and how quickly.',
    sceneType: 'product_demo',
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
    return 'Somewhere plain and evenly lit, with the light in front of you rather than behind. You are holding a screen up next to your face, and a bright window behind you turns both of you into a silhouette.'
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

  // ⚠️ `SOMETIMES` YIELDS NO SHOW MOMENTS, AND THIS OVERRULES THIS MODULE'S
  // FIRST VERSION. It kept one "optional" beat, which was wrong: a show moment
  // IS a scene that depends on the product being visible, so one beat is not a
  // weaker version of the rule -- it breaks it. generate-blueprint already
  // decided this deliberately and said why: "a script is written once and filmed
  // LATER, so a scene depending on a product the creator sometimes has is a
  // scene that sometimes cannot be filmed."
  //
  // ⚖️ THE DIFFERENCE FROM NEVER LIVES IN THE SENTENCE, NOT IN THE MOMENTS. It
  // may still be MENTIONED, and the creator is not told they cannot show it --
  // only that no scene will be built on it.
  if (showability === 'SOMETIMES') {
    return {
      mayShow: false,
      cannotShowBecause: 'You can only sometimes have this one to hand, so it gets mentioned rather than built into a scene you might not be able to film.',
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

  // ⚠️ ONE SET PER TYPE, WHICH IS THE WHOLE OF THIS CHANGE. Every screen-shown
  // product used to get SCREEN_MOMENTS, written for a SaaS dashboard: "go to the
  // main screen people actually use — the dashboard, the editor, the feed".
  // Sound advice about software and nonsense about a course, where the thing
  // people use is a lesson.
  //
  // ⚖️ `OTHER` AND `SAAS` KEEP THE ORIGINAL SET, and for different reasons. SAAS
  // is what it was written for. OTHER is unclassified, so the generic
  // walkthrough is the honest thing to give it — inventing specifics for a
  // product we cannot name would be worse than the dashboard shape.
  const BY_TYPE: Partial<Record<EntityType, readonly ShowMoment[]>> = {
    COURSE: COURSE_MOMENTS,
    MARKETPLACE: MARKETPLACE_MOMENTS,
    APP: APP_MOMENTS,
    DIGITAL_PRODUCT: DIGITAL_PRODUCT_MOMENTS,
    COMMUNITY: COMMUNITY_MOMENTS,
  }

  const moments = HELD_IN_HAND.includes(type) ? OBJECT_MOMENTS
    : BY_TYPE[type] ?? SCREEN_MOMENTS

  return {
    mayShow: true,
    cannotShowBecause: null,
    moments,
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
