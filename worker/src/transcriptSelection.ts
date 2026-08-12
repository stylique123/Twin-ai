// WHICH VIDEOS ARE WORTH PAYING TO TRANSCRIBE?
// Inlined from `packages/shared/src/transcriptSelection.ts` (the worker has no
// runtime dep on @twinai/shared — see directorContract.ts), where the rationale
// and 9 tests live. `transcriptSelectionParity.test.ts` fails if they drift.

export interface TranscriptCandidate {
  url: string
  /** Reach. Either metric may be absent; `0` is a real value and not "unknown". */
  plays?: number | null
  likes?: number | null
  /** The caption/title. Used ONLY as a density proxy, never as knowledge. */
  text?: string | null
  /** Newest first is NOT assumed — pass the real value when you have it. */
  postedAt?: string | number | null
}

export const TRANSCRIPT_BUDGET = 5

/**
 * Pick a representative few to transcribe.
 *
 * ⚖️ ORDER IS STABLE AND DUPLICATES ARE IMPOSSIBLE: each axis draws from what
 * the previous ones left, so a video that is both the top performer and the
 * most recent consumes ONE slot, not two, and the remaining budget still gets
 * spent on something different.
 */
export function selectVideosToTranscribe(
  candidates: readonly TranscriptCandidate[],
  budget = TRANSCRIPT_BUDGET,
): string[] {
  const usable = candidates.filter((c) => typeof c?.url === 'string' && /^https:\/\//i.test(c.url))
  if (!usable.length || budget <= 0) return []

  const picked: string[] = []
  const taken = new Set<string>()
  const take = (c: TranscriptCandidate | undefined) => {
    if (!c || taken.has(c.url) || picked.length >= budget) return
    taken.add(c.url); picked.push(c.url)
  }
  const left = () => usable.filter((c) => !taken.has(c.url))

  const reach = (c: TranscriptCandidate) => (c.plays ?? 0) || (c.likes ?? 0)
  // ⚖️ `postedAt` ABSENT MEANS UNKNOWN, NOT OLD. Treating a missing timestamp as
  // epoch would silently rank every unknown-date video last and quietly turn the
  // recency axis into a second performance axis.
  const when = (c: TranscriptCandidate): number | null => {
    if (c.postedAt === null || c.postedAt === undefined) return null
    const t = typeof c.postedAt === 'number' ? c.postedAt : Date.parse(String(c.postedAt))
    return Number.isFinite(t) ? t : null
  }

  // 1-2. Performance.
  const byReach = [...usable].sort((a, b) => reach(b) - reach(a))
  take(byReach[0]); take(byReach[1])

  // 3-4. Recency — only among videos whose date is actually known.
  const dated = left().filter((c) => when(c) !== null)
    .sort((a, b) => (when(b) as number) - (when(a) as number))
  take(dated[0]); take(dated[1])

  // 5. Density: the longest remaining caption.
  const byLength = left().sort((a, b) => String(b.text ?? '').length - String(a.text ?? '').length)
  take(byLength[0])

  // ⚖️ SPEND THE BUDGET. If an axis had nothing to give — no dates, too few
  // videos — fall back to reach rather than returning a short list, because an
  // unspent slot is a transcript we could have had for free.
  for (const c of byReach) { if (picked.length >= budget) break; take(c) }
  return picked
}
