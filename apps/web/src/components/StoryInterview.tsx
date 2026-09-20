import { useEffect, useMemo, useState } from 'react'
import {
  CREATOR_QUESTIONS, OPENING_THREE, ANSWER_MAX, suggestStoryAnswers, anchorAllToSubNiche,
  creatorQuestionsFor, openingQuestionsFor, type SellsKind,
  type CreatorQuestion, type StorySuggestion,
} from '@twinai/shared'
import { answerQuestion, skipQuestion, markQuestionShown, loadExtractedKnowledge, confirmExtractedRow } from '../lib/creatorAnswers'
import { readStoryDraft, writeStoryDraft, clearStoryDraft } from '../lib/storyDraft'

/**
 * THE STORY QUESTIONS, ASKED IN THE WAIT THAT ALREADY EXISTS.
 *
 * ⚠️ THREE, AND EXTRA QUESTIONS DO NOT BELONG HERE. This screen exists for the
 * three the DNA can word; the depth questions that need no scan are asked on the
 * building step, where the wait already is.
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
  voiceId, onDone, niche = null, sells = null, stageBand = null, subNiche = null,
  questionIds = OPENING_THREE,
}: {
  voiceId: string | null
  /** ⚠️ CALLED ONLY WHEN ALL THREE ARE RESOLVED (answered or skipped). The
   *  parent parks a finished scan until then — this file already learned once
   *  that a scan finishing early took the screen away with an answer
   *  half-typed. */
  onDone: () => void
  /** ⚠⚠ THE NICHE ARRIVES LATE, AND THAT IS WHY THESE READ AS GENERIC. These
   *  three are asked WHILE THE SCAN RUNS, so at first render there is no niche
   *  to word them with and `creatorQuestionsFor` correctly returns the plain
   *  bank. But the parent already parks the finished scan until these are done,
   *  so for most creators the profile LANDS while they are still answering — and
   *  from that moment the wording can be theirs. Null until then, never a guess. */
  niche?: string | null
  /** ⚖️ WHAT SHE SELLS OUTRANKS HER NICHE FOR ONE QUESTION, and
   *  `creatorQuestionsFor` states why: the bucket says what her WORLD is, `sells`
   *  says what her RELATIONSHIP to her audience is. A template seller has buyers,
   *  not clients, and must not be asked the coach's "when a founder comes to you
   *  stuck". Null during onboarding, where no product exists yet. */
  sells?: SellsKind | 'none' | null
  /** ⚠️ UNDER 1,000 FOLLOWERS THE RESULT QUESTION HAS NO ANSWER, and asking for
   *  a number she does not have reads as an accusation. Replaces `best_result`
   *  only, and only at that band. */
  stageBand?: string | null
  /** ⚠️ THE SCAN'S OWN PHRASE FOR THE WORK — "custom Bible rebinding", not
   *  "business". The bucket flattens an account onto one of eight words, and a
   *  creator can tell: "everyone in your industry" reads as written for someone
   *  else. Measured on 57 voices, `sub_niche` is populated on 52.
   *
   *  ⚠️ IT ARRIVES WITH THE PROFILE, SO IT IS NULL AT FIRST RENDER, exactly like
   *  `niche` — and `anchorAllToSubNiche` refuses anything that is not a short
   *  noun phrase, so a null or a sentence leaves the wording alone. */
  subNiche?: string | null
  /** WHICH questions this instance asks. Defaults to the story three.
   *
   *  ⚖️ ONE RENDERER, TWO PLACEMENTS, AND THAT IS THE POINT. The scan step also
   *  needs to ask — the wait is there — and a second component would mean a
   *  second write path. This one already resolves EVERY field as answered or
   *  skipped before `onDone`, records `shown` separately, and persists a draft
   *  as she types; duplicating that is how two screens come to disagree about
   *  what was asked.
   *
   *  ⚠️ AND DEDUPE DEPENDS ON IT BEING THIS PATH. `answerQuestion` /
   *  `skipQuestion` write `creator_questions_put`, which is what forbids
   *  `nextQuestion` from ever putting the same question again. A bespoke field
   *  on the scan screen would have re-asked a creator her own answer later. */
  questionIds?: readonly string[]
}) {
  // ⚠️ THE BANK WAS READ RAW HERE AND THE NICHE-AWARE BUILDER WAS NEVER CALLED.
  // `creatorQuestionsFor` has existed and been correct; `CreatorQuestionCard`
  // calls it, this file did not. That is the defect this codebase keeps finding,
  // in its two-caller form: built, right, and one of the callers reads around it.
  //
  // ⚖️ RECOMPUTED AS THE NICHE ARRIVES, and the QUESTION IDS NEVER CHANGE —
  // only the words do. `CreatorQuestion.id` is what "already answered" and
  // "already skipped" are keyed on, so a creator who answered `first_thing_asked`
  // must never meet it again wearing different wording.
  const questions = useMemo(() => {
    // ⚖️ TWO PASSES, AND THE ORDER IS THE POINT. `creatorQuestionsFor` words
    // by NICHE BUCKET and covers a different three ids; `openingQuestionsFor`
    // words THESE three by what she SELLS, which is the axis that actually
    // decides whether a question can be answered honestly. Sells runs second so
    // it wins on the ids it owns.
    // ⚠️ `subNiche` IS PASSED AS EVIDENCE, NOT ONLY AS WORDING. It already
    // anchored the sentence below; it now also decides the BUCKET when `niche`
    // matches nothing — a re-scan that broadened "Handmade candle crafting" to
    // "Home Decor" had silently returned that creator to the generic bank.
    const byNiche = creatorQuestionsFor(
      niche, CREATOR_QUESTIONS, sells === 'none' ? null : sells, subNiche)
    const worded = openingQuestionsFor(byNiche, sells, stageBand)
    // ⚠️⚠️ THREE, AND IT WENT TO FIVE ONCE BY MY MISREADING. The owner asked for
    // extra depth questions on the SCAN screen, where the wait already is, and I
    // appended two here instead — onto the one screen whose whole purpose is the
    // three questions the DNA can word. `Onboarding.tsx` records why they live
    // here and nowhere else: "on this screen the DNA does not exist yet and they
    // could never be worded in her world." Adding to this set spends the
    // creator's attention on the screen that is already earning it.
    //
    // ⚖️ THE EXTRA DEPTH QUESTIONS BELONG WITH `profileQuestionsFor`, on the
    // building step, which already asks categorical questions one at a time and
    // already parks the finished scan until the creator taps Done.
    const set = questionIds
      .map((id) => worded.find((x) => x.id === id))
      .filter((q): q is CreatorQuestion => !!q)
    // ⚠️ ANCHORED LAST. The niche rewrite decides WHICH words; this decides whose
    // work they name, and it must see the final wording to find the placeholder.
    return anchorAllToSubNiche(set, subNiche)
  }, [niche, sells, stageBand, subNiche, questionIds])

  // ⚠️⚠️ SEEDED FROM THE DRAFT, BECAUSE THERE WAS NO SAVE UNTIL "Continue".
  // Measured 2026-09-09: of eleven creators who reached these three questions,
  // FOUR carry `shown` rows and nothing else — `submit()` never completed, so
  // whatever they typed died with the tab. One is the baker whose store holds
  // eight caption-derived rows and none of her three stories.
  //
  // ⚖️ A LAZY INITIALISER, NOT AN EFFECT. Restoring in a `useEffect` would
  // render empty boxes first and fill them a frame later, which reads as the
  // screen losing her work and then changing its mind.
  const [text, setText] = useState<Record<string, string>>(() => readStoryDraft())
  const [problem, setProblem] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<Record<string, StorySuggestion[]>>({})
  /** Which rows she has confirmed this session, for the tick. Local only: the
   *  write is best-effort and a failed one must not claim success. */
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [slot, setSlot] = useState<Record<string, SlotState>>({})

  // ⚖️ WRITTEN ON EVERY CHANGE RATHER THAN ON A TIMER. These are three short
  // boxes, the payload is a few hundred bytes, and a debounce would reintroduce
  // a window in which the last sentence typed is the one that is lost — which
  // is the sentence she was in the middle of when she walked away.
  useEffect(() => { writeStoryDraft(text) }, [text])

  // ⚖️ THE BLANK BOXES RENDER IMMEDIATELY AND THE SUGGESTION ARRIVES LATE, NOT
  // THE OTHER WAY ROUND. This sits inside a wait; blocking the questions on
  // another read would spend the creator's attention to maybe save them typing.
  // A read that fails or finds nothing leaves all three boxes blank, which is
  // today's behaviour exactly.
  useEffect(() => {
    let live = true
    void (async () => {
      // ⚠️ SCOPED TO THIS VOICE. `owner_id` alone reads one owner's ten voices
      // as one creator — the same pooling 0220 fixed for transcripts. A
      // suggestion drawn from a DIFFERENT creator's speech, offered as "you
      // said this", is the worst thing this screen could do.
      const items = await loadExtractedKnowledge(voiceId)
      if (!live || items === null) return
      const found = suggestStoryAnswers(questions, items)
      if (Object.keys(found).length === 0) return
      setSuggestions(found)
      setSlot((prev) => {
        const next = { ...prev }
        // ⚠️ NEVER CLOBBER A SLOT THE CREATOR HAS ALREADY TOUCHED. The read is
        // async and they may have started typing into the blank box before it
        // landed; replacing that with a suggestion would delete their words.
        // ⚠️ A RESTORED DRAFT COUNTS AS TOUCHED. The existing rule protects a
        // box she is typing into right now; a sentence restored from a previous
        // visit is the same words, older, and offering a suggestion over it
        // would delete exactly what this restore exists to save.
        for (const id of Object.keys(found)) {
          if (!next[id] && (text[id] ?? '').trim() === '') next[id] = 'offered'
        }
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
  /** ⚠️⚠️ CONFIRMING IS NOT ANSWERING, AND IT DELIBERATELY DOES NOT TOUCH
   *  `text`, `slot` OR `creator_questions_put`. The row already exists, so this
   *  adds no supply — it adds TRUST, on a claim she has personally vouched for.
   *  Marking the question answered here would mean she is never asked again
   *  (0128's never-ask-twice rule), and one tap would permanently trade the
   *  story we do not have for a re-label of one we do. The box stays open. */
  async function confirmKnown(questionId: string, rowId: string) {
    const ok = await confirmExtractedRow(rowId)
    // ⚖️ THE TICK FOLLOWS THE WRITE, never precedes it. Showing "Confirmed" for a
    // write that failed is the one thing worse than not offering the button.
    if (ok) setConfirmed((prev) => ({ ...prev, [rowId]: true }))
    // The impression is recorded either way: she has now seen this slot's
    // material, which is a different fact from having answered it.
    void markQuestionShown(questionId)
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
    // ⚠️ CLEARED ONLY HERE, PAST EVERY REFUSAL. A draft dropped before the
    // writes would recreate the loss it exists to close, one step earlier — and
    // an answer rejected as too long is still on screen and still hers, so the
    // early `return` above must keep it.
    clearStoryDraft()
    onDone()
  }

  async function skipAll() {
    setSaving(true)
    // ⚠️ INCLUDING SLOTS THAT HAD A SUGGESTION ON SCREEN. "Skip all" means all,
    // and an unconfirmed suggestion is not an answer no matter how good it was.
    for (const q of questions) await skipQuestion(q.id)
    setSaving(false)
    // ⚖️ "Skip all" MEANS THE DRAFT TOO. Keeping it would restore, on her next
    // visit, sentences she has just declined to give — and every question is
    // now marked skipped, so nothing would ever ask for them again.
    clearStoryDraft()
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
          // ⚠️⚠️ WHAT THE STORE ALREADY HAS — NOT A CANDIDATE ANSWER. See 0219.
          // These rows already exist, so confirming one adds NO supply; letting
          // it close the question would mean she is never asked for the story we
          // do NOT have, and one tap would permanently trade a new story for a
          // re-label of an old one. So the card sits ABOVE the question and the
          // box stays open underneath it, always.
          const known = suggestions[q.id] ?? []
          const dismissed = state === 'discarded'
          return (
            <div key={q.id}>
              {known.length > 0 && !dismissed && (
                <div className="mb-2 rounded-xl border border-teal/25 bg-ink/40 p-3">
                  <p className="text-xs text-stone">
                    {known.length === 1
                      ? 'We already heard you say this — so you do not need to repeat it:'
                      : 'We already heard you say these — so you do not need to repeat them:'}
                  </p>
                  <ul className="mt-1.5 space-y-2">
                    {known.map((k) => (
                      <li key={k.id ?? k.text}>
                        <p className="text-sm text-sand">{k.text}</p>
                        {/* ⚖️ HER OWN SENTENCE UNDER OUR DISTILLATE. A distillate
                            offered back cold reads as something the machine
                            decided about her; the words she actually said are a
                            quote she can check in one glance — and they jog the
                            memory the blank box asks her to search cold. */}
                        {k.evidence && (
                          <p className="mt-0.5 border-l-2 border-teal/30 pl-2 text-xs italic text-stone">
                            “{k.evidence}”
                          </p>
                        )}
                        {k.id && (
                          <button
                            type="button" onClick={() => void confirmKnown(q.id, k.id!)} disabled={saving}
                            className="mt-1 text-xs text-teal hover:text-cream disabled:opacity-50"
                          >
                            {confirmed[k.id] ? 'Confirmed ✓' : 'Yes, that is right'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button" onClick={() => discardSuggestion(q.id)} disabled={saving}
                    className="mt-2 text-xs text-stone hover:text-cream disabled:opacity-50"
                  >
                    Hide these
                  </button>
                </div>
              )}

              <p className="font-display text-base leading-snug text-cream">{q.ask}</p>
              {/* ⚠️ THE ASK CHANGES WHEN WE ALREADY HAVE SOME. "Another one" is
                  the only version of this question that can still grow the
                  store, and it is also the honest one — asking flat for a
                  contrarian belief when we just showed her two of hers reads as
                  not having listened. */}
              <p className="mt-1 text-xs text-stone">
                {known.length > 0 && !dismissed ? `Something different from those — ${q.hint}` : q.hint}
              </p>
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
