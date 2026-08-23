// WHAT A CREATOR SEES WHEN TWIN DOES NOT THINK THIS VIDEO WILL WORK.
//
// ⚠️ IT WARNS, IT DOES NOT REFUSE, and the two buttons say so by their weight
// rather than by their wording. Twin agreed with a human on 73% of the visual
// claims it was judged on, so it must never be able to stop anyone — but a
// warning the creator can dismiss without reading is not a warning either. The
// advice is the filled button; continuing is plain text and states its own cost.
//
// ⚠️ IT REPLACES THE PROGRESS BAR RATHER THAN SITTING BESIDE IT. The owner asked
// for this to "very apparently limit bad results". A note next to a spinner is
// read by nobody; a card where the spinner was is read by everybody.
//
// ⚖️ AND NOTHING HERE DECIDES ANYTHING. Every word comes from
// warningForPickedVideo in @twinai/shared, which is where the rules and the
// plain-English copy live and where they are tested. This file is layout.

import type { FitWarning } from '@twinai/shared'
import { LogoMark } from './Logo'

export function TalkingHeadWarning({
  warning, onPickAnother, onUseAnyway, busy = false,
}: {
  warning: FitWarning
  /** Took the advice. Recorded, because agreement is half the measurement. */
  onPickAnother: () => void
  /** Overrode. Recorded, because these are the only rows that say if we are wrong. */
  onUseAnyway: () => void
  busy?: boolean
}) {
  return (
    <div className="glass gradient-border p-7 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft">
        <LogoMark size={22} />
      </span>

      {/* What Twin saw. One sentence, no hedging — hedging here reads as a bug. */}
      <h2 className="mt-4 font-display text-2xl">{warning.saw}</h2>

      {/* ⚠️ THE COST, NOT THE RULE. "This may not sound like you" is something a
          creator cares about; "unsupported video type" is a rule they never
          agreed to and cannot act on. */}
      <p className="mt-2 text-sm leading-relaxed text-stone">{warning.cost}</p>

      {/* What to use instead — a recommendation, never a bare refusal. */}
      <p className="mt-3 text-xs leading-relaxed text-stone/80">{warning.instead}</p>

      <button
        onClick={onPickAnother}
        disabled={busy}
        className="btn-gradient mt-6 w-full disabled:opacity-40"
      >
        Pick a different video
      </button>

      {/* ⚠️ THE COST IS ON THE BUTTON ITSELF. A bare "Continue" hides what it
          costs, and the entire case for warning rather than blocking rests on
          the override being an informed one. */}
      <button
        onClick={onUseAnyway}
        disabled={busy}
        className="btn-ghost mt-3 w-full text-xs disabled:opacity-40"
      >
        {warning.continueLabel}
      </button>
    </div>
  )
}
