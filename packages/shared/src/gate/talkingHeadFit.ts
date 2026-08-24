// IS THIS A VIDEO OF SOMEONE TALKING TO THE CAMERA?
//
// TwinAI is talking-head only. It learns how a creator TALKS, so a video where
// nobody talks to the camera gives it nothing to learn from, and the script it
// writes will be generic — the founding defect, arriving by a new road.
//
// ⚠️ THIS DECIDES FROM AN EARLY LOOK, NOT FROM A FINISHED ANALYSIS. The whole
// point is that the creator is told in seconds, before the transcript and before
// the full visual pass. A gate that runs at the end is an apology, not a gate.
// The input type here is deliberately TINY — three questions, not eighteen —
// because anything richer could only come from the full pass this runs before.
//
// ⚠️ IT WARNS, IT DOES NOT BLOCK. Twin agreed with a human on 73% of the visual
// claims it was judged on (run 7204de6f, 75 SUPPORTED of 103 answered). A
// component that is wrong about one video in four must not be able to stop
// anyone. So `does_not_fit` produces a loud warning and a one-tap override, and
// the override is RECORDED — those records are the only evidence that will ever
// say whether this gate is any good.
//
// ⚖️ AND `unsure` LETS THEM STRAIGHT THROUGH, SILENTLY. Warning on Twin's own
// uncertainty would spend the creator's patience on Twin's ignorance. A warning
// nobody trusts is worse than no warning, because the next real one is ignored
// too. We only speak when we actually saw something.

/** What one early look at a few frames can honestly answer.
 *
 *  ⚠️ EVERY FIELD IS NULLABLE AND null MEANS "WE DO NOT KNOW". It does NOT mean
 *  no and it does NOT mean zero. Absent is not zero — a missing answer that got
 *  read as `false` would turn Twin's silence into Twin's accusation. */
export interface EarlyLook {
  /** Is at least one person speaking towards the camera? */
  someoneTalkingToCamera: boolean | null
  /** How many real people are visible at all. */
  peopleOnCamera: 'none' | 'one' | 'multiple' | null
  /** Drawings, cartoons or animation rather than filmed people. */
  looksAnimated: boolean | null
  /** How many frames this answer was actually derived from.
   *
   *  ⚠️ ZERO IS NOT A LOOK. If nothing was sampled, every field above is an
   *  invention, and the verdict must be `unsure` no matter how confident the
   *  other fields read. */
  framesLookedAt: number
}

export type FitVerdict = 'fits' | 'does_not_fit' | 'unsure'

/** Why we said what we said. Stored with every override so a later reader can
 *  ask "which reason was Twin wrong about most often" rather than "how often was
 *  Twin wrong", which is a number nobody can act on. */
export type FitReason =
  | 'NOTHING_LOOKED_AT'
  | 'ANIMATED'
  | 'NOBODY_ON_CAMERA'
  | 'NOBODY_TALKING_TO_CAMERA'
  | 'TALKING_TO_CAMERA'
  | 'CANNOT_TELL'

export interface FitDecision {
  verdict: FitVerdict
  reason: FitReason
}

/** ⚠️ ORDER IS THE RULE, NOT AN IMPLEMENTATION DETAIL. Each branch below is
 *  tried before the next, and the sequence is the definition:
 *
 *    1. nothing looked at   -> unsure. We have no evidence at all.
 *    2. animated            -> does not fit. There is no person to learn from,
 *                              however much talking the drawing appears to do.
 *    3. nobody on camera    -> does not fit. Text-on-screen, b-roll, a montage.
 *    4. talking to camera   -> decided by that answer alone, yes or no.
 *    5. anything still null -> unsure.
 *
 *  ⚖️ TWO PEOPLE TALKING TO CAMERA STILL FITS. An interview or a two-hander is
 *  people talking, which is the thing Twin learns from; it is a skit that is
 *  excluded, and what makes a skit a skit is that nobody addresses the camera.
 *  Excluding `multiple` outright would have refused podcasts to catch sketches. */
