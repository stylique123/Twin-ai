// TWENTY-FIVE TRANSCRIPTIONS IN A QUEUE OF ONE.
//
// ⚠️ MEASURED 2026-09-17. `build_voice` is what the creator actually waits on —
// `dna-poll` reports ready from `brand_voices.status`, which that job sets — and
// its core is a serial loop over up to `transcriptBudgetFor(platform)` videos,
// each a download plus a transcription. The budget is 25 on TikTok (free) and 10
// elsewhere (paid).
//
// The last twelve `build_voice` jobs, in seconds: 49, 91, 134, 199, 208, 266,
// 292, 340, 373, 380, 538, 952. p50 279, p90 522. The 952 outlier is not a slow
// model — it is the full free budget of 25 run one after another at ~38s each.
//
// ⚖️ AND THEY ARE INDEPENDENT. Nothing in one transcription informs the next, so
// the serialisation buys nothing.
//
// ⚠️⚠️ THE BOUND IS 3 AND IT IS NOT 25. This repo has already paid for the other
// choice: `SWEEP_BATCH` was 25, it flooded the single worker loop, and phase4's
// own asset was starved behind it — a real priority inversion on the same VPS
// that serves live creators. Downloads, ffmpeg and model calls all land there.
// A bound is a RATE, not a cap on ambition.

/** How many transcriptions may be in flight for one creator's scan.
 *
 *  ⚠️ NOT TUNED UPWARD WITHOUT A MEASUREMENT. Three takes the 25-video worst
 *  case from ~9 sequential minutes to roughly 3, which is the win; going higher
 *  trades a live creator's worker for a diminishing slice of one scan.
 *
 *  ⚠️ AND THE PROVIDER'S RATE LIMIT AT THIS CONCURRENCY IS UNKNOWN — it cannot
 *  be established from the repository, only from the first real run. If 429s
 *  appear in `routes` as a rise in `failed`, this is the number to lower, and
 *  lowering it to 1 restores exactly today's behaviour. */
export const TRANSCRIBE_CONCURRENCY = 3

/**
 * Run `fn` over `items`, at most `limit` at a time, returning results IN INPUT
 * ORDER.
 *
 * ⚠️ ORDER IS A GUARANTEE, NOT AN ACCIDENT. The caller feeds the transcripts to
 * `synthesizeVoiceFromAudio`, and quietly changing what the model sees is not a
 * latency fix — it is an unmeasured change to the output dressed as one. Results
 * are written into indexed slots rather than pushed as they land.
 *
 * ⚠️ `fn` MUST NOT THROW. A rejection here rejects the whole batch, which would
 * turn one bad video into a lost scan — strictly worse than the serial loop it
 * replaces, which tolerated a throw per item. The caller keeps its per-item
 * try/catch and is tested for it; this function deliberately does not add a
 * second, silent one, because a helper that swallows errors hides the very
 * failures `routes` exists to count.
 *
 * ⚖️ A LIMIT BELOW 1 IS TREATED AS 1, NOT AS ZERO WORK. "Do nothing" is never
 * what a caller means by a concurrency setting, and returning an empty array
 * would silently drop every transcript.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0) return []
  const width = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 1

  const out = new Array<R>(list.length)
  // A shared cursor rather than fixed slices: one slow item must not idle a
  // worker that could be starting the next video. Chunking by index would make
  // the batch as slow as its worst chunk.
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next
      next += 1
      if (i >= list.length) return
      out[i] = await fn(list[i] as T, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, list.length) }, worker))
  return out
}
