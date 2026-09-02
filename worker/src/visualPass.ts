// LOOKING AT A REFERENCE, ONCE, AND WRITING DOWN ONLY WHAT WAS SEEN.
//
// ⚠️ THIS COSTS A SECOND DOWNLOAD, AND THAT IS A DELIBERATE, TEMPORARY CHOICE.
// The transcript pass pulls `bestaudio`; frames need pixels. The efficient
// arrangement is one video download that both passes read, and it is NOT what
// this does — because the transcript path was proven in production hours ago
// against a library of 4,000 references, and refactoring it to serve a pass that
// has not yet been shown to work would risk a working thing for a speculative
// one. The pilot (#58) runs on 20-40 videos, where a doubled download is a
// rounding error. If the pass earns its place, merging the two downloads is the
// first optimisation and it can be done with the measurement already in hand.
//
// ⚖️ AND IT IS OPT-IN PER JOB. Nothing about the backlog changes until somebody
// asks for frames on purpose.

import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadReference } from './media.js'
import { sampleFrames, DEFAULT_FRAME_COUNT, type ScheduleBasis } from './frameSample.js'
import { visualPrompt } from './visualPrompt.js'
import { extractVisualProfile } from './visualExtractionRules.js'
import { geminiJson } from './gemini.js'
import { modelForTask } from './modelRouting.js'
import { persistFrames } from './referenceFrames.js'
import { ffmpegPresent } from './frameSample.js'
import { classifyDownloadFailure, phaseOf } from './downloadFailure.js'
import { runTierZeroPass, type TierZeroPassResult } from './referenceTierZeroPass.js'
import type { DownloadRoute } from './downloadRoute.js'

const SYSTEM = `You describe what is visible in still frames from a video.

You are not summarising, reviewing or guessing at context. Another system decides
what a creator can recreate; your only job is to report what the frames show,
with the frame numbers that show it.

An answer with no frame citation is DISCARDED, so a guess costs you the field
rather than passing as knowledge.`

/** What the visual pass produces, in the shape the row wants.
 *
 *  ⚠️ `ran: false` IS NOT AN ERROR. A reference whose video would not download,
 *  or which yielded no frames, has simply not been looked at — and that is a
 *  different row from one looked at and found unreadable. The columns stay null
 *  and `visual_assessed_at` is not stamped, so a later run knows to try again. */
export interface VisualPassResult {
  ran: boolean
  visual_profile: unknown | null
  visual_rejections: unknown | null
  frames_sampled: number | null
  frame_schedule_basis: ScheduleBasis | null
  /** Why it did not run, when it did not. Normalised through the same
   *  classifier the transcript ladder uses, so a frames failure and a transcript
   *  failure on the same video are comparable rather than two vocabularies. */
  failure_code: string | null
  phase: string | null
  /** What came off the FILE, with no model involved. Present even when the
   *  model call failed — that is the entire reason it is computed first. */
  tier_zero: TierZeroPassResult | null
}

const NOT_RUN = (
  failure_code: string | null, phase: string | null, tier_zero: TierZeroPassResult | null = null,
): VisualPassResult => ({
  ran: false,
  visual_profile: null,
  visual_rejections: null,
  frames_sampled: null,
  frame_schedule_basis: null,
  failure_code,
  phase,
  // ⚠️ DEFAULTS TO null, NOT TO AN EMPTY PROFILE. A download that never landed
  // leaves no file to measure, and a Tier 0 row of nulls there would claim a
  // reading of a video nobody ever had.
  tier_zero,
})

/**
 * Download, sample, ask, parse.
 *
 * ⚠️ NO SCHEMA IS SENT TO THE MODEL, AND THAT IS NOT AN OVERSIGHT. The response
 * mixes value types per field — an enum here, a boolean there, and the
 * NOT_DETERMINED sentinel anywhere — which no single response schema expresses.
 * More importantly, a schema-shaped answer is not a BELIEVABLE one: what makes a
 * claim admissible here is a frame citation that can support its claim class,
 * and that is `extractVisualProfile`'s job. Sending a schema would enforce the
 * part that does not matter and imply the part that does was handled.
 *
 * ⚖️ THROWS FOR NOTHING. Every failure is a row: an unavailable video, a video
 * with no samplable frames, a model that answered rubbish. The caller records
 * the result beside the transcript's and moves to the next reference.
 */
