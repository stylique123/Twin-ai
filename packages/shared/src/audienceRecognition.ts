// THE SCAN ALREADY KNOWS WHO THEY MAKE VIDEOS FOR.
//
// ⚠️ 45 OF 47 VOICES CARRY BOTH ANSWERS, MEASURED IN PRODUCTION. The DNA
// synthesis has been inferring `audience_pain` and `dream_outcome` all along,
// and the values are not filler:
//
//   bakery  pain  "Feeling overwhelmed by the unseen business backend
//                  (licensing, pricing, branding) and believing they lack the
//                  perfect kitchen setup to start."
//   physio  dream "Returning to sports, training, and daily hobbies completely
//                  pain-free with restored joint stability."
//
// The ONLY reader is `generate-blueprint`'s prompt. The onboarding screen that
// needs them — "0 stated, 34 guessed" — has never looked. This is the same
// defect as `recurring_ctas`: a field written and never read on the surface
// that needed it, which is now the dominant shape in this codebase.
//
// ⚖️ SO THIS IS A CONFIRMATION, NOT A GENERATOR. Four chips generated per niche
// would throw away a better answer to ask a worse question — and a model call
// on an onboarding screen is a spinner or a fallback, neither of which beats a
// sentence that is already stored. What was missing was never the inference. It
// was the creator ever being shown it.
//
// ⚠️ AND AN UNCONFIRMED INFERENCE IS NEVER A STATEMENT. Same rule as the goal
// question and the recognition lines: the sentence is theirs to accept, and
// declining records nothing.

/** The shape this reads. Structural rather than importing the profile type, so
 *  a caller holding a plain row can ask too. */
export interface ScannedAudience {
  audience_pain?: unknown
  dream_outcome?: unknown
}

export type AudienceFactField = 'audience_pain' | 'dream_outcome'

export interface AudienceFact {
  field: AudienceFactField
  /** The scan's own sentence, verbatim — never paraphrased. */
  text: string
  /** What the creator is being asked to confirm, in their language. */
  question: string
}

/** ⚠️ A ONE-WORD "INFERENCE" IS NOT ONE. The synthesis occasionally returns a
 *  fragment, and "Your people are stuck on: beginners. Right?" is worse than
 *  asking. Long enough to be a claim someone can agree or disagree with. */
const MIN_USEFUL_LENGTH = 20

const QUESTION: Record<AudienceFactField, string> = {
  audience_pain: 'Is this what your people are stuck on?',
  dream_outcome: 'Is this what they actually want?',
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * What the scan already believes about this creator's audience, ready to be
 * confirmed.
 *
 * ⚠️ ORDER IS PAIN THEN DREAM, and it is the order a video is built in: what
 * they are stuck on decides the hook, what they want decides the payoff.
 *
 * ⚖️ RETURNS ONLY WHAT IS THERE. Two accounts in production have neither, and
 * for them the screen must fall back to asking rather than showing an empty
 * card — so an absent field yields no entry, never a blank one.
 */
export function scannedAudienceFacts(
  profile: ScannedAudience | null | undefined,
): AudienceFact[] {
  const out: AudienceFact[] = []
  for (const field of ['audience_pain', 'dream_outcome'] as const) {
    const text = clean(profile?.[field])
    if (text.length < MIN_USEFUL_LENGTH) continue
    out.push({ field, text, question: QUESTION[field] })
  }
  return out
}

/** Has the creator confirmed this one already? The draft stores the CONFIRMED
 *  sentence, not a boolean — so what a later reader sees is the text a person
 *  agreed to, not a flag whose subject has since been re-scanned underneath it.
 *
 *  ⚠️ COMPARED ON THE TEXT, deliberately. A re-scan that changes the sentence
 *  means the creator confirmed something else, and the new one has not been
 *  confirmed by anybody. */
export function audienceFactConfirmed(
  confirmed: string | null | undefined,
  fact: AudienceFact,
): boolean {
  return clean(confirmed) !== '' && clean(confirmed) === fact.text
}
