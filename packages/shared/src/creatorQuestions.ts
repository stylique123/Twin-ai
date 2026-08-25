// THE ONE SOURCE BETTER THAN A TRANSCRIPT IS THE CREATOR ANSWERING A QUESTION.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// Measured on the production store: transcript-derived items are 78% substance
// and carry 50 experiences and 23 figures; caption-derived items are 13%
// substance with ZERO experiences and 2 figures. Scanning harder does not close
// that gap, because `clampCaptionBasis` is right — a title proves a video was
// made, never what it concluded. Transcripts are expensive, capped per creator,
// and still only recover what happened to be said on camera.
//
// ⚠️ AN ANSWER IS THE ONLY SOURCE WITH NO EXTRACTION LOSS. Everything else in
// this system is a model inferring a position from evidence; here the creator
// states it. That is why these rows are the only ones in the product that carry
// `basis: 'stated'` without a transcript behind them.
//
// ── WHY ONE AT A TIME, INSIDE NORMAL USE ──────────────────────────────────
//
// ⚖️ PLACEMENT DECIDES WHETHER ANSWERS EXIST AT ALL, AND IT IS ALREADY MEASURED.
// In the first real production run, EVERY question below the fold on the confirm
// screen came back unanswered — the wording was fine and the position was fatal
// (`Onboarding.tsx`). Ten questions on a screen of their own is that same wall,
// rebuilt: the Product Library is a complete, working feature with zero rows in
// it, because it waits to be visited.
//
// So these are asked ONE at a time, at a moment the creator is already having a
// good one — just after a script they kept. Ten answers arrive over weeks
// instead of never arriving at once.
//
// ⚠️ AND NOTHING MAY BE ASKED TWICE. A question the creator skipped is a
// decision, not an absence, and re-asking it is how a helpful prompt becomes
// nagging. `nextQuestion` is given everything already put to them and is
// forbidden from returning it — which is only possible because the caller
// records skips as durably as answers.

/** How a creator-answered row is marked, everywhere. */
export const ASKED_SOURCE = 'asked'

/** The knowledge kinds a question can mint.
 *
 *  ⚖️ THE QUESTION FIXES THE KIND, RATHER THAN A CLASSIFIER GUESSING IT. When
 *  the prompt is "what do most people in your niche get wrong", the answer is an
 *  opinion by construction — asking a model to label it afterwards would add a
 *  failure mode to a step that has none. */
export type AskedKind = 'opinion' | 'experience' | 'framework' | 'claim'

export interface CreatorQuestion {
  /** Stable across wording changes — it is what "already asked" is keyed on.
   *  ⚠️ NEVER REUSE AN ID FOR A DIFFERENT QUESTION. A creator who answered the
   *  old one would silently never see the new one. */
  id: string
  /** What the creator reads. */
  ask: string
  /** The kind the answer becomes. */
  kind: AskedKind
  /** Shown under the field. Present to make a SPECIFIC answer the obvious one:
   *  the whole value of this channel is detail a scan cannot recover. */
  hint: string
}

/** ⚠️ THE SCHEMA CAPS KNOWLEDGE TEXT AT 240 CHARS. Enforced here too, and by
 *  REFUSING rather than truncating: a sentence cut at 240 can invert its own
 *  meaning ("I never recommend X unless the client has…"), and a distillate that
 *  says the opposite of what the creator said is worse than no row at all. */
export const ANSWER_MAX = 240

/** Below this an answer is a gesture, not a position. "Yes", "consistency",
 *  "hard work" — true, useless to a writer, and indistinguishable from a
 *  dismissal of the prompt. */
export const ANSWER_MIN = 12

// ⚖️ TEN QUESTIONS, AIMED AT WHAT THE STORE MEASURABLY LACKS. Not a survey: each
// one targets a kind the caption path cannot produce, and four of the ten ask
// for a NUMBER or a specific case, because `figures` on caption-derived stores
// is 2 across 374 items and a script with no concrete detail is the founding
// defect of this product.
/**
 * THE THREE ASKED AT SIGNUP, IN THIS ORDER.
 *
 * ⚠️ THE SIX QUESTIONS ON THE SCAN SCREEN ARE ALL CATEGORICAL — what you do,
 * who for, what you sell. NOTHING ASKS "tell me about a time". And `experience`
 * items are the single predictor of a script that does not read as generic:
 * measured on production knowledge, captions produce 13% substance and ZERO
 * experiences, ever. So a creator whose catalogue is captions reaches their
 * first script structurally unable to have one worth filming, and finds out by
 * reading it.
 *
 * ⚖️ THREE ANSWERS ARE MORE SUBSTANCE THAN 374 SCRAPED CAPTIONS PRODUCED. That
 * is the whole case for asking, and it is why these three and not six: the wait
 * is real but it is not long, and a question nobody answers is worth less than
 * one they do.
 *
 * ⚠️ THEY ARE EXISTING QUESTIONS, NOT NEW ONES. Two experiences and one
 * opinion, already written and already carrying hints that make a SPECIFIC
 * answer the obvious one. Writing three more would have created a second
 * catalogue to keep honest.
 */
export const OPENING_THREE: readonly string[] = Object.freeze([
  // What it cost, in their own words. The clearest route to an `experience`.
  'expensive_lesson',
  // The one most likely to carry a figure the writer may quote.
  'best_result',
  // ⚖️ THE OPINION LAST, DELIBERATELY. It is the hardest to answer cold and the
  // easiest to skip, so it goes where a skip costs the least.
  'contrarian',
])

