/**
 * SIGNATURE VOCABULARY, MEASURED — NOT ASSERTED.
 *
 * ⚠️ VOICE CAUSE 3. Every prompt instruction that says "use their signature
 * vocabulary" (generate-blueprint, dna.ts) hands the model an adjective, not a
 * fact — nothing anywhere counts which phrases a creator actually repeats.
 * The DNA scan is told to "capture... signature vocabulary" in prose, and the
 * writer is told to "reuse" it; both trust the model's own guess of what that
 * phrase is, with nothing to check it against.
 *
 * ⚖️ SO THIS COUNTS. A 2–4 word phrase that shows up in at least three
 * DIFFERENT videos is not a coincidence of word choice — it is something this
 * creator actually says more than once. Requiring distinct videos (not just
 * occurrences) is what stops one long transcript with a repeated phrase from
 * qualifying alone.
 */

const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'in', 'on', 'at', 'to',
  'for', 'with', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'it',
  'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we',
  'they', 'my', 'your', 'his', 'her', 'our', 'their', 'as', 'so', 'not',
  'do', 'does', 'did', 'have', 'has', 'had', 'just', 'from', 'by', 'up',
  'out', 'about', 'into', 'over', 'then', 'than', 'when', 'what', 'which',
  'who', 'how', 'why', 'here', 'there', 'all', 'can', 'will', 'would',
  'could', 'should', 'im', 'its', 'get', 'got', 'like',
])

const MAX_PHRASES = 10
const MIN_VIDEOS = 3
const NGRAM_SIZES = [2, 3, 4] as const

export interface SignaturePhrase {
  phrase: string
  /** Number of distinct videos this phrase was found in — never a raw count. */
  videos: number
}

function tokenize(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[^a-z0-9']+/)
    .filter(Boolean)
}

/** A phrase whose FIRST or LAST word is a stopword is a fragment of a bigger
 *  sentence ("of the", "in a"), not a phrase this creator reaches for — only
 *  the boundary words are checked, so a stopword in the middle ("out of gas")
 *  is fine. */
function isBoundaryClean(words: string[]): boolean {
  return !STOPWORDS.has(words[0]) && !STOPWORDS.has(words[words.length - 1])
}

/** Phrases this creator repeats across their own videos, measured rather than
 *  guessed. Each `video.id` should be distinct per source video/transcript —
 *  the whole discipline of this function is that occurrence count within one
 *  video never substitutes for spread across videos. */
export function extractSignaturePhrases(
  videos: readonly { id: string; text: string }[],
): SignaturePhrase[] {
  const byVideoId = new Map<string, Set<string>>()
  for (const v of videos ?? []) {
    const id = String(v?.id ?? '')
    const words = tokenize(v?.text ?? '')
    if (!id || !words.length) continue
    if (!byVideoId.has(id)) byVideoId.set(id, new Set())
    const seenInThisVideo = byVideoId.get(id)!
    for (const n of NGRAM_SIZES) {
      for (let i = 0; i + n <= words.length; i++) {
        const slice = words.slice(i, i + n)
        if (!isBoundaryClean(slice)) continue
        seenInThisVideo.add(slice.join(' '))
      }
    }
  }

  const phraseVideoCount = new Map<string, number>()
  for (const phrases of byVideoId.values()) {
    for (const phrase of phrases) {
      phraseVideoCount.set(phrase, (phraseVideoCount.get(phrase) ?? 0) + 1)
    }
  }

  const qualifying = [...phraseVideoCount.entries()]
    .filter(([, videoCount]) => videoCount >= MIN_VIDEOS)
    // ⚖️ MOST-REPEATED FIRST, LONGER PHRASES BREAK A TIE — a 4-word repeated
    // phrase is stronger evidence of a real verbal habit than a 2-word one at
    // the same video count. Alphabetical last, purely for determinism.
    .sort(([a, ac], [b, bc]) => bc - ac || b.split(' ').length - a.split(' ').length || a.localeCompare(b))
    .slice(0, MAX_PHRASES)

  return qualifying.map(([phrase, videos]) => ({ phrase, videos }))
}

/** What the writer prompt reads — plain, and only when there is something
 *  real to say. ⚠️ NO SCORE, NO PERCENTAGE — matches every other measured
 *  card in this module family (twinStrength, styleCompiler). */
export function renderSignaturePhrases(phrases: readonly SignaturePhrase[]): string {
  if (!phrases.length) return ''
  const list = phrases.map((p) => `"${p.phrase}" (in ${p.videos} of their videos)`).join(', ')
  return `Phrases they actually repeat across their own videos, measured, not guessed: ${list}.`
}
