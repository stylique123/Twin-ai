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

/** How many videos get transcribed per creator, ever.
 *
 *  ⚠️ THIS NUMBER IS THE CEILING ON EVERYTHING DOWNSTREAM. Transcripts are the
 *  ONLY source that yields `claim`, `experience`, `opinion` or `framework` — a
 *  caption proves someone made a video about a thing, never what they concluded
 *  about it. Measured across 8 production creators: 84 substance items total,
 *  roughly ten each, off five videos each. The prompt's ten-item cap, the
 *  substance floor and the relevance ranking are all rearranging whatever these
 *  five produced.
 *
 *  So a creator whose five videos happen to be spectacle rather than argument
 *  has no positions in the system, and no amount of selection logic invents any.
 *  Raised 5 → 10 deliberately: transcription is PAID PER VIDEO, so this doubles
 *  a real per-scan cost, and it is the only lever that raises the ceiling for
 *  every creator at once rather than redistributing a fixed supply. */
export const TRANSCRIPT_BUDGET = 10

/** The budget where transcription costs NOTHING per video.
 *
 *  ⚠️ ONE NUMBER FOR THREE DIFFERENT PRICES WAS THE MISTAKE. TikTok is
 *  transcribed locally by yt-dlp and whisper — free, and bounded only by the
 *  worker's own CPU. YouTube tries free captions first and only falls back to a
 *  paid Actor. Instagram is paid on every video. A single budget therefore
 *  priced the free platforms as if they were the expensive one, and the ceiling
 *  it imposed was the ceiling on everything downstream.
 *
 *  ⚖️ AND THE YIELD IS NOW MEASURED RATHER THAN ASSUMED. Across the production
 *  store, transcript items run 78% substance against 13% for captions, and a
 *  transcribed video returns roughly one to two-and-a-half substance items —
 *  garyvee's TikTok scan produced 25 items, 22 of them substance, from ten
 *  videos. Scripts built on transcript-only stores scored 73% grounded and 8%
 *  generic against 58% and 23% for the same creators' full stores.
 *
 *  So on a free platform this is the cheapest available improvement to the one
 *  input that was measured to matter, and 25 is chosen to roughly triple the
 *  supply while staying inside a single scan's CPU budget. */
export const FREE_TRANSCRIPT_BUDGET = 25

/** Platforms whose transcripts cost nothing per video.
 *
 *  ⚠️ YOUTUBE IS NOT IN HERE, AND THAT IS DELIBERATE. Its transcript path tries
 *  free captions FIRST and falls back to a paid Actor, so a raised budget on a
 *  channel whose videos lack captions turns straight into spend. Free-first is
 *  not free, and only a platform that is free in every case belongs here. */
const FREE_TRANSCRIPT_PLATFORMS: ReadonlySet<string> = new Set(['tiktok'])

/** How many videos to transcribe for this platform.
 *
 *  ⚖️ AN UNKNOWN PLATFORM GETS THE PAID BUDGET. Defaulting the other way would
 *  make every platform added later silently expensive, and the cost would land
 *  on the owner's Apify bill rather than on a failing test. */
export function transcriptBudgetFor(platform: string | null | undefined): number {
  return FREE_TRANSCRIPT_PLATFORMS.has(String(platform ?? '').toLowerCase())
    ? FREE_TRANSCRIPT_BUDGET : TRANSCRIPT_BUDGET
}

/** Captions that suggest the video contains a POSITION rather than a spectacle.
 *
 *  ⚖️ REACH IS A PROXY FOR WHAT GOT VIEWS, NOT FOR WHAT CONTAINS AN ARGUMENT —
 *  and this file already warned that top performers "skew to spectacle". A
 *  creator's most-viewed upload is frequently their least opinionated one, so
 *  spending the first two slots on reach can spend them on the two videos least
 *  likely to yield a claim.
 *
 *  These are shapes a stance takes in a title: a correction, a ranking, a
 *  lesson, a reason. Deliberately NOT a sentiment model — an explainable pattern
 *  list can be argued with, and "why this video was picked" has an answer. */
const STANCE_TITLE = /\b(why|how i|what i|the truth|actually|stop |never |always |mistake|wrong|worst|best|vs\.?|versus|lesson|learned|regret|should|shouldn'?t|myth|overrated|underrated|problem with|reason)\b/i

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

  // 3-4. STANCE — titles shaped like an argument rather than a spectacle.
  //
  // ⚠️ ADDED BECAUSE REACH AND RECENCY BOTH MISS POSITIONS. Every substance kind
  // in the system comes from speech, and a video titled "I built a PC in a
  // volcano" yields products and topics; one titled "why RGB is a scam" yields
  // an opinion. Spending slots on stance costs nothing extra — same budget,
  // different picks — and it is the only axis aimed at what the knowledge
  // extractor is actually looking for.
  //
  // ⚖️ PLACED AFTER REACH, NOT BEFORE. Reach still opens, because a creator's
  // biggest videos are the ones their audience associates with them, and losing
  // those entirely would trade one blind spot for another.
  const byStance = left().filter((c) => STANCE_TITLE.test(String(c.text ?? '')))
    .sort((a, b) => reach(b) - reach(a))
  take(byStance[0]); take(byStance[1])

  // 5-6. Recency — only among videos whose date is actually known.
  const dated = left().filter((c) => when(c) !== null)
    .sort((a, b) => (when(b) as number) - (when(a) as number))
  take(dated[0]); take(dated[1])

  // 7. Density: the longest remaining caption.
  const byLength = left().sort((a, b) => String(b.text ?? '').length - String(a.text ?? '').length)
  take(byLength[0])

  // 8+. More stance, then more recency, before falling back to raw reach — the
  // extra budget should buy DIFFERENT videos, not simply the next-biggest ones.
  for (const c of byStance) { if (picked.length >= budget) break; take(c) }
  for (const c of dated) { if (picked.length >= budget) break; take(c) }

  // ⚖️ SPEND THE BUDGET. If an axis had nothing to give — no dates, too few
  // videos — fall back to reach rather than returning a short list, because an
  // unspent slot is a transcript we could have had for free.
  for (const c of byReach) { if (picked.length >= budget) break; take(c) }
  return picked
}
