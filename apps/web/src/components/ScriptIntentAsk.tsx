// WOULD YOU RECORD THIS? — THE ONE QUESTION NOBODY WAS EVER ASKED.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14: 134 scripts generated, 6 camera opens.
// 128 scripts never had a camera opened and no row anywhere says whether the
// creator would have. `recordingFunnel.ts` calls this "the single most valuable
// event this product does not yet collect", and its constants have sat written
// and unread since it was created.
//
// ⚠️⚠️ WITHOUT IT THE DROP IS UNATTRIBUTABLE. 128 non-openers is equally
// consistent with a bad script, an irrelevant premise, an intimidating record
// button, no time, or somebody who was only ever clicking around — and those
// need OPPOSITE fixes. Any quality decision made without this answer is a guess
// dressed as a measurement.
//
// ⚖️ ONE TAP, AND IT IS SKIPPABLE. A question that blocks the teleprompter
// would buy an answer by making the product worse, and a creator who dismisses
// it has told us nothing — which is honestly recorded as nothing. NULL means we
// never got an answer, never that she declined to record.
//
// ⚖️ AND THE REASON IS ONLY ASKED AFTER A NO. Asking everybody why they would
// not record a script they just said they WOULD record is how a form teaches
// people to stop reading it.

import { useState } from 'react'
import {
  SCRIPT_INTENTS, SCRIPT_INTENT_LABELS, NO_RECORD_REASONS, NO_RECORD_REASON_LABELS,
  type ScriptIntent, type NoRecordReason,
} from '../lib/api'

export interface ScriptIntentAskProps {
  /** Already answered, so the question is done. */
  answered: boolean
  /** Returns false when the write did not land, so the UI can stay asking. */
  onAnswer: (intent: ScriptIntent, reason?: NoRecordReason | null) => Promise<boolean>
  /** ⚠️⚠️ "Maybe — I want to change something" IS THE ONLY OPTION THAT NAMES AN
   *  ACTION, AND IT PERFORMED NONE. It recorded `would_edit_first` and the card
   *  vanished — the owner reported it as having no observable behaviour, which
   *  is exactly right: it was not broken, it was DISHONEST. A label that says
   *  "I want to change something" has to lead somewhere a change can be made.
   *
   *  ⚖️ OPTIONAL, SO THE SIGNAL STILL LANDS WITHOUT IT. A caller that cannot
   *  offer an editor records the answer exactly as before rather than losing it.
   *  Only fired after the write succeeds — sending someone to the editor on a
   *  failed save would hide the failure behind a scroll. */
  onWantsEdit?: () => void
}

export function ScriptIntentAsk({ answered, onAnswer, onWantsEdit }: ScriptIntentAskProps) {
  const [intent, setIntent] = useState<ScriptIntent | null>(null)
  const [done, setDone] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  // ⚠️ ANSWERED OR DISMISSED, THE QUESTION DOES NOT COME BACK. Re-asking is how
  // a one-tap question becomes a nag, and a second answer would overwrite the
  // first for no gain.
  if (answered || done || dismissed) return null

  const send = async (i: ScriptIntent, why?: NoRecordReason | null) => {
    setSaving(true)
    setFailed(false)
    const ok = await onAnswer(i, why ?? null)
    setSaving(false)
    // ⚖️ A FAILED WRITE STAYS ASKING. Showing "thanks" for an answer that was
    // never stored would be the silent-failure shape this repo keeps closing.
    if (ok) {
      setDone(true)
      // ⚖️ AFTER THE WRITE, NEVER INSTEAD OF IT. The answer is the thing this
      // card exists to collect; the scroll is what makes the label honest.
      if (i === 'would_edit_first') onWantsEdit?.()
    } else setFailed(true)
  }

  return (
    <div className="rounded-lg border border-stone/20 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-stone">
          {intent === 'would_not_record'
            ? 'What put you off?'
            : 'Would you record this one?'}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-stone/60 underline"
        >
          Skip
        </button>
      </div>

      {intent !== 'would_not_record' && (
        <div className="flex flex-wrap gap-2">
          {SCRIPT_INTENTS.map((i) => (
            <button
              key={i}
              type="button"
              disabled={saving}
              onClick={() => {
                // ⚖️ A NO OPENS THE SECOND QUESTION RATHER THAN SAVING ALONE.
                // "No" with no reason is a number nobody can act on, and the
                // eight reasons each send us somewhere different.
                if (i === 'would_not_record') setIntent(i)
                else void send(i)
              }}
              className="rounded-full border border-stone/30 px-3 py-1 text-xs text-stone disabled:opacity-50"
            >
              {SCRIPT_INTENT_LABELS[i]}
            </button>
          ))}
        </div>
      )}

      {intent === 'would_not_record' && (
        <div className="flex flex-wrap gap-2">
          {NO_RECORD_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={saving}
              onClick={() => void send('would_not_record', r)}
              className="rounded-full border border-stone/30 px-3 py-1 text-xs text-stone disabled:opacity-50"
            >
              {NO_RECORD_REASON_LABELS[r]}
            </button>
          ))}
          {/* ⚖️ DECLINING TO SAY WHY IS STILL AN ANSWER. Forcing a reason would
              make the honest answer impossible, and the column is nullable even
              on a refusal for exactly this. */}
          <button
            type="button"
            disabled={saving}
            onClick={() => void send('would_not_record', null)}
            className="text-xs text-stone/60 underline"
          >
            I'd rather not say
          </button>
        </div>
      )}

      {failed && (
        <p className="text-xs text-amber">That didn’t save. Tap again?</p>
      )}
    </div>
  )
}
