// GENERATED FROM packages/shared/src/script/referenceExposure.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * THE FIDELITY CONTROL GOVERNS HOW MUCH OF THE REFERENCE'S LANGUAGE THE WRITER
 * EVER SEES — because a directive cannot out-argue the presence of the text.
 *
 * ⚠️ THE DEFECT THIS REPLACES. `generate-blueprint` handed the writer 6,000
 * characters of the reference's verbatim speech UNCONDITIONALLY, at every
 * fidelity setting, and asked it in prose not to reuse them. Four audited live
 * runs answered that question: Run A shipped the reference creator's own
 * sentence as this creator's dialogue, Run D reproduced two of them near-
 * verbatim at fidelity="loose", and Run C shipped the reference creator's
 * company as the CTA. Renaming the options made the promise clearer, not truer.
 * If you supply the exact source material and instruct a model to replace what
 * every beat is about, it reuses the words.
 *
 * ⚖️ REMOVE THE VECTOR, DO NOT ARGUE WITH IT. The only lever that cannot be
 * ignored by a model is the one that changes what is in its context. So the
 * verbatim budget is a FUNCTION of the creator's choice, monotonic in it:
 * most-mine sees least of their words, most-theirs sees most.
 *
 * ⚖️ A FRACTION *AND* A CEILING, NOT A CEILING ALONE. `clip(text, 6000)` on a
 * 400-character reference is the whole transcript, so an absolute cap alone
 * would leave short references — the common case for a Short — entirely
 * ungoverned. The fraction is what makes the control bite at every length; the
 * ceiling is what keeps a 40-minute podcast from flooding the prompt.
 *
 * ⚖️ NO FLOOR, DELIBERATELY. A minimum-characters floor would restore exactly
 * the unconditional exposure this module exists to end, and would do it
 * silently on the short references that are most of the corpus. Grounding for
 * the analysis fields comes from `referenceShapeDigest` below instead — which
 * is computed from the FULL transcript and contains none of its words.
 */

/** ⚠️ MIRRORS `REFERENCE_USE` in `videoIntent.ts`, most-mine to most-theirs.
 *  Declared locally so this module has no imports to rewrite when it is
 *  mechanically copied into the edge runtime; `referenceExposure.test.ts`
 *  asserts the two lists are identical, so a value added there cannot go
 *  unbudgeted here. */
export type ReferenceUseLevel = 'structure' | 'idea_structure' | 'stay_close'

export interface ExposureBudget {
  /** Hard ceiling on verbatim characters, whatever the transcript's length. */
  maxChars: number
  /** Ceiling as a share of the transcript, so the control bites on short
   *  references too. `1` means "no fractional limit". */
  maxFraction: number
  /** What this level supplies to the writer, in one line, for the prompt. */
  supplies: string
}

/**
 * ⚠️ MONOTONIC IN BOTH FIELDS, and `referenceExposure.test.ts` asserts it. The
 * ordering IS the control: if a looser setting could ever expose more verbatim
 * text than a tighter one, the creator's choice would not govern borrowing and
 * this module would be another label.
 */
export const REFERENCE_EXPOSURE: Record<ReferenceUseLevel, ExposureBudget> = {
  // "Same shape and hook style, completely my subject." This is where borrowing
  // is most wrong and, until now, most possible. The writer gets the SHAPE —
  // the derived structure and the digest — and as little of the reference's
  // actual sentences as the analysis fields can survive on.
  structure: {
    maxChars: 1200,
    maxFraction: 0.25,
    supplies: 'the reference\'s SHAPE ONLY — beat order, hook mechanism, escalation and timing. The excerpt below is a short sample for your reference_read ONLY; there is deliberately not enough of it to write from, because the subject and every sentence must be this creator\'s.',
  },
  // The middle: the central argument plus the shape. Enough language to carry
  // the point across, not enough to lift phrasing from.
  idea_structure: {
    maxChars: 3000,
    maxFraction: 0.6,
    supplies: 'the reference\'s SHAPE and its CENTRAL ARGUMENT. The excerpt below is enough to carry what the video is arguing; it is not a source of wording — the sentences must be this creator\'s.',
  },
  // Most-theirs. The creator explicitly asked to stay near the original, so
  // today's exposure is defensible here and is left unchanged — this level is
  // the control's answer to "I want it close", not a loophole in it.
  stay_close: {
    maxChars: 6000,
    maxFraction: 1,
    supplies: 'the reference in full, because the creator asked to stay close to it. Even here, its sentences are evidence to adapt, never lines to reproduce.',
  },
}

/**
 * How many characters of the reference's verbatim speech this setting allows.
 *
 * ⚠️ NEVER MORE THAN THE TRANSCRIPT ITSELF, and never negative. A non-finite or
 * absent length is zero exposure rather than a NaN budget that `slice` would
 * silently read as "everything".
 */
