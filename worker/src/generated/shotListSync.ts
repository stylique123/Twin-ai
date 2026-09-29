// GENERATED FROM packages/shared/src/script/shotListSync.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
/**
 * A SHOT CARD MAY NOT QUOTE A LINE THE TELEPROMPTER NO LONGER SAYS.
 *
 * ⚠️ MEASURED ACROSS THE FOUR-RUN REGRESSION HARNESS (Wave 0). Every one of
 * runs A, B and C ships a `shot_list` row whose `spoken_text` disagrees with
 * `script[i].line` at the same position: run A quotes a non-selected hook
 * option instead of the shipped hook, run B's Hook row carries a sentence the
 * teleprompter dropped, and run C's shot list has an entire extra beat ("The
 * pivot") the teleprompter never shows. `liveRunFixtures.test.ts` assertion 4
 * documents this against the frozen evidence.
 *
 * ⚖️ THE ROOT CAUSE IS TIMING, NOT A SECOND WRITER. `shot_list` is produced by
 * the SAME model call as `script`, in the SAME response, so at the moment
 * both are written they agree. What breaks them apart is everything that
 * happens next: Fix 1's phrase-overlap repair, Fix 2's CTA-entity fallback,
 * Fix 3's hook-collision demotion, the entitlement repair, the ask/answer
 * fill, the placeholder/hook substitution — every one of these rewrites
 * `script[i].line` in place, and none of them has ever touched `shot_list`.
 * The creator's shot list is a photograph of the FIRST draft; the
 * teleprompter is the LAST one.
 *
 * ⚖️ SO THIS RUNS LAST, OVER THE FINAL BEATS, NOT AGAINST A SECOND SOURCE. It
 * takes the exact `script` array that ships — after every repair above has
 * already mutated it — and makes `shot_list[].spoken_text` agree with it
 * position-by-position. It is a SYNC, not a rewrite of intent: nothing here
 * decides what a beat should say. It only says the shot card must quote
 * whatever the teleprompter beat next in line actually says now.
 *
 * ⚖️ ONLY SPOKEN ROWS ADVANCE THE POINTER. A shot row with empty `spoken_text`
 * (the cover-frame shot, a silent cutaway) is not a line the creator reads
 * aloud, so it carries no claim to reconcile and is left exactly as written.
 * Walking the pointer only across rows that DO claim to quote a line is what
 * keeps a cover-frame row from silently eating a real beat's turn.
 *
 * ⚖️ A ROW WITH NO BEAT LEFT TO MATCH IS EMPTIED, NEVER LEFT STALE. Run C's
 * extra "The pivot" row is exactly this: the shot list asked for one more
 * spoken beat than the final script has. Leaving its `spoken_text` in place
 * would keep shipping a line nobody will say; blanking it turns a phantom
 * line into a shot the editor still has (framing, notes) but does not expect
 * dialogue for.
 *
 * ⚖️ A BEAT THE WRITER LEFT SILENT ("[No spoken audio]") SYNCS TO SILENCE.
 * `isSilentBeat` is the one shared reader for that marker — reusing it here
 * rather than a second regex is what keeps this pass and the render agreeing
 * on what counts as "nothing said" now that a beat CAN turn silent it was not
 * at generation time (an ask that resolved to no safe line, for instance).
 */

import { isSilentBeat } from './silentBeat.js'

export interface SyncedScriptBeat {
  line?: unknown
  /** The beat's own label ("Hook", "CTA"), used when a resynced row's label went stale. */
  section?: unknown
}

export interface SyncedShotRow {
  spoken_text?: unknown
  [key: string]: unknown
}

export interface ShotListSyncResult<T extends SyncedShotRow> {
  /** The shot list, with every spoken row's `spoken_text` resolved against
   *  the final script beat it corresponds to. Rows that needed no change are
   *  returned by reference, unchanged. */
  shots: T[]
  /** How many spoken rows now quote a different line than they arrived with —
   *  the rate this fix exists to drive down, and to make visible rather than
   *  silently inert. */
  resynced: number
  /** How many spoken rows had no corresponding beat left in the final script
   *  (an extra beat the writer proposed and a later repair dropped, or an
   *  ask that collapsed the beat count) and were blanked rather than left
   *  stale. */
  orphaned: number
}

/**
 * Reconcile `shot_list[].spoken_text` against the FINAL `script` array — the
 * one the teleprompter renders, after every post-generation repair has
 * already run. Position is tracked only across rows that carry non-empty
 * `spoken_text`; a cover-frame or cutaway row with none is passed through.
 */
export function syncShotListSpokenText<T extends SyncedShotRow>(
  shots: readonly T[] | null | undefined,
  script: readonly SyncedScriptBeat[] | null | undefined,
): ShotListSyncResult<T> {
  const rows = Array.isArray(shots) ? shots : []
  const beats = Array.isArray(script) ? script : []

  let beatIndex = 0
  let resynced = 0
  let orphaned = 0

  const out = rows.map((row) => {
    const original = typeof row?.spoken_text === 'string' ? row.spoken_text : ''
    if (original.trim() === '') return row

    const beat = beats[beatIndex]
    beatIndex += 1

    if (!beat) {
      orphaned += 1
      // ⚠️ SUNFLOWER #16: A TALKING SHOT WITH NO LINE IS A PHANTOM SCENE. The
      // teleprompter counted fewer scenes than the shot list because blanked
      // talking-head rows kept their camera direction. A talking shot with
      // nothing to say is dropped; any other row keeps its framing, blanked.
      if (row.shot_type === 'talking_head') return null
      return original === '' ? row : { ...row, spoken_text: '' }
    }

    const beatLine = typeof beat.line === 'string' ? beat.line : ''
    const resolved = isSilentBeat(beatLine) ? '' : beatLine

    if (resolved === original) return row
    resynced += 1
    // ⚠️ SUNFLOWER #17: THE LABEL WAS WRITTEN FOR THE OLD LINE ("Detailing the
    // deadline" over a line about her business origin). A resynced row takes
    // the script beat's own label when it has one.
    const label = typeof beat.section === 'string' && beat.section.trim() ? beat.section.trim() : null
    return { ...row, spoken_text: resolved, ...(label && 'shot' in row ? { shot: label } : {}) }
  }).filter((r): r is T => r !== null)

  return { shots: out, resynced, orphaned }
}

// ⚠️ "I HAVE 26 SIX DAYS" (Sunflower #18). A repair pass merged two spellings of
// one figure — the digits and the trailing spelled unit digit — and the script
// line shipped that way while the hook option still read "twenty six days".
// Deterministic, and deliberately narrow: only a number of 20+ followed by the
// word for its own last digit collapses, so "5 two-pound bags" is untouched.
const UNIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
export function collapseDoubledNumbers(line: string): string {
  return line.replace(/\b(\d{2,})[\s-]+(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, (m, n: string, w: string) =>
    Number(n) >= 20 && UNIT_WORDS[Number(n.slice(-1))] === w.toLowerCase() ? n : m)
}
