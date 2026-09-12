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
  /** How many frames the verdict was actually derived from.
   *
   *  ⚠️ CARRIED SO THE WARNING CAN SAY IT. Without this the creator-facing
   *  sentence had no way to be honest about its own evidence, and it wasn't:
   *  see the SAW comment below. */
  framesLookedAt: number
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
    return { verdict: 'unsure', reason: 'NOTHING_LOOKED_AT', framesLookedAt: 0 }
  }
  if (look.looksAnimated === true) {
    return { verdict: 'does_not_fit', reason: 'ANIMATED', framesLookedAt: frames }
  }
  if (look.peopleOnCamera === 'none') {
    return { verdict: 'does_not_fit', reason: 'NOBODY_ON_CAMERA', framesLookedAt: frames }
  }
  if (look.someoneTalkingToCamera === true) {
    return { verdict: 'fits', reason: 'TALKING_TO_CAMERA', framesLookedAt: frames }
  }
  if (look.someoneTalkingToCamera === false) {
    return { verdict: 'does_not_fit', reason: 'NOBODY_TALKING_TO_CAMERA', framesLookedAt: frames }
  }
  return { verdict: 'unsure', reason: 'CANNOT_TELL', framesLookedAt: frames }
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

/** ⚠️⚠️ THIS FIELD IS DOCUMENTED AS "WHAT TWIN SAW" AND IT USED TO SAY
 *  SOMETHING ELSE. The three sentences were claims about the WHOLE VIDEO --
 *  "Nobody appears on camera in this video." -- while the evidence behind them
 *  is EARLY_LOOK_FRAMES stills, which is TWO. A creator was told nobody appears
 *  on camera in a video of a woman talking to camera for 227 seconds, and told
 *  nobody was talking to the camera in a 19-second talking head. Both times the
 *  model answered honestly about the frames it was shown; the sentence promoted
 *  that answer into a statement about footage nobody looked at.
 *
 *  ⚖️ SO THE SENTENCE NOW REPORTS THE EVIDENCE, NOT A CONCLUSION FROM IT. The
 *  warning still fires, still costs the same, still offers the same override --
 *  it simply stops claiming to have watched the video. This is the same rule
 *  `readEarlyAnswer` already states one layer up: "false is an accusation and
 *  null is silence." An accusation must at least be about what we saw.
 *
 *  ⚠️ AND IT IS NOT FIXED BY LOOKING AT MORE FRAMES. Raising
 *  EARLY_LOOK_FRAMES would buy coverage and cost model spend on every scanned
 *  video, and the sentence would STILL be a whole-video claim from a sample.
 *  The two are independent: this one is free and true at any frame count.
 *
 *  ⚖️ PLAIN EVERYDAY ENGLISH, per the standing rule: "the two frames we
 *  checked", never "the sampled frames" or "n=2". */
function framesPhrase(n: number): string {
  // ⚠️ "FRAME" IS BANNED COPY AND THE TEST CAUGHT IT. The first draft of this
  // said "the two frames we checked"; `uses none of Twin's internal vocabulary`
  // failed, and it was right -- a creator reads "still pictures", not "frames".
  // THE TEST WAS RIGHT AND THIS CODE WAS WRONG.
  if (n === 1) return 'the one still picture we checked'
  if (n === 2) return 'the two still pictures we checked'
  return `the ${n} still pictures we checked`
}

const SAW: Record<
  Exclude<FitReason, 'TALKING_TO_CAMERA' | 'NOTHING_LOOKED_AT' | 'CANNOT_TELL'>,
  (n: number) => string
> = {
  ANIMATED: (n) => `In ${framesPhrase(n)}, this looks like a cartoon or animation rather than a person filming themselves.`,
  NOBODY_ON_CAMERA: (n) => `Nobody was on camera in ${framesPhrase(n)}.`,
  NOBODY_TALKING_TO_CAMERA: (n) => `Nobody was talking to the camera in ${framesPhrase(n)}.`,
}

/** The warning for ONE video the creator picked to copy.
 *
 *  Returns null when there is nothing to warn about — `fits` and `unsure` both
 *  pass silently, on purpose. */
