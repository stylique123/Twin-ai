// WHAT TWIN UNDERSTOOD, SHOWN BEFORE THE CREDIT IS SPENT.
//
// ⚠️ THE THIRD LINE IS WHY THIS SCREEN EXISTS. "The angle" and "What I'll use"
// build confidence; "What I don't have" is where a fabricated claim gets caught
// while it is still free to fix. A creator who reads "no numbers from you"
// before spending either adds one or picks a different angle. The same sentence
// after the spend is a refund.
//
// ⚖️ ONE SCREEN, NEVER TWO, AND IT NEVER BLOCKS. There is no second step and no
// gate: "Write it" is the primary action and it is always available. A gap is
// information, not a wall — a creator may look straight at one and generate
// anyway, and often should.
import { buildVideoPlan, type VideoPlanInput } from '@twinai/shared'
import { cn } from '../lib/cn'

export function VideoPlanCard({
  input, onWrite, onSkipAlways, busy = false,
}: {
  input: VideoPlanInput
  onWrite: () => void
  /** "Don't show me this again" — a preference, honoured immediately. */
  onSkipAlways: () => void
  busy?: boolean
}) {
  const plan = buildVideoPlan(input)

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-stone">Before I write this</p>

      {/* ⚖️ THE ANGLE IS SHOWN ONLY WHEN THERE IS ONE. A heading over an empty
          line would read as Twin having understood nothing, when in fact the
          creator simply did not narrow it — which is allowed. */}
      {plan.angle ? (
        <div className="mt-3">
          <p className="text-xs text-stone">The angle</p>
          <p className="mt-0.5 text-sm text-cream">{plan.angle}</p>
        </div>
      ) : null}

      {plan.willUse.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-stone">What I'll use</p>
          <p className="mt-0.5 text-sm text-cream">{plan.willUse.join(' · ')}</p>
        </div>
      ) : null}

      {/* ⚠️ NEVER STYLED AS AN ERROR. These are facts about the store, not
          faults of the creator, and red would make an honest screen feel like a
          telling-off — which is how a useful warning gets dismissed unread. */}
      {plan.gaps.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-stone">What I don't have</p>
          <ul className="mt-0.5 space-y-1">
            {plan.gaps.map((g) => (
              <li key={g.basis} className="text-sm leading-relaxed text-cream/90">{g.line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onWrite}
          disabled={busy}
          className={cn(
            'rounded-full bg-cream px-4 py-2 text-sm font-medium text-ink',
            busy && 'opacity-60',
          )}
        >
          Write it
        </button>
        {/* ⚖️ THE OPT-OUT IS ON THE SCREEN ITSELF, not buried in settings. A
            creator who finds this a tax must be able to end it where they meet
            it, in one tap, or it becomes a thing to click past forever. */}
        <button
          type="button"
          onClick={onSkipAlways}
          className="text-xs text-stone underline underline-offset-2 hover:text-cream"
        >
          Don't show this again
        </button>
      </div>
    </div>
  )
}
