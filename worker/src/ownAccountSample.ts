// COUNTING THE CREATOR'S OWN VIDEOS, EXPRESSED SO IT CAN BE TESTED.
//
// ⚠️ THE COUNTING RULE IS THE FEATURE, NOT THE LOOP. `earlyLookStep` already
// downloads one video, asks the three questions and never throws. What has never
// existed is the thing that runs it over a SAMPLE of the creator's own videos and
// turns the answers into the two numbers `messageForOwnAccount` reads. Those two
// numbers end up in a sentence shown to a person about their own work, so how
// they are counted is the part worth testing — and it cannot be tested through a
// function that also downloads and calls a model. Same separation as
// earlyLookStep.ts: sequence here, real I/O injected.
//
// ⚖️ NOTHING HERE THROWS. A sample that fails entirely produces zero-of-zero,
// which `messageForOwnAccount` reads as silence. The check is allowed to be
// useless; it is never allowed to cost the creator their scan.

/** Mirrors the one field of EarlyLookResult this cares about, plus whether the
 *  look happened at all. Kept structural so the caller can pass the real
 *  `EarlyLookResult` straight through. */
export interface OneLook {
  someoneTalkingToCamera: boolean | null
  /** Why we have no answer, when we have none. null when the look happened. */
  failure: string | null
}

export interface SampleCounts {
  /** Videos that are the creator talking to camera. */
  usable: number
  /** ⚠️ VIDEOS WE ACTUALLY GOT AN ANSWER ABOUT — never videos we attempted.
   *  See the note on `countOneLook`. */
  checked: number
  /** False while the sample is still being collected. */
  complete: boolean
  /** Attempts that produced no answer. Reported, never folded into `checked`. */
  noAnswer: number
}

export const EMPTY_SAMPLE: SampleCounts =
  Object.freeze({ usable: 0, checked: 0, complete: false, noAnswer: 0 })

/**
 * Fold one look into the running counts.
 *
 * ⚠️ A VIDEO WE COULD NOT READ IS NOT A VIDEO WE LOOKED AT, and this is the
 * whole of the counting rule. `messageForOwnAccount` renders `checked` into a
 * sentence the creator reads —
 *
 *     "None of the 6 videos we looked at are you talking to the camera"
 *
 * — so if three of those six failed to download, that sentence is FALSE. We
 * looked at three. Counting an attempt as a look would make Twin state a
 * measurement it never took, about the person's own work, in the one place the
 * product is asking them to trust it.
 *
 * ⚖️ AND `unsure` COUNTS THE SAME WAY, FOR THE SAME REASON. `readEarlyAnswer`
 * returns null for "unsure", a missing key, or a word it does not recognise —
 * deliberately, because false is an accusation and null is silence. A null here
 * is the model declining to say, which is not evidence the video is unusable.
 * Folding it into `checked` would quietly convert every decline into a point
 * against the creator.
 *
 * ⚠️ THE CONSEQUENCE IS THAT `checked` CAN FALL SHORT OF THE SAMPLE SIZE, and
 * that is correct rather than a gap. OWN_VIDEOS_TO_CHECK is 6 against a bar of
 * 5 precisely so one unreadable video still leaves a creator able to be told
 * nothing at all.
 */
export function countOneLook(counts: SampleCounts, look: OneLook): SampleCounts {
  if (look.failure !== null && look.failure !== undefined) {
    return { ...counts, noAnswer: counts.noAnswer + 1 }
  }
  if (look.someoneTalkingToCamera === null || look.someoneTalkingToCamera === undefined) {
    return { ...counts, noAnswer: counts.noAnswer + 1 }
  }
  return {
    ...counts,
    checked: counts.checked + 1,
    usable: counts.usable + (look.someoneTalkingToCamera === true ? 1 : 0),
  }
}

export interface OwnAccountSampleDeps {
  /** Look at one video. Must not throw; a thrown error is treated as no answer. */
  lookAt: (videoRef: string) => Promise<OneLook>
  /** Publish the counts so far. Called after EVERY video, and once at the end. */
  publish: (counts: SampleCounts) => Promise<void>
}

/**
 * Look at up to `limit` of the creator's own videos and publish the counts.
 *
 * ⚠️ PUBLISHED AFTER EVERY VIDEO, AND EVERY INTERIM PUBLISH SAYS `complete:
 * false`. That flag is not decoration: `messageForOwnAccount` refuses to speak
 * from a partial sample, so without it the creator would be shown "None of the 1
 * video we looked at" a few seconds in and then have it silently replaced. The
 * interim writes exist so a slow sample is VISIBLE as progress, not so it can be
 * judged early.
 *
 * ⚖️ AND THE FINAL PUBLISH IS UNCONDITIONAL — it happens even when every single
 * look failed. A sample that produced nothing must still be marked finished, or
 * the reader waits forever on a check that already gave up. Zero-of-zero is a
 * real, terminal answer, and `messageForOwnAccount` reads it as silence.
 *
 * ⚠️ A THROWN `lookAt` IS AN ANSWERLESS VIDEO, NOT A FAILED SCAN. The whole
 * point of moving this off the onboarding critical path is that it cannot hurt
 * the creator; letting one bad video reject the rest would undo that.
 */
export async function sampleOwnAccount(
  videoRefs: readonly string[],
  limit: number,
  deps: OwnAccountSampleDeps,
): Promise<SampleCounts> {
  let counts: SampleCounts = { ...EMPTY_SAMPLE }
  const take = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0
  const chosen = Array.isArray(videoRefs) ? videoRefs.slice(0, take) : []

  for (const ref of chosen) {
    let look: OneLook
    try {
      look = await deps.lookAt(ref)
    } catch {
      look = { someoneTalkingToCamera: null, failure: 'LOOK_THREW' }
    }
    counts = countOneLook(counts, look)
    await publishQuietly(deps, counts)
  }

  const finished: SampleCounts = { ...counts, complete: true }
  await publishQuietly(deps, finished)
  return finished
}

/** ⚖️ A FAILED WRITE IS NOT A FAILED SAMPLE — the same rule earlyLookStep uses.
 *  Losing a warning must never cost the creator the thing they asked for. */
async function publishQuietly(deps: OwnAccountSampleDeps, counts: SampleCounts): Promise<void> {
  try {
    await deps.publish(counts)
  } catch {
    // Intentionally swallowed. See above.
  }
}
