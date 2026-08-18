// WHAT A REFERENCE TAKES TO FILM — ANSWERED ONLY WHERE IT IS ACTUALLY VISIBLE.
//
// ⚠️ 9,504 GALLERY CARDS CARRY NULL IN BOTH OF 0106's COLUMNS, AND NOTHING HAS
// EVER WRITTEN ONE. `production_mode_match` is the signal §7a called the most
// valuable, and `recreate_feasibility` is the second question the same field
// answers. Both are dark for every card, so the gallery ranks on niche alone.
//
// ⚖️ AND THE MEASUREMENT IS NOT A MODEL CALL PER CARD, AT LEAST NOT FIRST. A
// card carries a hook, a label and a "why it works" blurb. Some of those name
// what the video physically is — an unboxing, a screen recording, a cooking
// video. Where that marker is present it is EVIDENCE, and where it is absent it
// is nothing at all.
//
// ── THE ASYMMETRY THIS FILE IS BUILT ON ───────────────────────────────────
//
// ⚠️ PRESENCE CONCLUDES; ABSENCE CONCLUDES NOTHING. A card that says "unboxing"
// needs an object in shot. A card that does NOT say "unboxing" tells us
// precisely nothing about whether it needs one — most videos never describe
// their own production. So this returns `true` or `null`, and NEVER `false`.
//
// ⚖️ THAT IS NOT TIMIDITY, IT IS THE DIFFERENCE BETWEEN THIS BEING USEFUL AND
// BEING HARMFUL. `false` would flow into `productionModeMatch` as "somebody
// established this video needs no objects", and a creator who cannot film
// objects would be shown a montage as a perfect fit. A wrong `true` costs a
// creator one skipped card; a wrong `false` costs them a video they cannot
// shoot. The states are not symmetric, so the classifier is not either.
//
// ── WHAT IT IS ACTUALLY WORTH, MEASURED ──────────────────────────────────
//
// ⚠️ RUN AGAINST ALL 9,504 PRODUCTION CARDS: 386 CONCLUSIVE (4.1%), AND ZERO
// SCREEN RECORDINGS. That is the honest yield, recorded here rather than
// discovered later by somebody expecting more. Scraped `title` and `why` are
// marketing prose about a video's IDEA; they almost never describe how it was
// shot, which is exactly why §7a called this signal blocked on a missing
// measurement rather than on wiring.
//
// ⚖️ SO THIS IS A FLOOR, NOT THE FIX. It converts the cards that ANNOUNCE what
// they are — an unboxing, a haul, a cooking video — and leaves 95.9% exactly as
// unassessed as it found them, which is the correct outcome for a classifier
// that cannot see the video. The real unlock is a vision pass over the poster or
// the video itself: that one can answer `false`, and this one never can.
//
// ⚠️ THE SCREEN MARKERS MATCH NOTHING TODAY AND ARE KEPT ANYWAY. They are
// correct markers against a corpus that happens not to use those words; deleting
// them would mean re-deriving them when the scraper starts capturing captions.
// A list that matches nothing is honest as long as its yield is written down.
//
// ⚖️ AND EVERY ANSWER CARRIES THE WORDS THAT PRODUCED IT. `evidence` is the
// matched marker, so a wrong assessment is inspectable rather than mysterious —
// the same rule the product extractor runs on.

/** A card as this classifier sees it.
 *
 *  ⚠️ THE TWO TEXT COLUMNS `gallery_items` ACTUALLY HAS, and no others. `niche`
 *  is deliberately excluded: it is a TOPIC, and a topic never establishes what
 *  is physically in frame. Reading it here is how "Beauty" would come to mean
 *  "films objects" for 689 cards nobody looked at. */
export interface AssessableCard {
  title?: string | null
  why?: string | null
}

