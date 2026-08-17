// A CTA TWIN WROTE FOR ITSELF MUST NEVER WEAR THE CREATOR'S NAME.
//
// ⚖️ TWO DIFFERENT THINGS SHARE ONE WORD. The MECHANISM is what the viewer is
// asked to do — follow, comment, save, book a call — and it is a creative
// decision Twin is entitled to make from the goal and the reference. The TEXT is
// the sentence said out loud, and the creator's own wording is theirs.
//
// ⚠️ THE FAILURE THIS EXISTS TO PREVENT IS QUIET AND FLATTERING. Derive
// "Follow for more" from the goal, store it as the creator's default CTA, and
// every later screen reports a confirmed preference that nobody ever expressed.
// It is the palette defect again in a different column: a machine's reading
// promoted to a person's decision, and once stored there is nothing left to
// distinguish it from one.
//
// ⚖️ SO PROVENANCE IS STRUCTURAL, NOT A FLAG. The profile field holds ONLY text a
// person typed; a generated line is produced per video and never written back.
// A boolean saying "this one is real" can be set wrongly by any writer — a field
// that generated text cannot reach cannot be wrong.

import type { VideoGoal } from './videoIntent'

/** What the viewer is asked to do. Twin may decide this. */
export const CTA_MECHANISMS = [
  'follow', 'comment', 'share', 'save', 'link', 'book', 'buy',
] as const
export type CtaMechanism = (typeof CTA_MECHANISMS)[number]

/**
 * Where a CTA came from.
 *
 * ⚖️ `user_confirmed` IS THE ONLY ONE THAT COUNTS AS A PREFERENCE. The other two
 * are Twin's own work, and reporting either as the creator's answer is the lie
 * this module is built to make impossible.
 */
export type CtaSource = 'user_confirmed' | 'generated' | 'creative_decision_plan'

export interface ResolvedCta {
  /** The sentence to say. Null when there is nothing honest to put here. */
  text: string | null
  mechanism: CtaMechanism | null
  /** Of the TEXT. A generated sentence is never `user_confirmed`. */
  source: CtaSource | null
}

/** ⚠️ A STRATEGY, NOT A SENTENCE. The goal decides what KIND of ask fits; it
 *  never decides the words, which is the boundary the whole module defends. */
// ⚠️ `Record<VideoGoal, …>` IS DELIBERATE AND IT ALREADY EARNED ITS KEEP. I first
// wrote this against a goal list I had assumed — awareness, community — and the
// real enum has neither. An index signature would have compiled and returned
// undefined for every real goal, so every video would have fallen through to the
// no-mechanism branch and silently lost its CTA. The exhaustive record makes a
// wrong guess a type error instead of a quiet blank.
export const MECHANISM_FROM_GOAL: Record<VideoGoal, CtaMechanism> = {
  followers: 'follow',
  authority: 'follow',
  educate: 'save',
  conversations: 'comment',
  leads: 'book',
  sell: 'link',
  entertain: 'share',
  personal_brand: 'follow',
}

/** The wording Twin uses when it has to write one itself. Deliberately plain:
 *  a generated line should not try to sound like the creator, because it is not
 *  theirs and a good imitation is harder to notice. */
const GENERATED_TEXT: Record<CtaMechanism, string> = {
  follow: 'Follow for more',
  comment: 'Tell me what you think in the comments',
  share: 'Send this to someone who needs it',
  save: 'Save this for later',
  link: 'The link is in my bio',
  book: 'Book a call — the link is in my bio',
  buy: 'The link is in my bio',
}

export interface CtaInput {
  /** What the creator typed, once, in their profile. The only source of truth
   *  for WORDING. */
  defaultCta?: string | null
  /** What this video is for. Decides the mechanism when nothing better does. */
  goal?: VideoGoal | null
  /** A mechanism read off the reference. It may override the goal's default —
   *  the reference is evidence about what works for this shape of video — but it
   *  may never supply TEXT. */
  referenceMechanism?: CtaMechanism | null
  /** Whether this video may talk commercially at all. A commercial default CTA
   *  must not be spoken on a video the creator's own answers say is not one. */
  commercial?: boolean
}

const COMMERCIAL_MECHANISMS: ReadonlySet<CtaMechanism> = new Set(['link', 'book', 'buy'])

/**
 * The CTA for one video, and an honest account of where it came from.
 *
 * ⚠️ THE CREATOR'S TEXT IS NOT USED ON A VIDEO THAT MAY NOT SELL. Someone whose
 * default is "Try Twin free" still makes non-commercial videos, and pasting a
 * product pitch onto the end of one is the CTA overriding the creative decision
 * rather than serving it. The mechanism falls back and the text is generated.
 */
export function resolveCta(input: CtaInput): ResolvedCta {
  const typed = typeof input.defaultCta === 'string' ? input.defaultCta.trim() : ''
  const fromGoal = input.goal ? MECHANISM_FROM_GOAL[input.goal] : null
  // ⚖️ THE REFERENCE OUTRANKS THE GOAL ON MECHANISM ONLY. It is measured evidence
  // about what this shape of video actually asks for; the goal is a stated
  // intention, and where they disagree the evidence is the better guide to the
  // ASK. Neither of them gets to write a sentence.
  const mechanism = input.referenceMechanism ?? fromGoal

  if (typed !== '') {
    const commercialAsk = mechanism !== null && COMMERCIAL_MECHANISMS.has(mechanism)
    // A creator's own CTA is honoured unless this video may not carry a
    // commercial ask at all.
    if (input.commercial !== false || !commercialAsk) {
      return { text: typed, mechanism, source: 'user_confirmed' }
    }
  }

  if (!mechanism) {
    // ⚠️ NULL RATHER THAN A CHEERFUL DEFAULT. With no goal, no reference and no
    // stated preference there is nothing to base an ask on, and inventing
    // "Follow for more" would put a sentence in the creator's mouth for the sake
    // of filling a field.
    return { text: null, mechanism: null, source: null }
  }
  const safe = input.commercial === false && COMMERCIAL_MECHANISMS.has(mechanism)
    ? 'follow'
    : mechanism
  return { text: GENERATED_TEXT[safe], mechanism: safe, source: 'generated' }
}

/**
 * ⚠️ THE PROFILE ITEM IS SATISFIED ONLY BY A PERSON. This is the function the
 * Content Profile meter calls, and it exists so the meter cannot tick to 100%
 * off a sentence Twin wrote for itself — which is precisely how the old palette
 * meter came to report brand colours nobody chose.
 */
export function hasConfirmedCta(defaultCta: string | null | undefined): boolean {
  return typeof defaultCta === 'string' && defaultCta.trim() !== ''
}
