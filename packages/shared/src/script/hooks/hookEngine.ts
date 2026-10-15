// THE HOOK ENGINE (A5): candidates → gate → score → pick, on top of the shape
// library in hookShapes.ts.
//
// 1. The writer is asked, IN ITS EXISTING CALL, for 8–10 hook candidates spread
//    across the eligible shapes (`renderHookCandidateRule`). No new model call.
// 2. Each candidate is gated by the cheap invention-gate rules the shape
//    library already carries (`checkHookAgainstShape`): no number not in an
//    item, no universal quantifier without a count, no invented experience.
// 3. Each candidate is scored deterministically on shape fit, specificity (how
//    much of it is drawn from her own ledger items) and length.
// 4. The top 3 passing candidates are picked, preferring distinct shapes.
// 5. The record (`hook_candidates`) carries counts, shape ids, scores and
//    pass/fail reasons — never the candidate text — so it is safe to log.
//
// ⚖️ PURE AND DETERMINISTIC. No I/O, no model calls, no clock.
// Every example in tests is made up; none is creator or third-party text.

import type { LedgerItem } from '../inventionGate.js'
import { contentWords, wordCount } from '../inventionGate.js'
import { hookShape, eligibleShapes, checkHookAgainstShape, hookNumbers, type HookShape } from './hookShapes.js'

export const HOOK_CANDIDATE_MIN = 8
export const HOOK_CANDIDATE_MAX = 10
export const HOOK_PICK_COUNT = 3

/** Score weights. Sum to 1. */
export const HOOK_SCORE_WEIGHTS = { fit: 0.4, specificity: 0.4, length: 0.2 } as const

export interface HookCandidateInput { shape?: unknown; text?: unknown }

export interface HookCandidateScore { fit: number; specificity: number; length: number; total: number }

export interface HookCandidateRecord {
  index: number
  shape: string
  ok: boolean
  /** Failed rule ids (empty when ok). */
  reasons: string[]
  words: number
  score: HookCandidateScore
}

export interface HookCandidatesRecord {
  eligible_shapes: string[]
  requested: number
  received: number
  passed: number
  failed: number
  shapes_used: number
  candidates: HookCandidateRecord[]
}

export interface HookPick {
  indices: number[]
  shapes: string[]
  scores: number[]
  /** The picked hook lines (blueprint only; never logged). */
  hooks: string[]
}

/**
 * Shape quota for N candidates: round-robin over the eligible shapes, so the
 * spread is as even as N allows. Empty when no shape is eligible.
 */
export function candidateQuota(eligible: readonly HookShape[], n = 9): string[] {
  if (eligible.length === 0) return []
  const count = Math.max(HOOK_CANDIDATE_MIN, Math.min(HOOK_CANDIDATE_MAX, n))
  return Array.from({ length: count }, (_, i) => eligible[i % eligible.length]!.id)
}

/** The writer-prompt block that asks for candidates in the same response. '' when nothing is eligible. */
export function renderHookCandidateRule(ledger: readonly LedgerItem[]): string {
  const eligible = eligibleShapes(ledger)
  const quota = candidateQuota(eligible)
  if (quota.length === 0) return ''
  const per = new Map<string, number>()
  for (const id of quota) per.set(id, (per.get(id) ?? 0) + 1)
  const lines = eligible.map((s) => `  - ${s.id} (${per.get(s.id) ?? 0}): ${s.pattern}`)
  return [
    `HOOK CANDIDATES: also return hook_candidates, ${quota.length} entries of { shape, text }, spread across these shapes (count in brackets):`,
    ...lines,
    '  Each text is one spoken line built only from the material above. Use no number that is not in her material, no "everyone", "nobody" or "most" without a real count, and no first-person event she did not tell you about.',
  ].join('\n')
}

function round3(n: number): number { return Math.round(n * 1000) / 1000 }

/** 1 inside 6–12 words, falling off linearly to 0 at 2 and at 24. */
export function lengthScore(words: number): number {
  if (words >= 6 && words <= 12) return 1
  if (words < 6) return Math.max(0, (words - 2) / 4)
  return Math.max(0, (24 - words) / 12)
}

