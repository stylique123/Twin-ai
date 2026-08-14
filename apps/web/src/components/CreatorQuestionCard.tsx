// ONE QUESTION, ASKED WHERE THE CREATOR IS ALREADY HAVING A GOOD MOMENT.
//
// ⚠️ PLACEMENT IS THE WHOLE DESIGN, AND IT IS ALREADY MEASURED ONCE. In the first
// real production run every question below the fold on the confirm screen came
// back unanswered — the wording was fine and the position was fatal. A dedicated
// screen is the same wall in a new place: the Product Library is a complete,
// working feature with zero rows because it waits to be visited.
//
// So this sits under a script the creator has just been given, asks ONE thing,
// and is dismissible in a tap. Ten answers arriving over weeks beats ten
// questions arriving at once and being closed.
//
// ⚖️ IT RENDERS NOTHING UNTIL IT KNOWS. `loadQuestionsPut` returns null when it
// could not read, and null is not "nothing has been asked" — opening on question
// one because a select failed would re-ask something the creator already
// declined, which is precisely how an optional prompt earns being ignored.
import { useEffect, useState } from 'react'
import { nextQuestion, askedProgress, ANSWER_MAX, type CreatorQuestion } from '@twinai/shared'
import { loadQuestionsPut, answerQuestion, skipQuestion } from '../lib/creatorAnswers'
import { cn } from '../lib/cn'

const REFUSAL: Record<string, string> = {
  empty: 'Add a sentence first.',
  too_short: 'A few more words — the detail is the part we cannot get from your videos.',
  too_long: `Keep it under ${ANSWER_MAX} characters. One sharp sentence beats a paragraph.`,
  not_saved: 'We could not save that just now. Your script is safe — try again in a moment.',
}

export function CreatorQuestionCard({ voiceId = null }: { voiceId?: string | null }) {
  const [question, setQuestion] = useState<CreatorQuestion | null>(null)
  const [progress, setProgress] = useState<{ put: number; of: number } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const put = await loadQuestionsPut()
      if (!live || put === null) return // not-knowing: ask nothing
      setQuestion(nextQuestion(put))
      const p = askedProgress(put)
      setProgress({ put: p.put, of: p.of })
    })()
    return () => { live = false }
  }, [])

  if (thanks) {
    return (
      <div className="rounded-card border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-cream">Got it — that goes into your voice.</p>
        <p className="mt-1 text-xs text-stone">
          {/* ⚖️ SAYS WHAT IT CHANGES, NOT JUST THANK YOU. A creator who cannot see
              what an answer bought has no reason to give a second one. */}
          Scripts from here on can use it, in your words.
        </p>
      </div>
    )
  }

  if (!question) return null

  const over = text.trim().length > ANSWER_MAX

  const submit = async () => {
    setBusy(true)
    setProblem(null)
    const res = await answerQuestion(question, text, voiceId)
    setBusy(false)
    if (res.ok) { setThanks(true); return }
    setProblem(REFUSAL[res.reason] ?? REFUSAL.not_saved)
  }

  const dismiss = async () => {
    // ⚠️ RECORDED, NOT JUST HIDDEN. A skip that only unmounts the component comes
    // straight back on the next script, and the creator experiences a product
    // that cannot take no for an answer.
    setQuestion(null)
    await skipQuestion(question.id)
  }

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber">
          Teach your twin
        </p>
        {progress && progress.put > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-stone">
            {progress.put}/{progress.of}
          </span>
        )}
      </div>
      <p className="mt-2 text-base font-medium text-cream">{question.ask}</p>
      <p className="mt-1 text-xs text-stone">{question.hint}</p>
      <textarea
        className="field mt-3 min-h-[72px] w-full"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="In your own words…"
      />
      <div className="mt-1 flex items-center justify-between">
        <p className={cn('text-[11px]', problem ? 'text-coral' : 'text-stone')}>
          {problem ?? 'Only you can answer this — your videos cannot.'}
        </p>
        {/* Shown only once it matters, so a counter is not nagging from word one. */}
        {text.trim().length > ANSWER_MAX - 60 && (
          <span className={cn('shrink-0 text-[11px] tabular-nums', over ? 'text-coral' : 'text-stone')}>
            {text.trim().length}/{ANSWER_MAX}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || over || !text.trim()}
          onClick={() => void submit()}
          className="btn-gradient flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Add to my voice'}
        </button>
        <button
          type="button"
          onClick={() => void dismiss()}
          className="shrink-0 px-2 py-2 text-xs text-stone hover:text-cream"
        >
          Not this one
        </button>
      </div>
    </div>
  )
}
