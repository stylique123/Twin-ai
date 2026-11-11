// FACTS-ONLY WRITER (panel 13c → panel 14; FACTS_ONLY_WRITER, default OFF,
// panel and test accounts only). Panel 13c: 14 of 62 scripts carried a line
// the creator never said; the writer filled gaps. This module makes that
// impossible in three steps, all pure:
//
//   1. NEEDS. From the request, what the script must have: a real story or
//      proof, the product's name / size / price / use, her opinion, her steps.
//   2. MATCH. Each need against her FACT LEDGER (creator_knowledge rows: her
//      extracted material, her posts, her answers, each with an id). Missing
//      needs become specific questions (max 3), never asked twice: a topic she
//      answered, skipped or was already asked is never asked again, and a
//      reworded duplicate is caught by topic key and by wording overlap.
//   3. BACK. After writing, every factual sentence must point to a ledger fact
//      id; one that does not is cut. Hooks, transitions and the CTA may be
//      generic, but may not state a number, event, feeling or fact she did not
//      say; an opinion line needs an opinion of hers.
//
// THRESHOLD (proposal): write when every need is covered; write a SHORTER
// script from her facts only when at least FACT_THRESHOLD (2) ledger facts fit
// the request, and ask for the rest; otherwise stop and ask.

export const FACT_THRESHOLD = 2
export const MAX_QUESTIONS = 3

export type FactSource = 'material' | 'post' | 'answer'
export interface LedgerFact { id: string; kind: string; text: string; source: FactSource; topic?: string | null; product_id?: string | null }
export type NeedKind = 'story' | 'product_name' | 'size' | 'price' | 'usage' | 'opinion' | 'steps'
export interface Need { key: string; kind: NeedKind; question: string }
export interface AskRecord { topic: string; wording?: string; outcome: 'shown' | 'answered' | 'skipped' | 'filler' | 'nothing'; request_key?: string | null }
export interface FactsRequest { note: string; goal?: string | null; kind?: string | null; product?: { id: string; name: string } | null }

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from', 'is', 'are', 'was', 'were', 'it', 'its', 'this', 'that', 'my', 'your', 'our', 'i', 'we', 'you', 'be', 'as', 'so', 'no', 'not', 'how', 'why', 'what', 'when', 'do', 'does', 'did', 'about', 'video', 'use', 'shape', 'copy', 'remix', 'structure', 'format', 'pacing', 'stay', 'close', 'this', 'these', 'those', 'things', 'thing', 'just', 'really', 'one', 'only', 'have', 'has', 'had', 'they', 'them', 'their', 'there', 'here', 'which', 'will', 'would', 'should', 'could', 'can', 'into', 'more', 'most', 'very', 'like', 'than', 'then', 'out', 'up', 'off', 'if', 'me'])
const toks = (t: string) => String(t ?? '').toLowerCase().replace(/[’']s\b/g, '').replace(/[’']/g, '').match(/[a-z0-9$]+(?:-[a-z0-9]+)*/g) ?? []
const stems = (t: string) => new Set(toks(t).flatMap((w) => w.split('-')).filter((w) => /\d/.test(w) || (w.length >= 4 && !STOP.has(w))).map((w) => (/\d/.test(w) ? w.replace(/^\$/, '') : w.slice(0, 5))))
const slug = (t: string) => [...stems(t)].sort().slice(0, 6).join('-') || 'general'

const PRICE = /\$\s?\d|\b\d+(?:\.\d+)?\s?(?:dollars|usd|eur|euros|gbp|pounds)\b|[£€]\s?\d/i
const SIZE = /\b\d+(?:\.\d+)?\s?(?:oz|ml|l|g|kg|lb|lbs|cm|mm|m|in|inch|inches)\b/i
const STORY_KINDS = new Set(['experience', 'story', 'event', 'answer', 'lesson', 'mistake'])
const OPINION_KINDS = new Set(['opinion', 'belief'])
const STEP_KINDS = new Set(['framework', 'steps', 'process'])

