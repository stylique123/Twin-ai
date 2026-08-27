// LABELS DESCRIBE A CREATOR. RULES TELL A WRITER WHAT TO DO.
//
// ⚠️ THE PROMPT'S STRONGEST CLAIM IS ABOUT A FIELD NOBODY FILLS. `creatorDna`
// carries "HOW THEY ACTUALLY WRITE (verbatim samples — match this EXACT cadence,
// diction, sentence length and rhythm; weight this above every other signal)".
// It reads `voice_samples`, which a creator types into Settings by hand.
// Production: 0 of 38 profiles, 0 of 37 voices. Every other DNA line is a label —
// `tone: direct`, `pacing: fast` — and two creators who share all three labels
// write nothing alike.
//
// ⚖️ SO THIS COMPILES BEHAVIOUR OUT OF SPEECH INSTEAD OF ADJECTIVES OUT OF
// SPEECH. "Median sentence 9 words; 62% of sentences address the viewer as you;
// opens on a claim, not a question" is something a writer can execute. "Direct"
// is something a writer can agree with.
//
// ⚠️ AND IT WILL NOT READ A REFERENCE VIDEO, WHICH IS WHY 0135 EXISTS. Of 58
// production transcripts, 50 are other people's videos pasted as inspiration.
// Compiling those would put a stranger's cadence behind a label instructing the
// model to weight it above everything else — reference leak promoted to identity.
// The caller passes own-speech only, and `compileStyle` refuses an empty corpus
// rather than describing one.
//
// ⚖️ EVERY MEASURE HERE IS DECIDABLE FROM THE TEXT. Nothing asks a model whether
// the creator "sounds warm". The interesting-but-undecidable properties are named
// in `NOT_MEASURED` so a reader discovers the absence rather than trusting a
// number nobody computed — the same discipline `editClassification` uses.

/** What can be said about a creator's writing from their own words alone. */
export interface StyleProfile {
  /** Sentences measured. Below `MIN_SENTENCES` nothing here is reportable. */
  sentences: number
  /** Words per sentence, median — resistant to one runaway ASR run-on. */
  medianSentenceWords: number
  /** The share of sentences that are short enough to land as a beat. */
  shortSentenceShare: number
  /** Share of sentences containing you/your/you're — direct address. */
  secondPersonShare: number
  /** Share of sentences that are questions. */
  questionShare: number
  /** Share using I/I'm/my/we — first-hand framing. */
  firstPersonShare: number
  /** Contractions per sentence. Formality, measured rather than judged. */
  contractionRate: number
  /** How the first sentence of each sample begins. */
  opener: 'claim' | 'question' | 'address' | 'mixed' | 'unknown'
  /** ⚠️ FALSE UNTIL THE CORPUS CARRIES IT. A caller that renders an
   *  unreportable profile is asserting a voice from three sentences. */
  reportable: boolean
}

/** ⚠️ NAMED SO THE ABSENCE IS VISIBLE. A reader who wants "is this creator warm"
 *  should learn here that nothing computes it, rather than infer it from a
 *  number that measured something else. */
export const NOT_MEASURED = [
  'warmth',
  'humour',
  'authority',
  'how_salesy',
  'emotional_register',
  'whether_the_writing_is_good',
] as const

/** Below this, the numbers are about one video's editing, not a person's voice. */
export const MIN_SENTENCES = 40

/** ⚠️ VOICE CAUSE 1(c) — THE GAP BETWEEN "NOTHING" AND "CONFIDENT". Below
 *  `MIN_SENTENCES` the full card is silent, correctly, but a creator sitting
 *  at 20-30 sentences is not the same as one at zero: some of these numbers
 *  are already meaningful. Between this floor and `MIN_SENTENCES`, a smaller
 *  card renders — fewer metrics, each labeled with the sentence count it was
 *  measured from, so nobody reads it as the full profile. */
export const PARTIAL_MIN_SENTENCES = 15

/** A sentence a viewer can absorb in one breath. Not a target — a measurement
 *  boundary, chosen because short-form beats that run past it tend to be read
 *  rather than spoken. */
export const SHORT_SENTENCE_WORDS = 12

