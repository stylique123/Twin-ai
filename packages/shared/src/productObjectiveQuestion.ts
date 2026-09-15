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
/**
 * WHETHER WHAT SHE SELLS IS A THING OR WORK SHE PERFORMS.
 *
 * ⚠️ THE OWNER ASKED FOR THREE — service, physical, digital — AND THE WORDING
 * ONLY NEEDS TWO. Tested against the three questions that actually break: "What
 * is new about IT", "how IT WORKS", "made you BUILD IT". A physical product and
 * a digital one take the SAME sentence in all three; there is no phrasing where
 * they differ. Only a service has no "it" to be new, nothing that "works" the
 * way an object does, and nothing you "build".
 *
 * ⚖️ SO THE THIRD BUCKET IS NOT BUILT. Adding a digital variant identical to the
 * physical one would be a distinction the copy cannot cash, and a bucket that
 * does not fit is what makes a model — or a creator — force-fit an answer. If a
 * phrasing is ever found that genuinely separates them, this union is where it
 * goes and the compiler will demand the wording.
 */
export const OFFER_FORMS = ['artefact', 'performed'] as const
export type OfferForm = (typeof OFFER_FORMS)[number]

/**
 * ⚠️ KEYED ON THE ENTITY'S OWN `type`, WHICH IS 100% POPULATED, NOT ON AN
 * ONBOARDING ANSWER. Measured 2026-09-14: all 22 live `product_entities` rows
 * carry a type across 20 owners (PHYSICAL_PRODUCT 9, SERVICE 7,
 * DIGITAL_PRODUCT 4, SAAS 1, OTHER 1), while `pre_script_brief.workKind` — the
 * nearest onboarding field — is filled on 19 of 56 voices (34%).
 *
 * ⚖️⚖️ AND THAT 34% IS EXACTLY WHY FOUR PREVIOUS FIXES STALLED. The owner's
 * ruling names it: a hand-written table "caps at 30 of 47 creators". Keying on
 * workKind would cap harder. The entity type cannot cap, because having an
 * entity is what makes a build a product build in the first place — and it is
 * the more current fact: what she is selling in THIS video, not what she typed
 * at signup.
 *
 * ⚠️ `OTHER` RETURNS null, AND null MEANS THE DEFAULT WORDING. That value exists
 * so the enum never forces a misclassification, so it must not be coerced into
 * one here either.
 */
export function offerFormOf(type: string | null | undefined): OfferForm | null {
  switch (typeof type === 'string' ? type.trim().toUpperCase() : '') {
    // Work performed by a person. There is no object, and nothing gets built.
    case 'SERVICE':
    case 'COMMUNITY':
      return 'performed'
    case 'PHYSICAL_PRODUCT':
    case 'DIGITAL_PRODUCT':
    case 'SAAS':
    case 'APP':
    case 'COURSE':
    case 'MARKETPLACE':
      return 'artefact'
    // 'OTHER', unknown, or absent: the default wording, never a guess.
    default:
      return null
  }
}

export interface ObjectiveQuestion {
  /** The sentence she reads. */
  readonly question: string
  /** Why no other objective can supply it. Recorded so a future edit has to
   *  argue with the reason rather than just overwrite the string. */
  readonly because: string
  /**
   * The same question for someone selling work rather than a thing.
   *
   * ⚠️⚠️ THIS WORDING IS MINE, NOT THE OWNER'S, AND IT IS THE ONE THING IN THIS
   * FILE THAT IS NOT. The banner above says the questions are the owner's
   * verbatim from the objective table, and that still holds for every
   * `question` field. These three variants exist because the default is
   * ungrammatical for a service, not because anyone wrote them — so they are
   * marked for replacement rather than presented as settled copy. A creator
   * reads this sentence; the mechanism is mine to build and the words are not.
   *
   * ⚖️ ABSENT MEANS THE DEFAULT ALREADY WORKS. Five of the eight objectives need
   * no variant at all, which is a fact about the owner's wording being mostly
   * kind-agnostic already — not an omission.
   */
  readonly whenPerformed?: string
}

/** ⚠️ KEYED ON THE CANONICAL GOAL, WHICH IS WHAT THE OBJECTIVE ALREADY IS.
 *  `PRODUCT_OBJECTIVES` is a re-presentation of `VideoGoal`, not a second
 *  vocabulary — see the long note above it in `videoIntent.ts`. Keying here on
 *  anything else would fork exactly the vocabulary that file exists to keep
 *  singular. */
export const OBJECTIVE_QUESTIONS: Readonly<Partial<Record<VideoGoal, ObjectiveQuestion>>> = Object.freeze({
  sell: Object.freeze({
    // "it" is an object. A coach has no it.
    whenPerformed: 'What is new about how you work, or why now?',
    question: 'What is new about it, or why now?',
    because: 'Nothing in Product DNA can supply urgency. Without it a launch is '
      + 'an explainer with a CTA on the end.',
  }),
  educate: Object.freeze({
    // A service does not "work" the way an object does; it is done.
    whenPerformed: 'What do people misunderstand about how you actually do it?',
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
  followers: Object.freeze({
    question: 'What do people outside your world get wrong about what you do?',
    because: 'Reach is a stranger problem. Everything else here assumes the '
      + 'viewer already cares; this is the only objective whose audience does '
      + 'not, and the misunderstanding an outsider holds is the one thing that '
      + 'travels past people who already follow her.',
  }),
  authority: Object.freeze({
    question: 'What can you do now that took you years to get right?',
    because: 'Trust is earned by demonstrated competence, not by claiming it. '
      + 'Product DNA holds what a thing IS, never what she had to learn to make '
      + 'it — and without that a trust video becomes an adjective list.',
  }),
  entertain: Object.freeze({
    question: 'What is the worst or funniest thing that has happened doing this?',
    because: 'A video meant to be enjoyed needs a MOMENT, and a moment has a '
      + 'time and a place. Nothing else in the system stores one: the knowledge '
      + 'store holds positions and lessons, which is why this objective '
      + 'otherwise produces a list with jokes attached.',
  }),
  personal_brand: Object.freeze({
    // Nobody builds a service. They start one because something was missing.
    whenPerformed: 'What was missing that made you start doing this?',
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
export function objectiveQuestion(
  objective: string | null | undefined,
  offerForm?: OfferForm | null,
): string | null {
  const key = typeof objective === 'string' ? objective.trim() : ''
  if (!key) return null
  const hit = (OBJECTIVE_QUESTIONS as Record<string, ObjectiveQuestion | undefined>)[key]
  if (!hit) return null
  // ⚠️ THE VARIANT ONLY WINS WHEN THE FORM IS KNOWN *AND* A VARIANT EXISTS.
  // An unknown form falls to the owner's wording, which is a real question --
  // never a blank and never a guess at what she sells. That is the same rule
  // `offerFormOf` follows when it returns null for 'OTHER'.
  if (offerForm === 'performed' && hit.whenPerformed) return hit.whenPerformed
  return hit.question
}
