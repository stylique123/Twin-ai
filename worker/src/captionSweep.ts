// KEEP THE CORPUS GROWING, INSTEAD OF WAITING FOR SOMEBODY TO REMEMBER.
//
// ⚠️⚠️ MEASURED 2026-09-20 AND IT IS THE WHOLE REASON THIS FILE EXISTS.
// `gallery_items.caption_shape` had exactly ONE writer — a manual script an
// operator runs by hand — so classification froze on 2026-09-10 at 596 rows
// while the table grew to 6,423. 397 cards had never been processed at all, and
// every single one of the 393 that arrived after that date went unread.
//
// ⚠️⚠️ AND THE READER NEVER STOPPED. `generate-blueprint` reads this column on
// EVERY generation to build the shape block, and 17 of 17 recorded generations
// emitted it. So a live prompt was being served a ten-day-old snapshot that
// nobody was refreshing — a reader on a hot path fed by a writer that only runs
// when a human remembers it exists.
//
// ⚖️ THE PATTERNS ARE NOT COPIED. `worker/src/generated/captionShape.ts` is
// produced by `scripts/ci/generate_shared_pilot_core.mjs` from the shared
// module, and CI fails on a diff. The script this replaces argued, correctly,
// that a HAND copy of eight regexes would let the corpus quietly mix two
// vocabularies — which 0196 warns is unrecoverable. A generated copy is the one
// thing that argument does not apply to: there is still exactly one author.

import { classifyOne, CAPTION_SHAPE_VERSION } from './generated/captionShape.js'

/** How often the sweep may run. The corpus changes slowly; this is not urgent
 *  work, and a tight loop would bill a query against every idle tick. */
export const CAPTION_SWEEP_INTERVAL_MS = 10 * 60 * 1000

/** ⚠️ SMALL, AND DELIBERATELY. The backlog is ~4,500 rows and there is no
 *  deadline: a bounded batch every ten minutes clears it inside a day without
 *  ever competing with a creator's scan for the same connection. */
export const CAPTION_SWEEP_BATCH = 200

export interface CardRow { id: string; title?: string | null }

export interface CaptionUpdate {
  id: string
  caption_shape: string | null
  caption_shape_basis: 'inferred' | null
  caption_shape_reason: string | null
  caption_shape_version: number
  caption_shape_at: string
}

/**
 * The classification for a batch of cards.
 *
 * ⚠️ A ROW THAT PRODUCES NO SHAPE IS STILL WRITTEN, and that is not a detail.
 * Recording `no_pattern_match` is what makes the NEXT run able to tell "we read
 * this and the patterns did not fire" from "nobody has ever looked at this" —
 * the difference between 4,084 known misses and 397 unknowns, which is exactly
 * the distinction that made the frozen corpus diagnosable at all.
 */
export function classifyBatch(rows: readonly CardRow[], at: string): CaptionUpdate[] {
  const out: CaptionUpdate[] = []
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || r.id === '') continue
    const v = classifyOne(r.title)
    out.push({
      id: r.id,
      caption_shape: v.shape,
      caption_shape_basis: v.basis,
      caption_shape_reason: v.reason,
      caption_shape_version: CAPTION_SHAPE_VERSION,
      caption_shape_at: at,
    })
  }
  return out
}

/** What a sweep did, for the one log line it emits. */
export interface SweepTally {
  read: number
  classified: number
  unclassified: number
  byReason: Record<string, number>
}

export function tally(updates: readonly CaptionUpdate[]): SweepTally {
  const byReason: Record<string, number> = {}
  let classified = 0
  for (const u of updates) {
    if (u.caption_shape !== null) { classified += 1; continue }
    const k = u.caption_shape_reason ?? 'unrecorded'
    byReason[k] = (byReason[k] ?? 0) + 1
  }
  return {
    read: updates.length,
    classified,
    // ⚖️ THE DENOMINATOR TOO. "classified: 3" cannot distinguish a healthy sweep
    // from one that read two hundred rows and understood three.
    unclassified: updates.length - classified,
    byReason,
  }
}
