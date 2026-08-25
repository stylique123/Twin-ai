import { useState } from 'react'
import { CREATOR_QUESTIONS, OPENING_THREE, ANSWER_MAX, type CreatorQuestion } from '@twinai/shared'
import { answerQuestion, skipQuestion } from '../lib/creatorAnswers'

/**
 * THE THREE STORY QUESTIONS, ASKED IN THE WAIT THAT ALREADY EXISTS.
 *
 * ⚠️ THE SIX QUESTIONS ABOVE THIS ONE ARE ALL CATEGORICAL — what you do, who
 * for, what you sell. Nothing asks "tell me about a time", and `experience`
 * items are the single predictor of a script that does not read as generic:
 * captions produce 13% substance and ZERO experiences, ever. A creator whose
 * catalogue is captions therefore reaches their first script structurally
 * unable to have one worth filming, and finds that out by reading it.
 *
 * ⚖️ THE SAME WRITER AS TEACH-YOUR-TWIN, NOT A SECOND ONE. `answerQuestion`
 * already stores a `creator_knowledge` row with `source: 'asked'` and marks the
 * question put, so 0128's unique index gives never-ask-twice for free. A second
 * path would be a second thing to keep honest.
 *
 * ⚖️ AND SKIPPING IS UNPUNISHED. A required question on a waiting screen turns
 * a wait into a toll. A skip is STORED, so it is never asked again here.
 */
export function StoryInterview({
  voiceId, onDone,
}: {
  voiceId: string | null
  /** ⚠️ CALLED ONLY WHEN ALL THREE ARE DONE. The parent parks a finished scan
   *  until then — this file already learned once that a scan finishing early
   *  took the screen away with an answer half-typed. */
  onDone: () => void
}) {
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const q: CreatorQuestion | undefined = CREATOR_QUESTIONS.find((x) => x.id === OPENING_THREE[i])

  function next() {
    setText(''); setProblem(null)
    if (i + 1 >= OPENING_THREE.length) { onDone(); return }
    setI(i + 1)
  }

  async function save() {
    if (!q) return
    const answer = text.trim()
    // ⚖️ REFUSED, NEVER TRUNCATED. A sentence cut at the limit can invert its
    // own meaning, and this becomes something the twin believes about them.
    if (answer.length > ANSWER_MAX) {
      setProblem('Shorter is better — one real moment beats a paragraph.')
      return
    }
    if (answer === '') { skip(); return }
    setSaving(true)
    const res = await answerQuestion(q, answer, voiceId)
    setSaving(false)
    if (!res.ok && res.reason === 'too_short') {
      setProblem('A few more words and it is usable.')
      return
    }
    // ⚠️ A STORAGE FAILURE DOES NOT TRAP THEM ON THIS SCREEN. They are signing
    // up; losing one answer is survivable, being stuck is not.
    next()
  }

  async function skip() {
    if (!q) { next(); return }
    setSaving(true)
    await skipQuestion(q.id)
    setSaving(false)
    next()
  }

  if (!q) return null

  return (
    <div className="mt-5 rounded-card border border-teal/25 bg-teal/[0.06] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-teal">
        One more thing only you know · {i + 1} of {OPENING_THREE.length}
      </p>
      <p className="mt-2 font-display text-lg leading-snug text-cream">{q.ask}</p>
      <p className="mt-1 text-xs text-stone">{q.hint}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label={q.ask}
        placeholder="A couple of sentences is plenty"
        disabled={saving}
        className="mt-3 w-full rounded-xl border border-white/10 bg-ink/60 px-3 py-2 text-sm text-sand
                   placeholder:text-stone/70 focus:border-teal/40 focus:outline-none"
      />
      {problem && <p className="mt-1 text-xs text-coral">{problem}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button" onClick={() => void save()} disabled={saving}
          className="rounded-full bg-teal px-4 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
        >
          Save and continue
        </button>
        <button
          type="button" onClick={() => void skip()} disabled={saving}
          className="text-xs text-stone hover:text-cream disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
