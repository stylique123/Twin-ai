// THE OPENING BEAT SAID TWO THINGS AND THE TELEPROMPTER KEPT ONE.
//
// ⚠️⚠️ MEASURED ON ALL THREE OF THE OWNER'S TEST RUNS, 2026-09-20. Run
// 788d20b4 shipped `script[0].line`:
//
//   "I lost two hundred dollars on candles before learning this one rule.
//    I bought hundreds of shiny metal tins before running a single burn test."
//
// The first sentence IS the selected hook. `recordingScriptAdapter` builds
// scene 1 from the hook, then walks the script dropping any beat that looks
// like the hook so the creator does not say it twice — correct, and it drops
// the WHOLE beat. The second sentence is not a duplicate of anything. It was
// written to be spoken, it reaches the shot card (which quotes
// `shot_list[].spoken_text`, synced against `script[]`), and it is spoken
// nowhere. The owner reported it as "the shot list carries an extra sentence".
//
// ⚖️ SO THIS IS A CONTENT LOSS WEARING A DISPLAY BUG'S CLOTHES, AND THE FIX
// BELONGS IN THE ADAPTER RATHER THAN IN THE SHOT LIST. Blanking the shot card
// would make the two surfaces agree by throwing the sentence away twice. The
// teleprompter is the one that is wrong: it is missing a line the writer wrote.
//
// ⚖️ FIRST SENTENCE ONLY, AND ONLY WHEN SOMETHING REAL FOLLOWS. Every other
// shape — a beat that is wholly the hook, a reworded duplicate spread across
// two sentences, a trailing fragment — keeps today's behaviour exactly. This
// recovers the one case that is unambiguous and leaves the ambiguous ones to
// the drop that has always handled them, because a wrong recovery puts words
// on the teleprompter that the creator already said.

/** Sentence-split that keeps its terminators.
 *
 *  ⚠️ A FULL STOP BETWEEN TWO DIGITS IS NOT THE END OF A SENTENCE. A candle
 *  maker's beat says "each tin costs me 2.50 in wax", and a naive `[.!?]`
 *  split hands the teleprompter "2." and "50 in wax" as separate lines — in a
 *  product whose own honesty check exists because invented figures reached
 *  creators. The lookahead is the whole guard: a terminator only counts when
 *  what follows is not another digit. */
function sentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    // Run to the end of a multi-character terminator ("?!", "...").
    let end = i
    while (end + 1 < text.length && '.!?'.includes(text[end + 1]!)) end++
    const next = text[end + 1]
    if (next !== undefined && /\d/.test(next)) { i = end; continue }
    // ⚠️ ITEM 35: NOR IS THE FULL STOP OF "Dr." — splitting there made the
    // remainder a mid-sentence scene ("Lee told me…").
    if (ch === '.' && /\b(?:dr|mr|mrs|ms|st|vs|etc|e\.g|i\.e|no)\.$/i.test(text.slice(start, end + 1))) { i = end; continue }
    const piece = text.slice(start, end + 1).trim()
    if (piece !== '') out.push(piece)
    start = end + 1
    i = end
  }
  const tail = text.slice(start).trim()
  if (tail !== '') out.push(tail)
  return out
}

/** Below this the remainder is a fragment, not a beat — "And that was that."
 *  on its own card is worse than the drop it replaces. */
const MIN_REMAINDER_WORDS = 5

/**
 * The part of a hook-like opening beat that is NOT the hook, or `''` when
 * there is nothing worth keeping.
 *
 * `isHookLike` is the caller's own duplicate test, passed in rather than
 * re-implemented, so this cannot drift from the rule that decided to drop the
 * beat in the first place. That matters: a remainder computed under a
 * different notion of "is the hook" could hand back the hook itself.
 */
export function hookRemainder(
  line: string | null | undefined,
  isHookLike: (candidate: string) => boolean,
): string {
  const whole = String(line ?? '').trim()
  if (whole === '') return ''
  const parts = sentences(whole)
  if (parts.length < 2) return ''
  // ⚠️ THE FIRST SENTENCE MUST BE THE DUPLICATE, NOT MERELY THE WHOLE BEAT.
  // The caller reached here because the BEAT looked like the hook; that can be
  // true because its opening sentence is the hook, or because the beat as a
  // whole rewords it across several. Only the first is safe to split.
  if (!isHookLike(parts[0]!)) return ''
  const rest = parts.slice(1).join(' ').trim()
  // ⚠️ AND THE REMAINDER MUST NOT ITSELF BE THE HOOK AGAIN. A writer that
  // opened with the hook and then restated it has written no new content, and
  // recovering that would put the creator back where this drop started.
  if (isHookLike(rest)) return ''
  if (rest.split(/\s+/).filter(Boolean).length < MIN_REMAINDER_WORDS) return ''
  return rest
}
