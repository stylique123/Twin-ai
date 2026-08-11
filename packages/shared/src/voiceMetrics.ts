// "ENERGETIC AND CONVERSATIONAL" DESCRIBES NOBODY.
//
// ⚠️ THE DEFECT, MEASURED. Across 50 real titles, Kallaway opens with a question
// ZERO times. Jeremy does it 38 times in 96. Handed the same adjectives, the
// writer gave Kallaway four question-openers out of four — and his persona
// review called it the thing that most made the scripts not his.
//
// An adjective cannot be checked, cannot be violated, and cannot be missed. A
// RATE can: "0 of 50" is a fact the prompt can carry and a reviewer can test.
//
// ⚖️ WHAT THESE MEASURE, AND WHAT THEY DO NOT. Titles are PACKAGING, not speech.
// A creator who never opens a title with a question may still open the video
// with one. So these describe how they package, and the honest place to apply
// them is the HOOK — the line that does the same job a title does. Applying
// them to body prose would be inference dressed as measurement, and the file
// says so rather than letting a later reader assume otherwise.
//
// Every metric is a count over a stated denominator, so a creator with 12 titles
// and one with 200 are never silently compared.

export interface VoiceMetrics {
  /** How many titles the metrics were computed from. Small n is reported, not hidden. */
  sampled: number
  /** Titles that open as a question, or contain one. */
  questionOpenRate: number
  /** Median words per title — the packaging length they habitually use. */
  medianWords: number
  /** Titles carrying a digit or a spelled small number. */
  numberRate: number
  /** Titles making a first-person claim ("I bought", "my"). */
  firstPersonRate: number
  /** Titles addressing the viewer directly ("you", "your"). */
  secondPersonRate: number
  /** Titles with a SHOUTED word — three or more capitals in a row. */
  shoutRate: number
  /** Titles carrying at least one emoji. */
  emojiRate: number
  /** Titles opening with an imperative ("Stop", "Meet", "Try"). */
  imperativeOpenRate: number
  /** The most common first word, when one is genuinely dominant. */
  topOpener: string | null
}

const QUESTION = /\?|^(?:is|are|can|does|do|should|would|why|how|what|who|when|which)\b/i
const NUMBER = /\b\d+\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/i
const FIRST_PERSON = /\b(?:i|i'm|i've|my|mine|me)\b/i
const SECOND_PERSON = /\b(?:you|your|you're)\b/i
const SHOUT = /\b[A-Z]{3,}\b/
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
const IMPERATIVE = /^(?:stop|start|try|meet|watch|look|check|buy|get|don'?t|never|always|forget)\b/i

const rate = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0)

function median(ns: number[]): number {
  if (!ns.length) return 0
  const s = [...ns].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** ⚖️ MEASURED, NEVER INFERRED. Anything not derivable from the text is absent
 *  from the result rather than estimated — the same rule the evidence ladder
 *  applies one layer up. */
export function voiceMetrics(titles: readonly string[]): VoiceMetrics {
  const t = titles.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0)
  const n = t.length
  // ⚠️ ARTICLES ARE GRAMMAR, NOT STYLE. "the" led 3 of 10 real titles and was
  // reported as a signature opener — it is a property of English, and telling a
  // writer to "open with the" is noise presented as a measurement. Demonstratives
  // ("this", "these") ARE kept: leading with one is a recognisable declarative
  // habit, which is exactly what this is for.
  const ARTICLES = new Set(['the', 'a', 'an'])
  const firstWords = t
    .map((x) => (x.match(/^[A-Za-z']+/)?.[0] ?? '').toLowerCase())
    .filter((w) => w && !ARTICLES.has(w))
  const counts = new Map<string, number>()
  for (const w of firstWords) counts.set(w, (counts.get(w) ?? 0) + 1)
  let topOpener: string | null = null
  let best = 0
  for (const [w, c] of counts) if (c > best) { best = c; topOpener = w }
  // A "top opener" that appears twice in fifty titles is noise, not a habit.
  if (n === 0 || best < Math.max(3, n * 0.1)) topOpener = null

  return {
    sampled: n,
    questionOpenRate: rate(t.filter((x) => QUESTION.test(x)).length, n),
    medianWords: median(t.map((x) => x.split(/\s+/).length)),
    numberRate: rate(t.filter((x) => NUMBER.test(x)).length, n),
    firstPersonRate: rate(t.filter((x) => FIRST_PERSON.test(x)).length, n),
    secondPersonRate: rate(t.filter((x) => SECOND_PERSON.test(x)).length, n),
    shoutRate: rate(t.filter((x) => SHOUT.test(x)).length, n),
    emojiRate: rate(t.filter((x) => EMOJI.test(x)).length, n),
    imperativeOpenRate: rate(t.filter((x) => IMPERATIVE.test(x)).length, n),
    topOpener,
  }
}

/** A rate is only worth instructing on when it is decisive. 38% is a tendency;
 *  0% and 96% are rules, and only rules belong in a prompt as rules. */
const NEVER = 8
const ALWAYS = 70

/**
 * The metrics as prompt text — HOOKS ONLY, and it says so.
 *
 * ⚖️ EMITS NOTHING when the sample is too small to mean anything. Twelve titles
 * cannot establish that someone "never" does a thing, and a fabricated habit is
 * the same class of error as a fabricated opinion.
 */
export function voiceMetricsPromptLine(m: VoiceMetrics, minSample = 20): string {
  if (m.sampled < minSample) return ''
  const rules: string[] = []
  const say = (cond: boolean, text: string) => { if (cond) rules.push(`  * ${text}`) }

  say(m.questionOpenRate <= NEVER,
    `They almost NEVER package a video as a question (${m.questionOpenRate}% of ${m.sampled}). Do not write a question hook.`)
  say(m.questionOpenRate >= ALWAYS,
    `They usually package as a question (${m.questionOpenRate}% of ${m.sampled}). A question hook fits them.`)
  say(m.imperativeOpenRate >= 25,
    `They frequently open with a command — "Stop…", "Meet…" (${m.imperativeOpenRate}%).`)
  say(m.numberRate >= 40, `They lean on numbers (${m.numberRate}% carry one).`)
  say(m.numberRate <= NEVER, `They rarely use numbers in packaging (${m.numberRate}%). Do not force a count.`)
  say(m.firstPersonRate >= 40, `They front themselves — "I bought", "my" (${m.firstPersonRate}%).`)
  say(m.firstPersonRate <= NEVER, `They keep themselves OUT of the packaging (${m.firstPersonRate}%). Lead with the subject, not with "I".`)
  say(m.secondPersonRate >= 40, `They speak straight to the viewer — "you", "your" (${m.secondPersonRate}%).`)
  say(m.shoutRate >= 30, `They SHOUT a word for emphasis (${m.shoutRate}%).`)
  say(m.emojiRate >= 30, `They use an emoji (${m.emojiRate}%).`)
  if (m.topOpener) rules.push(`  * Their most common opening word is "${m.topOpener}".`)
  rules.push(`  * Their median packaging length is ${m.medianWords} words — match that, not a paragraph.`)

  return '\nHOW THIS CREATOR PACKAGES A VIDEO — measured from their own titles, not adjectives.'
    + ' These describe the HOOK and the title, which do the same job.'
    // ⚖️ One line, so the parity test can see it — see the note in the edge copy.
    + ' They are NOT rules about body prose. Break one only if the reference mechanism requires it.\n'
    + rules.join('\n')
}