/** 1. What this request needs. */
export function needsFor(req: FactsRequest): Need[] {
  const note = String(req.note ?? '').trim()
  const goal = String(req.goal ?? '').toLowerCase()
  const kind = String(req.kind ?? '').toLowerCase()
  const t = slug(note)
  const out: Need[] = []
  const p = req.product
  if (p?.id) {
    out.push({ key: `product:${p.id}:name`, kind: 'product_name', question: `What exactly is ${p.name}, in one line: what it is and who it is for?` })
    out.push({ key: `product:${p.id}:usage`, kind: 'usage', question: `How do you or your customers actually use ${p.name}, day to day?` })
    if (/sell|leads|launch/.test(goal) || /sell|leads/.test(kind)) out.push({ key: `product:${p.id}:price`, kind: 'price', question: `What does ${p.name} cost right now, and what does that price include?` })
  }
  const storyShaped = /\b(?:story|the day|the time|first|when i|how i (?:started|got)|went wrong|mistake|nearly|almost|confession|before and after)\b/i.test(note) || kind === 'story'
  const opinionShaped = /\b(?:why|my take|belief|myth|hot take|should(?:n'?t)?|gets wrong)\b/i.test(note)
  const stepsShaped = /\b(?:how to|steps?|routine|check|guide|tell if|know if|choose|wash|learn|fix(?:es)?|change that)\b/i.test(note) || (goal === 'educate' && !storyShaped && !opinionShaped)
  if (storyShaped) out.push({ key: `story:${t}`, kind: 'story', question: `For "${note}": what actually happened? One real moment in your own words: when it was, what went on, and what you did.` })
  if (opinionShaped) out.push({ key: `opinion:${t}`, kind: 'opinion', question: `For "${note}": what is your own view, and what made you think that?` })
  if (stepsShaped) out.push({ key: `steps:${t}`, kind: 'steps', question: `For "${note}": what are the exact steps you follow, in order?` })
  if (!out.length) out.push({ key: `story:${t}`, kind: 'story', question: `For "${note}": what is one real thing that happened to you or a customer that shows this?` })
  return out
}

/** Ledger facts that fit the request: her facts sharing a topic word, plus the product's own facts. */
export function relevantFacts(req: FactsRequest, ledger: readonly LedgerFact[]): LedgerFact[] {
  const want = stems(`${req.note} ${req.product?.name ?? ''}`)
  return ledger.filter((f) => (req.product?.id && f.product_id === req.product.id) || [...stems(f.text)].some((w) => want.has(w)))
}

/** 2. Which ledger facts back one need (empty = missing). */
export function factsForNeed(need: Need, req: FactsRequest, ledger: readonly LedgerFact[]): LedgerFact[] {
  const answered = ledger.filter((f) => f.topic === need.key)
  if (answered.length) return answered
  const pid = req.product?.id
  const own = pid ? ledger.filter((f) => f.product_id === pid) : []
  const topic = stems(req.note)
  const overlap = (f: LedgerFact) => [...stems(f.text)].filter((w) => topic.has(w)).length
  switch (need.kind) {
    case 'product_name': {
      // What it is: her own line that names it, else a product fact that is not a price or size.
      const named = ledger.filter((f) => req.product?.name && f.text.toLowerCase().includes(req.product.name.toLowerCase()))
        .sort((a, b) => Number(b.product_id === pid) - Number(a.product_id === pid))
      return (named.length ? named : own.filter((f) => !PRICE.test(f.text) && !SIZE.test(f.text))).slice(0, 1)
    }
    case 'price': return own.filter((f) => PRICE.test(f.text))
    case 'size': return own.filter((f) => SIZE.test(f.text))
    case 'usage': return own.filter((f) => !PRICE.test(f.text) && !SIZE.test(f.text))
    case 'story': return ledger.filter((f) => STORY_KINDS.has(f.kind) && overlap(f) >= Math.min(2, topic.size))
    case 'opinion': return ledger.filter((f) => OPINION_KINDS.has(f.kind) && overlap(f) >= 1)
    case 'steps': return ledger.filter((f) => STEP_KINDS.has(f.kind) && overlap(f) >= Math.min(2, topic.size))
  }
}

const jaccard = (a: string, b: string) => { const A = stems(a), B = stems(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / (A.size + B.size - n) }

/** True when this need was already answered, or already asked (by topic or by near-same wording). */
export function alreadyAsked(need: Need, ledger: readonly LedgerFact[], history: readonly AskRecord[]): boolean {
  if (ledger.some((f) => f.topic === need.key)) return true
  return history.some((h) => h.topic === need.key || (h.wording ? jaccard(h.wording, need.question) >= 0.6 : false))
}

export type FactsDecision =
  | { action: 'write'; needs: Need[]; facts: LedgerFact[]; questions: [] }
  | { action: 'write_short'; needs: Need[]; facts: LedgerFact[]; questions: Need[] }
  | { action: 'needs_answers'; needs: Need[]; facts: LedgerFact[]; questions: Need[] }
  | { action: 'cannot_write'; needs: Need[]; facts: LedgerFact[]; questions: [] }

/** 2 + 3. Write, write short and ask, or stop and ask. */
export function decideFacts(req: FactsRequest, ledger: readonly LedgerFact[], history: readonly AskRecord[] = [], threshold = FACT_THRESHOLD): FactsDecision {
  const needs = needsFor(req)
  const missing = needs.filter((n) => factsForNeed(n, req, ledger).length === 0)
  const facts = relevantFacts(req, ledger)
  if (!missing.length) return { action: 'write', needs, facts, questions: [] }
  const questions: Need[] = []
  for (const n of missing) {
    if (questions.length >= MAX_QUESTIONS) break
    if (alreadyAsked(n, ledger, history)) continue
    if (questions.some((q) => q.key === n.key || jaccard(q.question, n.question) >= 0.6)) continue
    questions.push(n)
  }
  if (facts.length >= threshold) return { action: 'write_short', needs, facts, questions }
  if (questions.length) return { action: 'needs_answers', needs, facts, questions }
  return { action: 'cannot_write', needs, facts, questions: [] }
}

// ── 3. EVERY SENTENCE BACKED ────────────────────────────────────────────────
const FEELING = /\b(?:love[ds]?|hate[ds]?|felt|feel|scared|afraid|proud|terrified|nervous|excited|thrilled|angry|cried|happy|sad|worried|relieved|embarrass\w*)\b/i
const EVENT = /\b(?:i|we|my|our)\s+(?:\w+\s+){0,2}(?:was|were|had|did|made|built|lost|found|tried|started|threw|sold|spent|learned|realised|realized|bought|opened|fixed|glazed|roasted|answered|got)\b/i
const OPINION = /\b(?:i think|i believe|in my (?:view|opinion|experience)|honestly|i(?:'m| am) convinced|to me)\b/i
const sentencesOf = (l: string) => String(l ?? '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

/** True when a sentence states something: a number, an event, a feeling, an opinion, or a product name. */
export function isFactual(s: string, productNames: readonly string[] = []): boolean {
  const low = s.toLowerCase()
  return /\d/.test(s) || PRICE.test(s) || FEELING.test(s) || EVENT.test(s) || OPINION.test(s) || productNames.some((n) => n && low.includes(n.toLowerCase()))
}

/** The ledger fact that backs a factual sentence, or null. Numbers must match exactly. */
export function backingFact(s: string, ledger: readonly LedgerFact[]): LedgerFact | null {
  const nums = toks(s).filter((w) => /\d/.test(w)).map((w) => w.replace(/^\$/, ''))
  const ss = stems(s)
  const opinion = OPINION.test(s)
  let best: { f: LedgerFact; score: number } | null = null
  for (const f of ledger) {
    if (opinion && !OPINION_KINDS.has(f.kind) && f.source !== 'answer' && !OPINION.test(f.text)) continue
    const fs = stems(f.text)
    if (nums.some((n) => !fs.has(n))) continue
    let hit = 0
    for (const w of ss) if (fs.has(w)) hit++
    const score = hit / Math.max(1, ss.size)
    if ((score >= 0.5 || hit >= 3) && (!best || score > best.score)) best = { f, score }
  }
  return best?.f ?? null
}

export interface BackedCut { cut: number; backed: number; generic: number }

/**
 * Every factual sentence must point to a ledger fact id; one that does not is
 * cut (a beat left empty is dropped while `floor` spoken beats remain).
 * Generic lines (no number, event, feeling, opinion or product name) stay.
 * Each kept beat carries `fact_ids`.
 */
export function backEveryLine<T extends { line?: unknown }>(beats: readonly T[], ledger: readonly LedgerFact[], opts: { productNames?: readonly string[]; floor?: number } = {}): { beats: Array<T & { fact_ids: string[] }>; cut: BackedCut } {
  const floor = opts.floor ?? 2
  const names = opts.productNames ?? []
  const rec: BackedCut = { cut: 0, backed: 0, generic: 0 }
  let spoken = beats.filter((b) => typeof b?.line === 'string' && String(b.line).trim()).length
  const out: Array<T & { fact_ids: string[] }> = []
  for (const b of beats) {
    if (typeof b?.line !== 'string' || !b.line.trim()) { out.push({ ...b, fact_ids: [] }); continue }
    const ids: string[] = []
    const kept: string[] = []
    for (const s of sentencesOf(b.line)) {
      if (!isFactual(s, names)) { rec.generic++; kept.push(s); continue }
      const f = backingFact(s, ledger)
      if (f) { rec.backed++; ids.push(f.id); kept.push(s); continue }
      rec.cut++
    }
    if (!kept.length) {
      if (spoken - 1 >= floor) { spoken--; continue }
      out.push({ ...b, fact_ids: ids }); continue
    }
    out.push({ ...b, line: kept.join(' '), fact_ids: [...new Set(ids)] })
  }
  return { beats: out, cut: rec }
}
