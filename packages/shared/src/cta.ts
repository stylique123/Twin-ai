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
//
// ⚠️⚠️ AND NOW THE PART THAT MATTERS MOST TO WHOEVER READS THIS NEXT:
// `resolveCta` HAS NO READER. Measured 2026-09-08 across packages/shared,
// apps/web, supabase/functions and worker: zero non-test call sites. The
// mechanism table, the commercial suppression and the resolution logic are
// exercised only by this module's own tests.
//
// ⚠️ AND ONE OF THESE SENTENCES SHIPS FROM SOMEWHERE ELSE ENTIRELY. I first
// wrote here that none of `GENERATED_TEXT` reaches shipping code; the test
// below caught that as false on its first run. `recordingScriptAdapter.ts`
// carries its own hard-coded `ctaLine || 'Follow for more'` — a deliberate,
// documented fallback, and the line a creator actually sees when their CTA beat
// is empty. So "Follow for more" is defined TWICE, independently, and editing
// the copy below would change nothing a creator ever reads.
//
// ⚖️ THE SHIPPED POLICY LIVES SOMEWHERE ELSE, AND IT IS NOT A PORT OF THIS. This
// module decides a CTA: given a goal it returns a sentence. The product does not
// work that way — `generate-blueprint` puts the creator's typed wording into the
// prompt and instructs the model to use it, and where there is none the model
// writes the closing ask under the CTA-intent rules. So the two are not two
// copies of one rule, and a parity test between them would assert an
// equivalence that does not exist.
//
// ⚠️ THE REASON THIS COMMENT EXISTS AT ALL is that everything above it reads as
// live policy, and a header that describes behaviour the code no longer has is
// how a day gets spent editing a file that changes nothing. Until someone
// decides to wire it or delete it, the file must at least say which it is.
// `aPolicyModuleMustNotPretendToBeWired.test.ts` fails the moment a real reader
// appears, so this paragraph cannot quietly go stale the way the last one did.
//
// ⚖️ WHAT IS LIVE HERE: `CTA_MECHANISMS` (read by referenceExtraction and
// shapeLibrary) and `hasConfirmedCta` (read by profileCompletion and
// setupAreas). Deleting the module wholesale would take those with it.

import type { VideoGoal } from './videoIntent'
import type { BriefGoal } from './preScriptBrief'

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