/** Share of the hook's content words found in her first-party ledger items (her own material). */
export function specificityScore(text: string, ledger: readonly LedgerItem[]): number {
  const hook = contentWords(text)
  if (hook.size === 0) return 0
  const own = new Set<string>()
  for (const it of ledger) if (it.first_party) for (const w of contentWords(it.text)) own.add(w)
  let hit = 0
  for (const w of hook) if (own.has(w)) hit++
  return hit / hook.size
}

/** Shape fit: the shape is known and eligible (0.5), and the cheap check passes (0.5). */
function fitScore(shape: HookShape | undefined, eligibleIds: Set<string>, ok: boolean): number {
  if (!shape) return 0
  return (eligibleIds.has(shape.id) ? 0.5 : 0) + (ok ? 0.5 : 0)
}

export function scoreCandidates(
  candidates: readonly HookCandidateInput[],
  ledger: readonly LedgerItem[],
): { records: HookCandidateRecord[]; texts: string[] } {
  const eligibleIds = new Set(eligibleShapes(ledger).map((s) => s.id))
  const records: HookCandidateRecord[] = []
  const texts: string[] = []
  candidates.slice(0, HOOK_CANDIDATE_MAX).forEach((c, index) => {
    const text = typeof c?.text === 'string' ? c.text.trim() : ''
    const shapeId = typeof c?.shape === 'string' ? c.shape.trim() : ''
    const shape = hookShape(shapeId)
    const reasons: string[] = []
    if (!text) reasons.push('empty')
    if (!shape) reasons.push('unknown_shape')
    let ok = false
    if (text && shape) {
      const check = checkHookAgainstShape(text, shape, ledger)
      for (const i of check.issues) if (!reasons.includes(i.rule)) reasons.push(i.rule)
      // The invention-gate rule holds for EVERY shape, not only the ones that
      // list `unbacked_number`: no number in a hook that no item carries.
      const ledgerNums = new Set(ledger.flatMap((it) => it.numbers.map((n) => n.value)))
      const unbacked = hookNumbers(text).some((n) => !ledgerNums.has(n))
      if (unbacked && !reasons.includes('unbacked_number')) reasons.push('unbacked_number')
      ok = check.ok && !unbacked
    }
    const words = text ? wordCount(text) : 0
    const fit = fitScore(shape, eligibleIds, ok)
    const specificity = text ? specificityScore(text, ledger) : 0
    const length = lengthScore(words)
    const total = HOOK_SCORE_WEIGHTS.fit * fit + HOOK_SCORE_WEIGHTS.specificity * specificity + HOOK_SCORE_WEIGHTS.length * length
    records.push({
      index, shape: shape ? shape.id : 'unknown', ok, reasons, words,
      score: { fit: round3(fit), specificity: round3(specificity), length: round3(length), total: round3(total) },
    })
    texts.push(text)
  })
  return { records, texts }
}

/** Top N passing candidates by score; distinct shapes first, ties by index. */
export function pickTop(records: readonly HookCandidateRecord[], n = HOOK_PICK_COUNT): HookCandidateRecord[] {
  const passing = records.filter((r) => r.ok).sort((a, b) => b.score.total - a.score.total || a.index - b.index)
  const out: HookCandidateRecord[] = []
  const seen = new Set<string>()
  for (const r of passing) if (out.length < n && !seen.has(r.shape)) { out.push(r); seen.add(r.shape) }
  for (const r of passing) if (out.length < n && !out.includes(r)) out.push(r)
  return out
}

/** Run the engine over the writer's candidates. */
export function runHookEngine(
  candidates: readonly HookCandidateInput[] | null | undefined,
  ledger: readonly LedgerItem[],
): { record: HookCandidatesRecord; pick: HookPick } {
  const eligible = eligibleShapes(ledger)
  const list = Array.isArray(candidates) ? candidates : []
  const { records, texts } = scoreCandidates(list, ledger)
  const top = pickTop(records)
  const passed = records.filter((r) => r.ok).length
  return {
    record: {
      eligible_shapes: eligible.map((s) => s.id),
      requested: candidateQuota(eligible).length,
      received: list.length,
      passed,
      failed: records.length - passed,
      shapes_used: new Set(records.map((r) => r.shape).filter((s) => s !== 'unknown')).size,
      candidates: records,
    },
    pick: {
      indices: top.map((r) => r.index),
      shapes: top.map((r) => r.shape),
      scores: top.map((r) => r.score.total),
      hooks: top.map((r) => texts[r.index]!),
    },
  }
}
