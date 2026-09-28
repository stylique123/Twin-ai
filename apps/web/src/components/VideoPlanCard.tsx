// WHAT TWIN UNDERSTOOD, SHOWN BEFORE THE CREDIT IS SPENT.
//
// ⚠️ THE THIRD LINE IS WHY THIS SCREEN EXISTS. "The angle" and "What I'll use"
// build confidence; "What I don't have" is where a fabricated claim gets caught
// while it is still free to fix.
//
// ⚠️ OWNER, 2026-09-28: "32 things you've said before" was too vague — she
// could not see or remove anything, and that is where an unwanted story or
// number slips in. The stories and numbers Twin may draw on are now listed one
// by one, each removable; sensitive ones (health, legal, family, hardship) are
// never listed because the writer withholds them unless she raises them. The
// angle shows Twin's reading of the purpose, not her own sentence back. The
// "Don't show this again" opt-out is gone: this is the only place she learns
// something is missing, so the screen is skipped only when nothing is.
//
// ⚖️ ONE SCREEN, AND IT NEVER BLOCKS. "Write it" is always available.
import { Link } from 'react-router-dom'
import { buildVideoPlan, SENSITIVE, type VideoPlanInput } from '@twinai/shared'
import { cn } from '../lib/cn'

/** A story or number Twin may use, with its row id so she can leave it out. */
export interface PlanPick { id: string; kind: string; text: string }

const PICK_KINDS = new Set(['experience', 'story', 'claim', 'number', 'example', 'result'])

/** The stories and numbers worth showing: substance, never sensitive, at most 8. */
export function planPicks(knowledge: readonly { id?: string; kind?: string; text?: string }[] | null | undefined): PlanPick[] {
  const out: PlanPick[] = []
  const seen = new Set<string>()
  for (const k of knowledge ?? []) {
    const id = String(k?.id ?? ''), kind = String(k?.kind ?? ''), text = String(k?.text ?? '').trim()
    if (!id || !text || !PICK_KINDS.has(kind) || SENSITIVE.test(text) || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    out.push({ id, kind, text: text.slice(0, 140) })
    if (out.length >= 8) break
  }
  return out
}

export function VideoPlanCard({
  input, purposeLabel, picks, excluded, onToggle, onWrite, busy = false,
}: {
  input: VideoPlanInput
  /** Twin's reading of why the video exists (Idea Mode), shown instead of her own sentence. */
  purposeLabel?: string | null
  picks: readonly PlanPick[]
  excluded: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Absent when the card sits inside the questions screen, whose own button builds. */
  onWrite?: () => void
  busy?: boolean
}) {
  const plan = buildVideoPlan(input)
  const angle = purposeLabel ? `I read this as ${purposeLabel}. Change it on the questions screen if not.` : plan.angle

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-4" data-testid="video-plan">
      <p className="text-xs uppercase tracking-wide text-stone">Before I write this</p>

      {angle ? (
        <div className="mt-3">
          <p className="text-xs text-stone">The angle</p>
          <p className="mt-0.5 text-sm text-cream">{angle}</p>
        </div>
      ) : null}

      {picks.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-stone">What I may use from you <span className="text-stone/60">— tap one to leave it out</span></p>
          <ul className="mt-1 space-y-1.5">
            {picks.map((p) => {
              const out = excluded.has(p.id)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(p.id)}
                    aria-pressed={!out}
                    className={cn(
                      'w-full rounded-lg border px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors',
                      out ? 'border-white/5 text-stone line-through' : 'border-white/12 text-cream hover:border-white/25',
                    )}
                  >
                    {p.text}
                    <span className="ml-1 text-[11px] text-stone">{out ? '· left out' : '· ×'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {plan.gaps.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-stone">What I don't have</p>
          <ul className="mt-0.5 space-y-1">
            {plan.gaps.map((g) => (
              <li key={g.basis} className="text-sm leading-relaxed text-cream/90">
                {g.basis === 'readyFacts'
                  ? <>No confirmed facts about your product. <Link to="/products" className="underline underline-offset-2">Add a product</Link>, or continue without one.</>
                  : g.line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onWrite && <div className="mt-4">
        <button
          type="button"
          onClick={onWrite}
          disabled={busy}
          className={cn('rounded-full bg-cream px-4 py-2 text-sm font-medium text-ink', busy && 'opacity-60')}
        >
          Write it
        </button>
      </div>}
    </div>
  )
}
