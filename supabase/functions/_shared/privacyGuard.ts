// GENERATED FROM packages/shared/src/script/privacyGuard.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE PRIVACY GUARD — one rule for every door (fact-scoping architecture, 2026-09-29).
//
// ⚠️ WHY THIS EXISTS. Private and tapped-out facts reached scripts three times,
// each through a door the previous fix did not know about: the length-extension
// pass (all 60 stored rows), the voice profile, and — still open before this —
// signature phrases from her transcripts, her past scripts' hooks and premises,
// and quoted hook lessons. Every fix had filtered ONE reader. This module is the
// single rule all readers and the final check share:
//
//   · `PRIVATE` — what counts as private (the same list the plan screen uses to
//     switch facts off, and the database uses to flag rows: parity-tested);
//   · `scrubPrivate` — strip private sentences from any value before a writer
//     sees it (profile, phrases, catalogue, lessons);
//   · `guardScript` — THE LAST LINE: after writing, remove any sentence that
//     carries a private term or a tapped-out fact's wording that nothing she
//     allowed contains. Deterministic, no model, so it cannot be talked round.
//
// ⚖️ HER CONSENT WINS. A private term she typed for this video, or a fact she
// switched back on, is in `allowedText` and is never removed.

import { SENSITIVE } from './storyRotation.ts'

/** What counts as private. One source: the shared SENSITIVE list. */
export const PRIVATE: RegExp = SENSITIVE

export function isPrivate(text: string | null | undefined): boolean {
  return PRIVATE.test(String(text ?? ''))
}

/**
 * The same rule as a Postgres regex (ARE), for the database flag. Word
 * boundaries become \m / \M; everything else in the source is ARE-compatible.
 */
export function privateSqlPattern(): string {
  return PRIVATE.source.replace(/^\\b/, '\\m').replace(/\\b$/, '\\M')
}

const SENTENCES = /(?<=[.!?])\s+/

/** Private sentences out of any JSON value: list items dropped, text cut by sentence. */
export function scrubPrivate<T>(v: T): T {
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') {
      if (!isPrivate(x)) return x
      return x.split(SENTENCES).filter((s) => !isPrivate(s)).join(' ')
    }
    if (Array.isArray(x)) return x.filter((i) => !(typeof i === 'string' && isPrivate(i))).map(walk)
    if (x && typeof x === 'object') {
      return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, i]) => [k, walk(i)]))
    }
    return x
  }
  return walk(v) as T
}

/**
 * BLIND SET 3 T5 (owner 2026-10-06): her voice profile kept "move from a
 * home roastery to a commercial space" and "I have 26 days to move … to a
 * commercial space" — her private relocation story — because neither line
 * has a word on the list. The writer turned it into "signing a commercial
 * lease". A profile string that shares two distinctive words with any private
 * fact is cut, the same way a listed word would cut it.
 */
const LIKE_STOP = new Set(['about', 'their', 'there', 'which', 'would', 'could', 'should', 'small', 'business', 'coffee', 'people', 'every', 'being', 'after', 'before', 'where', 'while', 'these', 'those', 'things'])
function likeWords(t: string): Set<string> {
  return new Set((t.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !LIKE_STOP.has(w)))
}
export function scrubLike<T>(v: T, privateTexts: readonly string[], minShared = 2): T {
  const bags = privateTexts.map(likeWords).filter((b) => b.size >= 2)
  if (!bags.length) return v
  const hit = (s: string) => { const w = likeWords(s); return bags.some((b) => { let n = 0; for (const x of w) if (b.has(x) && ++n >= minShared) return true; return false }) }
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return hit(x) ? x.split(SENTENCES).filter((s) => !hit(s)).join(' ') : x
    if (Array.isArray(x)) return x.filter((i) => !(typeof i === 'string' && hit(i))).map(walk)
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, i]) => [k, walk(i)]))
    return x
  }
  return walk(v) as T
}

/**
 * The private half of a value: every private list item and private sentence
 * `scrubPrivate` would cut. Handed to `guardScript` as excluded text, so a
 * paraphrase of a private hook in her voice profile (audit 2026-10-03, part 2:
 * "the city inspector walks through our doors") is caught by its wording too,
 * not only by the word list.
 */
