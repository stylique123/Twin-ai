// FOUR OBJECTIVES ASKED THE SAME TWO QUESTIONS, WHICH IS WHY THE SCRIPTS WERE
// THE SAME SCRIPT.
//
// ⚠️ THE OWNER'S MEASUREMENT: nine of ten runs shared one premise. The cause is
// upstream of the writer and upstream of the prompt — the INPUT never changed.
// A creator picked "Launch it" or "Explain what it does" or "Say why I made
// it", and every one of them was then asked the same generic claims question,
// so the writer received the same material and, reasonably, wrote the same
// video with a different last line.
//
// ⚖️ SO THE OBJECTIVE SELECTS THE QUESTION. Not a new field, not a new
// vocabulary: the objective she already picks now decides WHICH SENTENCE is put
// in front of her for the claims field. The answer travels the path
// `answers.claims` already travels, to the reader that already exists.
//
// ⚠️ AND THAT IS THE ONLY REASON THIS IS SAFE TO SHIP AS ONE CHANGE. A new
// field would need a new server reader, a new persisted key and a migration,
// and would be the repo's standing defect — something written that nothing
// reads. This writes to a field whose reader has been live for months.
//
// ⚖️ EACH QUESTION EARNS ITS PLACE BY WHAT ONLY IT CAN SUPPLY. The test beside
// this file pins that no two objectives share a question, because two
// objectives that ask the same thing are a choice with no consequence — the
// same bar `PRODUCT_OBJECTIVES` already holds for goals.

import type { VideoGoal } from './videoIntent.js'

/** The one question each product objective needs, in the creator's own
 *  language, and the reason only that objective needs it.
 *
 *  ⚠️ WORDING IS THE OWNER'S, VERBATIM, from the objective table. It is written
 *  to be answerable in one line by somebody holding a phone — never "describe
 *  your value proposition".
 *
 *  ⚖️ AND IT ASKS FOR MATERIAL, NEVER FOR A JUDGEMENT ABOUT HER AUDIENCE. The
 *  distinction the owner drew on the niche-questions decision holds here too:
 *  Twin may ask what people misunderstand; it may never offer her four guesses
 *  at what her audience believes and call one of them her answer. */
export interface ObjectiveQuestion {
  /** The sentence she reads. */
  readonly question: string
  /** Why no other objective can supply it. Recorded so a future edit has to
   *  argue with the reason rather than just overwrite the string. */
  readonly because: string
}

/** ⚠️ KEYED ON THE CANONICAL GOAL, WHICH IS WHAT THE OBJECTIVE ALREADY IS.
 *  `PRODUCT_OBJECTIVES` is a re-presentation of `VideoGoal`, not a second
 *  vocabulary — see the long note above it in `videoIntent.ts`. Keying here on
 *  anything else would fork exactly the vocabulary that file exists to keep
 *  singular. */
export const OBJECTIVE_QUESTIONS: Readonly<Partial<Record<VideoGoal, ObjectiveQuestion>>> = Object.freeze({
  sell: Object.freeze({
    question: 'What is new about it, or why now?',
    because: 'Nothing in Product DNA can supply urgency. Without it a launch is '
      + 'an explainer with a CTA on the end.',
  }),
  educate: Object.freeze({
    question: 'What do people misunderstand about how it works?',
    because: 'An explainer needs the misunderstanding, not the feature list. '
      + 'The misunderstanding becomes the hook and a spec list becomes a myth-bust.',
  }),
  leads: Object.freeze({
    question: 'What is the smallest first step someone can take?',
    because: 'Trial needs a low doorstep, and only she knows where hers is. '
      + 'This is the question that produced the free 3-day sample.',
  }),
  conversations: Object.freeze({
    question: 'What is the question you keep getting?',
    because: 'Otherwise Twin invents the question — and on the DM run it '
      + 'guessed wrong. Her real one becomes the hook.',
  }),
  personal_brand: Object.freeze({
    question: 'What was missing that made you build it?',
    because: 'An origin needs the absence. The gap is the stakes, and today '
      + 'this objective asks nothing at all.',
  }),
})

/** The claims question for a product build, when the objective is known.
 *
 *  ⚠️ RETURNS null RATHER THAN A GUESS. An objective with no question of its
 *  own falls back to the generic claims wording, which is a real question — not
 *  a blank and not an invented sentence. `null` is what lets the caller do that
 *  without this file knowing what the fallback says. */
export function objectiveQuestion(objective: string | null | undefined): string | null {
  const key = typeof objective === 'string' ? objective.trim() : ''
  if (!key) return null
  const hit = (OBJECTIVE_QUESTIONS as Record<string, ObjectiveQuestion | undefined>)[key]
  return hit ? hit.question : null
}
