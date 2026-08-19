// ⚠️ DERIVED FILE — DO NOT EDIT. The source of truth is
// `packages/shared/src/speechPolish.ts`, where the thresholds are derived and
// the tests live. Edge functions cannot import `@twinai/shared` under Deno
// deploy, so the copy is kept honest by `scripts/ci/check_speech_polish_parity.mjs`
// rather than by the module system.
//
// ⚖️ THIS FILE HAS NO ALLOWED DIFFERENCE. The shared module imports nothing, so
// the copy is byte-for-byte identical below the marker — any drift at all is a
// failure, and there is no substitution for a reader to reason about.

// WRITTEN TO BE SAID, NOT TO BE READ.
//
// ⚠️ THE SENTENCE A MODEL WRITES BY DEFAULT IS AN ESSAY SENTENCE. "One of the
// most significant mistakes that early-stage founders frequently make when
// evaluating artificial intelligence tools is failing to consider…" is
// grammatical, on-topic, and unspeakable — a creator reading it off a
// teleprompter runs out of breath, loses the thread, and rewrites it. That
// rewrite is the metric this whole track is judged on.
//
// ⚖️ SO THERE ARE TWO PASSES, AND THE SECOND ONE MAY NOT THINK. The content
// writer decides what is said; the speech editor makes it sayable and is
// forbidden from changing what it means. Merging them produces a writer that
// trades a fact away for a nicer rhythm, and nobody notices because the output
// reads beautifully.
//
// ⚠️ THE FORBIDDEN LIST IS THE POINT, NOT THE ALLOWED ONE. A polish pass that
// may add a claim is a second writer with no plan and no validator behind it.

/** What a polish pass is allowed to do. Stated so it can be quoted into the
 *  instruction AND checked afterwards from the same source. */
export const POLISH_MAY = [
  'shorten a sentence',
  'break one sentence into two',
  'remove a repeated setup',
  'improve a transition',
  'fix awkward phrasing',
  'use a contraction',
] as const

/** ⚖️ AND WHAT IT MAY NOT. Every entry here is checkable after the fact, which
 *  is why the list is short and concrete rather than "do not change the
 *  meaning" — a rule nobody can test is a rule nobody enforces. */
export const POLISH_MAY_NOT = [
  'add a claim that was not there',
  'change a product fact',
  'invent an anecdote',
  'change the call to action',
  'change the premise',
] as const

// ── SPEAKABILITY, MEASURED RATHER THAN JUDGED ─────────────────────────────

/** ⚠️ A RANGE, NOT A MAXIMUM. Every sentence at six words is a staccato robot;
 *  the target is a spoken rhythm, and both ends of it matter. */
export const SPOKEN_WORDS_MIN = 6
export const SPOKEN_WORDS_MAX = 16
/** A line long enough that a creator will have to take a breath inside it.
 *
 *  ⚠️ DERIVED FROM THE RANGE, NOT PICKED. Half again the top of the spoken band
 *  (16 → 22): far enough above it that a slightly long line is not an error, and
 *  low enough to catch the shape this file is named after. The essay sentence
 *  that motivated all of this is 25 words, and a limit of 28 would have let it
 *  through — a threshold that misses its own worked example is decoration. */
export const SPOKEN_WORDS_HARD_MAX = 22

export const SPEECH_ISSUES = [
  'sentence_too_long', 'semicolon', 'nested_clause', 'essay_transition',
  'list_inside_sentence',
] as const
export type SpeechIssueCode = (typeof SPEECH_ISSUES)[number]

export interface SpeechIssue {
  code: SpeechIssueCode
  /** The offending sentence, so a fix has something to point at. */
  sentence: string
  /** Plain English — this can reach a screen. */
  explain: string
}

/** ⚖️ THE PHRASES THAT BELONG IN AN ESSAY AND NOT IN A MOUTH. Nobody says
 *  "furthermore" out loud, and a script that does is a script being read. */
const ESSAY_TRANSITIONS = [
  'furthermore', 'moreover', 'additionally', 'in conclusion', 'firstly',
  'secondly', 'thirdly', 'nevertheless', 'consequently', 'thus',
  'it is important to note', 'one of the most significant',
]

const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length

/** Split into spoken sentences. Deliberately simple: a period, a question mark
 *  or an exclamation ends a sentence, because that is what a reader does. */
