// GENERATED FROM packages/shared/src/script/checkLines.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// CHECK THIS LINE (backlog item d; trial only, behind a kill switch).
//
// A gate REVIEW line ships as written: only one judge flagged an invention, or
// a rule (RULE_REVIEW_REASONS) sent it to review. The creator is asked to check
// it: CONFIRM (it is true for her, so it is saved as her fact and the line
// stays), EDIT (her text replaces the line, then the deterministic guards run
// on it) or REMOVE (the line is dropped).
//
// Pure: no I/O, no model call. The worker builds `blueprint.check_lines` after
// the gate (`buildCheckLines`); the edge applies a decision
// (`applyCheckLineDecision`) and does the writes. Records and logs hold the
// line index, the reason id and offsets, never text.
import { extractSentences, type GateBlueprint, type GateReason, type Surface } from './inventionGate.ts'

export const CHECK_LINES_VERSION = 'check-lines-v1'
export type CheckLineDecision = 'confirm' | 'edit' | 'remove'
export const CHECK_LINE_DECISIONS: readonly CheckLineDecision[] = ['confirm', 'edit', 'remove']
/** Her edited line, at most (a spoken line, not an essay). */
export const CHECK_LINE_TEXT_MAX = 400

export interface CheckLine {
  /** Index into blueprint.script. */
  line_index: number
  /** The gate reason id. */
  reason: GateReason | 'unknown'
  /** The offending sentence's offsets inside the line text. */
  span: { start: number; end: number }
  /** Set once she decides. */
  decision?: CheckLineDecision
}

export interface CheckLineRecord {
  line_index: number
  decision: CheckLineDecision
  reason: GateReason | 'unknown'
  at: string
  /** edit only: guard rule ids that trimmed her text (ids, never text). */
  guard_rules?: string[]
}

type ReviewLine = { i: number; surface: Surface; reason?: GateReason }
type Beat = { line?: unknown; [k: string]: unknown }

const scriptOf = (bp: Record<string, unknown>): Beat[] => (Array.isArray(bp.script) ? bp.script as Beat[] : [])

/** The script REVIEW lines of a gated blueprint, one per sentence, in order.
 *  Non-script surfaces are not offered (they paraphrase a script line). */
export function buildCheckLines(bp: GateBlueprint, review: readonly ReviewLine[] | null | undefined): CheckLine[] {
  if (!review?.length) return []
  const sentences = extractSentences(bp)
  const script = scriptOf(bp as Record<string, unknown>)
  const out: CheckLine[] = []
  for (const r of review) {
    if (r.surface !== 'script') continue
    const s = sentences[r.i]
    if (!s || s.surface !== 'script') continue
    const line = String(script[s.at]?.line ?? '')
    const start = line.indexOf(s.text)
    if (start < 0) continue
    out.push({ line_index: s.at, reason: r.reason ?? 'unknown', span: { start, end: start + s.text.length } })
  }
  return out
}

/** Log shape for check_lines: indices, reasons and offsets only. */
export function checkLinesLog(lines: readonly CheckLine[]): Array<{ line_index: number; reason: string; start: number; end: number }> {
  return lines.map((l) => ({ line_index: l.line_index, reason: l.reason, start: l.span.start, end: l.span.end }))
}

export interface DecisionInput {
  blueprint: Record<string, unknown>
  line_index: unknown
  decision: unknown
  text?: unknown
  /** The deterministic guards on one line: returns the kept text ('' = all dropped) and the rule ids hit. */
  guard: (line: string) => { line: string; rules: string[] }
  now?: string
}

export type DecisionResult =
  | { ok: true; blueprint: Record<string, unknown>; decision: CheckLineDecision; line_index: number; reason: string; fact: string | null; line: string | null }
  | { ok: false; code: 'bad_decision' | 'bad_index' | 'not_a_check_line' | 'already_decided' | 'text_required' | 'text_too_long' | 'guard_dropped'; rules?: string[] }

/** Apply one decision to a blueprint. Returns a NEW blueprint; the input is not mutated.
 *  confirm → the line stays, `fact` is the sentence she confirmed (to save as hers);
 *  edit    → her text (after the guards) replaces the line;
 *  remove  → the beat is dropped and later check lines shift down. */
export function applyCheckLineDecision(input: DecisionInput): DecisionResult {
  const decision = input.decision as CheckLineDecision
  if (!CHECK_LINE_DECISIONS.includes(decision)) return { ok: false, code: 'bad_decision' }
  const idx = input.line_index
  if (!Number.isInteger(idx) || (idx as number) < 0) return { ok: false, code: 'bad_index' }
  const bp = input.blueprint
  const script = scriptOf(bp)
  const lines = Array.isArray(bp.check_lines) ? bp.check_lines as CheckLine[] : []
  const pending = lines.filter((l) => l?.line_index === idx)
  if (!pending.length || !script[idx as number]) return { ok: false, code: 'not_a_check_line' }
  if (pending.every((l) => l.decision)) return { ok: false, code: 'already_decided' }
  const reason = pending[0]!.reason
  const at = input.now ?? new Date().toISOString()
  const i = idx as number
  const lineText = String(script[i]!.line ?? '')
  let nextScript = script
  let nextLines: CheckLine[] = lines.map((l) => (l?.line_index === i ? { ...l, decision } : l))
  let fact: string | null = null
  let line: string | null = lineText
  let guardRules: string[] | undefined
  if (decision === 'confirm') {
    fact = pending.map((l) => lineText.slice(l.span.start, l.span.end)).join(' ').trim() || lineText.trim()
  } else if (decision === 'edit') {
    if (typeof input.text !== 'string' || !input.text.trim()) return { ok: false, code: 'text_required' }
    const typed = input.text.trim().replace(/\s+/g, ' ')
    if (typed.length > CHECK_LINE_TEXT_MAX) return { ok: false, code: 'text_too_long' }
    const g = input.guard(typed)
    if (!g.line.trim()) return { ok: false, code: 'guard_dropped', rules: g.rules }
    if (g.rules.length) guardRules = g.rules
    line = g.line.trim()
    nextScript = script.map((b, k) => (k === i ? { ...b, line } : b))
  } else {
    line = null
    nextScript = script.filter((_, k) => k !== i)
    nextLines = nextLines.map((l) => (l && l.line_index > i ? { ...l, line_index: l.line_index - 1 } : l))
  }
  // Earlier decisions on later lines shift with a removal, like the lines do.
  const prior = (Array.isArray(bp.check_line_decisions) ? bp.check_line_decisions as CheckLineRecord[] : [])
    .map((d) => (decision === 'remove' && d && d.line_index > i ? { ...d, line_index: d.line_index - 1 } : d))
  const rec: CheckLineRecord = { line_index: i, decision, reason, at, ...(guardRules ? { guard_rules: guardRules } : {}) }
  return {
    ok: true,
    blueprint: { ...bp, script: nextScript, check_lines: nextLines, check_line_decisions: [...prior, rec] },
    decision, line_index: i, reason, fact, line,
  }
}

/** The knowledge source a confirmed check line is saved under. */
export const CHECK_LINE_SOURCE = 'check_line'

/** The kill switch: on unless the edge env CHECK_LINE_KILL is exactly '1'. */
export function checkLineOn(kill: unknown): boolean {
  return String(kill ?? '').trim() !== '1'
}
