import { useState } from 'react'
import { trialUser } from './ProductDetailsByKind'
import { checkLine, type CheckLineDecision } from '../lib/api'

/**
 * CHECK THIS LINE (backlog d). A gate REVIEW line ships as written; she is
 * asked to check it: "It's true" (saved as her fact), "Edit" or "Remove".
 *
 * ⚖️ BEHIND THE TRIAL: only the account in `VITE_TRIAL_USER_ID` sees it, and
 * `VITE_CHECK_LINE_KILL=1` hides it for everyone. Every other account gets
 * `null` — no change at all. The server enforces the same (test accounts only,
 * CHECK_LINE_KILL).
 */

export interface CheckLineView { line_index: number; reason: string; span: { start: number; end: number }; decision?: string }

export function checkLinesOf(bp: { check_lines?: unknown } | null | undefined): CheckLineView[] {
  const xs = Array.isArray(bp?.check_lines) ? bp!.check_lines as unknown[] : []
  return xs.filter((x): x is CheckLineView => {
    const c = x as Partial<CheckLineView> | null
    return !!c && Number.isInteger(c.line_index) && !!c.span && Number.isInteger(c.span.start) && Number.isInteger(c.span.end)
  })
}

/**
 * Why Twin flagged the line, in plain words. Covers the gate reasons
 * (inventionGate GateReason) and the targeted reasons from #1297
 * (checkLines TargetedReason). Unknown codes get a safe generic sentence.
 */
const REASON_TEXT: Record<string, string> = {
  // targeted flags (#1297)
  absolute_efficacy: 'It promises a result works every time. Is that true for you?',
  invented_team: 'It mentions a team or staff you never told Twin about.',
  invented_origin: 'It tells how you started, and Twin has no story like that from you.',
  invented_habit: 'It says you do something regularly, and Twin never heard that from you.',
  unbacked_number: 'It has a number nothing you gave Twin states.',
  unbacked_name: 'It names someone or something you never mentioned.',
  scarcity_unbacked: 'It says stock or time is running out, and Twin has nothing saying so.',
  // gate reasons
  stronger_than_item: 'It says more than what you told Twin.',
  hyperbole: 'It may overstate things.',
  no_item: 'Nothing you gave Twin backs this up.',
  number_unmatched: "The number doesn't match what you gave Twin.",
  cross_product: 'It may be about a different product.',
  gated_no_first_party: 'It makes a claim only you can confirm.',
  scarcity_not_live: 'It says stock or time is running out, and Twin has nothing saying so.',
  event_unbacked: 'It describes something that happened, and Twin never heard about it from you.',
  invented_quote: 'It quotes someone, and Twin has no such quote from you.',
  opinion_unbacked: "It gives an opinion Twin hasn't heard from you.",
  general_unsourced: 'Twin wrote this without anything you gave it.',
  habit_unbacked: 'It says you do something regularly, and Twin never heard that from you.',
  safety_promise: 'It makes a safety promise. Only keep it if you can stand behind it.',
  first_person_claim: 'It says something about you that Twin could not check.',
  invented_frequency: 'It says how often something happens, and Twin never heard that from you.',
  invented_specific: 'It adds a detail you never gave Twin.',
  advice: 'It gives advice. Make sure it is advice you would give.',
  judge_missing: "Twin couldn't finish checking this line.",
}
export function reasonText(reason: string | null | undefined): string {
  return REASON_TEXT[String(reason ?? '')] ?? "Twin isn't sure this is true for you."
}

export function checkLineVisible(userId: string | null | undefined): boolean {
  return trialUser(userId) && String(import.meta.env.VITE_CHECK_LINE_KILL ?? '').trim() !== '1'
}

type Send = (generationId: string, lineIndex: number, decision: CheckLineDecision, text?: string) => Promise<{ ok: boolean }>

export function CheckThisLine({ userId, generationId, blueprint, onDone, send = checkLine }: {
  userId: string | null | undefined
  generationId: string
  blueprint: { check_lines?: unknown; script?: Array<{ line?: unknown } | null> | null } | null | undefined
  onDone?: () => void
  send?: Send
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!checkLineVisible(userId)) return null
  const script = Array.isArray(blueprint?.script) ? blueprint!.script : []
  const seen = new Set<number>()
  const open = checkLinesOf(blueprint).filter((c) => !c.decision && !seen.has(c.line_index) && seen.add(c.line_index) && typeof script[c.line_index]?.line === 'string')
  if (!open.length) return null
  const decide = async (i: number, d: CheckLineDecision, text?: string) => {
    setBusy(true); setErr(null)
    try {
      const r = await send(generationId, i, d, text)
      if (!r.ok) throw new Error('not saved')
      setEditing(null); setDraft('')
      onDone?.()
    } catch {
      setErr("We couldn't save that — try again.")
    } finally { setBusy(false) }
  }
  return (
    <section aria-label="Check this line" className="rounded-xl border border-amber-300 p-4 space-y-3">
      <h3 className="font-semibold">Check this line</h3>
      <p className="text-sm">Twin isn't sure these are true for you. Keep, change or remove each one.</p>
      {open.map((c) => {
        const line = String(script[c.line_index]?.line ?? '')
        return (
          <div key={c.line_index} data-testid={`check-line-${c.line_index}`} className="space-y-2">
            <p className="text-sm">
              {line.slice(0, c.span.start)}<mark>{line.slice(c.span.start, c.span.end)}</mark>{line.slice(c.span.end)}
            </p>
            <p className="text-xs" data-testid={`check-line-reason-${c.line_index}`}>{reasonText(c.reason)}</p>
            {editing === c.line_index ? (
              <div className="space-y-2">
                <textarea aria-label="Your line" className="w-full rounded border p-2 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button type="button" disabled={busy || !draft.trim()} onClick={() => decide(c.line_index, 'edit', draft)}>Save line</button>
                <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => decide(c.line_index, 'confirm')}>It's true</button>
                <button type="button" disabled={busy} onClick={() => { setEditing(c.line_index); setDraft(line) }}>Edit</button>
                <button type="button" disabled={busy} onClick={() => decide(c.line_index, 'remove')}>Remove</button>
              </div>
            )}
          </div>
        )
      })}
      {err ? <p role="alert" className="text-sm text-red-600">{err}</p> : null}
    </section>
  )
}