// ── DOES THIS SENTENCE ALREADY ASK THE VIEWER FOR SOMETHING? ──────────────
//
// ⚠️ TWO PRODUCTION RUNS, BOTH ON @theofferingmicrobakery. The recorder showed
// "Scene 6 · about 1.5s · no beat length planned" carrying the words "Follow for
// more" — on scripts that contain no such line anywhere. Neither blueprint had
// a beat named CTA: both ended on a beat named `Payoff` that already asked
// ("Tell me in the comments, what is the one scent note…" / "…I will see you in
// the next video"), each with a planned target of 9 and 12 seconds.
//
// `recordingScriptAdapter` looked for a CTA by SECTION NAME only, found none,
// and appended a generic ending of its own — unplanned, so no beat length, and
// 1.5 seconds long by estimate. Every word on that card was true and the scene
// should not have existed.
//
// ⚖️ SO THE ASK IS RECOGNISED BY WHAT IT ASKS, not by what the writer labelled
// it. The vocabulary is `CTA_MECHANISMS`, which already exists and is already
// what the rest of this module reasons in — a second private list of "ending
// phrases" is how two parts of one system come to disagree about whether a
// script has an ending.
//
// ⚠️ ORDER IS COMMERCE-FIRST AND NOT ALPHABETICAL. "Comment SAUCE and I'll send
// the link" is two mechanisms in one line, and reading it as a comment prompt
// loses the fact that it is a sale — which is the reading that carries a
// disclosure obligation.
// ⚠️ WIDENED AGAINST THE REAL CORPUS, AND THE FIRST VERSION MISSED 71% OF IT.
// Measured over all 47 stored `recurring_ctas` sets: the original patterns
// recognised an ask on 12 of 42 non-empty accounts. The candle maker's own
// ending — "I'll put the link for it right down here" — was a miss, so was
// "link in the description", "Book a demo", "Join our newsletter" and
// "smash that subscribe button". A rule that fires on a third of accounts is
// not a rule, it is a coincidence, and I shipped it as one.
//
// ⚖️ THE MISSES THAT REMAIN ARE CORRECT MISSES. "Do the work", "Take a deep
// breath", "Lock it in", "Let's get into them" are sign-offs, not asks. Widening
// until everything matches would make the detector meaningless — the point is to
// tell an ask from an ending, and some endings ask for nothing.
const MECHANISM_PATTERNS: ReadonlyArray<{ mechanism: CtaMechanism; test: RegExp }> = [
  { mechanism: 'buy', test: /\b(use (my|the) code|discount code|promo code|shop (now|here|the|smarter)|order (now|yours|here)|buy (it|now|yours|here|your first)|grab (yours|one|this)|pre-?order|try it (now|free|for free|before you buy)|sign up now)\b/i },
  { mechanism: 'link', test: /\b(link ?s? (in|down|below|is in)|in bio|linkinbio|swipe up|check the link|the link i (left|dropped)|put the link|tap the (product )?link|link in the description)\b/i },
  { mechanism: 'book', test: /\b(book (a|your|the) (call|slot|appointment|consult|demo)|dm me|message me|message the number|get in touch|work with me|apply (now|here|to)|to apply|enquire|contact us|connect with us|schedule a (live )?demo|join our newsletter)\b/i },
  { mechanism: 'save', test: /\b(save (this|it|for later|karlo)|bookmark|keep this|come back to this)\b/i },
  { mechanism: 'share', test: /\b(send this to|share (this|it) with|share to your story|tag (someone|a friend|that friend|a woman)|show this to|share this)\b/i },
  { mechanism: 'comment', test: /\b(comment|drop (a|an|your)|tell me|let me know|what do you think)\b/i },
  // ⚠️ A DIRECT QUESTION TO THE VIEWER IS AN ASK, and it took a real creator's
  // CTA to show it. The bakery's own recurring ending is "have you ever thought
  // about starting a small business?" — no imperative, no keyword, and the
  // whole point of the sentence is to get an answer. A detector that missed it
  // would have refused her own line and ended her script on nothing.
  //
  // ⚖️ IT MUST ADDRESS THE VIEWER AND END IN A QUESTION MARK. A rhetorical
  // question about a third party ("why does bread collapse?") asks the audience
  // for nothing, and treating it as an ending is the defect one row up.
  { mechanism: 'comment', test: /\byou(r|rs)?\b[^?]*\?\s*$/i },
  { mechanism: 'follow', test: /\b(follow (for|me|my|him|her|the)|give me a follow|hit follow|subscribe|see you in the next|part \d)\b/i },
]

/**
 * The thing this line asks the viewer to do, or null if it asks nothing.
 *
 * ⚠️ NULL IS A REAL ANSWER AND MUST STAY CHEAP. Most sentences in a script ask
 * for nothing, and a detector that finds an ask everywhere would suppress the
 * generated ending on scripts that genuinely have none.
 */
export function ctaMechanismIn(text: string | null | undefined): CtaMechanism | null {
  const t = String(text ?? '').trim()
  if (t === '') return null
  return MECHANISM_PATTERNS.find((m) => m.test.test(t))?.mechanism ?? null
}

/** What a creator whose endings use this mechanism is mostly doing.
 *
 *  ⚠️ NOT THE INVERSE OF `MECHANISM_FROM_GOAL`, and it cannot be: three goals
 *  map to `follow` there, so inverting would have to pick one and would state a
 *  priority nobody expressed. This is its own judgement, in the safe direction —
 *  the broadest goal each mechanism is evidence for. */
export const GOAL_FROM_MECHANISM: Record<CtaMechanism, BriefGoal> = {
  buy: 'sell',
  link: 'sell',
  book: 'leads',
  save: 'educate',
  share: 'followers',
  comment: 'followers',
  follow: 'followers',
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
