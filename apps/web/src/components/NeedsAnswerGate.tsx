import { useEffect, useState, type ReactNode } from 'react'
import { trialUser } from './ProductDetailsByKind'

/**
 * Owner rule (13 Oct): a placeholder must never be shown as a finished script.
 *
 * The zero-invention gate can hand back a blueprint that is not ready to record:
 * `needs_answers` (Twin needs facts only she has), `general` (a usable but
 * generic version) or, with the parallel `check_status` field, `unchecked`
 * (the gate has not finished). This screen asks the gate's questions, shows
 * the placeholder lines as gaps, and keeps recording closed until answered.
 *
 * ⚖️ BEHIND THE TRIAL: only the account in `VITE_TRIAL_USER_ID` sees any of it.
 * Every other account gets `null` / "not blocked" — no change at all.
 */

export type CheckStatus = 'checked' | 'needs_answers' | 'general' | 'unchecked'
export interface GateQuestionView { scope: 'script'; kind: string; text: string; writes_to: string }

interface GateBlueprintLike {
  check_status?: unknown
  invention_gate?: { outcome?: unknown } | null
  gate_questions?: unknown
  script?: Array<{ line?: unknown } | null> | null
}

const STATUSES: CheckStatus[] = ['checked', 'needs_answers', 'general', 'unchecked']

/** `check_status` when present, else derived from `invention_gate.outcome`. */
export function checkStatusOf(bp: GateBlueprintLike | null | undefined): CheckStatus {
  const cs = bp?.check_status
  if (typeof cs === 'string' && (STATUSES as string[]).includes(cs)) return cs as CheckStatus
  const outcome = bp?.invention_gate?.outcome
  if (outcome === 'needs_answers') return 'needs_answers'
  if (outcome === 'general') return 'general'
  // No gate record at all, or final/measure_only/timeout: nothing to ask.
  return 'checked'
}

export function gateQuestionsOf(bp: GateBlueprintLike | null | undefined): GateQuestionView[] {
  const q = Array.isArray(bp?.gate_questions) ? (bp!.gate_questions as unknown[]) : []
  return q
    .filter((x): x is GateQuestionView => !!x && typeof (x as GateQuestionView).text === 'string' && typeof (x as GateQuestionView).writes_to === 'string')
    .slice(0, 3)
}

/** Which status the trial user sees; `checked` for everyone else. */
export function gateStatusFor(userId: string | null | undefined, bp: GateBlueprintLike | null | undefined): CheckStatus {
  return trialUser(userId) ? checkStatusOf(bp) : 'checked'
}

/** Record / teleprompter / "use this script" are closed for these. */
export function recordBlocked(status: CheckStatus): boolean {
  return status === 'needs_answers' || status === 'unchecked'
}

export const PLACEHOLDER_RE = /\[Your answer:[^\]]*\]/g

export function hasPlaceholder(line: string): boolean {
  return new RegExp(PLACEHOLDER_RE.source).test(line)
}

/** A line with each placeholder rendered as a visible gap, never as script text. */
export function LineWithGaps({ line }: { line: string }) {
  const parts: ReactNode[] = []
  let last = 0
  const re = new RegExp(PLACEHOLDER_RE.source, 'g')
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index))
    const hint = m[0].replace(/^\[Your answer:\s*/, '').replace(/\]$/, '').trim()
    parts.push(
      <span key={k++} data-testid="script-gap" aria-label={`Missing: ${hint || 'your answer'}`}
        className="mx-0.5 inline-block min-w-[6rem] rounded border border-dashed border-amber/60 bg-amber/5 px-2 text-xs italic text-amber">
        {hint ? `gap: ${hint}` : 'gap'}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < line.length) parts.push(line.slice(last))
  return <>{parts}</>
}

export function ScriptWithGaps({ script }: { script: GateBlueprintLike['script'] }) {
  const lines = (script ?? []).map((s) => (typeof s?.line === 'string' ? s.line : '')).filter((l) => l.trim() !== '')
  return (
    <ol className="space-y-2" data-testid="script-with-gaps">
      {lines.map((l, i) => (
        <li key={i} data-gap={hasPlaceholder(l) ? 'true' : undefined}
          className={hasPlaceholder(l) ? 'rounded border-l-2 border-amber/60 pl-2 text-sm text-stone' : 'pl-2 text-sm text-cream'}>
          <LineWithGaps line={l} />
        </li>
      ))}
    </ol>
  )
}

export function NeedsAnswerCard({ userId, blueprint, onSubmit, onRefresh, pollMs = 10_000, pollForMs = 120_000 }: {
  userId: string | null | undefined
  blueprint: GateBlueprintLike | null | undefined
  /** Answers keyed by each question's `writes_to`. */
  onSubmit: (answers: Record<string, string>) => Promise<void>
  /** Re-read the blueprint (used while `unchecked`). */
  onRefresh?: () => void | Promise<void>
  pollMs?: number
  pollForMs?: number
}) {
  const status = gateStatusFor(userId, blueprint)
  const questions = gateQuestionsOf(blueprint)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'unchecked' || !onRefresh) return
    const started = Date.now()
    const t = setInterval(() => {
      if (Date.now() - started >= pollForMs) { clearInterval(t); return }
      void onRefresh()
    }, pollMs)
    return () => clearInterval(t)
  }, [status, onRefresh, pollMs, pollForMs])

  if (status === 'checked') return null

  if (status === 'unchecked') {
    return (
      <div role="status" data-testid="gate-unchecked" className="rounded-card border border-white/10 bg-ink2/60 p-4 text-sm text-stone">
        Twin is still checking this script
      </div>
    )
  }

  const filled = questions.filter((q) => (answers[q.writes_to] ?? '').trim() !== '')
  const ready = status === 'needs_answers' ? filled.length === questions.length && questions.length > 0 : filled.length > 0

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const out: Record<string, string> = {}
      for (const q of filled) out[q.writes_to] = answers[q.writes_to].trim()
      await onSubmit(out)
    } catch (e) {
      setErr((e as Error)?.message || 'Could not send your answers')
    } finally { setBusy(false) }
  }

  const n = questions.length
  return (
    <div data-testid={status === 'needs_answers' ? 'gate-needs-answers' : 'gate-general'}
      className="space-y-3 rounded-card border border-amber/40 bg-amber/5 p-4">
      <p className="text-sm font-semibold text-cream">
        {status === 'needs_answers'
          ? `Twin needs ${n} answer${n === 1 ? '' : 's'} before this script is ready`
          : 'This is a general version — add a real detail to make it yours'}
      </p>
      {questions.map((q) => (
        <label key={q.writes_to} className="block space-y-1">
          <span className="text-xs text-stone">{q.text}</span>
          <input type="text" value={answers[q.writes_to] ?? ''} aria-label={q.text}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.writes_to]: e.target.value }))}
            className="w-full rounded border border-white/10 bg-ink px-3 py-1.5 text-sm text-cream" />
        </label>
      ))}
      {err && <p className="text-xs text-amber">{err}</p>}
      <button type="button" disabled={!ready || busy} onClick={submit}
        className="btn-gradient py-2 text-xs font-semibold disabled:opacity-50">
        {busy ? 'Rewriting…' : 'Send answers and rewrite'}
      </button>
    </div>
  )
}
