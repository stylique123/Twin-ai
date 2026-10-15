// QUESTION-USEFULNESS (Master Prompt v3, 15 Oct). Plugs into the Need Check
// (itemFormat.ts needCheck): a question is asked only when the missing piece is
// required by the chosen angle or template, is not on file, and the answer
// would change the script. At most three, one piece each, ranked story →
// product slot → niche → profile (profile once). Never a presumed event, a date
// or scarcity. Skip always works. Pure; records carry ids and counts, no text.

import type { Slot } from './itemFormat.js'

export type QuestionKind = 'story' | 'product_slot' | 'niche' | 'profile'
const RANK: Record<QuestionKind, number> = { story: 0, product_slot: 1, niche: 2, profile: 3 }

export interface QuestionCandidate {
  kind: QuestionKind
  /** The one piece asked for (a slot or a profile field). */
  piece: string
  /** What the writer falls back to if unanswered. */
  fallback: 'invented' | 'general' | 'none'
}

export interface UsefulnessInput {
  candidates: readonly QuestionCandidate[]
  /** Slots required by the chosen angle and template. */
  required: readonly Slot[]
  /** Slots already on file. */
  onFile: readonly Slot[]
  /** Profile already asked in an earlier request. */
  profileAsked?: boolean
}

export interface UsefulQuestion extends QuestionCandidate { skippable: true }

const FORBIDDEN_PIECE = /date|deadline|when|launch|event|urgency|scarcity|stock|limited|sold_?out|countdown/i

export function isForbiddenPiece(piece: string): boolean { return FORBIDDEN_PIECE.test(piece) }

export function usefulQuestions(i: UsefulnessInput): UsefulQuestion[] {
  const req = new Set(i.required)
  const have = new Set(i.onFile)
  const seen = new Set<string>()
  let profile = !!i.profileAsked
  const out: UsefulQuestion[] = []
  const sorted = [...i.candidates].sort((a, b) => RANK[a.kind] - RANK[b.kind])
  for (const c of sorted) {
    if (out.length === 3) break
    if (isForbiddenPiece(c.piece) || seen.has(c.piece)) continue
    if (c.kind === 'profile') { if (profile) continue; profile = true } else {
      if (!req.has(c.piece as Slot) || have.has(c.piece as Slot)) continue
    }
    // The answer must change the script: a piece with no fallback cost does not.
    if (c.fallback === 'none' && c.kind !== 'profile') continue
    seen.add(c.piece)
    out.push({ ...c, skippable: true })
  }
  return out
}

/** Need Check ask list → candidates, using the angle's gaps for the product piece. */
export function candidatesFromNeedCheck(ask: readonly string[], gaps: readonly Slot[]): QuestionCandidate[] {
  const out: QuestionCandidate[] = []
  for (const a of ask) {
    if (a === 'catalyst') out.push({ kind: 'story', piece: 'story', fallback: 'invented' })
    else if (a === 'product_slot') { for (const g of gaps) if (g !== 'story') out.push({ kind: 'product_slot', piece: g, fallback: 'general' }) }
    else if (a === 'profile') out.push({ kind: 'profile', piece: 'profile', fallback: 'general' })
  }
  return out
}

/** question_necessity: per asked piece, which fallback the question avoided. */
export function questionNecessity(qs: readonly UsefulQuestion[]) {
  return {
    asked: qs.length,
    avoided_invented: qs.filter((q) => q.fallback === 'invented').length,
    avoided_general: qs.filter((q) => q.fallback === 'general').length,
    pieces: qs.map((q) => ({ kind: q.kind, piece: q.piece, avoided: q.fallback })),
  }
}

const words = (t: string): string[] => t.toLowerCase().match(/[a-z0-9']{4,}/g) ?? []

/** question_use: which answer keys reach the final script (≥3 shared content words, or all of a short answer). */
export function questionUse(answers: Record<string, unknown>, lines: readonly string[]) {
  const script = new Set(words(lines.join(' ')))
  const used: string[] = []
  let answered = 0
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (typeof v !== 'string' || !v.trim()) continue
    answered++
    const w = [...new Set(words(v))]
    if (!w.length) continue
    const hit = w.filter((x) => script.has(x)).length
    if (hit >= Math.min(3, w.length)) used.push(k)
  }
  return { answered, used: used.length, used_keys: used }
}