export const CREATOR_QUESTIONS: readonly CreatorQuestion[] = [
  {
    id: 'contrarian',
    ask: 'What does almost everyone in your niche believe that you think is wrong?',
    kind: 'opinion',
    hint: 'The thing you would argue about. Name what they believe, then what you believe instead.',
  },
  {
    id: 'expensive_lesson',
    ask: 'What is something you learned the expensive way?',
    kind: 'experience',
    hint: 'What it cost you — money, months, a client — and what you do differently now.',
  },
  {
    id: 'beginner_mistake',
    ask: 'What mistake do you watch beginners make over and over?',
    kind: 'opinion',
    hint: 'The specific move, not the category. What they do, and what it costs them.',
  },
  {
    id: 'own_method',
    ask: 'When you do this well, what are the actual steps?',
    kind: 'framework',
    hint: 'Your order of operations. Two or three steps beats a philosophy.',
  },
  {
    id: 'number_that_matters',
    ask: 'What number do you track that most people in your niche ignore?',
    kind: 'claim',
    hint: 'The figure and what it tells you. A real number from your own work.',
  },
  {
    id: 'best_result',
    ask: 'What is the most specific result you have gotten for yourself or a client?',
    kind: 'experience',
    hint: 'With the number and the timeframe. "£13,500 in about 40 seconds" beats "great results".',
  },
  {
    id: 'refuse_to_do',
    ask: 'What do people expect you to recommend that you refuse to?',
    kind: 'opinion',
    hint: 'And the reason. This is often the most quotable thing a creator has.',
  },
  {
    id: 'changed_mind',
    ask: 'What did you used to believe about your work that you no longer do?',
    kind: 'opinion',
    hint: 'What changed it. A position someone held and abandoned carries more than one they inherited.',
  },
  {
    id: 'first_thing_asked',
    ask: 'When someone comes to you with a problem, what do you ask them first?',
    kind: 'framework',
    hint: 'The question itself, and why it is the one that matters.',
  },
  {
    id: 'costs_more_than_people_think',
    ask: 'What part of your work costs far more time or money than people assume?',
    kind: 'claim',
    hint: 'The real figure, and what people guess instead.',
  },
]

/** A knowledge row built from an answer, in the shape the store already takes. */
export interface AskedKnowledgeRow {
  kind: AskedKind
  text: string
  basis: 'stated'
  source: typeof ASKED_SOURCE
  /** ⚠️ NOT 1, AND THE REASON IS NOT MODESTY. `confidence` records how sure the
   *  SOURCE was, and the creator is as sure as a source gets — but 1 is reserved
   *  in this system for a thing that cannot be wrong, and a person can misreport
   *  their own practice. 0.9 keeps it ranked above every inferred row without
   *  claiming an authority nothing else in the table can reach. */
  confidence: number
  /** ⚖️ A STATED POSITION IS SEEN ONCE, BY DEFINITION. Seeding it higher to make
   *  it rank would corrupt the one field that means "how often they say this",
   *  which the writer reads as what a creator is known for. */
  times_seen: 1
  /** Which question produced it — the provenance a creator can act on. */
  source_ref: string
}

/** Turn an answer into a row, or refuse and say why.
 *
 *  ⚖️ IT RETURNS THE REASON RATHER THAN NULL. The caller has to tell the creator
 *  why their sentence was not kept, and "too long" and "too short" need different
 *  words. A bare null forces the UI to re-derive what this function already knew. */
export function answerToKnowledge(
  question: CreatorQuestion,
  answer: string,
): { ok: true; row: AskedKnowledgeRow } | { ok: false; reason: 'empty' | 'too_short' | 'too_long' } {
  const text = String(answer ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length < ANSWER_MIN) return { ok: false, reason: 'too_short' }
  if (text.length > ANSWER_MAX) return { ok: false, reason: 'too_long' }
  return {
    ok: true,
    row: {
      kind: question.kind,
      text,
      basis: 'stated',
      source: ASKED_SOURCE,
      confidence: 0.9,
      times_seen: 1,
      source_ref: `asked:${question.id}`,
    },
  }
}

/** The next question to put to this creator, or null when there is none.
 *
 *  ⚠️ `alreadyPut` MUST INCLUDE SKIPS. It is the union of answered and declined,
 *  because both are decisions and neither should come back. A caller that only
 *  passes answers will re-ask a skipped question on the very next script, which
 *  is the fastest way to make this feature feel like a nag and get it disabled.
 *
 *  ⚖️ ORDER IS FIXED, NOT RANDOM. The first questions are the ones whose answers
 *  most change a script — a contrarian position and an expensive lesson — so a
 *  creator who answers two and never returns has still given the two that matter.
 *  Randomising would trade that for variety nobody asked for. */
export function nextQuestion(
  alreadyPut: readonly string[],
  bank: readonly CreatorQuestion[] = CREATOR_QUESTIONS,
): CreatorQuestion | null {
  const done = new Set(alreadyPut.map((x) => String(x)))
  return bank.find((q) => !done.has(q.id)) ?? null
}

/** How far through the bank a creator is. Exists so the UI can say "3 of 10"
 *  and so the absence of answers is visible as a number rather than inferred. */
export function askedProgress(alreadyPut: readonly string[], bank: readonly CreatorQuestion[] = CREATOR_QUESTIONS): {
  put: number; of: number; remaining: number
} {
  const ids = new Set(bank.map((q) => q.id))
  // ⚠️ COUNT ONLY IDS THIS BANK STILL HAS. A retired question left in the log
  // would otherwise push the count past the total and read as corruption.
  const put = new Set([...alreadyPut].filter((x) => ids.has(String(x)))).size
  return { put, of: bank.length, remaining: bank.length - put }
}
