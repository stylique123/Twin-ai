// PLAN B: A CODE-ASSEMBLED SCRIPT BODY FOR PRODUCT MODE (owner decision 5,
// consolidated plan §15 tripwire; trial only, flag PLAN_B_ASSEMBLY at the edge).
//
// Used when her story or her facts are on file. The body is put together by
// code, in this order, and every line carries the id of the item it came from:
//   1. HOOK   — the opening sentence of her story, verbatim.
//   2. STORY  — the rest of her story VERBATIM (trimmed only at sentence ends).
//   3. FACTS  — product facts and her own facts, verbatim or a minimal fixed phrasing.
//   4. CTA    — exactly one call to action.
// The facts included are chosen to fit the duration word budget.
//
// ⚖️ AN UNSOURCED LINE CANNOT BE WRITTEN. `PlanBLine` objects are only made by
// `sourcedLine`, which refuses (throws) when the source id is not one of the
// supplied items. A polished line is made by the same function, from the same id.
//
// ⚖️ THE AI ONLY POLISHES, WITHIN BOUNDS. `applyPolish` takes a candidate per
// line and keeps it only when `withinBounds` holds: the item's content words,
// numbers and names all kept; no new content word or number; length within
// ±30%. Otherwise the unpolished text ships. Story and hook lines are never
// polished (they are her words).
//
// Pure, no I/O. Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs).

import { contentWords, dedupeSpokenLines, splitSentences, wordCount, type LedgerItem } from '../inventionGate.js'
import { DURATION_PROFILES, type DurationProfile } from '../templates/templateData.js'

export type PlanBSection = 'hook' | 'story' | 'fact' | 'cta'

export interface PlanBSource { id: string; text: string; kind: 'story' | 'product_fact' | 'her_fact' | 'cta'; field?: string | null }

export interface PlanBLine {
  readonly section: PlanBSection
  readonly line: string
  readonly source_ids: readonly [string]
  readonly polished: boolean
}

export interface PlanBRecord { lines: number; sourced: number; polished: number; fell_back: number }

/** The default CTA when no offer is on file: a fixed source of its own. */
export const PLAN_B_DEFAULT_CTA: PlanBSource = { id: 'cta:default', text: 'Tap the link to get yours.', kind: 'cta' }

const PLACEHOLDER = /[[\]{}<>]|\b(?:TBD|TODO|lorem ipsum|xx+|placeholder)\b|_{2,}/i

/** A line with its source. Throws when the id is not a supplied source, or the text is empty / a placeholder. */
export function sourcedLine(sources: ReadonlyMap<string, PlanBSource>, section: PlanBSection, text: string, sourceId: string, polished = false): PlanBLine {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!sourceId || !sources.has(sourceId)) throw new Error(`plan_b: unsourced line refused (${section})`)
  if (!t) throw new Error('plan_b: empty line refused')
  if (PLACEHOLDER.test(t)) throw new Error('plan_b: placeholder refused')
  return Object.freeze({ section, line: t, source_ids: Object.freeze([sourceId]) as unknown as readonly [string], polished })
}

/** Every line names a supplied source. */
export function allSourced(lines: readonly { source_ids?: readonly string[] }[], sources: ReadonlyMap<string, PlanBSource>): boolean {
  return lines.every((l) => Array.isArray(l.source_ids) && l.source_ids.length > 0 && l.source_ids.every((id) => sources.has(id)))
}

// ── POLISH BOUNDS ──────────────────────────────────────────────────────────