const CONTRACTION = /\b\w+['’](?:s|t|re|ve|ll|d|m)\b/gi
const SECOND_PERSON = /\b(you|your|you['’]re|yours|yourself)\b/i
const FIRST_PERSON = /\b(i|i['’]m|i['’]ve|my|me|we|our)\b/i

/** Split spoken text into sentences.
 *
 *  ⚖️ NEWLINES COUNT AS BOUNDARIES BECAUSE THIS IS CAPTION TEXT. Production
 *  transcripts are hard-wrapped mid-sentence by the caption renderer, so a naive
 *  split on punctuation alone measures the caption width rather than the speech —
 *  which is why the wrap is stripped first and only punctuation ends a sentence. */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s*\n+\s*/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => /\w/.test(s))
}

const words = (s: string) => s.split(/\s+/).filter((w) => /\w/.test(w))

function median(ns: number[]): number {
  if (!ns.length) return 0
  const a = [...ns].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

function openerOf(first: string): 'claim' | 'question' | 'address' {
  if (/\?\s*$/.test(first)) return 'question'
  if (SECOND_PERSON.test(first.split(/\s+/).slice(0, 4).join(' '))) return 'address'
  return 'claim'
}

/**
 * Compile a style profile from the creator's OWN transcripts.
 *
 * ⚠️ THE CALLER IS RESPONSIBLE FOR PROVENANCE and this function cannot check it.
 * Pass `transcripts.subject = 'own'` rows only. Passing reference text produces a
 * confident, precise, entirely wrong profile — the failure 0135 exists to prevent.
 */
export function compileStyle(samples: readonly string[]): StyleProfile {
  const empty: StyleProfile = {
    sentences: 0, medianSentenceWords: 0, shortSentenceShare: 0,
    secondPersonShare: 0, questionShare: 0, firstPersonShare: 0,
    contractionRate: 0, opener: 'unknown', reportable: false,
  }
  const texts = samples.map((s) => String(s ?? '').trim()).filter(Boolean)
  if (!texts.length) return empty

  const all: string[] = []
  const openers: Array<'claim' | 'question' | 'address'> = []
  for (const t of texts) {
    const ss = sentencesOf(t)
    if (!ss.length) continue
    all.push(...ss)
    openers.push(openerOf(ss[0]))
  }
  if (!all.length) return empty

  const lens = all.map((s) => words(s).length)
  const share = (n: number) => Math.round((n / all.length) * 100) / 100
  const distinct = new Set(openers)

  return {
    sentences: all.length,
    medianSentenceWords: median(lens),
    shortSentenceShare: share(lens.filter((n) => n <= SHORT_SENTENCE_WORDS).length),
    secondPersonShare: share(all.filter((s) => SECOND_PERSON.test(s)).length),
    questionShare: share(all.filter((s) => /\?\s*$/.test(s)).length),
    firstPersonShare: share(all.filter((s) => FIRST_PERSON.test(s)).length),
    contractionRate: Math.round((all.join(' ').match(CONTRACTION)?.length ?? 0) / all.length * 100) / 100,
    // ⚖️ ONE OPENER MOVE IS A HABIT; THREE IS A RANGE. Reporting the most common
    // of three as "their opener" would invent a rule from a tie.
    opener: distinct.size === 1 ? openers[0] : 'mixed',
    reportable: all.length >= MIN_SENTENCES,
  }
}

/**
 * Render the profile as writing instructions, or nothing at all.
 *
 * ⚠️ RETURNS THE EMPTY STRING WHEN THE CORPUS CANNOT CARRY IT, and that is the
 * point. The alternative — emitting "median sentence: 0 words" or a hedged
 * paragraph — is this system telling the writer something about a creator it has
 * never heard speak. An absent block leaves the existing DNA labels doing exactly
 * what they do today, which is the honest fallback.
 */
export function renderStyleRules(style: StyleProfile): string {
  if (!style.reportable) return ''
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const lines = [
    `- Sentence length: median ${style.medianSentenceWords} words; ${pct(style.shortSentenceShare)} of their sentences run ${SHORT_SENTENCE_WORDS} words or fewer. Match this distribution, do not average it.`,
    `- Direct address: ${pct(style.secondPersonShare)} of their sentences speak to the viewer as "you".`,
    `- Questions: ${pct(style.questionShare)} of their sentences are questions.`,
    `- First person: ${pct(style.firstPersonShare)} carry I/we — their own experience.`,
    `- Contractions: ${style.contractionRate} per sentence.`,
  ]
  if (style.opener !== 'mixed' && style.opener !== 'unknown') {
    lines.push(`- They open on a ${style.opener}, every time in the samples measured.`)
  }
  return `HOW THEY ACTUALLY WRITE — MEASURED FROM ${style.sentences} SENTENCES OF THEIR OWN RECORDED SPEECH.
These are observations of this creator, not style advice. Write to them.
${lines.join('\n')}`
}

/**
 * Render a SMALLER card for a corpus too thin for `renderStyleRules` but not
 * empty. ⚠️ VOICE CAUSE 1(c).
 *
 * ⚖️ ONLY THE PER-SENTENCE METRICS, NEVER `opener`. Every number here pools
 * across ALL sentences in the corpus, so 20 sentences already gives each one
 * a real (if noisy) sample. `opener` is different: it is one data point per
 * SAMPLE TEXT, not per sentence — a creator with two or three short samples
 * has two or three opener observations regardless of total sentence count,
 * which is far too few to call a habit. The full card's own tie-break
 * ("one opener move is a habit; three is a range") already distrusts three
 * observations; this card never reaches for fewer.
 *
 * ⚠️ THE COUNT IS THE FIRST THING SAID, NOT A FOOTNOTE. A partial card that
 * reads like the confident one would undo the whole reason `renderStyleRules`
 * refuses below its own floor.
 */
export function renderPartialStyleRules(style: StyleProfile): string {
  if (style.sentences < PARTIAL_MIN_SENTENCES || style.reportable) return ''
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const lines = [
    `- Sentence length: median ${style.medianSentenceWords} words; ${pct(style.shortSentenceShare)} run ${SHORT_SENTENCE_WORDS} words or fewer.`,
    `- Direct address: ${pct(style.secondPersonShare)} of their sentences speak to the viewer as "you".`,
    `- Questions: ${pct(style.questionShare)} of their sentences are questions.`,
    `- First person: ${pct(style.firstPersonShare)} carry I/we — their own experience.`,
    `- Contractions: ${style.contractionRate} per sentence.`,
  ]
  return `AN EARLY READ ON HOW THEY WRITE — MEASURED FROM ONLY ${style.sentences} SENTENCES, BELOW THE ${MIN_SENTENCES}-SENTENCE FLOOR FOR A FULL PROFILE. Weight this less than a confident measurement, but more than a guess:
${lines.join('\n')}`
}
