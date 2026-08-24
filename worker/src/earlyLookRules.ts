// THE THREE QUESTIONS, AND HOW AN ANSWER TO THEM IS READ.
//
// ⚠️ SEPARATE FROM earlyLook.ts BECAUSE PURE LOGIC MUST NOT NEED AN ENVIRONMENT.
// The reader below is the part with all the traps in it — "unsure" surviving as
// null, a missing key not becoming false — so it is the part that most needs
// testing, and it cannot be tested through a module that reads SUPABASE_URL at
// import time. Same separation as visualExtractionRules.ts and visualPass.ts.
//
// ⚠️ IT OBSERVES; IT DOES NOT DECIDE. The verdict and every word a creator reads
// live in @twinai/shared's talkingHeadFit, and the worker has NO runtime
// dependency on @twinai/shared — which is why visualExtractionRules.ts exists as
// a byte-parity copy with a test to keep it honest. Rather than mint a SECOND
// thing needing parity, this returns the three raw answers and lets the caller,
// which does have shared, judge them. There is nothing here to drift.

export const EARLY_LOOK_FRAMES = 2

/** ⚠️ MIRRORS @twinai/shared's EarlyLook BY SHAPE, and is consumed by judgeFit
 *  there. Every field is nullable because "we could not tell" is a real answer
 *  and must never arrive as `false`. */
export interface EarlyLookResult {
  someoneTalkingToCamera: boolean | null
  peopleOnCamera: 'none' | 'one' | 'multiple' | null
  looksAnimated: boolean | null
  framesLookedAt: number
  /** Why we have no answers, when we have none. null when the look happened. */
  failure: string | null
}

export const SYSTEM = `You answer three questions about still frames from a video.

Answer only from what the frames show. If a frame does not settle a question,
answer "unsure" — that is a correct answer and it costs you nothing. A guess that
turns out wrong stops a real person from using a video they wanted, so "unsure"
is always better than a confident invention.`

export const EARLY_PROMPT = `You are shown ${EARLY_LOOK_FRAMES} still frames from one short video.

1. talking_to_camera: Is a real person facing the camera and speaking to whoever
   is watching — the way someone talks in a vlog, an opinion video or a how-to?
   Someone acting out a scene with another person, or shown from behind, or never
   facing the lens, is NOT talking to the camera. Answer "yes", "no" or "unsure".

2. people_on_camera: How many real people can you see? Answer "none", "one",
   "multiple" or "unsure". A photo of a person on a screen is not a person on
   camera.

3. animated: Is this drawn, animated or a cartoon rather than filmed with a
   camera? Answer "yes", "no" or "unsure".

Reply as JSON only: {"talking_to_camera":"...","people_on_camera":"...","animated":"..."}`

/** ⚠️ "unsure", A MISSING KEY AND A WORD WE DO NOT RECOGNISE ALL MEAN null.
 *  The one thing that must never happen is an unreadable answer landing as
 *  `false`, because false is an accusation and null is silence. */
export function readEarlyAnswer(raw: unknown, framesLookedAt: number): EarlyLookResult {
  const rec = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const yesNo = (v: unknown): boolean | null =>
    v === 'yes' ? true : v === 'no' ? false : null
  const count = (v: unknown): 'none' | 'one' | 'multiple' | null =>
    v === 'none' || v === 'one' || v === 'multiple' ? v : null
  return {
    someoneTalkingToCamera: yesNo(rec.talking_to_camera),
    peopleOnCamera: count(rec.people_on_camera),
    looksAnimated: yesNo(rec.animated),
    framesLookedAt,
    failure: null,
  }
}

