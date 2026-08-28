// GENERATED FROM packages/shared/src/script/beatAsk.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * A REFUSAL BECOMES A QUESTION.
 *
 * ⚠️ THE WORST MOMENT IN THE PRODUCT, AND IT IS ALSO THE BEST OPPORTUNITY IN IT.
 * When a beat rests on the creator's own life, the writer correctly refuses to
 * invent one — and the product then shipped that refusal AS THE SPOKEN LINE:
 * "Only you can supply this. What would you actually say here?" appeared in
 * three of six scenes of a real script. A creator at a teleprompter cannot read
 * that. The refusal is right; printing it as dialogue is the failure.
 *
 * ⚖️ A `needs_user` BEAT IS NOT A FAILED LINE. IT IS A CAPTURED QUESTION. The
 * same measurement that makes this a defect makes it an opportunity: answers a
 * creator types are the highest-quality knowledge this pipeline holds —
 * transcripts beat captions 78% to 13% on substance, and captions have produced
 * ZERO experiences ever. One answered question is worth more than the scrape.
 *
 * ⚠️ THIS MODULE HOLDS THE CONTRACT, NOT THE SCREEN. What makes an ask usable,
 * what makes a scaffold fillable, and what a filled line looks like. The card
 * that renders it and the endpoint that stores the answer are separate, and
 * both read this.
 */

/** ⚠️ ONE SLOT, SPELLED EXACTLY THIS WAY. A scaffold with two slots has no
 *  single answer; a scaffold with none is a line that never needed asking. */
export const ANSWER_SLOT = '{answer}'

/** The longest ask a creator will actually read before deciding to answer. */
export const ASK_MAX_CHARS = 160

/** ⚖️ REFUSE, NEVER TRUNCATE. A cut-off answer changes what the creator said,
 *  and this text goes into their script and their permanent knowledge. */
export const ANSWER_MAX_CHARS = 240

/**
 * ⚠️ AN ASK THAT COULD BE SENT TO ANY CREATOR IN THE NICHE IS MALFORMED.
 * "Tell me about yourself" produces the same nothing the placeholder did. The
 * beat needs ONE specific moment, number or object, and a question that names
 * none is a question the writer did not actually think about.
 */
