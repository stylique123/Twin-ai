import { useEffect, useState } from 'react'
import {
  CREATOR_QUESTIONS, OPENING_THREE, ANSWER_MAX, suggestStoryAnswers,
  type CreatorQuestion, type StorySuggestion,
} from '@twinai/shared'
import { answerQuestion, skipQuestion, markQuestionShown, loadExtractedKnowledge } from '../lib/creatorAnswers'

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
 * the three questions one at a time, which was three wizard steps inside a wait
 * that already has its own steps. Now all three prompts are visible at once and
 * one "Continue" resolves whichever were left blank as skips.
 *
 * ── CONFIRM WHAT WE ALREADY HAVE, INSTEAD OF ASKING FOR IT AGAIN ──────────
 *
 * ⚠️ SHOWING A CREATOR A BLANK BOX FOR SOMETHING THEIR OWN VIDEOS ALREADY SAID
 * is asking for something Twin already has. Where the scan extracted material
 * that fills a slot, this shows the sentence back and asks them to confirm it.
 * `suggestStoryAnswers` decides where that is honest, and on the real store the
 * answer is ONE slot of three — its header carries the measurement. Every slot
 * it does not fill renders exactly the blank box it always did, which is still
 * all three for a caption-only creator: the creator who most needs asking.
 *
 * ⚠️ AN UNTOUCHED SUGGESTION NEVER REACHES `text`, AND THAT IS THE WHOLE SAFETY
 * PROPERTY. Silence is not confirmation. A suggestion the creator never acts on
 * leaves the field empty, and an empty field is a skip — the same meaning it has
 * always had here. Prefilling the textarea would have made "Continue" write a
 * sentence nobody read, in the creator's own voice, as their own experience.
 *
 * ⚖️ AND CONFIRMING GOES THROUGH `answerQuestion` LIKE EVERY OTHER ANSWER. A
 * confirmed suggestion is put into the SAME `text[q.id]` the textarea writes to,
 * and `submit()` cannot tell the two apart — so it lands with the same
 * `source_ref: 'asked:<id>'`, the same `basis`, the same question-put row. That
 * is not a convention to be maintained; there is only one path to maintain.
 */

/** What is on screen for one slot.
 *
 *  ⚠️ `offered` AND `discarded` ARE DIFFERENT, AND SO ARE `discarded` AND
 *  never-suggested. A discarded suggestion must not come back, and the creator
 *  gets the blank box they asked for by discarding it. */
