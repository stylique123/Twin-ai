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
  gate_progress?: unknown
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

/** The durable worker step's progress (`blueprint.gate_progress`), written as the job runs. */
export type GateStep = 'queued' | 'judging' | 'repairing' | 'done' | 'failed'
export interface GateProgressView { step: GateStep; chunks_done: number; chunks_total: number }
const STEPS: GateStep[] = ['queued', 'judging', 'repairing', 'done', 'failed']

export function gateProgressOf(bp: GateBlueprintLike | null | undefined): GateProgressView | null {
  const p = bp?.gate_progress as { step?: unknown; chunks_done?: unknown; chunks_total?: unknown } | null | undefined
  if (!p || typeof p !== 'object' || !(STEPS as unknown[]).includes(p.step)) return null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
  return { step: p.step as GateStep, chunks_done: n(p.chunks_done), chunks_total: n(p.chunks_total) }
}

/** The line shown while the script is 'unchecked'. Never says it is ready. */
export function gateStepText(p: GateProgressView | null): string {
  if (!p) return 'Twin is still checking this script'
  switch (p.step) {
    case 'queued': return 'Twin is about to check every fact in this script'
    case 'judging':
      return p.chunks_total > 0
        ? `Checking every fact against what you gave Twin (${Math.min(p.chunks_done, p.chunks_total)} of ${p.chunks_total} parts)`
        : 'Checking every fact against what you gave Twin'
    case 'repairing': return 'Fixing the lines Twin could not back up'
    case 'done': return 'Check finished, loading the result'
    case 'failed': return 'The check hit a problem; Twin is trying again'
  }
}

/** Record / teleprompter / "use this script" are closed for these. */
export function recordBlocked(status: CheckStatus): boolean {
  return status === 'needs_answers' || status === 'unchecked'
}

/**
 * ⚖️ SKIP ALWAYS WORKS (owner, 13 Oct). The value sent for a question she
 * skips. The server reads it as a non-answer (`isNonAnswer` in
 * generate-blueprint, `isNonAnswerText` in the invention gate): the slot counts
 * as answered, its sentence is dropped or the script goes general, and the
 * same question is never asked again.
 */
export const SKIP_ANSWER = 'Nothing specific, keep it general'

/** Every question gets an answer: her words, or the skip. */
export function answersToSend(questions: GateQuestionView[], answers: Record<string, string>, skipped: Record<string, boolean>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const q of questions) {
    const v = (answers[q.writes_to] ?? '').trim()
    out[q.writes_to] = !skipped[q.writes_to] && v ? v : SKIP_ANSWER
  }
  return out
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

/** How long the screen polls an 'unchecked' script (the worker step targets p90 ≤ 30 s). */
export const UNCHECKED_POLL_FOR_MS = 180_000

export function NeedsAnswerCard({ userId, blueprint, onSubmit, onRefresh, pollMs = 5_000, pollForMs = UNCHECKED_POLL_FOR_MS }: {
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
  const [skipped, setSkipped] = useState<Record<string, boolean>>({})
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
      <div role="status" aria-live="polite" data-testid="gate-unchecked" data-step={gateProgressOf(blueprint)?.step ?? 'unknown'}
        className="rounded-card border border-white/10 bg-ink2/60 p-4 text-sm text-stone">
        <span className="block" data-testid="gate-step">{gateStepText(gateProgressOf(blueprint))}</span>
        <span className="mt-1 block text-xs text-stone/70">Recording opens when the check is done.</span>
      </div>
    )
  }

  // Each question is answered or skipped; nothing else is required.
  const settled = questions.filter((q) => skipped[q.writes_to] || (answers[q.writes_to] ?? '').trim() !== '')
  const ready = questions.length > 0 && settled.length === questions.length

  const send = async (out: Record<string, string>) => {
    setBusy(true); setErr(null)
    try {
      await onSubmit(out)
    } catch (e) {
      setErr((e as Error)?.message || 'Could not send your answers')
    } finally { setBusy(false) }
  }
  const submit = () => send(answersToSend(questions, answers, skipped))
  const writeGeneral = () => send(answersToSend(questions, {}, Object.fromEntries(questions.map((q) => [q.writes_to, true]))))

  const n = questions.length
  return (
    <div data-testid={status === 'needs_answers' ? 'gate-needs-answers' : 'gate-general'}
      className="space-y-3 rounded-card border border-amber/40 bg-amber/5 p-4">
      <p className="text-sm font-semibold text-cream">
        {status === 'needs_answers'
          ? `Twin needs ${n} answer${n === 1 ? '' : 's'} before this script is ready`
          : 'This is a general version — add a real detail to make it yours'}
      </p>
      {questions.map((q) => {
        const isSkipped = !!skipped[q.writes_to]
        return (
          <div key={q.writes_to} className="space-y-1" data-testid="gate-question">
            <label className="block space-y-1">
              <span className="text-xs text-stone">{q.text}</span>
              <input type="text" value={isSkipped ? '' : (answers[q.writes_to] ?? '')} aria-label={q.text} disabled={isSkipped}
                placeholder={isSkipped ? 'Skipped — Twin keeps this part general' : undefined}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.writes_to]: e.target.value }))}
                className="w-full rounded border border-white/10 bg-ink px-3 py-1.5 text-sm text-cream disabled:opacity-60" />
            </label>
            <button type="button" aria-pressed={isSkipped} aria-label={isSkipped ? `Answer this one: ${q.text}` : `Skip this one: ${q.text}`}
              onClick={() => setSkipped((s) => ({ ...s, [q.writes_to]: !isSkipped }))}
              className="text-xs text-stone underline">
              {isSkipped ? 'Answer this one' : 'Skip this one'}
            </button>
          </div>
        )
      })}
      {err && <p className="text-xs text-amber">{err}</p>}
      <button type="button" disabled={!ready || busy} onClick={submit}
        className="btn-gradient py-2 text-xs font-semibold disabled:opacity-50">
        {busy ? 'Rewriting…' : 'Send answers and rewrite'}
      </button>
      {questions.length > 0 && (
        <button type="button" disabled={busy} onClick={writeGeneral}
          className="ml-3 text-xs text-stone underline disabled:opacity-50">
          Write the general version
        </button>
      )}
    </div>
  )
}
