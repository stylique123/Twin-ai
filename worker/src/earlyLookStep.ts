// THE ORDER THE EARLY CHECK HAPPENS IN, EXPRESSED SO IT CAN BE TESTED.
//
// ⚠️ THE ORDER *IS* THE FEATURE. "Look, then write the answer down, and only
// then start the expensive work" is the entire requirement — a creator must hear
// "this won't work well" in seconds rather than after a full analysis. That
// sequence is trivially easy to get wrong later by moving one line, and
// impossible to test through a function that also downloads and calls a model.
// So the sequence lives here with its three collaborators injected, and the real
// download / look / write are supplied by the caller.
//
// ⚖️ NOTHING HERE THROWS. Every failure becomes an all-null answer, which
// judgeFit reads as `unsure` and lets the creator straight through. The check is
// allowed to be useless; it is never allowed to be an obstacle.

import type { EarlyLookResult } from './earlyLookRules.js'

export interface EarlyLookStepDeps {
  /** Fetch just enough video to sample two stills from. */
  download: (outPath: string) => Promise<void>
  /** Ask the three questions. */
  look: (videoPath: string) => Promise<EarlyLookResult>
  /** Make the answer visible to whoever is waiting, BEFORE the slow work runs. */
  persist: (r: EarlyLookResult) => Promise<void>
}

const NOTHING = (failure: string): EarlyLookResult => ({
  someoneTalkingToCamera: null, peopleOnCamera: null, looksAnimated: null,
  framesLookedAt: 0, failure,
})

/**
 * Run the early check and publish its answer.
 *
 * ⚠️ `persist` IS AWAITED, AND THAT IS THE ONE THING HERE WORTH ARGUING ABOUT.
 * Firing it and moving on would let transcription start first and the answer
 * land afterwards — which is precisely the "analyse to 100%, then apologise"
 * behaviour this exists to prevent. The write is small and it is the deliverable,
 * so it is waited for.
 *
 * ⚖️ BUT A FAILED WRITE IS NOT A FAILED INGEST. If persisting throws, the
 * creator simply does not get a warning, and losing a warning must never cost
 * them the video they asked for.
 */
export async function earlyLookStep(
  videoPath: string,
  deps: EarlyLookStepDeps,
): Promise<EarlyLookResult> {
  let result: EarlyLookResult
  try {
    await deps.download(videoPath)
  } catch {
    // ⚠️ AND THE LOOK IS NOT ATTEMPTED. Sampling frames from a file that was
    // never written would produce an answer about nothing, which is worse than
    // no answer: it reads like a finding.
    result = NOTHING('TRIAGE_DOWNLOAD_FAILED')
    await persistQuietly(deps, result)
    return result
  }
  try {
    result = await deps.look(videoPath)
  } catch {
    result = NOTHING('EARLY_LOOK_THREW')
  }
  await persistQuietly(deps, result)
  return result
}

async function persistQuietly(deps: EarlyLookStepDeps, r: EarlyLookResult): Promise<void> {
  try {
    await deps.persist(r)
  } catch {
    /* never block the creator's video on a write that only carries a warning */
  }
}
