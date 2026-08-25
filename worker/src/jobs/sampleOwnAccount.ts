// THE JOB THAT LOOKS AT THE CREATOR'S OWN VIDEOS.
//
// ⚠️ THIS IS THE CALLER THAT NEVER EXISTED. `sampleOwnAccount` (the counting
// rule) and `messageForOwnAccount` (the sentence) have both been shipped and
// tested for weeks with ZERO callers between them — the reference-video half of
// the talking-head gate went live because `transcribe.ts` gave it somewhere to
// run and somewhere to write; this half had neither. 0171 added the columns.
// This adds the run.
//
// ⚖️ IT IS ITS OWN JOB, AND THAT IS THE DESIGN DECISION WORTH STATING. The
// obvious alternative — do it inside the scan — was rejected on latency, not on
// money. Six downloads plus six model calls is roughly 100 calls across three
// weeks at current volume, which is nothing; but sitting in front of a creator
// waiting to be onboarded, it is six downloads they can feel. So the scan
// enqueues and moves on, and a creator is never held behind a check whose entire
// output is an optional warning.
//
// ⚠️ AND IT DOES NOT PIGGYBACK ON build_voice, WHICH LOOKS LIKE FREE REUSE AND
// IS NOT. `build_voice` calls `transcribeFromUrl`, which resolves from captions
// wherever it can and in that case NEVER DOWNLOADS THE VIDEO. There is no frame
// to borrow on the cheapest and most common path, so "reuse the download" would
// silently mean "only sample the creators whose captions were missing" — a
// sample biased by exactly the thing it must not be biased by.
//
// ⚖️ max_attempts: 1, THE SAME RULE build_voice USES. A retry re-runs paid
// downloads and paid model calls to re-derive a warning, and the default of five
// attempts would multiply that by five for an output nobody is blocked on.

import { db, type Job } from '../db.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadReference } from '../media.js'
import { parseRoute } from '../downloadRoute.js'
import { earlyLook } from '../earlyLook.js'
import { sampleOwnAccount, type OneLook, type SampleCounts } from '../ownAccountSample.js'

/** ⚠️ MIRRORS @twinai/shared's OWN_VIDEOS_TO_CHECK BY VALUE, and it has to.
 *  The worker has NO runtime dependency on `@twinai/shared` — deliberately, and
 *  stated in half a dozen files here. `theTwoHalvesAgree` pins the shape of the
 *  counts across that boundary; this constant is the other half of the same
 *  hazard, so it is asserted in the tests rather than trusted. */
export const OWN_VIDEOS_TO_CHECK = 6

/**
 * Look at one of the creator's own videos and answer the one question that
 * matters: is this them, talking to camera.
 *
 * ⚠️ NEVER THROWS, AND THE FAILURE IS NAMED. `sampleOwnAccount` treats a thrown
 * `lookAt` as an answerless video, so throwing would still be safe — but it
 * would lose WHY, and "we could not download it" and "the model would not say"
 * are different facts about the creator's account. `noAnswer` counts them the
 * same; the log should not.
 */
export async function lookAtOwnVideo(url: string): Promise<OneLook> {
  const dir = await mkdtemp(join(tmpdir(), 'twinai-own-'))
  try {
    const outPath = join(dir, 'own.mp4')
    try {
      // ⚖️ `triage`, NOT `video`: 360p. Two stills are all the question needs,
      // and this runs six times per creator rather than once.
      await downloadReference(url, parseRoute(undefined), { medium: 'triage', outPath, timeoutMs: 45_000 })
    } catch (err) {
      console.error('sample_own_account: download failed', url, err instanceof Error ? err.message : err)
      return { someoneTalkingToCamera: null, failure: 'OWN_DOWNLOAD_FAILED' }
    }
    try {
      const r = await earlyLook(outPath)
      // ⚠️ THE LOOK'S OWN FAILURE FIELD IS CARRIED THROUGH, NOT RE-DERIVED. A
      // null answer with no failure is the model declining to say, which is a
      // real terminal answer and NOT an error — folding the two together would
      // convert every decline into a point against the creator.
      return { someoneTalkingToCamera: r.someoneTalkingToCamera, failure: r.failure ?? null }
    } catch (err) {
      console.error('sample_own_account: look threw', url, err instanceof Error ? err.message : err)
      return { someoneTalkingToCamera: null, failure: 'OWN_LOOK_THREW' }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Write the counts so far onto the voice.
 *
 * ⚠️ ALL FOUR COLUMNS, EVERY TIME. 0171 refuses a half-written sample with a
 * check constraint, so a partial update is not a degraded write here — it is a
 * rejected one. That is deliberate: the reader turns these into a sentence about
 * the creator's own work, and there is no safe way to render three of four.
 */
export async function publishCounts(voiceId: string, counts: SampleCounts): Promise<void> {
  const { error } = await db.from('brand_voices').update({
    own_sample_usable: counts.usable,
    own_sample_checked: counts.checked,
    // ⚖️ WRITTEN EXPLICITLY WHILE STILL FALSE. A sample in progress must SAY it
    // is in progress: `messageForOwnAccount` returns silence for `complete ===
    // false`, and absent would instead read as a finished measurement of zero —
    // the exact bug #537 landed to prevent.
    own_sample_complete: counts.complete,
    own_sample_no_answer: counts.noAnswer,
  }).eq('id', voiceId)
  if (error) throw new Error(error.message)
}

/**
 * Handle `sample_own_account`.
 * payload: { brand_voice_id: string, urls: string[] }
 *
 * ⚖️ A SAMPLE THAT LEARNED NOTHING STILL FINISHES. `sampleOwnAccount` publishes
 * `complete: true` unconditionally, including for zero-of-zero, because "we
 * looked and could not tell" is a terminal state the reader handles (as silence)
 * and a permanently-pending row is one it cannot.
 */
export async function handleSampleOwnAccount(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { brand_voice_id?: string; urls?: string[] }
  const voiceId = String(p.brand_voice_id ?? '').trim()
  const urls = Array.isArray(p.urls) ? p.urls.filter((u) => typeof u === 'string' && u.trim() !== '') : []
  if (!voiceId) throw new Error('sample_own_account needs brand_voice_id')

  // ⚠️ NO URLS IS NOT AN ERROR, IT IS AN EMPTY SAMPLE. Throwing would mark the
  // job failed for a creator whose account simply had no usable video links,
  // which is a fact about their account and not a fault in the run.
  const counts = await sampleOwnAccount(urls, OWN_VIDEOS_TO_CHECK, {
    lookAt: lookAtOwnVideo,
    publish: (c) => publishCounts(voiceId, c),
  })

  return {
    usable: counts.usable,
    checked: counts.checked,
    no_answer: counts.noAnswer,
    complete: counts.complete,
    offered: urls.length,
  }
}