export function privateParts(v: unknown): string[] {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (typeof x === 'string') { if (isPrivate(x)) out.push(...x.split(SENTENCES).filter((s) => isPrivate(s))); return }
    if (Array.isArray(x)) { for (const i of x) walk(i); return }
    if (x && typeof x === 'object') for (const i of Object.values(x as Record<string, unknown>)) walk(i)
  }
  walk(v)
  return out
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'my', 'i', 'it', 'is', 'was', 'for', 'with', 'that', 'this', 'at', 'her', 'she', 'you', 'your', 'from', 'by', 'be', 'are'])

/** Distinctive 3-word runs of a text (stop words dropped), for matching a fact's wording. */
function runs(text: string, n = 3): Set<string> {
  const w = norm(text).split(' ').filter((x) => x && !STOP.has(x))
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '))
  return out
}

const UNITS = /^(?:-|\s)*(?:pounds?|lbs?|oz|ounces?|grams?|g|kg|batch(?:es)?|bags?|minutes?|hours?|days?|weeks?|months?|years?|%|percent|points?|scores?|cups?)\b/i
const SMALL: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

/** Numbers a text states as quantities: >= 10, or tied to a unit ("two-pound"). Words and digits alike. */
export function statedQuantities(text: string): Set<number> {
  const out = new Set<number>()
  const re = /(\d[\d,]*(?:\.\d+)?)|\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi
  for (const m of text.matchAll(re)) {
    const v = m[1] !== undefined ? Number(m[1].replace(/,/g, ''))
      : m[2] !== undefined ? TENS[m[2].toLowerCase()] + (m[3] ? SMALL[m[3].toLowerCase()] : 0)
        : SMALL[String(m[4]).toLowerCase()]
    if (!Number.isFinite(v)) continue
    const after = text.slice((m.index ?? 0) + m[0].length)
    if (v >= 10 || UNITS.test(after)) out.add(v)
  }
  return out
}

/** Each stated figure as "value|unit" (unit singular, '' when bare), so "six
 *  months" is not backed by "6 years". */
export function statedFigures(text: string): Set<string> {
  const out = new Set<string>()
  const re = /(\d[\d,]*(?:\.\d+)?)|\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi
  for (const m of text.matchAll(re)) {
    const v = m[1] !== undefined ? Number(m[1].replace(/,/g, ''))
      : m[2] !== undefined ? TENS[m[2].toLowerCase()] + (m[3] ? SMALL[m[3].toLowerCase()] : 0)
        : SMALL[String(m[4]).toLowerCase()]
    if (!Number.isFinite(v)) continue
    const after = text.slice((m.index ?? 0) + m[0].length)
    const u = after.match(UNITS)
    const unit = u ? u[0].replace(/^[\s-]+/, '').toLowerCase().replace(/(es|s)$/, '').replace(/^lb$/, 'pound').replace(/^ounce$/, 'oz') : ''
    if (v >= 10 || unit) out.add(`${v}|${unit}`)
  }
  return out
}

export interface GuardBeat { line?: unknown; [k: string]: unknown }
export interface GuardRemoval { beat: number; reason: 'private' | 'excluded' | 'unbacked_figure' | 'unbacked_identity'; sentence: string }

/**
 * ⚠️ OWNER RETEST 2026-10-01: "I run a coffee cart every morning" passed every
 * guard, because "coffee cart business" sat in a topic Twin GUESSED from a
 * caption. A role she claims in the first person ("I run / own / operate a …")
 * must be named in something she STATED (her answers, her stated facts, a
 * product she owns) — not a guessed topic.
 */
