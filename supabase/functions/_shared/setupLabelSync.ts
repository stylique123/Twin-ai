// GENERATED FROM packages/shared/src/script/setupLabelSync.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * A SETUP LETTER MEANS NOTHING IF IT REPEATS BY ACCIDENT.
 *
 * ⚠️ FIX 7 (Wave 3). MEASURED ACROSS THE FOUR-RUN REGRESSION HARNESS
 * (`liveRunFixtures.test.ts` §7). Every one of runs A–D ships a `shot_list`
 * whose `notes` field carries two independent defects from the SAME model
 * call that writes `shot_list` and `script` together:
 *
 *   (a) A LOCATION DESCRIPTION GETS COMMA-SPLIT. Run A's second row reads
 *       "Setup D · Standing in the center of a clean · brightly lit room ·
 *       Medium shot" — one clause, "a clean, brightly lit room", torn into
 *       two segments on its own internal comma and rejoined with the SAME
 *       separator ("·") the notes string uses between setup, description
 *       and framing. A reader can no longer tell "three real parts" from
 *       "one clause a comma broke in half".
 *
 *   (b) SETUP LETTERS ARE NEITHER DETERMINISTIC NOR NON-REPEATING. Run A's
 *       letters run A, D, A, B, C, D, E — it does not start at A and D is
 *       reused for two rows the model never showed to be the same place.
 *       Run B starts at B. Run C alternates B, A, B, A... Nothing here
 *       reconciles the letters against anything, so two different setups
 *       can land on the same letter and the same setup can land on two
 *       different letters across a re-render.
 *
 * ⚖️ THE ROOT CAUSE IS THE SAME SHAPE AS FIX 4 AND FIX 5. `shot_list.notes`
 * is free text the model writes once, in the same response as `script`, and
 * nothing downstream ever reconciles it. This is that reconciliation pass —
 * a SYNC over the notes the model already wrote, not a second source of
 * truth. It never invents a location; it only decides, deterministically,
 * which rows describe the SAME place and letters them accordingly.
 *
 * ⚖️ IDENTITY COMES FROM THE DESCRIPTION, NEVER FROM THE MODEL'S OWN LETTER.
 * The model's letter is exactly the thing measured broken above, so trusting
 * it to mean "same place" is how two different rooms end up both "A". A row
 * that repeats another row's FULL (background, framing) text — the same pair
 * `setupPlan.ts` keys a setup's identity on — gets that row's letter back.
 * A row with no description of its own carries no evidence it is the same
 * place as anything else, so it is never merged into one by guesswork; it
 * gets its own letter, the next one in sequence.
 *
 * ⚖️ LETTERS ARE ASSIGNED ONCE, IN FIRST-APPEARANCE ORDER, A/B/C/…, NEVER
 * REUSED FOR A DIFFERENT DESCRIPTION. Two rows with the same normalized
 * (background, framing) pair always land on the same letter; two rows with
 * different pairs never share one. Because the assignment depends only on
 * the order the rows already appear in, running this twice over the same
 * shot list produces the same letters both times.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const nthLetter = (n: number): string => LETTERS[n] ?? `S${n + 1}`

/** Matches the notes string's own leading token — "Setup <letter>" — and
 *  nothing else. A row whose notes do not start this way carries no setup
 *  label and is left untouched. */
const SETUP_PREFIX = /^Setup\s+([A-Za-z0-9]+)\s*(?:·\s*(.*))?$/

export interface SetupLabelRow {
  notes?: unknown
  [key: string]: unknown
}

export interface SetupLabelSyncResult<T extends SetupLabelRow> {
  /** The shot list, with every row's `notes` setup label and description
   *  repaired. Rows that needed no change are returned by reference,
   *  unchanged. Rows whose `notes` carries no "Setup X" token pass through
   *  untouched. */
  shots: T[]
  /** How many rows had their setup letter and/or description text
   *  rewritten. */
  relabeled: number
  /** How many distinct setups (by background+framing identity) this shot
   *  list resolved to. */
  setupCount: number
}

/**
 * Split the free text that follows "Setup <letter> ·" into (description,
 * framing).
 *
 * ⚖️ THE LAST "·" SEGMENT IS THE FRAMING; EVERYTHING BEFORE IT IS ONE
 * DESCRIPTION. A well-formed row has exactly two real parts — where, and how
 * the shot is framed — so any extra "·" in between is exactly the
 * comma-split defect this exists to undo: it is rejoined with a comma, the
 * punctuation the description already used before something split it.
 */
function splitDescriptionAndFraming(rest: string): { description: string; framing: string } {
  const segments = rest
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s !== '')

  if (segments.length === 0) return { description: '', framing: '' }
  if (segments.length === 1) return { description: segments[0], framing: '' }

  const framing = segments[segments.length - 1]
  const description = segments.slice(0, -1).join(', ')
  return { description, framing }
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Reconcile every `shot_list[].notes` setup label against the OTHER rows in
 * the same list, deterministically, over the exact array the model wrote.
 *
 * ⚠️ RUNS UNCONDITIONALLY, LIKE THE SHOT-LIST AND RETENTION-MAP RESYNCS. A
 * shot list with no "Setup X" tokens at all relabels zero rows and costs
 * nothing.
 */
export function syncSetupLabels<T extends SetupLabelRow>(
  shots: readonly T[] | null | undefined,
): SetupLabelSyncResult<T> {
  const rows = Array.isArray(shots) ? shots : []

  const byKey = new Map<string, string>()
  let nextIndex = 0
  let relabeled = 0

  const out = rows.map((row) => {
    const original = typeof row?.notes === 'string' ? row.notes : ''
    const match = SETUP_PREFIX.exec(original)
    if (!match) return row

    const { description, framing } = splitDescriptionAndFraming(match[2] ?? '')

    let letter: string
    if (description !== '') {
      const key = `${norm(description)}¦${norm(framing)}`
      const existing = byKey.get(key)
      if (existing !== undefined) {
        letter = existing
      } else {
        letter = nthLetter(nextIndex)
        nextIndex += 1
        byKey.set(key, letter)
      }
    } else {
      // ⚖️ NO DESCRIPTION MEANS NO EVIDENCE. A bare "Setup X" carries nothing
      // to compare against another row, so it is never guessed into sharing
      // a letter — it gets the next one in sequence.
      letter = nthLetter(nextIndex)
      nextIndex += 1
    }

    const rebuilt = `Setup ${letter}`
      + (description !== '' ? ` · ${description}` : '')
      + (framing !== '' ? ` · ${framing}` : '')

    if (rebuilt === original) return row
    relabeled += 1
    return { ...row, notes: rebuilt }
  })

  return { shots: out, relabeled, setupCount: nextIndex }
}