export async function runVisualPass(
  rawUrl: string,
  route: DownloadRoute,
  opts: { count?: number; at?: readonly number[]; speechMs?: number | null } = {},
): Promise<VisualPassResult> {
  const dir = await mkdtemp(join(tmpdir(), 'twinai-vis-'))
  const videoPath = join(dir, 'video.mp4')
  try {
    try {
      await downloadReference(rawUrl, route, { medium: 'video', outPath: videoPath })
    } catch (e) {
      // ⚠️ THE SAME CODES AS THE TRANSCRIPT LADDER. A video that is IP-blocked
      // for frames is IP-blocked for audio; giving the two passes different
      // words for it would make the library's failure counts uncomparable.
      return NOT_RUN(classifyDownloadFailure(e), phaseOf(e))
    }

    // ⚠️ TIER 0 RUNS HERE — AFTER THE DOWNLOAD, BEFORE ANYTHING CAN FAIL.
    // Every path below this point returns early on failure: no frames, frames
    // not persisted, model refused. Those are exactly the runs where a creator
    // learns nothing today. Measuring first is what makes this a floor rather
    // than a bonus on the happy path only.
    //
    // ⚖️ IT COSTS UP TO TIER_ZERO_TIMEOUT_MS ON JOBS THAT GO ON TO FAIL, and
    // that is the trade taken on purpose: a reference job that produces five
    // real numbers slowly beats one that produces nothing quickly. It cannot
    // throw and it cannot fail the job — see `runTierZeroPass`.
    const tierZero = await runTierZeroPass(videoPath, opts.speechMs ?? null)

    const sample = await sampleFrames(videoPath, { count: opts.count ?? DEFAULT_FRAME_COUNT, at: opts.at })
    // ⚠️ NO FRAMES MEANS THE PASS DID NOT HAPPEN. `extractVisualProfile` would
    // refuse to read a response produced from nothing anyway — a model answering
    // with no frames to look at is answering from the caption, which is the
    // WRONG EPISTEMIC SOURCE rather than weak evidence. Stopping here saves the
    // call as well as the confusion.
    if (sample.framesSampled === 0) {
      // ⚠️ WAS THE TOOL MISSING, OR THE VIDEO? sampleFrames catches EVERY ffmpeg
      // failure with `catch { continue }`, so a container without ffmpeg, a
      // corrupt download and a video with no decodable frame all arrive here as
      // the same zero. The pilot's attrition table would then report an
      // infrastructure failure as a property of the references — "8 videos
      // yielded no frames" reads as a finding about the library when it is a
      // finding about the box.
      //
      // ⚖️ ASKED ONLY ON THE ZERO PATH, so the healthy case pays nothing.
      // `ffmpegPresent` was written for exactly this and had never been called
      // by anything — a check that exists and never runs is not a check.
      const haveFfmpeg = await ffmpegPresent()
      return NOT_RUN(haveFfmpeg ? 'NO_FRAMES_SAMPLED' : 'FFMPEG_MISSING', 'media_download', tierZero)
    }

    // ⚠️ THE FRAMES ARE KEPT BEFORE THEY ARE SHOWN. This pass used to sample
    // into a temp directory, send the frames to the model, and delete the
    // directory below — so the profile came back citing `frame 2` and frame 2
    // no longer existed. Every visual field was an assertion nobody could
    // check.
    //
    // ⚖️ AND BEFORE THE CALL, NOT AFTER IT. Uploading afterwards spends the call
    // first and only then discovers the evidence could not be kept, which
    // leaves exactly the unverifiable claims this is here to prevent. A frame
    // we cannot store is a claim we cannot check, and a claim nobody can check
    // is worse than no claim: it reads like a finding.
    const kept = await persistFrames(rawUrl, sample)
    if (kept.failure !== null) return NOT_RUN('FRAMES_NOT_PERSISTED', 'media_download', tierZero)

    let raw: unknown
    try {
      raw = await geminiJson(
        SYSTEM,
        visualPrompt(sample.framesSampled),
        undefined,
        90_000,
        undefined,
        modelForTask('extract'),
        [...sample.frames],
      )
    } catch (e) {
      return NOT_RUN('VISUAL_MODEL_FAILED', 'complete', tierZero)
    }

    // ⚖️ `framesSampled` IS WHAT LANDED, and it is the number every citation is
    // range-checked against. Passing the REQUESTED count would legalise a
    // citation to a frame nobody sent — the exact hallucination the check exists
    // to catch.
    const { profile, rejections } = extractVisualProfile(raw, { framesSampled: sample.framesSampled })
    return {
      ran: true,
      visual_profile: profile,
      // Rejections are evidence about the PROMPT, not noise: "which fields does
      // the model struggle to answer from frames" is the question the pilot
      // exists to answer, and it is unanswerable from a profile that kept only
      // what passed.
      visual_rejections: rejections,
      frames_sampled: sample.framesSampled,
      frame_schedule_basis: sample.scheduleBasis,
      failure_code: null,
      phase: 'complete',
      tier_zero: tierZero,
    }
  } finally {
    // Analyze-and-discard the VIDEO, same as every other media path here. The
    // sampled frames are not discarded with it — they are the evidence for the
    // claims, and they were uploaded above before the model ever saw them.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