export function warningForPickedVideo(decision: FitDecision): FitWarning | null {
  if (decision.verdict !== 'does_not_fit') return null
  const sawFor = SAW[decision.reason as keyof typeof SAW]
  // A `does_not_fit` reason not in SAW would be a bug, and an empty card is a
  // worse outcome than no card: say nothing rather than show a blank warning.
  if (!sawFor) return null
  // ⚠️ A does_not_fit WITH NO FRAMES BEHIND IT IS NOT A THING TO WARN ABOUT.
  // judgeFit cannot produce one today -- zero frames returns NOTHING_LOOKED_AT
  // -- but a hand-built decision could, and "nobody was on camera in the 0
  // frames we checked" is a sentence no creator should ever read.
  if (!Number.isFinite(decision.framesLookedAt) || decision.framesLookedAt < 1) return null
  return {
    saw: sawFor(decision.framesLookedAt),
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

/** What `messageForOwnAccount` is being asked about.
 *
 *  ⚠️ `complete` EXISTS BECAUSE THE CHECK IS ABOUT TO BECOME ASYNCHRONOUS, and
 *  the guard is written BEFORE the switch is thrown rather than after the first
 *  creator sees the bug. Today every caller hands over a finished sample: the
 *  scan checks its videos and then asks. When the per-video pass moves off the
 *  onboarding critical path — so a creator is not kept waiting through six
 *  downloads and six model calls — counts become readable WHILE they are still
 *  climbing, and that is a state no existing caller can produce.
 *
 *  ⚖️ AND A PARTIAL SAMPLE IS NOT A SMALL ONE, which is the distinction that
 *  matters and the one I first got wrong. A creator who has posted a single
 *  video yields `checked: 1` legitimately, and "None of the 1 video we looked
 *  at" is a TRUE and useful sentence for them. Refusing to speak below some size
 *  would silence a finished measurement. What must be refused is a verdict drawn
 *  from a sample still being collected — one usable video out of one checked SO
 *  FAR is not "none of them", it is "we have barely started".
 *
 *  ⚠️ ABSENT MEANS COMPLETE, AND THAT IS AN OBSERVATION RATHER THAN A DEFAULT.
 *  Every call site that exists today asks only after its sample is finished, so
 *  `undefined` describes them correctly. The asynchronous caller is the one that
 *  must SAY it is partial, because it is the only one that ever is. */
export interface AccountCounts {
  usable: number
  checked: number
  /** False only while the sample is still being collected. */
  complete?: boolean
  /** Where the videos came from, lowercased, when the caller knows.
   *
   *  ⚠️ IT EXISTS FOR ONE REASON: a platform we cannot read AT ALL produces the
   *  same zero as a platform we read badly, and the two deserve opposite
   *  sentences. Absent means "not told", and an untold platform is treated as
   *  readable — silence must never manufacture an excuse for us. */
  platform?: string | null
}

/** Platforms whose videos Twin currently cannot read at all.
 *
 *  ⚠️ MEASURED ON PRODUCTION 2026-09-12, NOT ASSUMED: 60 Instagram profile
 *  fetches, 0 ok, 60 errored, 0 transcripts. Every one carried the IDENTICAL
 *  message `no audio url found` — the Apify actor's own `errMsg`, wrapped by
 *  the worker. Sixty different videos do not independently lose their audio on
 *  the same day; a 100% rate behind a single string is a contract that moved.
 *  Instagram references have therefore NEVER reached a transcript.
 *
 *  ⚖️ THIS LIST IS A CONFESSION, NOT A POLICY, AND IT IS MEANT TO SHRINK. It
 *  exists so the screen stops implying the creator's videos were unclear when
 *  the truth is we never read one. The moment the actor works, delete the entry
 *  and the honest sentence disappears with it — nothing else needs touching.
 *
 *  ⚠️ AND TIKTOK IS DELIBERATELY NOT HERE. TikTok fails OFTEN (IP blocks, 119 of
 *  154 invisible failures) but not ALWAYS, and 807 assess jobs finished clean
 *  overall. "Often" is a different sentence from "never", and putting it here
 *  would excuse Twin from a limit it does not actually have. */
export const UNREADABLE_PLATFORMS: readonly string[] = Object.freeze(['instagram'])

/** Whether Twin can read this platform's videos at all. */
export function platformIsUnreadable(platform: string | null | undefined): boolean {
  const p = typeof platform === 'string' ? platform.trim().toLowerCase() : ''
  return p !== '' && UNREADABLE_PLATFORMS.includes(p)
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
export function messageForOwnAccount(counts: AccountCounts): AccountMessage {
  const usable = counts.usable
  const checked = counts.checked
  if (!Number.isFinite(usable) || !Number.isFinite(checked) || checked < 1) {
    return { kind: 'fine', headline: '', detail: '' }
  }
  // ⚠️ A SAMPLE STILL BEING COLLECTED GETS NO VERDICT. Speaking from it would
  // produce "None of the 1 video we looked at" a second after the scan starts
  // checking, and then quietly replace it once the other five arrive — a
  // warning manufactured out of incompleteness, shown to a creator whose
  // account may be perfect. Silence costs nothing here: the finished sample is
  // seconds away and will say the true thing.
  //
  // ⚖️ EXPLICITLY `=== false`, NOT FALSY. `undefined` is every existing caller,
  // all of which are complete; only a caller that KNOWS it is partial says so.
  if (counts.complete === false) {
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
  // ⚠️ THE SENTENCE REPORTS TWIN'S READING, NOT THE CREATOR'S POSTING. The
  // previous wording — "Post one video where you talk straight to the camera,
  // then come back and scan again" — told the creator to fix a problem Twin
  // has. It was WRONG ON 10 OF 10 MEASURED ACCOUNTS, Hormozi among them at 1
  // usable of 6, on an account that is nothing but talking to camera. The
  // detector, not the account, is what fails: ~13.7% of ~51 videos read as
  // usable. An instruction built on a false negative is worse than a refusal,
  // because a refusal gets retried and this reads as a permanent statement
  // about her account.
  //
  // ⚖️ SO IT SAYS WHAT HAPPENED AND PROMISES NOTHING. "We could only read N"
  // locates the limit in Twin's reading, which is where it actually is, and
  // stays true after the detector is fixed — it just reports a better number.
  // No instruction, because Twin has no instruction to give that would help.
  if (usable < 1) {
    // ⚠️ "WE COULD NOT READ ANY OF THE 6 VIDEOS" READS AS HER FAULT WHEN THE
    // PLATFORM IS ONE WE HAVE NEVER READ. It implies we looked at six videos and
    // they were not clear enough — six specific videos of hers, judged. The
    // truth on Instagram is that we never read ONE: 60 of 60 attempts failed
    // with one identical error, because the actor's contract moved. Reporting
    // our outage as her sample is the sharpest version of a defect this file
    // already fixed once, when the wording told creators to post differently to
    // fix a detector that was failing on 10 of 10 accounts.
    //
    // ⚖️ SO IT NAMES THE LIMIT AND WHOSE IT IS, AND PROMISES NOTHING ELSE. No
    // instruction, because there is nothing she can do; no claim about what Twin
    // learned instead, because this function cannot see that and a comforting
    // guess would be a second false statement on the same card.
    if (platformIsUnreadable(counts.platform)) {
      return {
        kind: 'none',
        headline: 'Twin cannot read Instagram videos yet',
        detail: 'That is a limit on our side, not something about your account.',
      }
    }
    return {
      kind: 'none',
      headline: `We could not read any of the ${looked} we looked at clearly enough to learn from`,
      detail: 'Twin will keep learning as you post.',
    }
  }
  if (usable < ENOUGH_TO_SOUND_LIKE_YOU) {
    return {
      kind: 'thin',
      headline: `We could only read ${usable} of the ${looked} we looked at clearly enough to learn from`,
      detail: 'Twin will keep learning as you post.',
    }
  }
  return { kind: 'fine', headline: '', detail: '' }
}
