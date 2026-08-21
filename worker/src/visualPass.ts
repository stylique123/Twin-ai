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
import { classifyDownloadFailure, phaseOf } from './downloadFailure.js'
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
}

const NOT_RUN = (failure_code: string | null, phase: string | null): VisualPassResult => ({
  ran: false,
  visual_profile: null,
  visual_rejections: null,
  frames_sampled: null,
  frame_schedule_basis: null,
  failure_code,
  phase,
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
  opts: { count?: number; at?: readonly number[] } = {},
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

    const sample = await sampleFrames(videoPath, { count: opts.count ?? DEFAULT_FRAME_COUNT, at: opts.at })
    // ⚠️ NO FRAMES MEANS THE PASS DID NOT HAPPEN. `extractVisualProfile` would
    // refuse to read a response produced from nothing anyway — a model answering
    // with no frames to look at is answering from the caption, which is the
    // WRONG EPISTEMIC SOURCE rather than weak evidence. Stopping here saves the
    // call as well as the confusion.
    if (sample.framesSampled === 0) return NOT_RUN('NO_FRAMES_SAMPLED', 'media_download')

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
    if (kept.failure !== null) return NOT_RUN('FRAMES_NOT_PERSISTED', 'media_download')

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
      return NOT_RUN('VISUAL_MODEL_FAILED', 'complete')
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
    }
  } finally {
    // Analyze-and-discard the VIDEO, same as every other media path here. The
    // sampled frames are not discarded with it — they are the evidence for the
    // claims, and they were uploaded above before the model ever saw them.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
