/**
 * TWIN'S QUESTION TO THE CREATOR IS NOT A LINE THE CREATOR SAYS.
 *
 * ⚠️ MEASURED IN PRODUCTION 2026-09-07. Of 447 stored shot-list entries, ONE
 * carries Twin's own interview question in `spoken_text`, which the Result
 * screen renders under the heading "What to say":
 *
 *   "What's something you personally did, learned, tried or went through that
 *    this video could be about? One sentence is enough. Most beginner bakers
 *    stall out because..."
 *
 * "One sentence is enough" is an instruction to the CREATOR. Nobody says that
 * on camera. A creator following the teleprompter reads Twin's question aloud.
 *
 * ⚠️ HOW IT GOT THERE, AND IT IS NOT THE MODEL BEING CARELESS. The prompt tells
 * the model to mark a beat `needs_user` "with a specific question
 * ("${SUBJECT_SOURCE_ASK}")" — quoting the ask verbatim — so the ask is IN the
 * instruction, and the model wrote it as the beat's line. The instruction is
 * right; nothing downstream distinguished a question we asked from a line she
 * speaks.
 *
 * ⚖️ MATCHED AGAINST THE KNOWN ASK, NEVER AGAINST "LOOKS LIKE A QUESTION".
 * That distinction is the whole safety of this file. TEN other stored shots
 * open with a question and every one is a real call to action a creator would
 * happily say out loud:
 *
 *   "What is the biggest thing holding you back from starting your home bakery?
 *    Let me know in the comments..."
 *   "Tell me if you have done this differently. I want to hear it."
 *
 * A heuristic on question marks or leading interrogatives would blank all ten.
 * The ask is a known string; it is imported, not re-spelled.
 *
 * ⚖️ AND THE ASK MUST STILL REACH HER — on the question card, where it is a
 * question. This suppresses it in ONE place: the surface that tells her what to
 * say on camera.
 */
import { SUBJECT_SOURCE_ASK } from './subjectSource'

/** Every question Twin puts to a creator. One entry today; the list exists so
 *  the next one is added here rather than given its own private matcher. */
export const CREATOR_ASKS: readonly string[] = [SUBJECT_SOURCE_ASK]

const norm = (s: unknown): string =>
  String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()

/**
 * Is this spoken line actually a question Twin asked the creator?
 *
 * ⚠️ SUBSTRING, NOT EQUALITY. The production case has the ask followed by more
 * text ("...One sentence is enough. Most beginner bakers stall out because"),
 * so an equality check would have missed the only real instance there is.
 */
export function spokenLineIsAnAsk(line: unknown): boolean {
  const hay = norm(line)
  if (hay === '') return false
  return CREATOR_ASKS.some((ask) => hay.includes(norm(ask)))
}
