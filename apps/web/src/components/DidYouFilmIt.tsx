// THE ONE QUESTION THAT MEASURES REGRET INSTEAD OF ENTHUSIASM.
//
// ⚠️ EVERYTHING ELSE IN TWIN MEASURES THE MOMENT OF CLICKING. Which references
// get picked, which angles get opened, which scripts get built — all of it says
// what looked appealing in a gallery. None of it says whether the script became
// a video, and that is the only thing the product is actually for.
//
// ⚖️ IT ASKS ONCE, IT CHANGES NOTHING ABOUT THE SCRIPT, AND "NO" IS A REAL
// ANSWER. A question that feels like a performance review gets avoided, and
// avoidance produces exactly the NULL-heavy data this exists to end — so "Not
// this one" sits beside "Yes, I filmed it" as an equal, not as a confession.
import { useEffect, useState } from 'react'
import {
  filmedAsk, loadGenerationOutcome, setGenerationFilmed,
  FILMED_ASK_QUESTION, FILMED_YES, FILMED_NO, FILMED_WHY,
} from '@twinai/shared'
import { cn } from '../lib/cn'

interface Props {
  generationId: string
  /** The generation's own `created_at`. Null when unknown — never treated as
   *  "long ago"; see `filmedAsk`. */
  generatedAt: string | null
}

export function DidYouFilmIt({ generationId, generatedAt }: Props) {
  const [outcome, setOutcome] =
    useState<{ was_filmed: boolean | null; filmed_answered_at: string | null } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void loadGenerationOutcome(generationId).then((o) => {
      if (!alive) return
      setOutcome(o)
      setLoaded(true)
    })
    return () => { alive = false }
  }, [generationId])

  // ⚠️ NOTHING RENDERS UNTIL THE ROW IS KNOWN. Rendering the question first and
  // hiding it on load would flash an ask at every creator whose generation
  // predates the table — the 85 that can never be answered.
  if (!loaded) return null

  const ask = filmedAsk({ outcome, generatedAt, now: Date.now() })
  if (ask.kind === 'no_row' || ask.kind === 'too_soon') return null

  const answer = async (filmed: boolean) => {
    setSaving(true)
    setFailed(false)
    const ok = await setGenerationFilmed(generationId, filmed)
    setSaving(false)
    // ⚠️ THE LOCAL STATE MOVES ONLY IF THE WRITE LANDED. Showing "saved" on a
    // failed RPC would tell her Twin knows something it does not, and she would
    // never think to answer again.
    if (ok) setOutcome({ was_filmed: filmed, filmed_answered_at: new Date().toISOString() })
    else setFailed(true)
  }

  if (ask.kind === 'answered') {
    return (
      <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.015] px-3.5 py-3">
        <p className="text-[12px] text-stone">
          {ask.wasFilmed ? 'You filmed this one.' : 'You didn’t film this one.'}
          {/* ⚖️ THE READER FOR `filmed_answered_at`. 0191 dropped this column
              because it had none; it exists again because this line reads it,
              and a creator who changed her mind can see what Twin believes and
              when she told it. */}
          {ask.answeredAt && (
            <span className="text-sand/60"> · you said so on {new Date(ask.answeredAt).toLocaleDateString()}</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void answer(!ask.wasFilmed)}
          disabled={saving}
          className="mt-1.5 text-[11px] text-sand/70 underline-offset-2 hover:underline"
        >
          {saving ? 'Saving…' : 'Change that'}
        </button>
        {failed && (
          <p className="mt-1 text-[11px] text-coral">Couldn’t save that just now — tap again to retry.</p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.015] px-3.5 py-3">
      <p className="text-[13px] font-medium text-cream">{FILMED_ASK_QUESTION}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-stone">{FILMED_WHY}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {([[true, FILMED_YES], [false, FILMED_NO]] as const).map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => void answer(value)}
            disabled={saving}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[12px] transition-colors',
              'border-white/10 bg-white/[0.02] text-sand hover:border-white/20 hover:text-cream',
              saving && 'opacity-60',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {failed && (
        <p className="mt-1.5 text-[11px] text-coral">Couldn’t save that just now — tap again to retry.</p>
      )}
    </div>
  )
}
