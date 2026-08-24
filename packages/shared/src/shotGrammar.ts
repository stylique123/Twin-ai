/**
 * CAMERA-AT-SCREEN: five shot patterns, and a lookup that picks one.
 *
 * ⚠️ WHY THIS EXISTS. Twin stopped asking for screen recordings, because the
 * pipeline could never keep that promise -- a screen capture is a second job the
 * creator does elsewhere, on another device, after they have already filmed
 * everything else. What replaces it is not "no screen": it is the screen INSIDE
 * the shot. These are the five ways a screen can be in a shot a phone can take.
 *
 * ⚖️ AND THE PICK IS A LOOKUP, NOT A MODEL DECISION. A writer choosing the shot
 * each time is a writer that drifts: the same beat gets a hold-up on Monday and
 * a reveal-turn on Tuesday for no reason a creator could name. Deterministic
 * from (beat purpose x what the creator has x privacy), so it cannot.
 */

/** The five patterns. Every one is filmable with one phone, or a phone and a
 *  laptop, and every one is compatible with a teleprompter. */
export type ShotPattern = 'HOLD_UP' | 'POINT_AT' | 'REVEAL_TURN' | 'PROP_SCREEN' | 'PRINTED'

/** What the beat is FOR. The writer already knows this; it is not a new question. */
export type BeatPurpose = 'credibility' | 'value' | 'social_proof' | 'cta' | 'ambience'

/** ⚠️ THREE STATES, AND THE SAFE ONE IS THE DEFAULT. Unanswered is `blur`:
 *  nothing ships assuming permission from somebody who never gave it. */
export type ShotPrivacy = 'mine' | 'permitted' | 'blur'

export interface ShotContext {
  purpose: BeatPurpose
  /** Can they prop a laptop and film past it? A phone-only creator cannot. */
  hasSecondScreen?: boolean | null
  /** Absent is treated as `blur`, never as permission. */
  privacy?: ShotPrivacy | null
  /** True when the thing worth showing is private -- client data, revenue,
   *  anything that would be mostly covered up. */
  screenIsPrivate?: boolean | null
}

/** ⚠️ ABSENT IS NOT PERMISSION. Written as its own function because the null
 *  check has to precede any use, and a `?? 'mine'` anywhere would silently
 *  invent consent. */
export function privacyOf(c: ShotContext): ShotPrivacy {
  return c.privacy === 'mine' || c.privacy === 'permitted' ? c.privacy : 'blur'
}

/**
 * THE PICKER. Order matters and each branch is a stated judgement.
 *
 * ⚖️ PRIVACY OUTRANKS POLISH. A private screen goes to PRINTED before anything
 * else is considered: a shot that is 80% thumb is worse than a number written
 * large on paper, and it is the shot finance and coaching creators actually
 * need. This is the branch that would be easiest to leave out and hardest to
 * add back once creators have learned Twin cannot handle their numbers.
 */
export function pickShot(c: ShotContext): ShotPattern {
  // A screen nobody may see is not a screen shot. Write the number down.
  if (c.screenIsPrivate === true) return 'PRINTED'

  // Ambience is not a demo. The screen sits in the room while they talk.
  if (c.purpose === 'ambience') return 'PROP_SCREEN'

  // ⚖️ A BLURRED THING CANNOT CARRY A TURN-TO-CAMERA REVEAL. The whole point of
  // REVEAL_TURN is that the viewer reads what the creator just reacted to; if it
  // has to be covered, the reveal lands on nothing. Falls back rather than
  // refusing -- the beat still gets a shot.
  if (c.purpose === 'social_proof') {
    return privacyOf(c) === 'blur' ? 'HOLD_UP' : 'REVEAL_TURN'
  }

  // Curriculum, calendars and charts read badly at phone size. Only offered when
  // they actually have a second screen to prop -- otherwise it is direction for
  // equipment they do not own.
  if (c.purpose === 'value' && c.hasSecondScreen === true) return 'POINT_AT'

  // Credibility, CTA, and everything else: the default that always works.
  return 'HOLD_UP'
}

/** What the creator reads. Plain everyday English -- a first-time creator has to
 *  understand every one of these in under two seconds. */