const numbersOf = (t: string): string[] => (t.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''))
/** Proper names: capitalised words not at a sentence start. */
const namesOf = (t: string): Set<string> => {
  const out = new Set<string>()
  for (const s of splitSentences(t)) {
    const ws = s.split(/\s+/)
    ws.slice(1).forEach((w) => { const c = w.replace(/[^A-Za-z0-9'-]/g, ''); if (/^[A-Z][a-zA-Z'-]+/.test(c) && c !== 'I') out.add(c.replace(/'s$/, '').toLowerCase()) })
  }
  return out
}

export const POLISH_LENGTH_SHARE = 0.3

/** Does `polished` stay within the bounds of `original`? */
export function withinBounds(original: string, polished: string): { ok: boolean; reason: string | null } {
  const p = String(polished ?? '').trim()
  if (!p) return { ok: false, reason: 'empty' }
  if (PLACEHOLDER.test(p)) return { ok: false, reason: 'placeholder' }
  const a = wordCount(original), b = wordCount(p)
  if (b < a * (1 - POLISH_LENGTH_SHARE) || b > a * (1 + POLISH_LENGTH_SHARE)) return { ok: false, reason: 'length' }
  const ow = contentWords(original), pw = contentWords(p)
  for (const w of ow) if (!pw.has(w)) return { ok: false, reason: 'lost_word' }
  for (const w of pw) if (!ow.has(w)) return { ok: false, reason: 'new_word' }
  const on = numbersOf(original), pn = numbersOf(p)
  if (on.length !== pn.length || on.some((n) => !pn.includes(n)) || pn.some((n) => !on.includes(n))) return { ok: false, reason: 'number' }
  const lowered = p.toLowerCase()
  for (const n of namesOf(original)) if (!lowered.includes(n)) return { ok: false, reason: 'lost_name' }
  if (splitSentences(p).length > Math.max(1, splitSentences(original).length)) return { ok: false, reason: 'new_claim' }
  return { ok: true, reason: null }
}

/** Keep each in-bounds polish; any other line falls back to its unpolished text. Hook and story are never polished. */
export function applyPolish(lines: readonly PlanBLine[], candidates: ReadonlyArray<string | null | undefined>, sources: ReadonlyMap<string, PlanBSource>): { lines: PlanBLine[]; polished: number; fell_back: number } {
  let polished = 0, fell = 0
  const out = lines.map((l, i) => {
    const c = candidates[i]
    if (l.section === 'hook' || l.section === 'story' || typeof c !== 'string' || c.trim() === '' || c.trim() === l.line) return l
    if (!withinBounds(l.line, c).ok) { fell++; return l }
    try { const n = sourcedLine(sources, l.section, c, l.source_ids[0], true); polished++; return n } catch { fell++; return l }
  })
  return { lines: out, polished, fell_back: fell }
}

// ── ASSEMBLY ───────────────────────────────────────────────────────────────

const endStop = (t: string) => t.replace(/([^.!?"')\]])$/, '$1.')
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** A fact's spoken form: verbatim when it is a sentence, else a minimal fixed phrasing by field. */
export function phraseFact(text: string, field?: string | null): string {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (wordCount(t) >= 4 && /[a-z]/.test(t)) return endStop(cap(t))
  const f = String(field ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim()
  if (f === 'price' || f === 'cost') return `It costs ${t.replace(/\.$/, '')}.`
  if (!f || /^(fact|note|other|story)$/.test(f)) return endStop(cap(t))
  return `The ${f} is ${t.replace(/\.$/, '')}.`
}

export interface PlanBInput {
  /** Her story (verbatim), with its knowledge id; null when none is on file. */
  story: { id: string; text: string } | null
  /** Product facts and her own facts, in priority order. */
  facts: ReadonlyArray<{ id: string; text: string; kind: 'product_fact' | 'her_fact'; field?: string | null }>
  /** The CTA source (offer item); the default CTA when absent. */
  cta?: { id: string; text: string } | null
  profile: DurationProfile
}

export interface PlanBResult { lines: PlanBLine[]; sources: Map<string, PlanBSource>; budget: number; words: number; story_verbatim: boolean; facts_used: number; facts_skipped: number }

const STORY_SHARE = 0.65

/** Can Plan B run? Her story or at least one fact on file. */
export function planBEligible(input: Pick<PlanBInput, 'story' | 'facts'>): boolean {
  return !!(input.story && input.story.text.trim()) || input.facts.some((f) => String(f.text ?? '').trim() !== '')
}

/** Assemble the body. Throws only on a programming error (an unsourced line). */
export function assemblePlanB(input: PlanBInput): PlanBResult {
  const budget = DURATION_PROFILES[input.profile]?.words ?? DURATION_PROFILES.standard.words
  const sources = new Map<string, PlanBSource>()
  const lines: PlanBLine[] = []
  // CTA first (its words are reserved), exactly one.
  const ctaText = input.cta && input.cta.text.trim() && wordCount(input.cta.text) <= 20 && !PLACEHOLDER.test(input.cta.text) ? endStop(cap(input.cta.text.trim())) : null
  const ctaSrc: PlanBSource = ctaText ? { id: input.cta!.id, text: ctaText, kind: 'cta' } : PLAN_B_DEFAULT_CTA
  sources.set(ctaSrc.id, ctaSrc)
  let used = wordCount(ctaSrc.text)
  // Story: leading sentences only (trimmed at sentence boundaries), within its share.
  let storyVerbatim = false
  if (input.story && input.story.text.trim() && !PLACEHOLDER.test(input.story.text)) {
    sources.set(input.story.id, { id: input.story.id, text: input.story.text, kind: 'story' })
    const ss = splitSentences(input.story.text.trim()).map((s) => s.trim()).filter(Boolean)
    const keep: string[] = []
    let w = 0
    for (const s of ss) {
      const n = wordCount(s)
      if (keep.length > 0 && w + n > budget * STORY_SHARE) break
      keep.push(s); w += n
    }
    if (keep.length) {
      lines.push(sourcedLine(sources, 'hook', keep[0]!, input.story.id))
      if (keep.length > 1) lines.push(sourcedLine(sources, 'story', keep.slice(1).join(' '), input.story.id))
      used += w
      storyVerbatim = true
    }
  }
  // Facts: in order, while they fit the budget; never a repeat of a line already in.
  let factsUsed = 0, skipped = 0
  const seen = new Set(lines.map((l) => l.line.toLowerCase()))
  for (const f of input.facts) {
    const text = phraseFact(f.text, f.field)
    if (!text || PLACEHOLDER.test(text) || seen.has(text.toLowerCase())) { skipped++; continue }
    const n = wordCount(text)
    if (used + n > budget) { skipped++; continue }
    sources.set(f.id, { id: f.id, text: f.text, kind: f.kind, field: f.field ?? null })
    // With no story, the first fact opens the video.
    lines.push(sourcedLine(sources, lines.length === 0 ? 'hook' : 'fact', text, f.id))
    seen.add(text.toLowerCase())
    used += n
    factsUsed++
  }
  lines.push(sourcedLine(sources, 'cta', ctaSrc.text, ctaSrc.id))
  return { lines, sources, budget, words: used, story_verbatim: storyVerbatim, facts_used: factsUsed, facts_skipped: skipped }
}

/** The blueprint's script beats, de-duplicated with the panel-7 spoken de-dup (her story protected). */
export function planBScript(lines: readonly PlanBLine[], story: string | null): { script: Array<{ section: string; line: string; source_ids: string[]; polished: boolean }>; removed: number } {
  const beats = lines.map((l) => ({ section: l.section, line: l.line, source_ids: [...l.source_ids], polished: l.polished }))
  const dd = dedupeSpokenLines(beats, story ? [story] : [])
  // De-dup may drop sentences; a beat left empty goes, and the CTA always stays one.
  const out = dd.script.filter((b) => String(b.line ?? '').trim() !== '')
  return { script: out, removed: dd.removed }
}

export function planBRecord(script: readonly { source_ids?: readonly string[]; polished?: boolean }[], sources: ReadonlyMap<string, PlanBSource>, fellBack: number): PlanBRecord {
  return {
    lines: script.length,
    sourced: script.filter((l) => Array.isArray(l.source_ids) && l.source_ids.length > 0 && l.source_ids.every((id) => sources.has(id))).length,
    polished: script.filter((l) => l.polished === true).length,
    fell_back: fellBack,
  }
}

/** The polish prompt: one line per item, wording only. The model's answer is a JSON array of strings. */
export function planBPolishPrompt(lines: readonly PlanBLine[]): string {
  const items = lines.map((l, i) => ({ i, line: l.section === 'hook' || l.section === 'story' ? null : l.line }))
  return [
    'Polish each line below for natural spoken delivery. Rules:',
    '- Keep every content word, number and name. Add no new noun, number, name or claim.',
    '- Keep the length within 30% of the original. One sentence stays one sentence.',
    '- A null line stays null. Return ONLY a JSON array of strings or nulls, same length and order.',
    JSON.stringify(items.map((x) => x.line)),
  ].join('\n')
}

/** Parse the polish answer; anything malformed is no polish at all. */
export function parsePolish(raw: string | null | undefined, n: number): Array<string | null> {
  try {
    const m = String(raw ?? '').match(/\[[\s\S]*\]/)
    const a = m ? JSON.parse(m[0]) : null
    if (!Array.isArray(a) || a.length !== n) return new Array(n).fill(null)
    return a.map((x) => (typeof x === 'string' ? x : null))
  } catch { return new Array(n).fill(null) }
}

/** Ledger → Plan B input: product facts for the target product (confirmed) and her facts. */
export function planBInputFromLedger(ledger: readonly LedgerItem[], story: { id: string; text: string } | null, targetProductId: string | null, profile: DurationProfile): PlanBInput {
  const facts: PlanBInput['facts'][number][] = []
  for (const it of ledger) {
    if (!it.first_party || !it.text.trim()) continue
    if (story && it.id === story.id) continue
    if (it.origin === 'product_fact' && (!targetProductId || it.product_id === targetProductId)) facts.push({ id: it.id, text: it.text, kind: 'product_fact', field: it.field })
  }
  for (const it of ledger) {
    if (!it.first_party || !it.text.trim() || (story && it.id === story.id)) continue
    if (it.origin === 'her_fact') facts.push({ id: it.id, text: it.text, kind: 'her_fact', field: null })
  }
  const offer = ledger.find((it) => it.origin === 'offer' && it.text.trim())
  return { story, facts, cta: offer ? { id: offer.id, text: offer.text } : null, profile }
}
