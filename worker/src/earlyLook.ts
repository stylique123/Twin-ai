// THE FIRST THING TWIN LOOKS AT, AND THE ONLY THING IT LOOKS AT FIRST.
//
// TwinAI is talking-head only, so before spending a transcript and a full visual
// pass on a video, it answers three questions off a couple of frames: is anyone
// on camera, is anyone talking TO the camera, and is this filmed or drawn.
//
// ⚠️ THIS RUNS EARLY OR IT IS POINTLESS. The requirement is that a creator hears
// "this won't work well" in seconds, not after a full analysis finishes. A check
// that runs at the end is an apology, not a check. So this deliberately does NOT
// reuse the eighteen-field visual pass: that pass is the thing being avoided.
//
// ⚠️ IT OBSERVES; IT DOES NOT DECIDE. The verdict and every word a creator reads
// live in @twinai/shared's talkingHeadFit, and the worker has NO runtime
// dependency on @twinai/shared — which is why visualExtractionRules.ts exists as
// a byte-parity copy with a test to keep it honest. Rather than mint a SECOND
// thing needing parity, this returns the three raw answers and lets the caller,
// which does have shared, judge them. There is nothing here to drift.
//
// ⚖️ TWO FRAMES, NOT FOUR. This is a triage question, not a description, and it
// is paid for on every video a creator picks. One frame cannot tell a pause from
// a person who never speaks; two is the cheapest sample that can.

import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sampleFrames } from './frameSample.js'
import { readEarlyAnswer, EARLY_LOOK_FRAMES, EARLY_PROMPT, SYSTEM, type EarlyLookResult } from './earlyLookRules.js'
import { geminiJson } from './gemini.js'
import { modelForTask } from './modelRouting.js'

const NOTHING = (failure: string): EarlyLookResult => ({
  someoneTalkingToCamera: null, peopleOnCamera: null, looksAnimated: null,
  framesLookedAt: 0, failure,
})

export { EARLY_LOOK_FRAMES, EARLY_PROMPT, readEarlyAnswer, type EarlyLookResult }

/**
 * Look at an ALREADY DOWNLOADED video and answer the three questions.
 *
 * ⚠️ TAKES A PATH, NOT A URL, ON PURPOSE. Downloading a second time to ask a
 * triage question would cost more than the analysis it is meant to save. The
 * caller downloads once and hands the file to this and to whatever follows.
 *
 * ⚖️ THROWS FOR NOTHING. Every failure returns all-null with a reason, which
 * `judgeFit` reads as `unsure` and lets straight through. A broken check must
 * never become a refusal.
 */
export async function earlyLook(videoPath: string): Promise<EarlyLookResult> {
  const dir = await mkdtemp(join(tmpdir(), 'twinai-early-'))
  try {
    let sample
    try {
      sample = await sampleFrames(videoPath, { count: EARLY_LOOK_FRAMES })
    } catch {
      return NOTHING('FRAME_SAMPLE_FAILED')
    }
    if (sample.framesSampled === 0) return NOTHING('NO_FRAMES_SAMPLED')

    let raw: unknown
    try {
      // ⚖️ A SHORT TIMEOUT, BECAUSE THE POINT IS SPEED. A triage question that
      // takes 90 seconds has already failed at its job even if it answers
      // correctly; letting it lapse into `unsure` is the better outcome.
      raw = await geminiJson(SYSTEM, EARLY_PROMPT, undefined, 20_000, undefined,
        modelForTask('extract'), [...sample.frames])
    } catch {
      return NOTHING('EARLY_MODEL_FAILED')
    }
    return readEarlyAnswer(raw, sample.framesSampled)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