export function judgeFit(look: EarlyLook): FitDecision {
  // ⚠️ THE COUNT IS CHECKED BEFORE IT IS TRUSTED, and checked for FINITENESS,
  // not merely for truthiness: NaN < 1 is false, so a bare `< 1` test would let
  // a NaN through as a real look.
  const frames = look.framesLookedAt
  if (typeof frames !== 'number' || !Number.isFinite(frames) || frames < 1) {
    return { verdict: 'unsure', reason: 'NOTHING_LOOKED_AT' }
  }
  if (look.looksAnimated === true) return { verdict: 'does_not_fit', reason: 'ANIMATED' }
  if (look.peopleOnCamera === 'none') return { verdict: 'does_not_fit', reason: 'NOBODY_ON_CAMERA' }
  if (look.someoneTalkingToCamera === true) return { verdict: 'fits', reason: 'TALKING_TO_CAMERA' }
  if (look.someoneTalkingToCamera === false) {
    return { verdict: 'does_not_fit', reason: 'NOBODY_TALKING_TO_CAMERA' }
  }
  return { verdict: 'unsure', reason: 'CANNOT_TELL' }
}

/** What the creator reads.
 *
 *  ⚠️ PLAIN EVERYDAY ENGLISH, and never a word about how Twin works inside. A
 *  first-time creator with no marketing knowledge has to understand this in
 *  under two seconds. No "talking-head", no "reference", no "profile", no
 *  "analysis" — those are our words, not theirs.
 *
 *  ⚖️ AND IT ALWAYS SAYS THE COST, NOT THE RULE. "This may not sound like you"
 *  is a consequence they care about. "Unsupported video type" is a rule they
 *  did not agree to. */
export interface FitWarning {
  /** What Twin saw. One sentence. */
  saw: string
  /** Why that hurts THEIR result — never why it breaks our pipeline. */
  cost: string
  /** What to use instead. Always actionable, never "try something else". */
  instead: string
  /** The exact words on the button that continues anyway, cost included. */
  continueLabel: string
}

const CONTINUE = 'Use it anyway — the script may not sound like you'

const SAW: Record<Exclude<FitReason, 'TALKING_TO_CAMERA' | 'NOTHING_LOOKED_AT' | 'CANNOT_TELL'>, string> = {
  ANIMATED: 'This looks like a cartoon or animation, not a person filming themselves.',
  NOBODY_ON_CAMERA: 'Nobody appears on camera in this video.',
  NOBODY_TALKING_TO_CAMERA: 'Nobody in this video is talking to the camera.',
}

/** The warning for ONE video the creator picked to copy.
 *
 *  Returns null when there is nothing to warn about — `fits` and `unsure` both
 *  pass silently, on purpose. */
export function warningForPickedVideo(decision: FitDecision): FitWarning | null {
  if (decision.verdict !== 'does_not_fit') return null
  const saw = SAW[decision.reason as keyof typeof SAW]
  // A `does_not_fit` reason not in SAW would be a bug, and an empty card is a
  // worse outcome than no card: say nothing rather than show a blank warning.
  if (!saw) return null
  return {
    saw,
    cost: 'Twin learns how you talk. It cannot learn that from this video, so the script it writes will sound generic.',
    instead: 'Pick a video where someone is speaking straight to the camera — telling a story, giving an opinion, or explaining how to do something.',
    continueLabel: CONTINUE,
  }
}

/** Below this many usable videos, Twin says so.
 *
 *  ⚖️ FIVE IS A JUDGEMENT, NOT A MEASUREMENT, and it is written here as one
 *  number so it can be moved when there is evidence. Nothing has yet measured
 *  how many videos it takes before a script stops sounding generic. Saying "we
 *  found 3" is honest at any threshold; the threshold only decides when we stop
 *  mentioning it. */
export const ENOUGH_TO_SOUND_LIKE_YOU = 5

/** How many of the creator's own videos a scan actually looks at.
 *
 *  ⚠️ THIS IS A SAMPLE, AND THE SAMPLE COSTS MONEY. `build_voice` transcribes
 *  from AUDIO, so it never has frames; deciding whether a video is the creator
 *  talking to camera means an ADDITIONAL 360p download and one model call per
 *  video checked. That is why a scan does not look at all of them, and why
 *  `messageForOwnAccount` names the number it looked at instead of implying it
 *  looked at everything.
 *
 *  ⚖️ AND THE FLOOR IS NOT ARBITRARY: A SAMPLE BELOW THE THRESHOLD CAN NEVER
 *  BE SILENT. `messageForOwnAccount` returns `fine` -- says nothing at all --
 *  only once `usable` reaches ENOUGH_TO_SOUND_LIKE_YOU. If a scan checks four
 *  videos and the bar is five, then every creator on earth, including one whose
 *  every video is a perfect talking head, is told their account is thin. The
 *  warning would stop being a measurement and become a fixture of the product.
 *  So the sample must be able to clear the bar, with room for one that fails to
 *  download. `sampleCanBeSilent` below is that rule, and it is tested. */