/** ⚠️ NAMED FOR WHAT IT ASSESSES, because `ReferenceAssessment` was already
 *  taken by `editor/referenceCheck.ts` — and that one answers a different
 *  question entirely: whether a reference may be USED at all. This one answers
 *  what it would take to FILM. Two concepts under one name is how a reader comes
 *  to think a permission check and a production check are the same thing. */
export interface ProductionAssessment {
  /** `true` where a marker established it. NEVER `false` — see the asymmetry. */
  requiresFilmingObjects: boolean | null
  requiresScreenRecording: boolean | null
  /** The exact markers matched, so a wrong answer can be argued with. */
  evidence: readonly string[]
  /** ⚠️ `text_markers` IS A WEAK SOURCE AND SAYS SO. A later vision pass over
   *  the poster or the video itself would be `observed` and could legitimately
   *  answer `false`, which this can never do. */
  source: 'text_markers'
}

/**
 * ⚠️ EVERY MARKER HERE NAMES A PHYSICAL ACT, NOT A TOPIC. "Beauty" is a niche
 * and tells us nothing about what is in frame; "unboxing" is a thing somebody
 * did with their hands and a box. A marker that can be true of a talking-head
 * video is not a marker, it is a guess with a keyword's confidence.
 */
const OBJECT_MARKERS: readonly string[] = [
  'unboxing', 'unbox', 'haul', 'taste test', 'taste-test',
  'cooking', 'recipe', 'baking', 'swatch', 'swatches',
  'product demo', 'demo of the product', 'hands-on', 'hands on with',
  'try-on', 'try on haul', 'assembly', 'installing the',
]

/**
 * ⚖️ SCREEN MARKERS ARE NARROWER, because "tutorial" is the trap. A tutorial can
 * be a whiteboard, a piece to camera, or a screen capture, and treating the word
 * as a screen-recording marker would mark a third of the gallery wrongly.
 */
const SCREEN_MARKERS: readonly string[] = [
  'screen recording', 'screen-recording', 'screenrecording',
  'screen capture', 'screenshare', 'screen share',
  'my screen', 'on my laptop screen', 'walkthrough of the app',
  'app walkthrough', 'dashboard walkthrough',
]

/** ⚠️ WORDS THAT LOOK LIKE MARKERS AND ARE NOT. Kept as a list rather than as a
 *  comment so the test can assert they never conclude anything. */
export const NON_MARKERS: readonly string[] = [
  'tutorial', 'review', 'beauty', 'tech', 'how to', 'behind the scenes',
  'day in my life', 'story time', 'tips', 'guide',
]

const haystack = (c: AssessableCard): string =>
  [c.title, c.why].map((x) => (x ?? '').toLowerCase()).join(' \n ')

const hits = (text: string, markers: readonly string[]): string[] =>
  markers.filter((m) => text.includes(m))

/**
 * Assess one card from the text a scrape captured.
 *
 * ⚖️ RETURNS `null` FAR MORE OFTEN THAN IT RETURNS `true`, and that is the
 * intended shape. This exists to convert the cards that ANNOUNCE what they are —
 * and to leave every other card exactly as unassessed as it was, rather than
 * dressing a guess as a measurement.
 */
export function assessFromText(card: AssessableCard): ProductionAssessment {
  const text = haystack(card)
  const objects = hits(text, OBJECT_MARKERS)
  const screen = hits(text, SCREEN_MARKERS)
  return {
    requiresFilmingObjects: objects.length > 0 ? true : null,
    requiresScreenRecording: screen.length > 0 ? true : null,
    evidence: [...objects, ...screen],
    source: 'text_markers',
  }
}

/** ⚖️ WHETHER THIS ASSESSMENT IS WORTH WRITING AT ALL. An assessment that
 *  concluded nothing must not overwrite a NULL with a NULL and stamp a row as
 *  "looked at" — a card nobody could read is still a card nobody has assessed,
 *  and marking it examined would hide it from the vision pass that could
 *  actually answer it. */
export function isConclusive(a: ProductionAssessment): boolean {
  return a.requiresFilmingObjects === true || a.requiresScreenRecording === true
}
