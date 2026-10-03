// GENERATED FROM packages/shared/src/script/corrections.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// HER CORRECTIONS REACH STORAGE (script batch audit 2026-10-03, parts 3 and 11).
//
// ⚠️ MEASURED: she wrote "brings back the two-pound batches and cup-score claims
// I've excluded multiple times now", "I didn't describe it that way" (burnt /
// overly acidic), "don't say Hello I'm Savannah". Each became an `avoid` lesson
// — advice in the prompt — while the facts that said those things stayed live
// and were handed to the writer as usable. The fact outweighed the advice:
// two-pound batches in 67 of 370 scripts, burnt/acidic in 60, cup scores in 8.
//
// ⚖️ SO A CORRECTION NOW ACTS IN THREE PLACES, WITH ONE MATCHING RULE:
//   · storage — a stored fact that says what she rejected is excluded
//     (`creator_excluded_at`, the same flag her "leave this out" tap sets, so
//     she can switch it back on from the plan screen);
//   · input — her voice samples and any fact still carrying the words are
//     scrubbed before the writer sees them;
//   · output — a sentence that still says it is removed, not just reported.
//
// The terms are HER words, copied from her note and checked against it; this
// module never invents what she rejected. This file is the one rule; the worker
// and the edge function run generated copies (scripts/ci/generate_shared_pilot_core.mjs).

const SMALL: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
}
const UNIT: Record<string, string> = { lb: 'pound', lbs: 'pound', pounds: 'pound', ounce: 'oz', ounces: 'oz', g: 'gram', grams: 'gram' }
// Words that frame a correction rather than name the thing ("cup-score CLAIMS",
// "the two-pound batch STORY"). A term made only of these matches nothing.
const FRAME = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'my', 'i', 'it', 'is', 'am', 'are', 'was', 'be', 'for', 'with',
  'that', 'this', 'at', 'her', 'she', 'you', 'your', 'me', 'we', 'our', 'about', 'any', 'again', 'never', 'not', 'no',
  'don', 't', 'do', 'say', 'saying', 'said', 'mention', 'mentions', 'claim', 'claims', 'line', 'lines', 'story',
  'stories', 'stuff', 'thing', 'things', 'part', 'bit', 'word', 'words', 'talk', 'talking', 'like',
])

function stem(w: string): string {
  const u = UNIT[w] ?? SMALL[w] ?? w
  if (u.length > 4 && u.endsWith('ies')) return `${u.slice(0, -3)}y`
  if (u.length > 4 && /(ch|sh|x|ss)es$/.test(u)) return u.slice(0, -2)
  if (u.length > 3 && u.endsWith('s') && !u.endsWith('ss')) return u.slice(0, -1)
  return u
}

/** Content tokens of a text: lower case, contractions opened, numbers and units unified. */
export function correctionTokens(text: string): string[] {
  return String(text ?? '').toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\b(i|you|we|they|he|she|it)'m\b/g, '$1 am')
    .replace(/'(s|re|ve|ll|d)\b/g, ' ')
    .replace(/\$\s?(\d)/g, '$1 ')
    .replace(/(\d)([a-z]+)/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(Boolean).map(stem)
}

const termKey = (term: string) => [...new Set(correctionTokens(term).filter((w) => !FRAME.has(w)))]

/** True when a text says what a rejected term names: every content token of the term is in it. */
export function saysRejected(text: string, term: string): boolean {
  const key = termKey(term)
  if (!key.length) return false
  const have = new Set(correctionTokens(text))
  return key.every((w) => have.has(w))
}

/** The rejected terms carried by her active avoid lessons (the phrase is her words). */
export function rejectedTerms(lessons: readonly { kind?: unknown; phrase?: unknown; active?: unknown }[]): string[] {
  const out = new Map<string, string>()
  for (const l of lessons) {
    if (l?.kind !== 'avoid' || l?.active === false || typeof l?.phrase !== 'string') continue
    const key = termKey(l.phrase)
    if (key.length) out.set(key.join(' '), l.phrase)
  }
  return [...out.values()]
}

/** Ids of stored facts that say something she rejected, and are not already excluded. */
export function factsRejected(
  facts: readonly { id?: unknown; text?: unknown; evidence?: unknown; creator_excluded_at?: unknown }[],
  terms: readonly string[],
): Array<{ id: string; term: string }> {
  const out: Array<{ id: string; term: string }> = []
  for (const f of facts) {
    if (!f?.id || f.creator_excluded_at) continue
    const t = `${String(f.text ?? '')} ${String(f.evidence ?? '')}`
    const term = terms.find((x) => saysRejected(t, x))
    if (term) out.push({ id: String(f.id), term })
  }
  return out
}

const SENTENCES = /(?<=[.!?])\s+/

/** Rejected sentences out of any JSON value (her voice profile): list items dropped, text cut by sentence. */
export function scrubRejected<T>(v: T, terms: readonly string[]): T {
  if (!terms.length) return v
  const bad = (s: string) => terms.some((t) => saysRejected(s, t))
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return bad(x) ? x.split(SENTENCES).filter((s) => !bad(s)).join(' ') : x
    if (Array.isArray(x)) return x.filter((i) => !(typeof i === 'string' && bad(i))).map(walk)
    if (x && typeof x === 'object') {
      return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, i]) => [k, walk(i)]))
    }
    return x
  }
  return walk(v) as T
}