export function verbatimBudget(
  level: ReferenceUseLevel | null | undefined,
  transcriptLength: number,
): number {
  const len = Number.isFinite(transcriptLength) && transcriptLength > 0
    ? Math.floor(transcriptLength)
    : 0
  if (len === 0) return 0
  // ⚖️ AN UNANSWERED CONTROL IS NOT A LOOSE ONE. When the creator never chose,
  // fall to the MIDDLE budget rather than the widest: defaulting to maximum
  // exposure would mean the setting governs borrowing only for people who
  // happened to answer, which is how the previous version failed.
  const budget = REFERENCE_EXPOSURE[level ?? 'idea_structure'] ?? REFERENCE_EXPOSURE.idea_structure
  return Math.max(0, Math.min(len, budget.maxChars, Math.floor(len * budget.maxFraction)))
}

/** ⚠️ SMALL COUNTS ONLY, DIGITS OR WORDS. An enumerating hook promises a
 *  handful ("three reasons", "5 mistakes"); a large number in an opener is a
 *  statistic, not a structural promise, and reading it as one would make the
 *  adapted script owe the viewer sections that were never there. */
const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

function readEnumeration(sentence: string): number | null {
  const digits = /\b([2-9]|10)\b/.exec(sentence)
  if (digits) return Number(digits[1])
  for (const w of sentence.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)) {
    if (w in NUMBER_WORDS) return NUMBER_WORDS[w]
  }
  return null
}

export interface ReferenceShapeDigest {
  sentences: number
  words: number
  /** Word count per sentence, in order — the pacing and escalation pattern,
   *  which is the thing a "same shape" adaptation actually needs. */
  sentenceWords: readonly number[]
  /** What the opener DOES, as a mechanism rather than as its words. */
  hookMechanism: 'question' | 'command' | 'number_promise' | 'statement'
  /** The count an enumerating opener promises ("3 reasons…"), when it makes
   *  one — the structural commitment the script must honour. */
  enumeration: number | null
  questions: number
  /** Second-person address density, ×1000, as an integer — how directly the
   *  reference talks AT the viewer, which is a delivery property, not content. */
  secondPersonPerThousand: number
}

/**
 * THE SHAPE OF THE REFERENCE, COMPUTED FROM THE WHOLE TRANSCRIPT, CARRYING NONE
 * OF ITS WORDS.
 *
 * ⚠️ THIS IS WHAT RESOLVES THE ANALYSIS TENSION. `reference_read.why_it_works`
 * and `retention_map` are required to be grounded in THIS specific video rather
 * than a generic format pattern, and cutting the transcript would starve them.
 * Every field here is measured from the FULL transcript regardless of the
 * verbatim budget, so the analysis keeps a this-video-specific evidence base at
 * every fidelity setting while the script-writing side of the prompt sees less
 * language to lift.
 *
 * ⚖️ NUMBERS AND ENUM LABELS ONLY — NO SUBSTRINGS OF THE TRANSCRIPT. Emitting
 * even a short quoted phrase here would reintroduce the borrowing vector
 * through the field designed to close it, so the digest is structurally
 * incapable of carrying one and a test asserts it shares no content word with
 * its input.
 */
export function referenceShapeDigest(transcript: unknown): ReferenceShapeDigest | null {
  const text = String(transcript ?? '').trim()
  if (text === '') return null
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s !== '')
  const wordsOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w !== '')
  const all = wordsOf(text)
  const first = sentences[0] ?? ''
  // ⚖️ MECHANISM FROM PUNCTUATION AND SHAPE, never from the opener's topic. A
  // digest that classified the hook by what it was ABOUT would be describing
  // the subject, which is the one thing `structure` fidelity must not carry.
  // ⚠️ WORDS AS WELL AS DIGITS. Spoken references say "three reasons", not
  // "3 reasons" — a digit-only match would have read almost every enumerating
  // hook in the corpus as a plain statement and lost the one structural
  // commitment the adapted script has to honour.
  const numberPromise = readEnumeration(first)
  const hookMechanism: ReferenceShapeDigest['hookMechanism'] =
    first.includes('?') ? 'question'
      : numberPromise !== null ? 'number_promise'
        : /^(stop|start|don'?t|never|always|do|try|watch|listen|look)\b/i.test(first) ? 'command'
          : 'statement'
  const secondPerson = all.filter((w) => w === 'you' || w === 'your' || w === "you're" || w === 'yours').length
  return Object.freeze({
    sentences: sentences.length,
    words: all.length,
    sentenceWords: Object.freeze(sentences.map((s) => wordsOf(s).length)) as readonly number[],
    hookMechanism,
    enumeration: hookMechanism === 'number_promise' ? numberPromise : null,
    questions: sentences.filter((s) => s.includes('?')).length,
    secondPersonPerThousand: all.length === 0 ? 0 : Math.round((secondPerson / all.length) * 1000),
  })
}

/** The digest rendered for the prompt. Labels and numbers only — see above. */
export function renderShapeDigest(d: ReferenceShapeDigest | null): string {
  if (!d) return '(none)'
  return [
    `sentences: ${d.sentences}`,
    `words: ${d.words}`,
    `words per sentence, in order: ${d.sentenceWords.join(', ')}`,
    `hook mechanism: ${d.hookMechanism}`,
    `enumeration promised: ${d.enumeration ?? 'none'}`,
    `questions asked: ${d.questions}`,
    `second-person address per 1000 words: ${d.secondPersonPerThousand}`,
  ].join('\n')
}
