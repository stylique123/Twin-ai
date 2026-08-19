// "49% FAILED" IS FOUR DIFFERENT PROBLEMS WEARING ONE NUMBER.
//
// ⚠️ MEASURED ON PRODUCTION 2026-08-19: 323 references attempted of 4,297
// distinct gallery URLs, 165 OK and 158 errored. Reported as a success rate that
// reads like one broken pipeline. It is not:
//
//   tiktok     161 OK │ 79 no_speech │ 70 impersonation
//   youtube      4 OK │  6 no captions
//   instagram    0 OK │  3 "no audio url found"
//
// Seventy of those are a fixable runtime failure — curl-cffi missing from the
// worker image. Seventy-nine are music-led, text-led or visual-hook TikToks with
// no speech at all, which are NOT failures: they are a large and legitimate part
// of the medium, and the transcript pass is simply the wrong instrument for
// them. Pooling the two produces a number that cannot be acted on, because half
// of it wants an engineer and half of it wants a frames pass.
//
// ⚖️ SO THE HEALTH NUMBER IS A CLASSIFICATION, NOT A RATE. Each bucket names who
// fixes it, which is the only property that makes a library metric worth
// looking at.

export const LIBRARY_HEALTH = [
  /** Read end to end. The transcript pass did its job. */
  'transcript_readable',
  /** ⚠️ NOT A FAILURE. Real content the transcript pass cannot see, and the
   *  frames pass is what would read it. Counting these as errors argues for
   *  excluding a quarter of TikTok from a creator-video product. */
  'visual_only_candidate',
  /** OURS, and fixable today: the downloader could not fetch the media. */
  'downloader_failure',
  /** Genuinely unavailable — private, deleted, region-locked, off-allowlist.
   *  Nothing we build changes these. */
  'unsupported_or_unavailable',
  /** ⚖️ NEVER ATTEMPTED IS NOT A RESULT. 3,974 of 4,297 gallery URLs have never
   *  been tried; folding them into a success rate would report the backlog as a
   *  failure rate, and folding them into "healthy" would hide it entirely. */
  'not_attempted',
] as const
export type LibraryHealth = (typeof LIBRARY_HEALTH)[number]

/** ⚠️ WHO FIXES IT — the reason this classification exists at all. */
export const HEALTH_OWNER: Record<LibraryHealth, string> = {
  transcript_readable: 'nobody — this one worked',
  visual_only_candidate: 'the frames pass (#56); no amount of transcript work reaches these',
  downloader_failure: 'the worker image — curl-cffi must be effective, not merely declared',
  unsupported_or_unavailable: 'nobody — the video is gone or was never reachable',
  not_attempted: 'the batch runner; this is backlog, not breakage',
}

export interface ProfileRow {
  /** Null when the assessment succeeded. */
  error?: string | null
  /** Absent when the URL has never been attempted. */
  attempted?: boolean
}

/**
 * Classify one reference.
 *
 * ⚠️ MATCHED ON THE ERROR TEXT, WHICH IS A COMPROMISE AND IS SAID SO. The
 * assessment writes a human sentence rather than a code, so this reads the
 * sentence. That is fragile against rewording — and the alternative, adding a
 * `failure_code` column, is the right fix and is not free. Until then the
 * matching is deliberately broad and anything unrecognised lands in
 * `unsupported_or_unavailable`, which is the bucket that asks for no work: an
 * unmatched error must never masquerade as something we know how to fix.
 */
export function classifyReference(row: ProfileRow): LibraryHealth {
  if (row.attempted === false) return 'not_attempted'
  const e = typeof row.error === 'string' ? row.error.trim() : ''
  if (e === '') return 'transcript_readable'
  const lower = e.toLowerCase()

  // ⚖️ NO SPEECH IS CHECKED FIRST, because it is the bucket most likely to be
  // misread as breakage and the one whose misreading costs the most: it is the
  // whole argument for the frames pass.
  if (lower.includes('no_speech')
    || lower.includes('no captions')
    || lower.includes('no speech')) return 'visual_only_candidate'

  if (lower.includes('impersonat')
    || lower.includes('curl')
    || lower.includes('no audio url found')
    || lower.includes('download')
    || lower.includes('timed out')
    || lower.includes('timeout')) return 'downloader_failure'

  return 'unsupported_or_unavailable'
}

export type HealthCounts = Record<LibraryHealth, number>

export function tally(rows: readonly ProfileRow[]): HealthCounts {
  const out = Object.fromEntries(LIBRARY_HEALTH.map((k) => [k, 0])) as HealthCounts
  for (const r of rows) out[classifyReference(r)]++
  return out
}

/**
 * How much of the library a creator could actually be shown.
 *
 * ⚖️ `visual_only_candidate` COUNTS AS USABLE ONLY ONCE THE FRAMES PASS EXISTS,
 * and that is a parameter rather than an assumption. Today it is false and these
 * are inventory we hold and cannot use; the day #56 ships it becomes true and
 * the same rows become usable without anything being re-scraped. Hard-coding
 * either answer would state a roadmap as a fact.
 */
export function usableCount(c: HealthCounts, opts: { framesPassLive: boolean }): number {
  return c.transcript_readable + (opts.framesPassLive ? c.visual_only_candidate : 0)
}
