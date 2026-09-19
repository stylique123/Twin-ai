// TEN QUESTIONS ASKED OF THE TRANSCRIPT, IN TWO TRACKS.
//
// ⚠️ WHY A SECOND PASS AND NOT A BIGGER PROMPT. The general extractor is told
// "record what this creator knows, believes, has done and has already covered",
// and it answers that question well: 541 transcript-derived rows, 84% substance.
// What it does NOT do is guarantee that the SEVEN things a script actually needs
// are among them — a number, an enemy, an episode, someone else's words, a
// contrarian position, a mistake, a real CTA. Asking for all of it in one prompt
// spreads attention and returns fewer of everything; measured at 1.63 rows per
// transcript, the general pass is already thinner than the material.
//
// ⚖️ SO THIS IS ADDITION, NEVER REPLACEMENT. The general pass runs unchanged on
// every transcript, alongside this one. Both write through the same merge, so an
// item both passes find increments `times_seen` rather than duplicating.
//
// ⚠️⚠️ TRACK B DOES NOT RUN WITHOUT A PRODUCT, AND NOTHING IS GUESSED IN ITS
// PLACE. Not every creator sells anything. Asking "what does she charge" of a
// creator with no offer produces either an empty row or — the failure this whole
// project has been fighting — an invented price. An empty Track B is a CORRECT
// result, and it must never trigger a fallback.

export interface TargetedQuestion {
  /** Stable id, stored on the row. Adding one means a migration (0216's CHECK),
   *  deliberately: a question id that reaches the database without being
   *  declared there is a taxonomy nobody can query. */
  id: string
  /** What the model is asked, in the creator's terms rather than ours. */
  ask: string
  /** What a script does with the answer. In the prompt, because a model that
   *  knows the use returns a usable answer rather than a tidy one. */
  yields: string
  /** The `kind` this answer should almost always be filed as. A HINT, not a
   *  constraint — the taxonomy filter is still the authority, and an answer that
   *  genuinely is a different kind must not be mis-filed to match a table. */
  kind: string
}

/** Asked of EVERY creator, always.
 *
 *  ⚠️ NONE OF THESE SEVEN ASSUMES A BUSINESS. A creator with nothing to sell
 *  still cites numbers, still pushes back against something, still describes a
 *  moment, still gets told things by their audience, still holds a position their
 *  field does not, still made a mistake, and still ends videos by asking for
 *  something — "follow for more", "comment X", "tell me I'm wrong" are all real
 *  CTAs and all valid answers. That is what makes this track unconditional. */
export const TRACK_A: readonly TargetedQuestion[] = Object.freeze([
  {
    id: 'specific_number',
    ask: 'What specific number does she cite — money, time, quantity, percentage — and what is it a number OF?',
    yields: 'the specificity floor. A script that can name her real figure never has to invent one, and an invented number is the single most damaging thing this product can write.',
    kind: 'claim',
  },
  {
    id: 'pushes_back_against',
    ask: 'Who or what does she push back against? Name the advice, habit, group or practice she argues with, in her framing.',
    yields: 'her enemy. The writer already has a field for this and fills it by INFERENCE when nothing is stored — this is the answer that stops it guessing.',
    kind: 'opinion',
  },
  {
    id: 'specific_moment',
    ask: 'What is one specific moment she describes — a decision, a customer, an outcome, a day something happened?',
    yields: 'an episode. Measured: a creator with two stored episodes received three scripts containing none, because the store held claims and the selector had nothing else to reserve.',
    kind: 'experience',
  },
  {
    id: 'someone_else_said',
    ask: 'What has someone else said to her, in THEIR own words — a customer, a follower, a critic, a family member?',
    yields: 'audience pain and proof in a voice that is not hers, which is the only thing that can open a video without sounding like a claim about herself.',
    kind: 'example',
  },
  {
    id: 'others_disagree',
    ask: 'What does she believe that others in her space do not? State her position and, if she named it, what the other side holds.',
    yields: 'a point of view. A script built on a position her field shares says nothing her audience has not heard.',
    kind: 'opinion',
  },
  {
    id: 'lesson_the_hard_way',
    ask: 'What mistake did she make, or what did she learn the hard way? Include what it cost her if she said.',
    yields: 'stakes. A lesson with a price is the most useful thing a creator can hand a script; without the price it is recorded as flat biography.',
    kind: 'experience',
  },
  {
    id: 'real_cta',
    ask: 'What does she actually tell people to do at the end of a video, in her words?',
    yields: 'her real CTA. The writer currently derives one from her goal, so it is our sentence rather than hers — and hers is the one her audience already recognises.',
    kind: 'framework',
  },
])

/** Asked ONLY when a product, service or paid offer is on record.
 *
 *  ⚠️ THE GATE IS A STORED ENTITY, NOT AN INFERENCE FROM THE TRANSCRIPT. "She
 *  sounds like she sells something" is exactly the reasoning that invents a
 *  price. If `product_entities` holds nothing live for this owner, these three
 *  are not asked, and no fallback stands in for them. */
export const TRACK_B: readonly TargetedQuestion[] = Object.freeze([
  {
    id: 'what_she_charges',
    ask: 'What does she charge, and for exactly what? Record the figure and the thing it buys, only if she said both.',
    yields: 'pricing facts a script may state. A figure attached to the wrong scope is worse than no figure.',
    kind: 'claim',
  },
  {
    id: 'refuses_to_promise',
    ask: 'What does she refuse to promise or claim about it — the outcome she will not guarantee, the case she says it is not for?',
    yields: 'claim restrictions. This is the half that lets a script sell without overclaiming, and nothing in the system captures it today.',
    kind: 'framework',
  },
  {
    id: 'what_she_calls_it',
    ask: 'What does she call the product, method or process? Her own name for it, not a description of it.',
    yields: 'signature vocabulary. Her name for her own method is the single strongest voice marker a script can carry.',
    kind: 'product',
  },
])

/** Every id either track can produce — the list 0216's CHECK must match. */
export const TARGETED_QUESTION_IDS: readonly string[] = Object.freeze(
  [...TRACK_A, ...TRACK_B].map((q) => q.id),
)

/** The questions to ask, given whether a product is genuinely on record.
 *
 *  ⚖️ TWO-VALUED IN, AND THE FALSE CASE IS SHORTER RATHER THAN SUBSTITUTED. This
 *  returns SEVEN questions for a creator with no offer, not seven plus three
 *  softened ones. */
export function questionsFor(hasProduct: boolean): readonly TargetedQuestion[] {
  return hasProduct ? [...TRACK_A, ...TRACK_B] : TRACK_A
}

/** Render the bank for the prompt. Numbered, because the model answers a
 *  numbered list more completely than a paragraph, and because an unanswered
 *  number is visible in the output where an unanswered clause is not. */
export function renderQuestions(questions: readonly TargetedQuestion[]): string {
  return questions
    .map((q, i) => `${i + 1}. [${q.id}] ${q.ask}\n   WHY IT MATTERS: ${q.yields}\n   Usually filed as kind "${q.kind}".`)
    .join('\n')
}
