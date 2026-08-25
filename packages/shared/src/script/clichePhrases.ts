/**
 * A STOCK PHRASE IS NOT A STANCE.
 *
 * ⚠️ THE PROMPT ALREADY FORBIDS THESE, AND THE WRITER STILL SHIPPED THEM. The
 * generate-blueprint prompt names "potato camera", "secret sauce", "the grind",
 * "relentless execution", "trust the process", "on a whole other level",
 * "hustle" and others, and says BAN them outright. Across 463 production lines
 * (script beats plus hook options) that instruction was ignored 7 times in 4 of
 * 41 generations. An instruction a model ignores 7 times is not a check.
 *
 * ⚠️⚠️ AND THEN THE OBVIOUS LIST WAS MEASURED AND WAS WRONG. Of those 7 hits,
 * FOUR were the single word "hustle" — and all four were the creator naming
 * their ENEMY, not reaching for filler:
 *
 *   "...being quite honest about why the toxic hustle culture almost ruined it"
 *   "...how hard it was to unlearn toxic hustle culture"
 *   "if you feel burnt out by hustle culture but still want to build something"
 *   "...replace a stressful corporate job with a frantic hustle culture business"
 *
 * That is a point of view. Flagging it would attack the exact thing that makes
 * a script belong to one person — the opposite of this module's purpose. A
 * word-level list had a 57% FALSE POSITIVE RATE on the only evidence available.
 *
 * ⚖️ SO THE RULE IS NARROW, LITERAL AND PHRASE-LEVEL, and "hustle" is NOT in
 * it. Every entry is a fixed multi-word phrase that carries no argument of its
 * own: swap it for a concrete detail and nothing is lost. The four lines above
 * are pinned in the tests as required NON-matches, so nobody can widen this
 * list back into somebody's opinion without a test going red.
 *
 * ⚖️ AND IT IS A NOTE, NOT A VERDICT. This never blocks, never scores and never
 * rewrites. It tells the creator which words are doing no work, and leaves the
 * decision where it belongs.
 */

/**
 * ⚠️ FIXED PHRASES ONLY. Each of these is interchangeable advice-speak that
 * would fit any creator in any niche — which is precisely why it makes every
 * creator sound identical. A single word never belongs here: a word takes its
 * meaning from the sentence around it, and this check does not read sentences.
 */
export const STOCK_PHRASES: readonly string[] = [
  'potato camera',
  'secret sauce',
  'relentless execution',
  'on a whole other level',
  'trust the process',
  'put in the reps',
  'the algorithm rewards',
  'rise and grind',
  'built different',
  'move the needle',
  'game changer',
  'game-changer',
]

export interface StockPhraseHit {
  /** The phrase as this module names it. */
  phrase: string
  /** Where it starts in the line, so a caller could highlight it. */
  index: number
}

/**
 * Find the stock phrases in one line.
 *
 * ⚠️ CASE-INSENSITIVE, BUT NOT WORD-FUZZY. "Secret Sauce" is the same phrase;
 * "secretive saucepan" is not, and neither is anything this list does not
 * literally contain.
 */
export function stockPhrasesIn(line: unknown): StockPhraseHit[] {
  if (typeof line !== 'string') return []
  const hay = line.toLowerCase()
  const hits: StockPhraseHit[] = []
  for (const phrase of STOCK_PHRASES) {
    const index = hay.indexOf(phrase)
    if (index !== -1) hits.push({ phrase, index })
  }
  return hits.sort((a, b) => a.index - b.index)
}

/**
 * The note shown beside a line. ⚖️ PLAIN ENGLISH, NO GRADE. It names the words
 * and says what to do instead; it never says the line is bad, and it never
 * says how many.
 */
export function stockPhraseNote(hits: readonly StockPhraseHit[]): string | null {
  if (hits.length === 0) return null
  const quoted = hits.map((h) => `"${h.phrase}"`)
  const list =
    quoted.length === 1
      ? quoted[0]
      : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`
  return `${list} could be said by anyone. Swap it for something only you would say.`
}