export const SHOT_DIRECTION: Record<ShotPattern, string> = {
  HOLD_UP:
    'Open the page before you start filming, then hold your phone up beside your face, screen turned to the camera. Frame yourself chest-up.',
  POINT_AT:
    'Put the laptop on a desk with the page already open, stand or sit beside it, and point at the one thing you are talking about. Camera slightly behind your shoulder.',
  REVEAL_TURN:
    'Start with the camera on your face and the phone low, out of shot. React to what is on it, then turn the phone to the camera and hold it there for two seconds.',
  PROP_SCREEN:
    'Leave the screen open behind you while you talk to the camera. It is background, not the subject -- do not turn to look at it.',
  PRINTED:
    'Write the number large on paper and hold that up instead of the screen. Nothing private ends up on camera, and a handwritten number reads better than a blurred one.',
}

/** ⚠️ THE READABILITY RULES, AND THEY RIDE ALONG RATHER THAN BEING REMEMBERED.
 *  A phone filming a screen is softer than a screen capture. These four lines
 *  are what close that gap, and a creator only follows them if they are in the
 *  direction they are already reading. */
export const READABILITY_RULES: readonly string[] = Object.freeze([
  'Have one thing on the screen, not a whole busy page.',
  'Pinch to zoom before you film, so the part that matters fills about a third of the screen.',
  'Tilt the screen down a little to kill glare, and face the window rather than backing on to it.',
])

/** Which patterns actually point a camera at a screen. PROP_SCREEN is ambience
 *  and PRINTED has no screen in it, so neither needs the rules. */
const NEEDS_READABILITY: readonly ShotPattern[] = Object.freeze(['HOLD_UP', 'POINT_AT', 'REVEAL_TURN'])

/** ⚖️ AND THE COVERING LINE IS UNCONDITIONAL WHEN PRIVACY IS UNKNOWN. It is not
 *  advice; it is the difference between a creator showing their own post and
 *  publishing a stranger's name to their whole audience. */
export const BLUR_LINE =
  'Before you film: scroll to your own post, or cover other people’s names with your thumb or crop them out of frame.'

/** The whole instruction for one beat, assembled. One reader, one place. */
export function shotDirection(c: ShotContext): { pattern: ShotPattern; lines: readonly string[] } {
  const pattern = pickShot(c)
  const lines: string[] = [SHOT_DIRECTION[pattern]]
  if (NEEDS_READABILITY.includes(pattern)) lines.push(...READABILITY_RULES)
  // Private screens are already handled by PRINTED -- adding a blur line there
  // would tell somebody to cover up a piece of paper they wrote themselves.
  if (pattern !== 'PRINTED' && privacyOf(c) === 'blur') lines.push(BLUR_LINE)
  return { pattern, lines: Object.freeze(lines) }
}

/** ⚠️ NOT WIRED YET, AND SAYING SO RATHER THAN IMPLYING OTHERWISE. The owner's
 *  audit routes the conversion check's flag at `unsupplyable_shots.converted`,
 *  a counter from Fix 12 that does not exist in this repository yet -- grep
 *  finds no definition. The check that rewrites leftover screen-capture phrasing
 *  into HOLD_UP is the next unit and will need somewhere to put its count. */
export const UNSUPPLYABLE_SHOTS_COUNTER_IS_NOT_BUILT =
  'unsupplyable_shots.converted has no definition in this repository; the conversion check needs it before it can flag.'

/** ⚠️ THE SETUP HAPPENS BEFORE THE RECORD BUTTON, AND NOTHING SAID SO. Every
 *  camera-at-screen pattern assumes the page is already open and already zoomed
 *  when the take starts — "open {page} BEFORE recording starts" is in the
 *  direction, and the direction is on a card the creator has usually scrolled
 *  past by the time they are holding the phone.
 *
 *  ⚖️ SO IT IS A SEPARATE LINE ON THE BETWEEN-SCENES PANEL, which is the last
 *  thing they read before the countdown. A creator who starts recording and THEN
 *  opens the app has burned the first three seconds of the take fumbling, and
 *  those are the seconds the whole hook depends on.
 *
 *  Returns null when the scene needs no setup — a talking-head beat has nothing
 *  to open, and a reminder there is noise that teaches people to ignore the line. */
export function preRollChecklist(direction: string | null | undefined): string | null {
  if (typeof direction !== 'string') return null
  const d = direction.toLowerCase()
  // Only the patterns that put a screen in the shot need anything opened.
  const needsScreen = /\bphone\b|\blaptop\b|\bscreen\b|\bopen\b/.test(d)
  if (!needsScreen) return null
  const needsZoom = /\bzoom\b|\bpinch\b|\bnumber\b|\bgraph\b|\bchart\b/.test(d)
  return needsZoom
    ? 'Before you press record: open it, pinch to zoom so the part that matters is readable, then start.'
    : 'Before you press record: open it on the screen first, then start.'
}
