// GENERATED FROM packages/shared/src/script/emphasis.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
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
 *
 * ⚠️ A SECOND SHIPPED SCRIPT CARRIED "*not*" INSIDE A SPOKEN LINE. Markdown
 * emphasis syntax is the same mistake in a different costume: a writer's stage
 * direction that leaked into dialogue. A teleprompter shows the literal
 * asterisks or underscores, and a naive strip-and-forget would silently throw
 * the emphasis signal away instead of moving it to the same channel the caps
 * fix already built. Both paths land in `emphasisWords`.
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

/** ⚠️ A LONE MARKER IS NOT A PAIR. "2 * 3" and a stray trailing "_" must never
 *  be treated as emphasis or corrupt the line — only a token that opens with
 *  the marker AND has real content after it is even a candidate, and nothing
 *  is touched unless a matching close is actually found. */
function extractMarkdownRuns(
  tokens: string[],
  words: readonly number[],
  marker: '**' | '*' | '_',
  emphasis: string[],
): number {
  let runs = 0
  let i = 0
  while (i < words.length) {
    const idx = words[i]
    const tok = tokens[idx]
    if (!tok.startsWith(marker)) { i += 1; continue }
    const afterStart = tok.slice(marker.length)
    if (afterStart.length === 0) { i += 1; continue }

    // Same-token pair: *word*, **word**, _word_.
    const sameTokenClose = tok.indexOf(marker, marker.length)
    if (sameTokenClose !== -1) {
      const inner = tok.slice(marker.length, sameTokenClose)
      const trailing = tok.slice(sameTokenClose + marker.length)
      if (inner.length > 0 && !/\s/.test(inner) && !/[A-Za-z0-9]/.test(trailing)) {
        tokens[idx] = inner + trailing
        emphasis.push(inner.replace(/[^A-Za-z0-9']/g, '').toLowerCase())
        runs += 1
        i += 1
        continue
      }
    }

    // Multi-word span: *two words*. Scan forward for a token carrying the
    // closing marker, with only punctuation trailing it.
    let j = i + 1
    let closeIdx = -1
    while (j < words.length && j - i <= 12) {
      const t2 = tokens[words[j]]
      if (t2.indexOf(marker) !== -1) { closeIdx = j; break }
      j += 1
    }
    if (closeIdx === -1) { i += 1; continue }
    const closeTok = tokens[words[closeIdx]]
    const pos = closeTok.indexOf(marker)
    const before = closeTok.slice(0, pos)
    const trailing = closeTok.slice(pos + marker.length)
    if (/[A-Za-z0-9]/.test(trailing)) { i += 1; continue }

    tokens[idx] = afterStart
    tokens[words[closeIdx]] = before + trailing
    const spanTexts = [afterStart]
    for (let k = i + 1; k < closeIdx; k++) spanTexts.push(tokens[words[k]])
    spanTexts.push(before)
    for (const s of spanTexts) {
      if (s.trim() === '') continue
      emphasis.push(s.replace(/[^A-Za-z0-9']/g, '').toLowerCase())
    }
    runs += 1
    i = closeIdx + 1
  }
  return runs
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
 * Move shouting — and markdown emphasis syntax — out of the line and into its
 * own channel.
 *
 * ⚠️ CAPS: RUNS OF TWO OR MORE, NEVER A SINGLE WORD. One capitalised word in an
 * otherwise normal sentence is usually a proper noun, a brand or an acronym the
 * allowlist has not heard of — and lowercasing "WHOOP" or "MrBeast" would put a
 * mistake in the creator's mouth. A run of two or more is unambiguous.
 *
 * ⚖️ MARKDOWN NEEDS NO SUCH THRESHOLD. `*word*`, `_word_` and `**word**` are an
 * explicit, unambiguous pair of delimiters the writer placed on purpose — a
 * single wrapped word is still a real instruction, not a coincidence the way a
 * single capitalised word is. Both paths write into the same `emphasisWords`
 * channel and a beat can carry both kinds in one line.
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

  // ⚠️ MARKDOWN FIRST. A second shipped script carried "*not*" straight into
  // spoken dialogue — the same stage-direction-in-dialogue mistake as caps,
  // just spelled with punctuation. Stripped and moved into the same channel
  // before the caps pass runs, so a line can carry both in one beat.
  for (const marker of ['**', '*', '_'] as const) {
    runs += extractMarkdownRuns(tokens, words, marker, emphasis)
  }

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
