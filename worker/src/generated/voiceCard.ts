// GENERATED FROM packages/shared/src/script/voice/voiceCard.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
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
  // ── Plan v5.1 item L: the complete card. Every field below is counted off
  // her own words; every phrase listed is verbatim in her material. ──
  /** How she usually opens: the first two words of her passages (verbatim, used at least twice) and the shape of her first sentences. */
  openers: { top: Array<{ text: string; count: number }>; question_share: number; you_share: number; i_share: number }
  /** Words she uses (verbatim, at least twice) and plain-English words she never uses. */
  vocabulary: { uses: Array<{ text: string; count: number }>; avoids: string[] }
  /** Humor and tone, as counts. */
  tone: { label: ToneLabel; laughter_per_100_words: number; caps_per_100_words: number; asides_per_100_words: number }
  /** Pacing: how her sentence lengths are spread. `long_bound` is her 90th-percentile sentence. */
  pacing: { short_share: number; long_share: number; spread: number; long_bound: number; words_per_minute: number | null }
  /** How much of her material the card was counted from (present when built from transcripts and answers). */
  material?: MaterialAmount
  /** Her own edits ("this is how you sound"), applied on top of the counts. */
  edited?: boolean
}

export type ToneLabel = 'playful' | 'energetic' | 'curious' | 'clipped' | 'even'

export interface MaterialAmount {
  transcripts: number
  answers: number
  samples: number
  words: number
  /** Minutes of her speech: measured transcript seconds, else words at SPOKEN_WPM. Answers are typed, not counted as speech. */
  speech_minutes: number
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

const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Times a phrase occurs VERBATIM (words separated only by spaces) in her material. */
export function verbatimCount(material: readonly string[], phrase: string): number {
  const ws = phrase.toLowerCase().split(/\s+/).filter(Boolean)
  if (!ws.length) return 0
  const re = new RegExp(`(?<![a-z0-9'])${ws.map(escRe).join('\\s+')}(?![a-z0-9'])`, 'g')
  return material.reduce((n, t) => n + (norm(t).toLowerCase().match(re) ?? []).length, 0)
}

/** Formal / corporate words a plain speaker avoids; one goes on her card only when absent from her material. */
export const FORMAL_WORDS: readonly string[] = [
  'utilize', 'furthermore', 'moreover', 'additionally', 'therefore', 'thus', 'hence', 'individuals', 'commence',
  'purchase', 'numerous', 'regarding', 'obtain', 'assist', 'facilitate', 'optimal', 'comprehensive', 'robust',
  'innovative', 'cutting-edge', 'curated', 'crucial', 'essential', 'vital', 'indeed',
]

const LAUGH = /\b(?:ha(?:ha)+|lol|lmao|hehe)\b/gi
const ASIDE = /\([^)]*\)|\b(?:mind you|by the way|to be fair|i mean|you know)\b/gi
/** Shouted words: all caps, three letters or more (BONK, CRUNCH, VERY). */
const CAPS = /\b[A-Z]{3,}\b/g