const ROLE_CLAIM = /\b(?:i|we)(?:'ve| have)?\s+(?:run|runs|own|owns|operate|operates|manage|manages|started|founded|opened|built)\s+(?:a|an|my|our|this)\s+((?:[a-z-]+\s+){0,3}?(?:cart|truck|shop|store|caf[eé]|bakery|roastery|studio|salon|gym|clinic|practice|agency|business|brand|company|restaurant|stand|stall|farm|boutique|kitchen|food truck))\b/i
export function unbackedRole(sentence: string, identityText: string): string | null {
  const m = sentence.match(ROLE_CLAIM)
  if (!m) return null
  const head = m[1]!.trim().toLowerCase().split(/\s+/).pop()!
  // Naming the thing is not owning it ("people ask how to start a coffee cart"):
  // her stated words must tie it to herself — "my cart", "I run the cart".
  const owned = new RegExp(`\\b(?:my|our|i (?:run|own|operate|manage|started|founded|opened|built|have)|we (?:run|own|operate|started|opened|built|have))\\s+(?:[a-z-]+\\s+){0,3}?${head.replace(/[^a-z]/g, '')}s?\\b`, 'i')
  return owned.test(norm(identityText)) ? null : m[0]
}

/**
 * The final check. `allowedText` is everything she allowed for this video (the
 * supplied facts, her words, the product and brand facts). `excludedTexts` are
 * the facts she tapped out and the private ones she did not switch on.
 */
export function guardScript<T extends GuardBeat>(
  beats: readonly T[],
  opts: { allowedText: string; excludedTexts: readonly string[]; figuresMustBeBacked?: boolean; identityText?: string },
): { beats: T[]; removed: GuardRemoval[] } {
  const allowedNorm = ` ${norm(opts.allowedText)} `
  const allowedRuns = runs(opts.allowedText)
  const banned = new Set<string>()
  for (const t of opts.excludedTexts) for (const r of runs(t)) if (!allowedRuns.has(r)) banned.add(r)
  const allowedQty = statedQuantities(opts.allowedText)
  const allowedFigures = statedFigures(opts.allowedText)
  const bannedQty = new Set<number>()
  for (const t of opts.excludedTexts) for (const q of statedQuantities(t)) if (!allowedQty.has(q)) bannedQty.add(q)
  const privateAllowed = (s: string) => {
    const m = s.match(new RegExp(PRIVATE.source, 'gi')) ?? []
    return m.length > 0 && m.every((w) => allowedNorm.includes(` ${norm(w)} `))
  }
  const removed: GuardRemoval[] = []
  const out = beats.map((b, i) => {
    const line = typeof b.line === 'string' ? b.line : ''
    if (!line) return b
    const kept: string[] = []
    for (const s of line.split(SENTENCES)) {
      if (isPrivate(s) && !privateAllowed(s)) { removed.push({ beat: i, reason: 'private', sentence: s }); continue }
      const hit = [...runs(s)].some((r) => banned.has(r)) || [...statedQuantities(s)].some((q) => bannedQty.has(q))
      if (hit) { removed.push({ beat: i, reason: 'excluded', sentence: s }); continue }
      // A figure (10 or more, or any number with a unit) that nothing she gave states.
      if (opts.figuresMustBeBacked && [...statedFigures(s)].some((f) => !allowedFigures.has(f) && !(f.endsWith('|') && allowedQty.has(Number(f.slice(0, -1)))))) {
        removed.push({ beat: i, reason: 'unbacked_figure', sentence: s }); continue
      }
      if (typeof opts.identityText === 'string' && unbackedRole(s, opts.identityText)) {
        removed.push({ beat: i, reason: 'unbacked_identity', sentence: s }); continue
      }
      kept.push(s)
    }
    const next = kept.join(' ').trim()
    return next === line ? b : { ...b, line: next }
  })
  return { beats: out, removed }
}

/**
 * A later rewrite of an already-checked script (the test-viewer panel, #1 of the
 * 2026-09-29 audit) may only say what the checked script and its facts already
 * say. False when the new text brings in a private term, a private fact's
 * wording, or any quantity the allowed text does not state.
 */
export function rewriteIsSafe(
  text: string,
  opts: { allowedText: string; excludedTexts: readonly string[] },
): boolean {
  if (!text.trim()) return true
  const { removed } = guardScript([{ line: text }], opts)
  if (removed.length) return false
  const allowedQty = statedQuantities(opts.allowedText)
  return [...statedQuantities(text)].every((q) => allowedQty.has(q))
}
