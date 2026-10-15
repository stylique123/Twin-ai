// GENERATED FROM packages/shared/src/script/voice/voiceCard.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE VOICE CARD (owner rule: scripts must sound like the creator; the
// generic AI voice is a bug).
//
// ⚖️ BUILT FROM HER OWN MATERIAL ONLY. Every number on the card is counted off
// passages she wrote or said. Nothing is inferred from her niche, her tone
// label or a model's opinion, so every line of the card can be verified by
// re-counting her material.
//
// ⚖️ A SIGNATURE MUST APPEAR AT LEAST TWICE. One use is an accident; two is a
// habit. A word or phrase seen once is never put on the card.
//
// ⚖️ "NEVER USES" IS A CHECKED ABSENCE. The candidates are the stock phrases
// of the generic AI voice; one is put on the card only when it appears nowhere
// in her material, so the card never forbids her own words.
//
// ⚖️ PURE AND DETERMINISTIC. No I/O, no clock, no randomness: the same
// material gives the same card (and the same id), and the same script gives
// the same score. Self-contained so the edge mirror needs no import rewrite.

export type Formality = 'casual' | 'neutral' | 'formal'
export type Person = 'i' | 'we' | 'you'

export interface VoiceCard {
  /** Stable id: a hash of the normalised material. */
  id: string
  /** How many passages and sentences the card was counted from. */
  passages: number
  sentences: number
  /** Words per sentence in her material. */
  sentence_length: { mean: number; median: number }
  /** Words and phrases she uses at least twice, most frequent first. */
  signatures: Array<{ text: string; count: number }>
  formality: { label: Formality; contractions_per_100_words: number; slang_per_100_words: number }
  /** Share of her sentences ending in ? and !. */
  question_rate: number
  exclamation_rate: number
  /** Share of person pronouns (I/we/you) and the dominant one. */
  person: { i: number; we: number; you: number; dominant: Person | null }
  /** Generic-AI phrases verified absent from her material. */
  never_uses: string[]
}

/** Stock phrases of the generic AI voice. A candidate, never a verdict:
 *  each goes on a card only if it is absent from her material. */
export const GENERIC_AI_PHRASES: readonly string[] = [
  'game-changer', 'game changer', 'unlock', 'elevate', 'delve', 'dive in', "let's dive", 'seamless',
  'journey', "in today's", 'fast-paced', 'level up', 'whether you\'re', 'look no further', 'take it to the next level',
  'transform', 'revolutionize', 'empower', 'supercharge', 'harness', 'unleash', 'embark', 'tapestry',
  'navigate', 'landscape', 'leverage', 'boost', 'ultimate', 'must-have', 'secret sauce',
  'say goodbye to', 'imagine a world', 'buckle up', "here's why", 'the best part?', 'stay tuned',
]

const STOP = new Set(('a an the and or but so if of to in on at for with by from as is are was were be been am it its it\'s '
  + 'this that these those i me my we our us you your he she they them their his her him not no do does did have has had '
  + 'just very then than there here what when where who how which can will would could should about up down out over into '
  + 'too also all any some one more most much many i\'m i\'ve i\'ll you\'re you\'ve we\'re we\'ll don\'t can\'t won\'t '
  + 'is isn\'t that\'s there\'s what\'s get got go goes like well now').split(/\s+/))

