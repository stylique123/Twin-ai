// PLAN B: A CODE-ASSEMBLED SCRIPT BODY FOR PRODUCT MODE (owner decision 5,
// consolidated plan §15 tripwire; trial only, flag PLAN_B_ASSEMBLY at the edge).
//
// Used when her story or her facts are on file. The body is put together by
// code, per template (plan v5.4 §20), and every line carries its source id:
//   1. HOOK    — her story's first beat, or else one SPECIFIC real fact of hers.
//                Never a bare spec (a price, size or count alone).
//   2. STORY   — the rest of her story VERBATIM (trimmed only at sentence ends).
//   3. METHOD  — her method or steps: product process facts, her own method answer.
//   4. REALITY — a reality check, ONLY when a sourced item (testimonial, review,
//                proof number, study, result) is on file. At most one.
//   5. FACTS   — any other fact that still fits the budget.
//   6. CTA     — exactly one call to action, from her offer.
// Her onboarding answers (niche, profile, story, product slot; the 'asked'
// creator_knowledge rows and the request's answers) are first-party items too.
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

export type PlanBSection = 'hook' | 'story' | 'method' | 'reality' | 'fact' | 'cta'

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

const endStop = (t: string) => t.replace(/([^.!?"')\]])$/, '$1.')
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

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

// ── POLISH CHECK (plan v5.4 §20) ───────────────────────────────────────────
// The model may reword, and may add ONE short connector (≤ CONNECTOR_MAX_WORDS
// words) before or after the line, set off by punctuation. The check rejects a
// rewrite that drops a number or a name, or adds a new number, proper noun or
// claim. On rejection the unpolished line ships.

export const CONNECTOR_MAX_WORDS = 12
const CLAIM_MARKER = /\b(?:best|better|guarantee[sd]?|guaranteed|proven|clinically|cures?|heals?|free|organic|natural|non-toxic|certified|award\w*|only|never|always|every(?:one)?|all|percent|results?|stud(?:y|ies)|science|scientific|doctors?|experts?|safe(?:st)?|fastest|cheapest|most|#1|number one|lasts?|works?|guaranteed)\b|%|\$/i

/** Proper nouns anywhere (except a sentence's first word and "I"). */
const properNouns = (t: string): Set<string> => namesOf(t)

/** A connector is short, carries no digit, no proper noun and no claim word. */
function connectorOk(c: string): boolean {
  const t = c.trim().replace(/^[,:;.!?\s\u2013\u2014-]+|[,:;.!?\s\u2013\u2014-]+$/g, '')
  if (!t) return true
  if (wordCount(t) > CONNECTOR_MAX_WORDS) return false
  if (/\d/.test(t) || CLAIM_MARKER.test(t)) return false
  return t.split(/\s+/).slice(1).every((w) => { const x = w.replace(/[^A-Za-z'-]/g, ''); return !/^[A-Z]/.test(x) || x === 'I' || /^I'/.test(x) })
}

export type PolishReject = 'empty' | 'placeholder' | 'lost_number' | 'new_number' | 'lost_name' | 'new_name' | 'new_claim' | 'lost_word' | 'length'

/** Is `polished` an allowed rewrite of `original`? Exactly the owner's rule, plus the line's own words kept. */
export function polishCheck(original: string, polished: string): { ok: boolean; reason: PolishReject | null; connector: boolean } {
  const p = String(polished ?? '').trim().replace(/\s+/g, ' ')
  const no = (reason: PolishReject) => ({ ok: false, reason, connector: false })
  if (!p) return no('empty')
  if (PLACEHOLDER.test(p)) return no('placeholder')
  const on = numbersOf(original), pn = numbersOf(p)
  if (on.some((n) => !pn.includes(n))) return no('lost_number')
  if (pn.some((n) => !on.includes(n)) || pn.length > on.length) return no('new_number')
  const lowered = p.toLowerCase()
  for (const n of namesOf(original)) if (!lowered.includes(n)) return no('lost_name')
  const lowOrig = original.toLowerCase()
  for (const n of properNouns(p)) if (!lowOrig.includes(n)) return no('new_name')
  const strict = withinBounds(original, p)
  if (strict.ok) return { ok: true, reason: null, connector: false }
  if (strict.reason === 'number') return no('new_number')
  if (strict.reason === 'lost_name') return no('lost_name')
  // A connector: split at each punctuation boundary; the core must pass strictly.
  const cuts = [...p.matchAll(/[,:;.!?\u2013\u2014]\s+|\s+[-\u2013\u2014]\s+/g)].map((m) => [m.index!, m.index! + m[0].length] as const)
  for (const [a, b] of cuts) {
    const lead = p.slice(0, a + 1), coreL = p.slice(b)
    if (connectorOk(lead) && withinBounds(original, cap(coreL)).ok) return { ok: true, reason: null, connector: true }
    const coreT = p.slice(0, a + 1), tail = p.slice(b)
    if (connectorOk(tail) && withinBounds(original, coreT).ok) return { ok: true, reason: null, connector: true }
  }
  if (strict.reason === 'lost_word') return no('lost_word')
  if (strict.reason === 'length') return no('length')
  return no('new_claim')
}

/** Keep each in-bounds polish; any other line falls back to its unpolished text. Hook and story are never polished. */
export function applyPolish(lines: readonly PlanBLine[], candidates: ReadonlyArray<string | null | undefined>, sources: ReadonlyMap<string, PlanBSource>, extraCheck?: (line: PlanBLine, candidate: string) => boolean): { lines: PlanBLine[]; polished: number; fell_back: number } {
  let polished = 0, fell = 0
  const out = lines.map((l, i) => {
    const c = candidates[i]
    if (l.section === 'hook' || l.section === 'story' || typeof c !== 'string' || c.trim() === '' || c.trim() === l.line) return l
    if (!polishCheck(l.line, c).ok) { fell++; return l }
    // POLISH_CHECK_V2 (test accounts): items in scope, first-person claims, wrong product.
    if (extraCheck && !extraCheck(l, c)) { fell++; return l }
    try { const n = sourcedLine(sources, l.section, c, l.source_ids[0], true); polished++; return n } catch { fell++; return l }
  })
  return { lines: out, polished, fell_back: fell }
}

// ── ASSEMBLY ───────────────────────────────────────────────────────────────


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

export interface PlanBFact { id: string; text: string; kind: 'product_fact' | 'her_fact'; field?: string | null }

export interface PlanBInput {
  /** Her story (verbatim), with its knowledge id; null when none is on file. */
  story: { id: string; text: string } | null
  /** Product facts and her own facts (incl. her onboarding answers), in priority order. */
  facts: ReadonlyArray<PlanBFact>
  /** The CTA source (offer item); the default CTA when absent. */
  cta?: { id: string; text: string } | null
  profile: DurationProfile
}

export interface PlanBResult { lines: PlanBLine[]; sources: Map<string, PlanBSource>; budget: number; words: number; story_verbatim: boolean; facts_used: number; facts_skipped: number; sections: Record<PlanBSection, number> }

const STORY_SHARE = 0.65

const METHOD_FIELD = /(?:^|[ _-])(?:method|methods|step|steps|process|how|how to|routine|usage|use|directions|instructions|recipe|framework|own method|technique)(?:$|[ _-])/i
const REALITY_FIELD = /^(?:testimonial|review|reviews|proof|proof number|proof_number|study|studies|result|results|evidence|data|stat|statistic|source|sourced)$/i
const BARE_SPEC_FIELD = /^(?:price|cost|size|sizes|count|quantity|qty|weight|volume|dimensions?|capacity|length|width|height|sku|colou?r|colou?rs)$/i
/** Onboarding answers that describe her, not what she says on camera. */
const PROFILE_ONLY = /^(?:niche|profile|audience|angle|note)$/i

const fieldOf = (f: Pick<PlanBFact, 'field'>) => String(f.field ?? '').toLowerCase().replace(/^answer:/, '').trim()

/** What a fact can do in the template. */
export function factRole(f: PlanBFact): 'method' | 'reality' | 'fact' {
  const fld = fieldOf(f)
  if (METHOD_FIELD.test(fld.replace(/_/g, ' '))) return 'method'
  if (f.kind === 'product_fact' && REALITY_FIELD.test(fld)) return 'reality'
  return 'fact'
}

/** A bare spec: a price, size or count alone (a spec field or a short number-led text). */
export function isBareSpec(f: Pick<PlanBFact, 'text' | 'field'>): boolean {
  const t = String(f.text ?? '').trim()
  if (BARE_SPEC_FIELD.test(fieldOf(f))) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length < 4) return true
  const nonNum = words.filter((w) => !/\d/.test(w) && !/^(?:\$|usd|eur|oz|ml|g|kg|lb|lbs|cm|in|inch|inches|pack|pcs|pieces|items|hours?|minutes?)$/i.test(w))
  return nonNum.length < 3
}

/** Can a fact open the video? A specific real fact: a full sentence, not a bare spec, not a profile-only answer. */
export function hookableFact(f: PlanBFact): boolean {
  return !isBareSpec(f) && !PROFILE_ONLY.test(fieldOf(f)) && /[a-z]/.test(f.text)
}

/** Can Plan B run? Her story, or a fact that can open the video (never a bare spec). */
export function planBEligible(input: Pick<PlanBInput, 'story' | 'facts'>): boolean {
  return !!(input.story && input.story.text.trim()) || input.facts.some((f) => String(f.text ?? '').trim() !== '' && hookableFact(f))
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
  let factsUsed = 0, skipped = 0
  const seen = new Set(lines.map((l) => l.line.toLowerCase()))
  const taken = new Set<string>()
  const place = (f: PlanBFact, section: PlanBSection): boolean => {
    if (taken.has(f.id)) return false
    const text = phraseFact(f.text, f.field)
    if (!text || PLACEHOLDER.test(text) || seen.has(text.toLowerCase())) return false
    const n = wordCount(text)
    if (used + n > budget) return false
    sources.set(f.id, { id: f.id, text: f.text, kind: f.kind, field: f.field ?? null })
    lines.push(sourcedLine(sources, section, text, f.id))
    seen.add(text.toLowerCase()); taken.add(f.id)
    used += n; factsUsed++
    return true
  }
  const usable = input.facts.filter((f) => String(f.text ?? '').trim() !== '' && !PROFILE_ONLY.test(fieldOf(f)))
  // No story: the hook is one specific real fact (never a bare spec).
  if (lines.length === 0) {
    const h = usable.find((f) => hookableFact(f) && factRole(f) !== 'reality') ?? usable.find(hookableFact)
    if (h) place(h, 'hook')
  }
  // Method, then at most one sourced reality check, then any other fact.
  for (const f of usable) if (factRole(f) === 'method') place(f, 'method')
  for (const f of usable) if (factRole(f) === 'reality' && place(f, 'reality')) break
  for (const f of usable) if (factRole(f) === 'fact' && !(lines.length === 0 && isBareSpec(f))) place(f, 'fact')
  skipped = input.facts.length - taken.size
  lines.push(sourcedLine(sources, 'cta', ctaSrc.text, ctaSrc.id))
  const sections = { hook: 0, story: 0, method: 0, reality: 0, fact: 0, cta: 0 } as Record<PlanBSection, number>
  for (const l of lines) sections[l.section]++
  return { lines, sources, budget, words: used, story_verbatim: storyVerbatim, facts_used: factsUsed, facts_skipped: skipped, sections }
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
export function planBPolishPrompt(lines: readonly PlanBLine[], voice: { card?: string | null; styleNote?: string | null; rhythm?: string | null } = {}): string {
  const items = lines.map((l, i) => ({ i, line: l.section === 'hook' || l.section === 'story' ? null : l.line }))
  const card = String(voice.card ?? '').trim(), note = String(voice.styleNote ?? '').trim(), rhythm = String(voice.rhythm ?? '').trim()
  return [
    'Polish each line below for natural spoken delivery in HER voice. You only polish wording. Rules:',
    '- Keep every content word, number and name. Add no new noun, number, name or claim.',
    `- You may add one short connector (at most ${CONNECTOR_MAX_WORDS} words) before or after a line, set off by a comma or dash. A connector carries no fact, number, name or claim.`,
    '- Keep the length within 30% of the original. One sentence stays one sentence.',
    ...(card ? [`Her voice card:\n${card.slice(0, 1200)}`] : []),
    ...(note ? [`Her style note: ${note.slice(0, 300)}`] : []),
    // Panel-10: style note, verbatim samples and explicit rhythm rules (voicePolishBrief).
    ...(rhythm ? [rhythm.slice(0, 1500), '- Rhythm rules may reshape sentences, but every content word, number and name still stays.'] : []),
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

/** Ledger → Plan B input: product facts for the target product (confirmed), her facts,
 *  and her answers (onboarding and request answers are first-party items too). An
 *  answered `story` slot is her story when no story item is on file. */
export function planBInputFromLedger(ledger: readonly LedgerItem[], story: { id: string; text: string } | null, targetProductId: string | null, profile: DurationProfile): PlanBInput {
  const facts: PlanBFact[] = []
  const answered = (it: LedgerItem) => it.origin === 'her_answer' && it.id.startsWith('answer:') && it.text.trim().length > 3 && !NON_ANSWER.test(it.text.trim())
  if (!story) {
    const sa = ledger.find((it) => answered(it) && /^(?:story)$/i.test(String(it.field ?? '')))
    if (sa) story = { id: sa.id, text: sa.text }
  }
  for (const it of ledger) {
    if (!it.first_party || !it.text.trim()) continue
    if (story && it.id === story.id) continue
    if (it.origin === 'product_fact' && (!targetProductId || it.product_id === targetProductId)) facts.push({ id: it.id, text: it.text, kind: 'product_fact', field: it.field })
  }
  for (const it of ledger) {
    if (!it.first_party || !it.text.trim() || (story && it.id === story.id)) continue
    if (it.origin === 'her_fact') facts.push({ id: it.id, text: it.text, kind: 'her_fact', field: it.field === 'fact' ? null : it.field })
    else if (answered(it)) facts.push({ id: it.id, text: it.text, kind: 'her_fact', field: it.field })
  }
  const offer = ledger.find((it) => it.origin === 'offer' && it.text.trim())
  return { story, facts, cta: offer ? { id: offer.id, text: offer.text } : null, profile }
}

const NON_ANSWER = /^(?:nothing specific|keep it general|skip|n\/a|none|no|idk|not sure)\b/i
