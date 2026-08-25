/**
 * EMPHASIS IS DIRECTION, NOT WORDS.
 *
 * ⚠️ A REAL SCRIPT SHIPPED "YOU HAVE TIME" INSIDE THE SPOKEN LINE. Capitals are
 * how a writer tells a person to lean on a word, and that is a stage direction
 * wearing the costume of dialogue. Two things go wrong with it: a creator
 * reading a teleprompter sees SHOUTING rather than emphasis, and the caps then
 * travel downstream into burned-in captions, where they are permanent.
 *
 * ⚖️ ONE WRITER, TWO READERS. The words to lean on move into their own field,
 * which the teleprompter bolds and the caption packet consumes — and that second
 * reader is the point: `caption_packet.emphasis` ("which words to emphasize")
 * has never had an upstream source and has been guessed per generation. This
 * gives it one.
 */

/** ⚠️ WORDS THAT ARE LEGITIMATELY CAPITALISED AND ARE NOT SHOUTING. Lowercasing
 *  "SEO" or "DIY" would corrupt the line rather than de-shout it, and "I" is a
 *  capital in every correctly written English sentence. */
const NOT_SHOUTING: ReadonlySet<string> = new Set([
  'I', 'A', 'OK', 'TV', 'AI', 'UK', 'US', 'USA', 'EU', 'CEO', 'CFO', 'CTO',
  'SEO', 'DIY', 'PDF', 'API', 'ROI', 'DM', 'DMS', 'CTA', 'FAQ', 'ID', 'IT',
  'HR', 'PR', 'B2B', 'B2C', 'SAAS', 'UGC', 'ASMR', 'GPT', 'URL', 'CV',
])

/** A word is "shouted" when it is all-caps, at least two letters, and not on the
 *  allowlist. Digits and punctuation ride along with the word they belong to. */
function isShouted(word: string): boolean {
  const bare = word.replace(/[^A-Za-z]/g, '')
  if (bare.length < 2) return false
  if (bare !== bare.toUpperCase()) return false
  if (NOT_SHOUTING.has(bare.toUpperCase())) return false
  return true
}

export interface EmphasisSplit {
  /** The line with shouted runs written normally. */
  line: string
  /** The words to lean on, in the order they appear, lowercased and stripped of
   *  punctuation so a caption renderer can match them. */
  emphasisWords: readonly string[]
  /** How many runs were converted. ⚖️ ZERO IS A REAL ANSWER: the writer wrote a
   *  clean line. It is not the same as "we did not look", which is `null` at the
   *  caller when the split never ran. */
  runs: number
}

/**
 * Move shouting out of the line and into its own channel.
 *
 * ⚠️ RUNS OF TWO OR MORE, NEVER A SINGLE WORD. One capitalised word in an
 * otherwise normal sentence is usually a proper noun, a brand or an acronym the
 * allowlist has not heard of — and lowercasing "WHOOP" or "MrBeast" would put a
 * mistake in the creator's mouth. A run of two or more is unambiguous.
 *
 * ⚖️ AND THE SENTENCE'S OWN CAPITAL IS RESTORED. Lowercasing a run that starts a
 * sentence would leave "you have time." mid-paragraph, which reads as a typo
 * rather than as calm delivery.
 */
export function splitEmphasis(raw: unknown): EmphasisSplit {
  const line = String(raw ?? '')
  if (line.trim() === '') return { line, emphasisWords: Object.freeze([]), runs: 0 }

  const tokens = line.split(/(\s+)/)
  const words: number[] = []
  tokens.forEach((t, i) => { if (i % 2 === 0 && t !== '') words.push(i) })

  const emphasis: string[] = []
  let runs = 0
  let i = 0
  while (i < words.length) {
    if (!isShouted(tokens[words[i]])) { i += 1; continue }
    let j = i
    while (j + 1 < words.length && isShouted(tokens[words[j + 1]])) j += 1
    if (j > i) {
      runs += 1
      for (let k = i; k <= j; k++) {
        const idx = words[k]
        const w = tokens[idx]
        emphasis.push(w.replace(/[^A-Za-z0-9']/g, '').toLowerCase())
        tokens[idx] = w.toLowerCase()
      }
    }
    i = j + 1
  }

  let out = tokens.join('')
  if (runs > 0) {
    // ⚖️ RESTORE THE SENTENCE CAPITAL. A run that began a sentence must not
    // leave the sentence starting in lower case.
    out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p, c) => p + c.toUpperCase())
  }
  return { line: out, emphasisWords: Object.freeze(emphasis), runs }
}