export interface CorrectionRemoval { beat: number; reason: 'rejected_by_her'; term: string; sentence: string }

/**
 * THE OUTPUT RULE. A sentence that says something she rejected is removed —
 * enforced, not suggested. `allowedText` is what she typed for THIS video: a
 * term she used herself this time is hers to say.
 */
export function enforceCorrections<T extends { line?: unknown }>(
  beats: readonly T[], terms: readonly string[], allowedText = '',
): { beats: T[]; removed: CorrectionRemoval[] } {
  const live = terms.filter((t) => !(allowedText && saysRejected(allowedText, t)))
  const removed: CorrectionRemoval[] = []
  const out = beats.map((b, i) => {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line || !live.length) return b
    const kept: string[] = []
    for (const s of line.split(SENTENCES)) {
      const term = live.find((t) => saysRejected(s, t))
      if (term) { removed.push({ beat: i, reason: 'rejected_by_her', term, sentence: s }); continue }
      kept.push(s)
    }
    const next = kept.join(' ').trim()
    return next === line ? b : { ...b, line: next }
  })
  return { beats: out, removed }
}

/** Model instructions: the words in her note naming what she rejects. */
export const CORRECTION_SYSTEM = [
  'A creator rated a video script and wrote a note. List every claim, fact, detail, phrase or wording she REJECTS: something she says is wrong, untrue, not hers, not how she described it, already excluded, or never to be said.',
  'Copy HER exact words naming the thing (2-6 words), e.g. "two-pound batches", "cup scores", "burnt", "Hello I\'m Savannah". Never paraphrase, never add a thing she did not reject.',
  'Things she liked or asked for are NOT rejections. Return an empty list when she rejects nothing.',
].join('\n')

export const CORRECTION_SCHEMA = {
  type: 'object',
  properties: { rejects: { type: 'array', items: { type: 'string' } } },
  required: ['rejects'],
} as const

/** The model's terms, kept only when they are her words and name something. */
export function cleanCorrections(raw: unknown, note: string): string[] {
  const list = (raw as { rejects?: unknown })?.rejects
  if (!Array.isArray(list)) return []
  const said = correctionTokens(note).join(' ')
  const out = new Map<string, string>()
  for (const r of list.slice(0, 8)) {
    const t = String(r ?? '').trim().replace(/^["“'‘]+|["”'’.,!]+$/g, '')
    const words = t.split(/\s+/).filter(Boolean).length
    if (!t || words > 6 || !termKey(t).length) continue
    if (!` ${said} `.includes(` ${correctionTokens(t).join(' ')} `)) continue
    out.set(termKey(t).join(' '), t.slice(0, 80))
  }
  return [...out.values()]
}

/** The standing lesson a rejected term becomes (an avoid rule whose phrase is the term). */
export function correctionLessonText(term: string): string {
  return `Never say or claim "${term}" — she rejected it.`
}