const SLANG = /\b(?:gonna|wanna|gotta|kinda|sorta|legit|y'?all|lol|omg|nah|yeah|yep|super|totally|literally|vibes?|dude|guys)\b/gi
const CONTRACTION = /\b\w+'(?:s|re|ve|ll|d|m|t)\b|\bcan't\b|\bwon't\b/gi

const norm = (t: string) => String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')

/** Sentences in a passage (a trailing fragment counts). */
export function splitSentences(text: string): string[] {
  return (norm(text).match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter((s) => /[A-Za-z]/.test(s))
}

const words = (s: string) => (norm(s).toLowerCase().match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) ?? [])

const round = (n: number, p = 3) => Math.round(n * 10 ** p) / 10 ** p

function hash(text: string): string {
  // FNV-1a, 32-bit. Enough to tell two materials apart; not a security hash.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

const hasPhrase = (haystack: string, phrase: string) => {
  const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?![a-z0-9])`).test(haystack)
}

function personCounts(ws: string[]): { i: number; we: number; you: number } {
  let i = 0; let we = 0; let you = 0
  for (const w of ws) {
    if (/^(?:i|me|my|mine|i'm|i've|i'll|i'd)$/.test(w)) i++
    else if (/^(?:we|us|our|ours|we're|we've|we'll|we'd)$/.test(w)) we++
    else if (/^(?:you|your|yours|you're|you've|you'll|you'd)$/.test(w)) you++
  }
  return { i, we, you }
}

function formalityOf(contractions: number, slang: number): Formality {
  const informal = contractions + 2 * slang
  if (informal < 2) return 'formal'
  if (informal >= 6) return 'casual'
  return 'neutral'
}

interface Stats {
  sentences: number
  mean: number
  median: number
  question_rate: number
  exclamation_rate: number
  contractions_per_100_words: number
  slang_per_100_words: number
  person: { i: number; we: number; you: number }
}

function stats(texts: readonly string[]): Stats {
  const sents = texts.flatMap(splitSentences)
  const n = sents.length
  const lens = sents.map((s) => words(s).length).sort((a, b) => a - b)
  const all = texts.map(norm).join(' ')
  const ws = words(all)
  const pc = personCounts(ws)
  const total = pc.i + pc.we + pc.you
  return {
    sentences: n,
    mean: n ? round(lens.reduce((a, b) => a + b, 0) / n, 2) : 0,
    median: n ? (n % 2 ? lens[(n - 1) / 2] : (lens[n / 2 - 1] + lens[n / 2]) / 2) : 0,
    question_rate: n ? round(sents.filter((s) => s.endsWith('?')).length / n) : 0,
    exclamation_rate: n ? round(sents.filter((s) => s.endsWith('!')).length / n) : 0,
    contractions_per_100_words: ws.length ? round((all.match(CONTRACTION) ?? []).length * 100 / ws.length, 2) : 0,
    slang_per_100_words: ws.length ? round((all.match(SLANG) ?? []).length * 100 / ws.length, 2) : 0,
    person: total ? { i: round(pc.i / total), we: round(pc.we / total), you: round(pc.you / total) } : { i: 0, we: 0, you: 0 },
  }
}

/** Words (non-stopword) and 2-3 word phrases she uses at least twice. A
 *  phrase that only repeats inside a longer listed phrase is dropped. */
function signaturesOf(texts: readonly string[], max = 12): Array<{ text: string; count: number }> {
  const counts = new Map<string, number>()
  for (const s of texts.flatMap(splitSentences)) {
    const ws = words(s)
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= ws.length; i++) {
        const g = ws.slice(i, i + n)
        if (n === 1 && (STOP.has(g[0]) || g[0].length < 4 || /^\d+$/.test(g[0]))) continue
        // Two function words ("of the") are grammar; three ("you've got this") can be a catchphrase.
        if (n === 2 && STOP.has(g[0]) && STOP.has(g[1])) continue
        if (n === 3 && STOP.has(g[0]) && STOP.has(g[2]) && !g.every((w) => STOP.has(w))) continue
        const k = g.join(' ')
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
  }
  const rep = [...counts.entries()].filter(([, c]) => c >= 2)
    .sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const kept: Array<{ text: string; count: number }> = []
  for (const [text, count] of rep) {
    // Subsumed: every use of it sits inside a longer kept phrase.
    if (kept.some((k) => k.count >= count && ` ${k.text} `.includes(` ${text} `))) continue
    kept.push({ text, count })
  }
  return kept.sort((a, b) => b.count - a.count || b.text.split(' ').length - a.text.split(' ').length || (a.text < b.text ? -1 : 1)).slice(0, max)
}

/** Her own passages from a stored profile: `samples` (strings). Anything else
 *  — tone labels, summaries — is description, not her words, and is ignored. */
export function voiceMaterial(profile: unknown): string[] {
  const s = (profile as { samples?: unknown } | null)?.samples
  return (Array.isArray(s) ? s : []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
}

/** Fewer passages than this and there is no card: a style read off one or two
 *  lines would be a guess. */
export const MIN_PASSAGES = 3

/** The card, or null when there is too little of her own material. */
export function buildVoiceCard(material: readonly string[]): VoiceCard | null {
  const texts = material.map((t) => norm(t).trim()).filter(Boolean)
  if (texts.length < MIN_PASSAGES) return null
  const st = stats(texts)
  if (st.sentences === 0) return null
  const hay = texts.join(' \n ').toLowerCase()
  const p = st.person
  const top = (['i', 'we', 'you'] as const).slice().sort((a, b) => p[b] - p[a])[0]
  return {
    id: `vc_${hash(texts.join('\u0000').toLowerCase())}`,
    passages: texts.length,
    sentences: st.sentences,
    sentence_length: { mean: st.mean, median: st.median },
    signatures: signaturesOf(texts),
    formality: { label: formalityOf(st.contractions_per_100_words, st.slang_per_100_words), contractions_per_100_words: st.contractions_per_100_words, slang_per_100_words: st.slang_per_100_words },
    question_rate: st.question_rate,
    exclamation_rate: st.exclamation_rate,
    person: { ...p, dominant: p[top] > 0 ? top : null },
    never_uses: GENERIC_AI_PHRASES.filter((ph) => !hasPhrase(hay, ph)),
  }
}

/** Generic-AI phrases (from her `never_uses`) found in a script, by line. */
export function voiceCardMisses(card: VoiceCard, lines: readonly string[]): Array<{ index: number; phrases: string[] }> {
  const out: Array<{ index: number; phrases: string[] }> = []
  lines.forEach((l, index) => {
    const t = norm(l).toLowerCase()
    const phrases = card.never_uses.filter((ph) => hasPhrase(t, ph))
    if (phrases.length) out.push({ index, phrases })
  })
  return out
}

export interface VoiceMatch {
  /** 0-100, higher sounds more like her. */
  score: number
  parts: { length: number; punctuation: number; person: number; formality: number; signatures: number; never_uses: number }
  never_used_hits: number
  signatures_used: number
}

const closeness = (a: number, b: number, scale: number) => Math.max(0, 1 - Math.abs(a - b) / scale)

/** How well a script matches her card. Deterministic; the weights are fixed. */
export function scoreVoiceMatch(card: VoiceCard, lines: readonly string[]): VoiceMatch {
  const texts = lines.map((l) => String(l ?? '')).filter((l) => l.trim())
  const st = stats(texts)
  const lenTol = Math.max(4, card.sentence_length.mean * 0.6)
  const length = st.sentences ? closeness(st.mean, card.sentence_length.mean, lenTol) : 0
  const punctuation = (closeness(st.question_rate, card.question_rate, 0.5) + closeness(st.exclamation_rate, card.exclamation_rate, 0.5)) / 2
  const cp = card.person
  const person = (cp.i + cp.we + cp.you) === 0 ? 1
    : 1 - (Math.abs(st.person.i - cp.i) + Math.abs(st.person.we - cp.we) + Math.abs(st.person.you - cp.you)) / 2
  const fScore = (c: number, s: number) => Math.min(15, c + 2 * s)
  const formality = closeness(fScore(st.contractions_per_100_words, st.slang_per_100_words), fScore(card.formality.contractions_per_100_words, card.formality.slang_per_100_words), 8)
  const hay = texts.join(' \n ').toLowerCase()
  const used = card.signatures.filter((s) => hasPhrase(hay, s.text)).length
  const signatures = card.signatures.length ? Math.min(1, used / Math.min(3, card.signatures.length)) : 1
  const hits = voiceCardMisses(card, texts).reduce((a, m) => a + m.phrases.length, 0)
  const neverUses = Math.max(0, 1 - hits / 2)
  const W = { length: 20, punctuation: 15, person: 15, formality: 15, signatures: 15, never_uses: 20 }
  const score = Math.round(
    W.length * length + W.punctuation * punctuation + W.person * person
    + W.formality * formality + W.signatures * signatures + W.never_uses * neverUses,
  )
  return {
    score: texts.length ? score : 0,
    parts: { length: round(length), punctuation: round(punctuation), person: round(person), formality: round(formality), signatures: round(signatures), never_uses: round(neverUses) },
    never_used_hits: hits,
    signatures_used: used,
  }
}

/** The card as writer-brief text. States counts, not adjectives. */
export function voiceCardBrief(card: VoiceCard): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const sig = card.signatures.slice(0, 8).map((s) => `"${s.text}"`).join(', ')
  const lines = [
    `HER VOICE CARD (${card.id}, counted from ${card.passages} passages in her own words; match it, do not imitate a generic presenter)`,
    `- Sentence length: about ${Math.round(card.sentence_length.mean)} words (median ${card.sentence_length.median}). Keep yours close.`,
    `- Formality: ${card.formality.label} (${card.formality.contractions_per_100_words} contractions and ${card.formality.slang_per_100_words} slang words per 100 words).`,
    `- Questions: ${pct(card.question_rate)} of her sentences. Exclamations: ${pct(card.exclamation_rate)}.`,
    card.person.dominant ? `- Person: mostly "${card.person.dominant === 'i' ? 'I' : card.person.dominant}" (I ${pct(card.person.i)}, we ${pct(card.person.we)}, you ${pct(card.person.you)}).` : '',
    sig ? `- Her signature words (each used at least twice; use one or two where natural, never stuff them): ${sig}.` : '',
    card.never_uses.length ? `- Words she never uses (do not write them): ${card.never_uses.slice(0, 20).join(', ')}.` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

/** Kill-switch: real creators get the card only when `VOICE_CARD_ENABLED` is
 *  'true'; 'false' turns it off for everyone; unset = fictional creators only.
 *  Always behind the trial. */
export function voiceCardOn(trialOn: boolean, fictional: boolean, flag: string | undefined | null): boolean {
  if (!trialOn) return false
  const f = String(flag ?? '').trim().toLowerCase()
  if (f === 'false') return false
  if (f === 'true') return true
  return fictional
}

/** The cleanup step's ask: rewrite only lines carrying a phrase she never
 *  uses, toward her card. The caller re-checks every rewrite and keeps the
 *  original when the rewrite still misses. */
export function voiceCardRepairPrompt(
  card: VoiceCard, beats: ReadonlyArray<{ line?: unknown }>, misses: ReadonlyArray<{ index: number; phrases: string[] }>,
): string {
  return `${voiceCardBrief(card)}\nRewrite ONLY these lines so they sound like her card. Keep every fact, number, name and claim. `
    + 'Return JSON: {"rewrites":[{"index":<number>,"line":"<new line>"}]}\n\n'
    + misses.map((m) => `index ${m.index}\nNOT HER WORDS: ${m.phrases.join(', ')}\nLINE: ${String(beats[m.index]?.line ?? '')}`).join('\n\n')
}
