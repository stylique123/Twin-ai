// WHAT HAS THIS CREATOR ALREADY MADE? — a question the writer has never been able to ask.
//
// ⚠️ THE WRITER SEES ONE VIDEO AT A TIME. `userPrompt` is assembled from four
// blocks — creator DNA, position, reference, claims — and not one of them
// mentions a script this system has already written for this person. So Twin can
// produce the same format, the same opener move and the same CTA twice and have
// no way to know.
//
// ── ⚠️ AND THE REPETITION IT WAS BUILT TO PREVENT DOES NOT REPRODUCE ──────
//
// Measured before building, on all 39 production generations across 21 owners:
//
//   owners with more than one generation      11
//   ...repeating a reference format_label      1
//   ...repeating a hook opening (first 40ch)   1
//   most generations by any single creator     3
//
// Ten of eleven do not repeat. The reason is mundane: a different reference
// drives a different format, and nobody has enough history to repeat yet.
//
// ⚖️ SO THIS SUPPLIES FACTS AND ISSUES NO INSTRUCTION, which is the opposite of
// what an anti-repetition feature usually is. Two reasons, both from this
// project's own evidence. A prompt rule would be inert — every instruction
// measured here came back changing nothing, including one that quoted its own
// defect rate. And a novelty rule fed a creator's SECOND video would push the
// writer away from a format that worked, on the strength of one prior data
// point. Telling the writer what exists is a supply change; telling it what to
// avoid is a guess about what the creator wants next.
//
// ⚠️ IT IS WORTH BUILDING ANYWAY, and the reason is honest rather than
// retrospective: the value grows monotonically with history and costs one read.
// At three videos it is context. At fifteen it is the only thing standing
// between a creator and their own house style. Nothing here should be quoted
// later as having fixed a repetition problem — it was not demonstrated.

/** One thing already made for this creator. */
export interface PriorVideo {
  /** The reference format the blueprint named — the closest thing to "shape". */
  formatLabel?: string | null
  /** The hook stored on the generation. ⚠️ THIS FIELD ALONE CANNOT SAY WHETHER
   *  THE CREATOR CHOSE IT — see `hookChoice`. */
  hook?: string | null
  /** 0134 provenance for `hook`, and the reason this interface changed.
   *
   *  ⚖️ `Result.tsx` captures the RECOMMENDED hook on load when none is stored,
   *  so `selected_hook` is non-empty for rows nobody picked anything in: 14 of
   *  23 production rows equal `option[0]`. Rendering those as `opened:` told the
   *  writer, as a FACT about the creator's catalogue, that they had opened a
   *  video with a line we wrote and they may never have said.
   *
   *  ⚠️ NULL IS NOT `default` AND NOT `creator`. A row predating 0134 carries no
   *  provenance, and guessing either way manufactures the thing this field
   *  exists to prevent. It renders as unconfirmed. */
  hookChoice?: { source: 'creator' | 'default' | 'freeform'; index: number | null } | null
  /** The premise, when the blueprint carried one (11 of 39 rows do). */
  premise?: string | null
  createdAt?: string | null
}

/** ⚠️ ENOUGH HISTORY TO BE WORTH SHOWING. One prior video is a fact about a
 *  single script, not a pattern, and a writer shown one item tends to treat it
 *  as the thing to differ from. */
export const MIN_PRIOR_VIDEOS = 2

/** More than this and the block competes with the reference for attention. The
 *  most recent are the ones a creator would notice repeating. */
export const MAX_PRIOR_SHOWN = 8

const clean = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Render what already exists, or nothing.
 *
 * ⚖️ NO "DO NOT REPEAT" LINE, DELIBERATELY. See the header: the repetition this
 * would police is not reproducible in production, and an instruction against it
 * would be both inert and premature. The writer is told what exists and left to
 * use it.
 */
export function renderContentHistory(prior: readonly PriorVideo[]): string {
  const rows = prior
    .filter((p) => clean(p.formatLabel) || clean(p.hook) || clean(p.premise))
    .slice(0, MAX_PRIOR_SHOWN)
  if (rows.length < MIN_PRIOR_VIDEOS) return ''

  const lines = rows.map((p, i) => {
    const bits: string[] = []
    if (clean(p.formatLabel)) bits.push(`format: ${clean(p.formatLabel)}`)
    if (clean(p.premise)) bits.push(`premise: ${clean(p.premise).slice(0, 160)}`)
    // ⚖️ THREE LABELS, BECAUSE THERE ARE THREE FACTS. What the creator opened
    // with, what WE put in front of them, and a row too old to tell. Collapsing
    // the second into the first is how a recommendation becomes evidence of a
    // preference — and this block is read by the writer as catalogue fact.
    const hook = clean(p.hook)
    if (hook) {
      const src = p.hookChoice?.source ?? null
      const shown = hook.slice(0, 120)
      if (src === 'default') bits.push(`we suggested: "${shown}"`)
      else if (src === null) bits.push(`opened (unconfirmed): "${shown}"`)
      else bits.push(`opened: "${shown}"`)
    }
    return `${i + 1}. ${bits.join(' · ')}`
  })

  return `ALREADY MADE FOR THIS CREATOR (${rows.length} most recent, newest first).
These are facts about their existing catalogue, not a list to avoid.
${lines.join('\n')}`
}
