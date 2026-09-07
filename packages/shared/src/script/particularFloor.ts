/**
 * AUDIT WAVE 2.2 — A SCRIPT MUST USE A DETAIL THE CREATOR ALREADY GAVE US.
 *
 * ⚠️ MEASURED IN PRODUCTION 2026-09-07, across the 33 generations carrying a
 * `witness_score`:
 *
 *     scripts with no number ANYWHERE ................... 31 of 33
 *     scripts that trip the specificity floor ........... 28 of 33  (85%)
 *
 * The floor (`specificityFloorNote`) has been firing on roughly six of every
 * seven scripts and rendering to the creator on the Result page. The owner's
 * call was A: THE NOTE IS RIGHT AND THE WRITER IS WRONG. So the floor is left
 * exactly as it is and this asks the writer to clear it.
 *
 * ── ⚠️ AND IT MUST NEVER ASK FOR A NUMBER TO BE INVENTED ──────────────────
 *
 * "Add a figure" is the instruction that produced the worst output in the
 * twelve-run audit — a Florida baker told on camera what her cottage licence
 * permits, invented whole. `regulatoryClaim` and `firstPersonFloor` both exist
 * because a repair that adds a FACT is a repair that can fabricate one.
 *
 * ⚖️ SO THIS ONLY EVER SAYS "USE THE ONE THEY GAVE YOU", and it is measurable
 * that this is possible. Of the 28 scripts tripping the floor:
 *
 *     the creator's store is EMPTY ...................... 11
 *     the store has rows but NO particular ...............  0
 *     the store holds 2 to 9 particulars, unused ........ 17
 *
 * Seventeen scripts were vague while the creator's own concrete details sat in
 * the store unused. Those are the ones this fixes. The eleven with an empty
 * store are NOT failures and are never flagged — the same negative control the
 * first-person floor has, for the same reason: a creator who supplied nothing
 * cannot be asked to be specific about it, and a script that does not pretend
 * otherwise is the correct output.
 *
 * ⚖️ THE CANDIDATES ARE HANDED OVER VERBATIM. The repair names the actual
 * supplied lines rather than describing them, so the writer picks one instead
 * of composing something that sounds like one.
 */

import { bodyBeats, hasParticular, type CraftBeat } from './craftContracts'

/** How many of their own details to put in front of the writer. More than a
 *  few and the instruction becomes a menu the model browses instead of a fact
 *  it uses. */
export const MAX_CANDIDATES = 3

/** Longest candidate we quote. A whole paragraph pasted into a repair reads as
 *  "rewrite this beat as that paragraph", which is not what is being asked. */
export const MAX_CANDIDATE_CHARS = 160

export interface ParticularFailure {
  index: number
  line: string
  repair: string
}

const textOf = (item: unknown): string =>
  typeof item === 'string' ? item : String((item as { text?: unknown })?.text ?? '')

/**
 * @param script   the declared beats
 * @param supplied what the PROMPT carried — never the fuller store, or this
 *   would fault a script for failing to use material the writer never saw.
 */
export function particularFailures(
  script: readonly CraftBeat[] | null | undefined,
  supplied: readonly unknown[] | null | undefined,
): ParticularFailure[] {
  const beats = Array.isArray(script) ? script : []
  const body = bodyBeats(beats)
  if (body.length === 0) return []

  // ⚖️ ALREADY SPECIFIC — nothing to ask for. This is the same test the floor
  // itself runs, imported rather than restated.
  if (body.some((b) => hasParticular(b.line))) return []

  // ⚠️ THE SUPPLY CHECK PRECEDES THE COMPLAINT. Eleven of the twenty-eight
  // measured have an empty store; asking them for a detail they never gave us
  // is asking them to make one up.
  const candidates = (Array.isArray(supplied) ? supplied : [])
    .map(textOf)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t !== '' && hasParticular(t))
    .slice(0, MAX_CANDIDATES)
    .map((t) => (t.length > MAX_CANDIDATE_CHARS ? `${t.slice(0, MAX_CANDIDATE_CHARS).trimEnd()}…` : t))

  if (candidates.length === 0) return []

  const target = body[0]
  const quoted = candidates.map((c) => `"${c}"`).join(' · ')
  return [{
    index: beats.indexOf(target),
    line: typeof target.line === 'string' ? target.line : '',
    repair: 'Nothing in the body of this script is concrete — no number, no name, no amount —'
      + ' so it could be about any business in the world.'
      + ' Rewrite this one line to use a detail the creator ALREADY told us:'
      + ` ${quoted}.`
      + ' Use one of those, in their words. Do not add a number, a name or an amount'
      + ' that is not in that list.',
  }]
}
