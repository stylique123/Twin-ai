// GENERATED FROM packages/shared/src/script/supportCheck.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// SENTENCE-LEVEL SUPPORT CHECK, SHADOW ONLY (brief item 2.17).
//
// Every spoken sentence must be one of: supported (traces to at most two of
// the items the writer was given), a question to the viewer, a short
// structure line, or the close (the one CTA that restates the offer).
// Anything else is unsupported with reasons in
// {number, name, cause, comparative, low_overlap}.
//
// Word handling reuses provenance.ts (STOPWORDS + stem). Output carries
// indexes, ids and labels — callers log counts only, never text.

import { provenanceWords } from './provenance.ts'

export type SupportType = 'supported' | 'question' | 'structure' | 'close' | 'unsupported'
export type SupportReason = 'number' | 'name' | 'cause' | 'comparative' | 'low_overlap'

export interface SupportItem { id?: unknown; text?: unknown; kind?: unknown }
export interface SupportInput {
  sentences?: readonly unknown[] | null
  items?: readonly SupportItem[] | null
  offerText?: unknown
}
export interface SupportSentence { i: number; type: SupportType; reasons: SupportReason[]; item_ids: string[] }
export interface SupportResult {
  perSentence: SupportSentence[]
  counts: {
    supported: number; question: number; structure: number; close: number; unsupported: number
    by_reason: Record<SupportReason, number>
  }
}

export const SUPPORT_MIN_OVERLAP = 0.6
export const SUPPORT_STRUCTURE_MAX_WORDS = 8

const NUMBER_WORDS = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'twenty', 'thirty', 'forty', 'fifty', 'hundred', 'thousand', 'million', 'dozen',
  'half', 'once', 'twice'])
// Duration nouns: an invented span ("months on shelves") is a number claim.
const DURATION_WORDS = new Set(['minute', 'minutes', 'hour', 'hours', 'day', 'days',
  'week', 'weeks', 'month', 'months', 'year', 'years', 'decade', 'decades'])
const CONNECTIVE = provenanceWords('here what happened happen thing story deal part wait now okay real truth point turn out know tell look listen why how this that guess thought next')
const CTA_WORDS = provenanceWords('order ordering shop grab link bio dm message visit buy get yours tap click comment follow book reserve try today now head check pick')
const CTA_RE = /\b(order|shop|grab|link in (?:my |the )?bio|dm|message me|visit|buy|get yours|tap|click|comment|book|reserve|head to|pick up)\b/i

function rawNumbers(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(m[0].replace(',', ''))
  for (const w of text.toLowerCase().split(/[^a-z]+/)) if (NUMBER_WORDS.has(w) || DURATION_WORDS.has(w)) out.push(w)
  return out
}

function properNouns(sentence: string): string[] {
  const toks = sentence.trim().split(/\s+/)
  const out: string[] = []
  let atStart = true
  for (const t of toks) {
    const w = t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, '')
    if (w && !atStart && /^[A-Z][a-z]/.test(w) && !/^I'/.test(w)) out.push(w.replace(/'s?$/, ''))
    if (w) atStart = /[.!?:]["')]*$/.test(t)
  }
  return out
}