type SlotState = 'offered' | 'editing' | 'confirmed' | 'discarded'

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
  const [suggestions, setSuggestions] = useState<Record<string, StorySuggestion>>({})
  const [slot, setSlot] = useState<Record<string, SlotState>>({})

  // ⚖️ THE BLANK BOXES RENDER IMMEDIATELY AND THE SUGGESTION ARRIVES LATE, NOT
  // THE OTHER WAY ROUND. This sits inside a wait; blocking the questions on
  // another read would spend the creator's attention to maybe save them typing.
  // A read that fails or finds nothing leaves all three boxes blank, which is
  // today's behaviour exactly.
  useEffect(() => {
    let live = true
    void (async () => {
      const items = await loadExtractedKnowledge()
      if (!live || items === null) return
      const found = suggestStoryAnswers(questions, items)
      if (Object.keys(found).length === 0) return
      setSuggestions(found)
      setSlot((prev) => {
        const next = { ...prev }
        // ⚠️ NEVER CLOBBER A SLOT THE CREATOR HAS ALREADY TOUCHED. The read is
        // async and they may have started typing into the blank box before it
        // landed; replacing that with a suggestion would delete their words.
        for (const id of Object.keys(found)) if (!next[id]) next[id] = 'offered'
        return next
      })
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (questions.length === 0) return null

  /** ⚠️ CONFIRM WRITES NOTHING BY ITSELF. It moves the sentence into the same
   *  field a typed answer occupies and lets `submit()` do the one write there
   *  has ever been. */
  function confirmSuggestion(id: string) {
    const s = suggestions[id]
    if (!s) return
    setText((prev) => ({ ...prev, [id]: s.text }))
    setSlot((prev) => ({ ...prev, [id]: 'confirmed' }))
  }

  /** ⚠️ DISCARD CLEARS THE FIELD AS WELL AS THE CARD. Leaving the sentence in
   *  `text` would write on Continue the very thing they just rejected.
   *
   *  ⚖️ AND IT RECORDS THE IMPRESSION, SO THE THREE STATES STAY THREE. A
   *  suggestion that was shown and rejected is not a question that was never
   *  put, and only `markQuestionShown` can tell them apart later. It is
   *  deliberately NOT a skip: the creator rejected our sentence, not the
   *  question, and the blank box they are about to get is the point. */
  function discardSuggestion(id: string) {
    setText((prev) => ({ ...prev, [id]: '' }))
    setSlot((prev) => ({ ...prev, [id]: 'discarded' }))
    void markQuestionShown(id)
  }

  async function submit() {
    setSaving(true)
    const nextProblems: Record<string, string> = {}
    // ⚠️ EVERY FIELD IS RESOLVED, ANSWERED OR SKIPPED, BEFORE onDone FIRES.
    // A blank field is a decline — the same meaning "Skip" always had — and a
    // filled one is stored exactly as `answerQuestion` already stores a
    // single answer, with the same `source_ref`. A confirmed suggestion is
    // filled, an untouched one is not, and nothing below needs to know which
    // is which. Run in order so a slow network never interleaves two writes
    // for the same creator oddly.
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
    // ⚠️ INCLUDING SLOTS THAT HAD A SUGGESTION ON SCREEN. "Skip all" means all,
    // and an unconfirmed suggestion is not an answer no matter how good it was.
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
        {questions.map((q) => {
          const state = slot[q.id]
          const suggestion = suggestions[q.id]
          const showCard = !!suggestion && (state === 'offered' || state === 'confirmed')
          return (
            <div key={q.id}>
              <p className="font-display text-base leading-snug text-cream">{q.ask}</p>
              <p className="mt-1 text-xs text-stone">{q.hint}</p>

              {showCard && state === 'offered' && (
                <div className="mt-2 rounded-xl border border-teal/30 bg-ink/40 p-3">
                  <p className="text-xs text-stone">We found this in your videos — is this right?</p>
                  <p className="mt-1.5 text-sm text-sand">{suggestion.text}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    <button
                      type="button" onClick={() => confirmSuggestion(q.id)} disabled={saving}
                      className="rounded-full bg-teal/90 px-3 py-1 text-xs font-semibold text-ink disabled:opacity-50"
                    >
                      Yes, that is right
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setText((prev) => ({ ...prev, [q.id]: suggestion.text }))
                        setSlot((prev) => ({ ...prev, [q.id]: 'editing' }))
                      }}
                      disabled={saving}
                      className="text-xs text-stone hover:text-cream disabled:opacity-50"
                    >
                      Close, but let me fix it
                    </button>
                    <button
                      type="button" onClick={() => discardSuggestion(q.id)} disabled={saving}
                      className="text-xs text-stone hover:text-cream disabled:opacity-50"
                    >
                      Not this — I will write my own
                    </button>
                  </div>
                </div>
              )}

              {showCard && state === 'confirmed' && (
                <div className="mt-2 rounded-xl border border-teal/40 bg-teal/[0.08] p-3">
                  <p className="text-xs text-teal">Kept — this is yours.</p>
                  <p className="mt-1.5 text-sm text-sand">{text[q.id]}</p>
                  <button
                    type="button"
                    onClick={() => setSlot((prev) => ({ ...prev, [q.id]: 'editing' }))}
                    disabled={saving}
                    className="mt-2 text-xs text-stone hover:text-cream disabled:opacity-50"
                  >
                    Change it
                  </button>
                </div>
              )}

              {!showCard && (
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
              )}
              {problem[q.id] && <p className="mt-1 text-xs text-coral">{problem[q.id]}</p>}
            </div>
          )
        })}
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