export function spokenSentences(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * What makes this hard to say out loud.
 *
 * ⚠️ FRAGMENTS ARE NOT AN ERROR AND ARE NOT REPORTED. "Here's the mistake." is
 * exactly what a person says, and a checker that flagged short sentences would
 * push the script back towards the essay voice it exists to remove. Only the
 * long end is a defect.
 */
export function speechIssues(text: string): SpeechIssue[] {
  const out: SpeechIssue[] = []
  for (const s of spokenSentences(text)) {
    const n = words(s)
    if (n > SPOKEN_WORDS_HARD_MAX) {
      out.push({
        code: 'sentence_too_long', sentence: s,
        explain: `This is ${n} words — you would have to breathe in the middle of it.`,
      })
    }
    if (s.includes(';')) {
      out.push({ code: 'semicolon', sentence: s, explain: 'A semicolon is a pause nobody can hear.' })
    }
    // ⚖️ TWO COMMAS BEFORE THE VERB IS THE SHAPE OF A NESTED CLAUSE, and it is
    // the sentence a creator reliably stumbles over on the first take.
    if ((s.match(/,/g) ?? []).length >= 3 && n > SPOKEN_WORDS_MAX) {
      out.push({ code: 'nested_clause', sentence: s, explain: 'Too many clauses to hold in one breath.' })
    }
    const lower = s.toLowerCase()
    const essay = ESSAY_TRANSITIONS.find((t) => lower.includes(t))
    if (essay) {
      out.push({ code: 'essay_transition', sentence: s, explain: `Nobody says “${essay}” out loud.` })
    }
    if ((s.match(/,/g) ?? []).length >= 3 && /\band\b/.test(lower) && n > SPOKEN_WORDS_MAX) {
      out.push({ code: 'list_inside_sentence', sentence: s, explain: 'A list inside a sentence is hard to follow by ear.' })
    }
  }
  return out
}

/** Share of sentences inside the spoken range — the number worth watching over
 *  time, and never shown to a creator as a score. */
export function speakableShare(text: string): number | null {
  const ss = spokenSentences(text)
  if (ss.length === 0) return null
  const ok = ss.filter((s) => {
    const n = words(s)
    return n >= SPOKEN_WORDS_MIN && n <= SPOKEN_WORDS_MAX
  }).length
  return ok / ss.length
}

// ── WHAT THE POLISH PASS CHANGED, CHECKED ─────────────────────────────────

export const POLISH_VIOLATIONS = [
  'cta_changed', 'fact_dropped', 'claim_added', 'length_ballooned',
] as const
export type PolishViolationCode = (typeof POLISH_VIOLATIONS)[number]

export interface PolishViolation {
  code: PolishViolationCode
  detail: string
}

const NUMBERS = /\$?\d[\d,.]*%?/g
const numbersIn = (s: string): string[] => (s.match(NUMBERS) ?? []).map((x) => x.replace(/[,]/g, ''))

/**
 * Did the speech pass keep its promise?
 *
 * ⚠️ CHECKED RATHER THAN TRUSTED, because "make this easier to say" and "make
 * this better" are one word apart in a model's understanding, and the second one
 * rewrites facts. Every rule here is decidable from the two texts plus the plan
 * — no judgement, no second model.
 *
 * ⚖️ NUMBERS ARE THE PROXY FOR FACTS. A price, a count, a percentage: those are
 * what a polish pass drops or rounds, and rounding "$29" to "about thirty
 * dollars" is a changed product fact wearing a friendlier voice.
 */
export function polishViolations(
  before: string,
  after: string,
  opts: { cta?: string | null } = {},
): PolishViolation[] {
  const out: PolishViolation[] = []
  const cta = opts.cta?.trim()
  if (cta && before.includes(cta) && !after.includes(cta)) {
    out.push({ code: 'cta_changed', detail: `The closing ask "${cta}" is no longer in the script.` })
  }

  const had = new Set(numbersIn(before))
  const has = new Set(numbersIn(after))
  for (const n of had) {
    if (!has.has(n)) out.push({ code: 'fact_dropped', detail: `“${n}” was in the script and is not any more.` })
  }
  for (const n of has) {
    if (!had.has(n)) out.push({ code: 'claim_added', detail: `“${n}” appears in the polished version and was never supplied.` })
  }

  // ⚖️ A POLISH THAT GREW THE SCRIPT DID SOMETHING OTHER THAN POLISH. Shorter or
  // about the same is the shape of this pass; materially longer means it wrote.
  const w = (s: string) => words(s)
  if (w(before) > 0 && w(after) > w(before) * 1.15) {
    out.push({
      code: 'length_ballooned',
      detail: `The script grew from ${w(before)} to ${w(after)} words, which is writing rather than polishing.`,
    })
  }
  return out
}
