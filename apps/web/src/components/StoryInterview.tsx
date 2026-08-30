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
 *
 * ⚠️ D7 OF THE CONSOLIDATION SPEC — ONE SCREEN, NOT THREE. This used to show
 * the three questions one at a time ("1 of 3", "2 of 3", "3 of 3"), which was
 * three separate wizard steps for a screen that itself sits inside a wait
 * that already has its own steps. In production every one of these came back
 * `skipped` — a near-total dead zone — and three sequential taps to reach a
 * question nobody was answering is a plausible reason why. The audit found
 * the READER is real and works (`creator_knowledge` rows with
 * `source_ref: 'asked:<id>'`); nothing about storage changes here. Only the
 * UI collapses from three screens into one: all three prompts visible at
 * once, three independent text fields, one "Continue" that resolves whichever
 * were left blank as skips and answers the ones that were filled in — so a
 * creator who only has one good answer in them is not forced through three
 * separate "Skip" taps to get past the other two.
 */
export function StoryInterview({
  voiceId, onDone,
}: {
  voiceId: string | null
  /** ⚠️ CALLED ONLY WHEN ALL THREE ARE RESOLVED (answered or skipped). The
   *  parent parks a finished scan until then — this file already learned once
   *  that a scan finishing early took the screen away with an answer
   *  half-typed. */
  onDone: () => void
}) {
  const questions = OPENING_THREE
    .map((id) => CREATOR_QUESTIONS.find((x) => x.id === id))
    .filter((q): q is CreatorQuestion => !!q)

  const [text, setText] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  if (questions.length === 0) return null

  async function submit() {
    setSaving(true)
    const nextProblems: Record<string, string> = {}
    // ⚠️ EVERY FIELD IS RESOLVED, ANSWERED OR SKIPPED, BEFORE onDone FIRES.
    // A blank field is a decline — the same meaning "Skip" always had — and a
    // filled one is stored exactly as `answerQuestion` already stores a
    // single answer, with the same `source_ref`. Run in order so a slow
        // network never interleaves two writes for the same creator oddly.
    for (const q of questions) {
      const answer = (text[q.id] ?? '').trim()
      if (answer === '') {
        await skipQuestion(q.id)
        continue
      }
      if (answer.length > ANSWER_MAX) {
        nextProblems[q.id] = 'Shorter is better — one real moment beats a paragraph.'
        continue
      }
      const res = await answerQuestion(q, answer, voiceId)
      if (!res.ok && res.reason === 'too_short') {
        nextProblems[q.id] = 'A few more words and it is usable.'
      }
      // A storage failure (`not_saved`) does not block the flow — they are
      // signing up, losing one answer is survivable, being stuck is not.
    }
    setSaving(false)
    if (Object.keys(nextProblems).length > 0) {
      setProblem(nextProblems)
      return
    }
    onDone()
  }

  async function skipAll() {
    setSaving(true)
    for (const q of questions) await skipQuestion(q.id)
    setSaving(false)
    onDone()
  }

  return (
    <div className="mt-5 rounded-card border border-teal/25 bg-teal/[0.06] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-teal">
        Three things only you know
      </p>
      <p className="mt-1 text-xs text-stone">
        Answer what you can — skip the rest, and everything here stays editable later.
      </p>
      <div className="mt-4 space-y-4">
        {questions.map((q) => (
          <div key={q.id}>
            <p className="font-display text-base leading-snug text-cream">{q.ask}</p>
            <p className="mt-1 text-xs text-stone">{q.hint}</p>
            <textarea
              value={text[q.id] ?? ''}
              onChange={(e) => setText((prev) => ({ ...prev, [q.id]: e.target.value }))}
              rows={2}
              aria-label={q.ask}
              placeholder="A couple of sentences is plenty — or leave it blank"
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-white/10 bg-ink/60 px-3 py-2 text-sm text-sand
                         placeholder:text-stone/70 focus:border-teal/40 focus:outline-none"
            />
            {problem[q.id] && <p className="mt-1 text-xs text-coral">{problem[q.id]}</p>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button" onClick={() => void submit()} disabled={saving}
          className="rounded-full bg-teal px-4 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
        >
          Continue
        </button>
        <button
          type="button" onClick={() => void skipAll()} disabled={saving}
          className="text-xs text-stone hover:text-cream disabled:opacity-50"
        >
          Skip all
        </button>
      </div>
    </div>
  )
}