const GENERIC_ASKS: readonly RegExp[] = Object.freeze([
  /^\s*tell me about\b/i,
  /^\s*describe your\b/i,
  /^\s*share your story\b/i,
  /^\s*what(?:'s| is) your (?:story|background|journey)\b/i,
  /^\s*talk about\b/i,
  /^\s*can you (?:tell|describe|share)\b/i,
])

export function askIsGeneric(ask: unknown): boolean {
  const s = String(ask ?? '').trim()
  if (s === '') return true
  return GENERIC_ASKS.some((r) => r.test(s))
}

export interface AskProblem {
  code: 'ASK_MISSING' | 'ASK_TOO_LONG' | 'ASK_GENERIC' | 'ASK_NOT_A_QUESTION'
    | 'SCAFFOLD_MISSING' | 'SCAFFOLD_NO_SLOT' | 'SCAFFOLD_MANY_SLOTS' | 'SCAFFOLD_ONLY_SLOT'
  detail: string
}

/**
 * Is this pair usable as a question card?
 *
 * ⚖️ IT RETURNS PROBLEMS, NOT A BOOLEAN, because the caller's job is to repair
 * deterministically and to record WHICH rule failed. "Invalid" tells nobody
 * whether the writer forgot the scaffold or wrote a question for everybody.
 */
export function askProblems(ask: unknown, scaffold: unknown): readonly AskProblem[] {
  const out: AskProblem[] = []
  const a = String(ask ?? '').trim()
  const s = String(scaffold ?? '').trim()

  if (a === '') out.push({ code: 'ASK_MISSING', detail: 'no question was emitted' })
  else {
    if (a.length > ASK_MAX_CHARS) {
      out.push({ code: 'ASK_TOO_LONG', detail: `${a.length} chars, max ${ASK_MAX_CHARS}` })
    }
    if (askIsGeneric(a)) {
      out.push({ code: 'ASK_GENERIC', detail: 'could be sent to any creator in this niche' })
    }
    // ⚠️ IT MUST READ AS A QUESTION. A statement rendered as a question card is
    // a card the creator does not know how to answer.
    if (!a.includes('?')) out.push({ code: 'ASK_NOT_A_QUESTION', detail: 'no question mark' })
  }

  if (s === '') out.push({ code: 'SCAFFOLD_MISSING', detail: 'no line to fill' })
  else {
    const slots = s.split(ANSWER_SLOT).length - 1
    if (slots === 0) out.push({ code: 'SCAFFOLD_NO_SLOT', detail: `expected ${ANSWER_SLOT}` })
    else if (slots > 1) out.push({ code: 'SCAFFOLD_MANY_SLOTS', detail: `${slots} slots, expected 1` })
    // ⚖️ A SCAFFOLD THAT IS *ONLY* THE SLOT HAS WRITTEN NOTHING. The point of a
    // scaffold is that the creator supplies one fact and the writer supplies the
    // sentence around it; "{answer}" alone hands the whole line back to them,
    // which is the placeholder again in a better costume.
    if (slots === 1 && s.replace(ANSWER_SLOT, '').trim().length < 8) {
      out.push({ code: 'SCAFFOLD_ONLY_SLOT', detail: 'the scaffold is the slot and almost nothing else' })
    }
  }
  return Object.freeze(out)
}

export function askIsUsable(ask: unknown, scaffold: unknown): boolean {
  return askProblems(ask, scaffold).length === 0
}

/** The three states an ask can be in. ⚠️ `skipped` IS STORED AS FIRMLY AS AN
 *  ANSWER — a creator who declines must never be asked the same thing again,
 *  and an unanswered ask must never be mistaken for a declined one. */
export type AskState = 'unanswered' | 'answered' | 'skipped'

/**
 * Fill the scaffold with what the creator typed.
 *
 * ⚠️ NO MODEL CALL. The whole point of the scaffold is that the common case
 * costs nothing and cannot fail: the writer already wrote the sentence, the
 * creator supplies the fact, and the two are joined by string substitution.
 *
 * ⚖️ AND THE ANSWER IS REFUSED, NEVER TRUNCATED, when it is too long. Cutting a
 * sentence in half can invert its meaning, and this text is about to be both
 * spoken on camera and stored as something the creator believes.
 */
export function fillScaffold(scaffold: unknown, answer: unknown): string | null {
  const s = String(scaffold ?? '')
  const a = String(answer ?? '').trim()
  if (a === '' || a.length > ANSWER_MAX_CHARS) return null
  if (s.split(ANSWER_SLOT).length - 1 !== 1) return null

  // ⚠️ THE JOIN IS TIDIED, BECAUSE A CREATOR TYPES LIKE A PERSON. They may end
  // with a full stop or not, capitalise or not; the scaffold already carries the
  // sentence punctuation around the slot. Doubling it produces "I quit.. And
  // that was the moment", which reads as a typo in their own script.
  const trimmed = a.replace(/[.\s]+$/, '')
  const filled = s.replace(ANSWER_SLOT, trimmed)
  return filled.replace(/\s+/g, ' ').trim()
}

/** ⚖️ WHAT THE SKIP LEAVES BEHIND. The slot is removed and the sentence around
 *  it survives if it can still stand alone; otherwise there is no line, and the
 *  caller drops the beat rather than shipping a fragment. */
export function scaffoldWithoutAnswer(scaffold: unknown): string | null {
  const s = String(scaffold ?? '')
  if (s.split(ANSWER_SLOT).length - 1 !== 1) return null
  // ⚠️ REMOVING THE SLOT ORPHANS ITS PUNCTUATION. "It starts small. {answer}."
  // becomes "It starts small. ." and then "small.." — a doubled full stop the
  // creator reads as a typo in their own script. Collapse the run rather than
  // leaving the seam visible.
  const rest = s
    .replace(ANSWER_SLOT, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/([.,!?])\s*([.,!?])/g, '$1')
    .trim()
  // A fragment is worse than a missing beat: it reads as a sentence someone
  // started and abandoned, which is exactly how the placeholder read.
  if (rest.replace(/[^a-z0-9]/gi, '').length < 12) return null
  return rest
}

/** What answering or skipping an ask beat produces, and nothing else. */
export interface AskResolution {
  /** The spoken line to store, or '' when nothing survives — never the
   *  question and never a fragment (see `scaffoldWithoutAnswer`). */
  line: string
  state: AskState
}

/**
 * ONE FUNCTION, CALLED FROM BOTH SIDES OF THE WIRE.
 *
 * ⚖️ THE CLIENT AND THE SERVER MUST AGREE ON THE RESULT BEFORE THE SERVER HAS
 * ANSWERED. The card applies this locally the instant a creator taps Answer, so
 * the teleprompter reads real words with no spinner in front of them; the edge
 * function applies the SAME call to decide what actually gets persisted. Two
 * call sites, one function, is how "instant" and "correct" stop being in
 * tension — a second, hand-written copy of this branch is exactly the kind of
 * drift this module exists to prevent.
 *
 * `answer` absent/blank means SKIP, not a malformed answer — skipping is a
 * first-class outcome here, not an error path the caller has to construct.
 *
 * ⚖️ NO SCAFFOLD IS NOT A FAILURE. `generate-blueprint` blanks a beat's line to
 * '' when the writer produced an ask with no usable scaffold — the beat is
 * still worth asking, and the creator's own words become the line directly,
 * with no sentence built around them.
 */
export function resolveAskAnswer(
  ask: unknown, scaffold: unknown, answer: string | null | undefined,
): AskResolution {
  const usable = askIsUsable(ask, scaffold)
  const a = String(answer ?? '').trim()

  if (a === '') {
    // SKIP. Whatever the scaffold's own sentence can stand on without the
    // slot survives; a scaffold that cannot stand alone, or that never
    // existed, leaves no line — never the question itself.
    const kept = usable ? scaffoldWithoutAnswer(scaffold) : null
    return { line: kept ?? '', state: 'skipped' }
  }

  if (usable) {
    const filled = fillScaffold(scaffold, a)
    // `fillScaffold` only returns null for a too-long answer here, since
    // `usable` already guarantees exactly one slot — refuse, not truncate.
    return filled === null
      ? { line: '', state: 'unanswered' }
      : { line: filled, state: 'answered' }
  }

  // No usable scaffold: the creator's own words ARE the line.
  if (a.length > ANSWER_MAX_CHARS) return { line: '', state: 'unanswered' }
  return { line: a, state: 'answered' }
}