export const OWN_VIDEOS_TO_CHECK = 6

/** True when a sample of this size can still produce silence -- i.e. when a
 *  creator with a good account can be told nothing at all.
 *
 *  ⚠️ THE NULL CHECK PRECEDES THE COERCION, because Number(null) is 0 and
 *  isFinite(0) is true, so a missing size would otherwise read as a real zero. */
export function sampleCanBeSilent(size: number | null | undefined): boolean {
  if (size === null || size === undefined) return false
  if (!Number.isFinite(size)) return false
  return size >= ENOUGH_TO_SOUND_LIKE_YOU
}

export interface AccountMessage {
  /** 'none' — we found nothing usable. 'thin' — enough to begin, worth saying.
   *  'fine' — nothing to say, and nothing is shown. */
  kind: 'none' | 'thin' | 'fine'
  headline: string
  detail: string
}

/** What Twin says about the creator's OWN account after a scan.
 *
 *  ⚠️ THIS IS THE SAME CHECK, SAID DIFFERENTLY, AND THAT IS THE WHOLE POINT.
 *  Telling someone "Twin isn't for you" at the front door is a verdict on the
 *  person, it is irreversible in their head, and they do not come back next
 *  month to see if it changed. So the normal case is a FACT ABOUT THEIR VIDEOS —
 *  how many we found — which is true at every count and reads as progress
 *  rather than rejection.
 *
 *  ⚖️ THE ZERO CASE STILL SAYS NO, because pretending otherwise would produce a
 *  bad script and blame them for it. But even then it names the one thing that
 *  changes the answer, so it is a door rather than a wall.
 *
 *  ⚠️ `usable` OF `checked`, AND NEITHER IS ASSUMED. A scan that checked nothing
 *  is not a scan that found nothing — it is `fine`, i.e. silent, because we have
 *  no standing to tell somebody about videos we never looked at. */
export function messageForOwnAccount(counts: { usable: number; checked: number }): AccountMessage {
  const usable = counts.usable
  const checked = counts.checked
  if (!Number.isFinite(usable) || !Number.isFinite(checked) || checked < 1) {
    return { kind: 'fine', headline: '', detail: '' }
  }
  // ⚠️ THE COUNT WE LOOKED AT IS NAMED, NOT IMPLIED. Twin does not watch every
  // video on an account — frames cost a download each, so a scan samples. Saying
  // "we found 3 videos of you talking to the camera" to someone with forty
  // videos states a fact about their WHOLE account that nobody measured. Naming
  // the sample keeps the sentence true at any size and costs the creator
  // nothing: they can see for themselves that three out of six is not three out
  // of forty.
  //
  // ⚖️ AND IT IS STILL A FACT ABOUT THEIR VIDEOS, which is the whole of option
  // 3. "None of the six we looked at" is a measurement; "Twin isn't for you" is
  // a verdict on the person, and the difference is whether they come back.
  const looked = `${checked} ${checked === 1 ? 'video' : 'videos'}`
  if (usable < 1) {
    return {
      kind: 'none',
      headline: `None of the ${looked} we looked at are you talking to the camera`,
      detail:
        'Twin writes scripts that sound like you, and it learns that from watching you speak. Post one video where you talk straight to the camera, then come back and scan again.',
    }
  }
  if (usable < ENOUGH_TO_SOUND_LIKE_YOU) {
    return {
      kind: 'thin',
      headline: `${usable} of the ${looked} we looked at ${usable === 1 ? 'is' : 'are'} you talking to the camera`,
      detail: 'That is enough to get started. The more you post talking straight to the camera, the more your scripts will sound like you.',
    }
  }
  return { kind: 'fine', headline: '', detail: '' }
}