function openersOf(texts: readonly string[]): VoiceCard['openers'] {
  const firsts = texts.map((t) => splitSentences(t)[0] ?? '').filter(Boolean)
  const counts = new Map<string, number>()
  for (const f of firsts) {
    const k = words(f).slice(0, 2).join(' ')
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const top = [...counts.entries()].filter(([k, c]) => c >= 2 && verbatimCount(texts, k) >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([text, count]) => ({ text, count }))
  const n = firsts.length || 1
  return {
    top,
    question_share: round(firsts.filter((f) => f.endsWith('?')).length / n),
    you_share: round(firsts.filter((f) => /^(?:you|your|you're|you've|if you)\b/i.test(norm(f))).length / n),
    i_share: round(firsts.filter((f) => /^(?:i|i'm|i've|my|we|we're|our)\b/i.test(norm(f))).length / n),
  }
}

function vocabularyOf(texts: readonly string[], hay: string): VoiceCard['vocabulary'] {
  const counts = new Map<string, number>()
  for (const w of words(texts.join(' \n '))) {
    if (STOP.has(w) || w.length < 4 || /^\d+$/.test(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  const uses = [...counts.entries()].filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 12).map(([text, count]) => ({ text, count }))
  return { uses, avoids: FORMAL_WORDS.filter((w) => !hasPhrase(hay, w)) }
}

function toneOf(texts: readonly string[], st: Stats): VoiceCard['tone'] {
  const all = texts.map(norm).join(' ')
  const n = words(all).length || 1
  const per100 = (re: RegExp) => round((all.match(re) ?? []).length * 100 / n, 2)
  const laughter = per100(LAUGH)
  const caps = per100(CAPS)
  const asides = per100(ASIDE)
  const label: ToneLabel = laughter + caps >= 1 ? 'playful'
    : st.exclamation_rate >= 0.3 ? 'energetic'
      : st.question_rate >= 0.25 ? 'curious'
        : st.mean > 0 && st.mean <= 7 ? 'clipped' : 'even'
  return { label, laughter_per_100_words: laughter, caps_per_100_words: caps, asides_per_100_words: asides }
}

function pacingOf(texts: readonly string[], wpm: number | null): VoiceCard['pacing'] {
  const lens = texts.flatMap(splitSentences).map((s) => words(s).length).sort((a, b) => a - b)
  const n = lens.length
  if (!n) return { short_share: 0, long_share: 0, spread: 0, long_bound: 0, words_per_minute: wpm }
  const mean = lens.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
  return {
    short_share: round(lens.filter((l) => l <= 6).length / n),
    long_share: round(lens.filter((l) => l >= 20).length / n),
    spread: round(sd, 2),
    long_bound: lens[Math.max(0, Math.ceil(0.9 * n) - 1)]!,
    words_per_minute: wpm,
  }
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
export function buildVoiceCard(material: readonly string[], opts: { words_per_minute?: number | null } = {}): VoiceCard | null {
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
    // A signature is listed ONLY when it is verbatim in her material at least twice.
    signatures: signaturesOf(texts).filter((g) => verbatimCount(texts, g.text) >= 2),
    formality: { label: formalityOf(st.contractions_per_100_words, st.slang_per_100_words), contractions_per_100_words: st.contractions_per_100_words, slang_per_100_words: st.slang_per_100_words },
    question_rate: st.question_rate,
    exclamation_rate: st.exclamation_rate,
    person: { ...p, dominant: p[top] > 0 ? top : null },
    never_uses: GENERIC_AI_PHRASES.filter((ph) => !hasPhrase(hay, ph)),
    openers: openersOf(texts),
    vocabulary: vocabularyOf(texts, hay),
    tone: toneOf(texts, st),
    pacing: pacingOf(texts, opts.words_per_minute ?? null),
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
    // Plan v5.1 item L: the complete card, as constraints.
    card.openers?.top.length ? `- How she opens: often with ${card.openers.top.map((o) => `"${o.text}"`).join(', ')}; ${pct(card.openers.question_share)} of her openings are questions. Open the way she does.` : '',
    card.vocabulary?.uses.length ? `- Words she actually uses: ${card.vocabulary.uses.slice(0, 10).map((u) => u.text).join(', ')}.` : '',
    card.vocabulary?.avoids.length ? `- Formal words she avoids (do not write them): ${card.vocabulary.avoids.slice(0, 15).join(', ')}.` : '',
    card.tone ? `- Humor and tone: ${card.tone.label} (${card.tone.laughter_per_100_words} laughs, ${card.tone.caps_per_100_words} shouted words, ${card.tone.asides_per_100_words} asides per 100 words). Do not add jokes or energy she does not have.` : '',
    card.pacing ? `- Pacing: ${pct(card.pacing.short_share)} of her sentences are 6 words or fewer, ${pct(card.pacing.long_share)} are 20 or more; her longest usual sentence is ${card.pacing.long_bound} words. No sentence longer than that.` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

// ── MATERIAL: HER TRANSCRIPTS AND ANSWERS (plan v5.1 item L) ────────────────

export interface VoiceSource {
  /** Her own transcripts (subject = own), with measured seconds when known. */
  transcripts?: ReadonlyArray<{ text?: unknown; seconds?: unknown }>
  /** Answers she typed to Twin's questions. */
  answers?: readonly unknown[]
  /** Short verbatim samples on her profile. */
  samples?: readonly unknown[]
}

/** Below BOTH of these she is a thin creator: no card, the general version. */
export const THIN_SPEECH_MINUTES = 15
export const THIN_ANSWERS = 10
/** Words per minute used when a transcript has no measured duration. */
export const SPOKEN_WPM = 150

const SKIP_ANSWER = /^(nothing( specific| really| much)?|none|no|n\/a|na|idk|i don'?t know|not sure|skip|no idea|not really)\b|\bkeep it general\b/i
const strs = (xs: readonly unknown[] | undefined) => (xs ?? []).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
const realAnswer = (a: string) => !SKIP_ANSWER.test(a.replace(/[.!\s]+$/, '')) && words(a).length >= 4

/** Her material, flattened: transcripts, real answers, samples (in that order). */
export function voiceSourceTexts(src: VoiceSource): string[] {
  return [
    ...strs((src.transcripts ?? []).map((t) => t?.text)),
    ...strs(src.answers).filter(realAnswer),
    ...strs(src.samples),
  ]
}

/** How much of her own material there is. */
export function voiceMaterialAmount(src: VoiceSource): MaterialAmount {
  const ts = (src.transcripts ?? []).filter((t) => typeof t?.text === 'string' && t.text.trim())
  const answers = strs(src.answers).filter(realAnswer)
  const samples = strs(src.samples)
  let seconds = 0
  for (const t of ts) {
    const sec = Number(t.seconds)
    seconds += Number.isFinite(sec) && sec > 0 ? sec : (words(String(t.text)).length / SPOKEN_WPM) * 60
  }
  return {
    transcripts: ts.length,
    answers: answers.length,
    samples: samples.length,
    words: words([...ts.map((t) => String(t.text)), ...answers, ...samples].join(' ')).length,
    speech_minutes: round(seconds / 60, 2),
  }
}

/** Thin: under about 15 minutes of her speech AND under 10 real answers. */
export const isThinMaterial = (a: MaterialAmount): boolean => a.speech_minutes < THIN_SPEECH_MINUTES && a.answers < THIN_ANSWERS

// ⚖️ RICH SAMPLES LOWER THE FLOOR (panel-current-10: 23 of 24 fictional
// generations were skipped as 'thin': five profile samples, no transcripts, no
// answers). When her verbatim samples alone are rich enough to count a rhythm
// off (at least RICH_SAMPLES_MIN passages, RICH_SAMPLES_WORDS words and
// RICH_SAMPLES_SENTENCES sentences), the thin floor is lowered for her. The
// card is still counted ONLY from her own words. Kill switch at the edge:
// VOICE_CARD_RICH_SAMPLES=off (trial only; the card itself stays behind
// voiceCardOn).
export const RICH_SAMPLES_MIN = 5
export const RICH_SAMPLES_WORDS = 45
export const RICH_SAMPLES_SENTENCES = 5

export function richSamples(samples: readonly unknown[] | undefined): boolean {
  const s = strs(samples)
  if (s.length < RICH_SAMPLES_MIN) return false
  return words(s.join(' ')).length >= RICH_SAMPLES_WORDS && s.flatMap(splitSentences).length >= RICH_SAMPLES_SENTENCES
}

export interface CreatorVoiceCard { card: VoiceCard | null; reason: 'ok' | 'thin' | 'too_little'; material: MaterialAmount }

/**
 * The card from her transcripts and answers. A thin creator gets NO card (the
 * general version), unless `thinFloor` is false (kill switch
 * VOICE_CARD_THIN_FLOOR=off at the edge, for fictional-panel testing only).
 */
export function buildCreatorVoiceCard(src: VoiceSource, opts: { thinFloor?: boolean; richSamples?: boolean } = {}): CreatorVoiceCard {
  const material = voiceMaterialAmount(src)
  const rich = opts.richSamples === true && richSamples(src.samples)
  if (opts.thinFloor !== false && !rich && isThinMaterial(material)) return { card: null, reason: 'thin', material }
  const ts = (src.transcripts ?? []).filter((t) => typeof t?.text === 'string' && t.text.trim())
  const measured = ts.filter((t) => Number.isFinite(Number(t.seconds)) && Number(t.seconds) > 0)
  const wpm = measured.length
    ? Math.round(words(measured.map((t) => String(t.text)).join(' ')).length / (measured.reduce((a, t) => a + Number(t.seconds), 0) / 60))
    : null
  const card = buildVoiceCard(voiceSourceTexts(src), { words_per_minute: wpm })
  return card ? { card: { ...card, material }, reason: 'ok', material } : { card: null, reason: 'too_little', material }
}

// ── THE VOICE CHECK (plan v5.1 item L) ─────────────────────────────────────

export const VOICE_CHECK_PASS = 60

export interface VoiceCheck extends VoiceMatch {
  /** 0-100 with pacing and openers folded in. */
  score: number
  pass: boolean
  threshold: number
  pacing: number
  opener: number
  /** Short, countable notes for the record (no script text). */
  notes: string[]
}

/** Score a script against her card: the match parts plus pacing and how it opens. */
export function voiceCheck(card: VoiceCard, lines: readonly string[]): VoiceCheck {
  const base = scoreVoiceMatch(card, lines)
  const texts = lines.map((l) => String(l ?? '')).filter((l) => l.trim())
  const lens = texts.flatMap(splitSentences).map((s) => words(s).length)
  const n = lens.length
  const p = card.pacing
  const pacing = !p || !n ? (n ? 1 : 0)
    : (closeness(lens.filter((l) => l <= 6).length / n, p.short_share, 0.5)
      + (lens.filter((l) => l > Math.max(p.long_bound, 8)).length === 0 ? 1 : Math.max(0, 1 - lens.filter((l) => l > Math.max(p.long_bound, 8)).length / n * 3))) / 2
  const first = texts.length ? (splitSentences(texts[0]!)[0] ?? '') : ''
  const firstWords = words(first).slice(0, 2).join(' ')
  const o = card.openers
  const opener = !o || !first ? (first ? 1 : 0)
    : o.top.length && o.top.some((t) => t.text === firstWords) ? 1
      : closeness(first.endsWith('?') ? 1 : 0, o.question_share, 1)
  const score = texts.length ? Math.round(0.8 * base.score + 10 * pacing + 10 * opener) : 0
  const notes: string[] = []
  if (base.never_used_hits) notes.push(`never_uses:${base.never_used_hits}`)
  if (p && lens.some((l) => l > Math.max(p.long_bound, 8))) notes.push('longer_than_her_longest')
  if (base.parts.length < 0.5) notes.push('sentence_length_off')
  if (base.parts.formality < 0.5) notes.push('formality_off')
  return { ...base, score, pass: score >= VOICE_CHECK_PASS, threshold: VOICE_CHECK_PASS, pacing: round(pacing), opener: round(opener), notes }
}

// ── THE CLEAN-UP'S VOICE OPTIONS (rhythm and robot-phrase filter) ─────────────

/**
 * What the deterministic clean-up (robotPhrases.robotPass) takes from her card:
 * her verbatim signatures are never cut as robot phrases, and the cadence split
 * uses her own long-sentence bound (kept between 12 and 30 words).
 */
export function voiceCardCleanupOptions(card: VoiceCard): { keep: string[]; maxWords: number } {
  const bound = card.pacing?.long_bound || Math.round(card.sentence_length.mean * 2) || 22
  return { keep: card.signatures.map((s) => s.text), maxWords: Math.min(30, Math.max(12, bound)) }
}

// ── "THIS IS HOW YOU SOUND": WHAT SHE SEES AND EDITS ───────────────────────────

export interface VoiceCardView {
  id: string
  title: 'This is how you sound'
  /** Counted from: e.g. "3 videos (16 min) and 12 answers". */
  counted_from: string
  sections: Array<{ key: VoiceCardSection; label: string; summary: string; items: string[]; editable: boolean }>
}
export type VoiceCardSection = 'sentences' | 'openers' | 'uses' | 'avoids' | 'tone' | 'pacing' | 'signatures' | 'never_says'

export interface VoiceCardEdits {
  /** Items she removed (verbatim as shown), per section. */
  remove?: Partial<Record<'openers' | 'uses' | 'signatures' | 'never_says' | 'avoids', string[]>>
  /** Phrases she says she never says (added to never_says). */
  never_says_add?: string[]
  /** Phrases she says ARE hers: kept only when verbatim in her material. */
  signatures_add?: string[]
}

/** The card as she reads it. Plain words, her own phrases, no internal ids beyond the card id. */
export function voiceCardView(card: VoiceCard): VoiceCardView {
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const m = card.material
  const counted = m
    ? `${m.transcripts} video${m.transcripts === 1 ? '' : 's'} (${Math.round(m.speech_minutes)} min) and ${m.answers} answer${m.answers === 1 ? '' : 's'}`
    : `${card.passages} passages of your own words`
  return {
    id: card.id,
    title: 'This is how you sound',
    counted_from: counted,
    sections: [
      { key: 'sentences', label: 'Your sentences', summary: `About ${Math.round(card.sentence_length.mean)} words each; ${card.formality.label}.`, items: [], editable: false },
      { key: 'openers', label: 'How you usually open', summary: `${pct(card.openers?.question_share ?? 0)} of your openings are questions.`, items: (card.openers?.top ?? []).map((o) => o.text), editable: true },
      { key: 'uses', label: 'Words you use', summary: 'Each one appears at least twice in your own words.', items: (card.vocabulary?.uses ?? []).map((u) => u.text), editable: true },
      { key: 'avoids', label: 'Words you avoid', summary: 'Never found in your own words.', items: card.vocabulary?.avoids ?? [], editable: true },
      { key: 'tone', label: 'Humor and tone', summary: card.tone ? `${card.tone.label}` : 'even', items: [], editable: false },
      { key: 'pacing', label: 'Pacing', summary: card.pacing ? `${pct(card.pacing.short_share)} short sentences, ${pct(card.pacing.long_share)} long ones${card.pacing.words_per_minute ? `, about ${card.pacing.words_per_minute} words a minute` : ''}.` : '', items: [], editable: false },
      { key: 'signatures', label: 'Your phrases', summary: 'Said word for word at least twice.', items: card.signatures.map((s) => s.text), editable: true },
      { key: 'never_says', label: 'What you never say', summary: 'Twin will not write these for you.', items: card.never_uses, editable: true },
    ],
  }
}

const cleanList = (xs: unknown, max = 20) => (Array.isArray(xs) ? xs : [])
  .filter((x): x is string => typeof x === 'string').map((x) => norm(x).trim().toLowerCase().replace(/\s+/g, ' '))
  .filter((x) => x.length > 0 && x.length <= 60).slice(0, max)

/** Sanitise edits from the client: strings only, short, capped. */
export function sanitizeVoiceCardEdits(e: unknown): VoiceCardEdits {
  const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
  const r = (o.remove && typeof o.remove === 'object' ? o.remove : {}) as Record<string, unknown>
  const remove: VoiceCardEdits['remove'] = {}
  for (const k of ['openers', 'uses', 'signatures', 'never_says', 'avoids'] as const) {
    const l = cleanList(r[k], 40)
    if (l.length) remove[k] = l
  }
  return { remove, never_says_add: cleanList(o.never_says_add), signatures_add: cleanList(o.signatures_add) }
}

/**
 * Her edits on top of the counted card. She can remove anything and add
 * never-says phrases. An added signature is kept ONLY when it is verbatim in
 * her material at least twice: the card never claims a phrase she did not say.
 */
export function applyVoiceCardEdits(card: VoiceCard, edits: VoiceCardEdits | null | undefined, material: readonly string[] = []): VoiceCard {
  if (!edits) return card
  const e = sanitizeVoiceCardEdits(edits)
  const rm = (k: keyof NonNullable<VoiceCardEdits['remove']>) => new Set(e.remove?.[k] ?? [])
  const sigAdds = (e.signatures_add ?? [])
    .filter((t) => !card.signatures.some((s) => s.text === t))
    .map((t) => ({ text: t, count: verbatimCount(material, t) }))
    .filter((s) => s.count >= 2)
  const herWords = material.join(' \n ').toLowerCase()
  const neverAdds = (e.never_says_add ?? []).filter((t) => !card.never_uses.includes(t) && !hasPhrase(herWords, t))
  const changed = Object.values(e.remove ?? {}).some((l) => (l?.length ?? 0) > 0) || sigAdds.length > 0 || neverAdds.length > 0
  if (!changed) return card
  return {
    ...card,
    signatures: [...card.signatures.filter((s) => !rm('signatures').has(s.text)), ...sigAdds],
    never_uses: [...card.never_uses.filter((p) => !rm('never_says').has(p)), ...neverAdds],
    openers: card.openers ? { ...card.openers, top: card.openers.top.filter((o) => !rm('openers').has(o.text)) } : card.openers,
    vocabulary: card.vocabulary ? { uses: card.vocabulary.uses.filter((u) => !rm('uses').has(u.text)), avoids: card.vocabulary.avoids.filter((a) => !rm('avoids').has(a)) } : card.vocabulary,
    edited: true,
  }
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

// ── THE VOICE AT THE POLISH STEP (panel-10 advisor: "voice is not visible") ──
//
// The polish (async worker self-review and Plan B polish) gets her style note,
// 2-3 short verbatim samples, and explicit rhythm rules counted off the card.
// After the polish the voice check scores before and after; the polish is kept
// ONLY when the score improves AND the claim/number/name checks pass.
// Kill switch: VOICE_POLISH=off (trial only).

export function voicePolishOn(trialOn: boolean, flag: string | undefined | null): boolean {
  return trialOn && String(flag ?? 'on').trim().toLowerCase() !== 'off'
}

export type Rhythm = 'clipped' | 'mid' | 'winding'

/** Clipped (short sentences, many fragments) vs winding (long, comma-heavy) vs mid. */
export function rhythmOf(card: VoiceCard): Rhythm {
  const m = card.sentence_length.mean
  const p = card.pacing
  if (m <= 8 || (p && p.short_share >= 0.5)) return 'clipped'
  if (m >= 18 || (p && p.long_share >= 0.3)) return 'winding'
  return 'mid'
}

/** 2-3 short verbatim samples of hers (5-40 words), in her order. */
export function voicePolishSamples(samples: readonly unknown[] | undefined, n = 3): string[] {
  const s = strs(samples).filter((x) => { const w = words(x).length; return w >= 5 && w <= 40 })
  return s.slice(0, Math.max(2, Math.min(3, n)))
}

/** Signatures that are verbatim in her material (the card's own rule, re-checked). */
export function verbatimSignatures(card: VoiceCard, material: readonly string[]): string[] {
  if (!material.length) return []
  return card.signatures.filter((s) => verbatimCount(material, s.text) >= 2).map((s) => s.text)
}

/** Explicit rhythm rules from the card: length target, exclamation habit, signatures, clipped vs winding. */
export function voiceRhythmRules(card: VoiceCard, material: readonly string[] = []): string[] {
  const mean = Math.round(card.sentence_length.mean)
  const lo = Math.max(2, Math.round(mean * 0.7)), hi = Math.max(lo + 1, Math.round(mean * 1.3))
  const ex = card.exclamation_rate
  const rhythm = rhythmOf(card)
  const sigs = verbatimSignatures(card, material)
  return [
    `- SENTENCE LENGTH: aim for ${lo}-${hi} words per sentence (hers average ${mean}).`,
    ex <= 0 ? '- EXCLAMATIONS: she never uses "!". Write none.'
      : ex >= 0.25 ? `- EXCLAMATIONS: ${Math.round(ex * 100)}% of her sentences end in "!". Use them as she does: about one sentence in ${Math.max(1, Math.round(1 / ex))}.`
        : `- EXCLAMATIONS: rare (${Math.round(ex * 100)}% of her sentences). At most one.`,
    sigs.length ? `- SIGNATURE PHRASES (verbatim in her own words; use one or two where natural, word for word): ${sigs.slice(0, 5).map((t) => `"${t}"`).join(', ')}.`
      : '- SIGNATURE PHRASES: none on record. Do not invent catchphrases for her.',
    rhythm === 'clipped' ? '- RHYTHM: CLIPPED. Short sentences. Fragments are fine. Cut every filler word.'
      : rhythm === 'winding' ? '- RHYTHM: LONG AND WINDING. Join thoughts with commas and dashes into longer sentences; let asides run on.'
        : '- RHYTHM: medium sentences, plain and even.',
  ]
}

/** The block the polish prompts carry: style note, samples, rules. */
export function voicePolishBrief(v: { card: VoiceCard; styleNote?: string | null; samples?: readonly unknown[]; material?: readonly string[] }): string {
  const note = String(v.styleNote ?? '').trim().slice(0, 300)
  const samples = voicePolishSamples(v.samples)
  return [
    'HER VOICE (make the rewrite sound like these, not like a generic presenter):',
    note ? `Her style note: ${note}` : '',
    samples.length ? `Her own words (verbatim samples; copy the rhythm, not the facts):\n${samples.map((x) => `> ${x}`).join('\n')}` : '',
    ...voiceRhythmRules(v.card, v.material ?? strs(v.samples)),
  ].filter(Boolean).join('\n')
}

const NUMS = /\d+(?:[.,]\d+)?/g
const CLAIM_WORDS = /\b(?:best|guarantee[sd]?|proven|clinically|cures?|heals?|certified|award\w*|#1|number one|scientific|fastest|cheapest)\b|%/gi
const namesIn = (t: string): string[] => {
  const out: string[] = []
  for (const sent of splitSentences(t)) {
    const ws = sent.split(/\s+/).slice(1)
    for (const w of ws) { const x = w.replace(/[^A-Za-z'-]/g, ''); if (/^[A-Z][a-z]/.test(x) && x !== 'I' && !/^I'/.test(x)) out.push(x.toLowerCase()) }
  }
  return out
}

/** Claim/number/name checks: the polished lines add no number, name or claim word absent from the original lines and her material. */
export function polishFactChecks(before: readonly string[], after: readonly string[], material = ''): { ok: boolean; reasons: string[] } {
  const known = `${before.join('\n')}\n${material}`
  const lowKnown = known.toLowerCase()
  const reasons: string[] = []
  const kn = new Set(known.match(NUMS) ?? [])
  const bn = new Set(before.join('\n').match(NUMS) ?? [])
  const an = new Set(after.join('\n').match(NUMS) ?? [])
  if ([...an].some((n) => !kn.has(n))) reasons.push('new_number')
  if ([...bn].some((n) => !an.has(n))) reasons.push('lost_number')
  if (namesIn(after.join('\n')).some((n) => !lowKnown.includes(n))) reasons.push('new_name')
  if ((after.join('\n').match(CLAIM_WORDS) ?? []).some((c) => !lowKnown.includes(c.toLowerCase()))) reasons.push('new_claim')
  return { ok: reasons.length === 0, reasons }
}

export interface VoicePolishVerdict { keep: boolean; before: number; after: number; reason: 'improved' | 'not_better' | 'checks_failed' }

/** Keep the polish only if the voice score improves and the fact checks pass. */
export function voicePolishVerdict(card: VoiceCard, before: readonly string[], after: readonly string[], checksOk: boolean): VoicePolishVerdict {
  const b = voiceCheck(card, before).score, a = voiceCheck(card, after).score
  if (!checksOk) return { keep: false, before: b, after: a, reason: 'checks_failed' }
  return a > b ? { keep: true, before: b, after: a, reason: 'improved' } : { keep: false, before: b, after: a, reason: 'not_better' }
}