function causeClause(s: string): string | null {
  const m = s.match(/\b(?:because|so that|which is why|that's why|that is why)\b(.*)$/i)
  return m ? m[1]! : null
}
function comparativeSpan(s: string): string | null {
  const m = s.match(/\b(more|less|fewer|better|worse|longer|shorter|faster|slower|\w{3,}er)\b(.*?)\bthan\b(.*?)(?:[,.;!?]|$)/i)
  return m ? m[0] : null
}

function wordCount(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length }

function allIn(words: Set<string>, pool: Set<string>): boolean {
  for (const w of words) if (!pool.has(w)) return false
  return true
}

const normNum = (n: string) => n.replace(/s$/, '')
function numbersSupported(s: string, poolText: string): boolean {
  const pool = new Set(rawNumbers(poolText).map(normNum))
  return rawNumbers(s).every((n) => pool.has(normNum(n)))
}
function namesSupported(s: string, poolWords: Set<string>): boolean {
  return properNouns(s).every((n) => { const w = provenanceWords(n); return w.size === 0 || allIn(w, poolWords) })
}

export function checkSupport(input: SupportInput): SupportResult {
  const items = (input.items ?? [])
    .map((it) => ({ id: String(it?.id ?? '').trim(), text: String(it?.text ?? ''), words: provenanceWords(it?.text) }))
    .filter((it) => it.id !== '' && it.words.size > 0)
  const offerText = String(input.offerText ?? '')
  const offerWords = provenanceWords(offerText)
  const counts: SupportResult['counts'] = {
    supported: 0, question: 0, structure: 0, close: 0, unsupported: 0,
    by_reason: { number: 0, name: 0, cause: 0, comparative: 0, low_overlap: 0 },
  }
  let closeUsed = false
  const perSentence = (input.sentences ?? []).map((raw, i): SupportSentence => {
    const s = String(raw ?? '').trim()
    const sw = provenanceWords(s)
    const done = (type: SupportType, reasons: SupportReason[] = [], item_ids: string[] = []): SupportSentence => {
      counts[type]++
      for (const r of reasons) counts.by_reason[r]++
      return { i, type, reasons, item_ids }
    }
    if (s.endsWith('?')) return done('question')
    if (wordCount(s) <= SUPPORT_STRUCTURE_MAX_WORDS && rawNumbers(s).length === 0 && properNouns(s).length === 0
      && !causeClause(s) && !comparativeSpan(s) && allIn(sw, CONNECTIVE)) return done('structure')
    if (!closeUsed && offerWords.size > 0 && CTA_RE.test(s)) {
      const content = new Set([...sw].filter((w) => !CTA_WORDS.has(w)))
      let hit = 0
      for (const w of content) if (offerWords.has(w)) hit++
      const ratio = content.size === 0 ? 0 : hit / content.size
      if (ratio >= SUPPORT_MIN_OVERLAP && numbersSupported(s, offerText) && namesSupported(s, offerWords)) {
        closeUsed = true
        return done('close')
      }
    }
    // Best single item or best pair, by share of the sentence's words covered.
    let best: { ids: string[]; words: Set<string>; text: string; ratio: number } = { ids: [], words: new Set(), text: '', ratio: 0 }
    const cover = (u: Set<string>) => { if (sw.size === 0) return 0; let h = 0; for (const w of sw) if (u.has(w)) h++; return h / sw.size }
    for (let a = 0; a < items.length; a++) {
      const A = items[a]!
      const r1 = cover(A.words)
      if (r1 > best.ratio) best = { ids: [A.id], words: A.words, text: A.text, ratio: r1 }
      for (let b = a + 1; b < items.length; b++) {
        const B = items[b]!
        const u = new Set([...A.words, ...B.words])
        const r2 = cover(u)
        if (r2 > best.ratio + 1e-9) best = { ids: [A.id, B.id], words: u, text: `${A.text} ${B.text}`, ratio: r2 }
      }
    }
    const reasons: SupportReason[] = []
    if (!numbersSupported(s, best.text)) reasons.push('number')
    if (!namesSupported(s, best.words)) reasons.push('name')
    const cc = causeClause(s)
    if (cc !== null && !allIn(provenanceWords(cc), best.words)) reasons.push('cause')
    const cp = comparativeSpan(s)
    if (cp !== null && !allIn(provenanceWords(cp), best.words)) reasons.push('comparative')
    if (best.ratio < SUPPORT_MIN_OVERLAP) reasons.push('low_overlap')
    return reasons.length ? done('unsupported', reasons, best.ids) : done('supported', [], best.ids)
  })
  return { perSentence, counts }
}
