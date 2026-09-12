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
import { nextQuestionByDeficit, creatorQuestionsFor, ANSWER_MAX, type CreatorQuestion } from '@twinai/shared'
import { loadVoiceNiche } from '../lib/voiceNicheLoad'
import { loadOwnSells } from '../lib/ownSellsLoad'
import { loadQuestionsPut, answerQuestion, skipQuestion, markQuestionShown, loadKnowledgeCounts } from '../lib/creatorAnswers'
import { cn } from '../lib/cn'

const REFUSAL: Record<string, string> = {
  empty: 'Add a sentence first.',
  too_short: 'A few more words — the detail is the part we cannot get from your videos.',
  too_long: `Keep it under ${ANSWER_MAX} characters. One sharp sentence beats a paragraph.`,
  not_saved: 'We could not save that just now. Your script is safe — try again in a moment.',
}

export function CreatorQuestionCard({ voiceId = null }: { voiceId?: string | null }) {
  const [question, setQuestion] = useState<CreatorQuestion | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [thanks, setThanks] = useState(false)

  // ⚠️⚠️ EXTRACTED SO A SKIP CAN SERVE THE NEXT ONE. This was inline in the
  // effect below, and the effect depends on `voiceId` alone — so "Not this one"
  // set `question` to null, the card returned null, and THE WHOLE SECTION
  // EMPTIED UNTIL THE PAGE WAS RELOADED. Reported live: dismissing one question
  // ended the queue. One question at a time is right; one question EVER is not.
  //
  // ⚖️ THE SERVER DECIDES WHAT IS NEXT, NOT A LOCAL CURSOR. `loadQuestionsPut`
  // is re-read after the skip has been recorded, so the skipped id is already
  // excluded and `nextQuestionByDeficit` picks by what the store actually lacks.
  // A client-side index would drift from the record the moment anything else
  // wrote to it.
  const loadNext = async (alive: () => boolean) => {
    const put = await loadQuestionsPut()
    if (!alive() || put === null) return // not-knowing: ask nothing
    const counts = await loadKnowledgeCounts()
    if (!alive()) return
    const niche = await loadVoiceNiche(voiceId)
    if (!alive()) return
    // ⚠️ WHAT SHE SELLS, NOT ONLY WHAT SHE TALKS ABOUT. Her niche buckets as
    // `business`, which is right, and the business wording asks "when a founder
    // comes to you stuck" — a question a template seller can only decline. Her
    // products say she has BUYERS, NOT CLIENTS, and that is a closed enum rather
    // than prose we have to guess at.
    //
    // ⚖️ A FAILED READ FALLS BACK TO THE BUCKET WORDING, never blocks the card.
    // Not knowing what she sells is the state every creator was in before this
    // existed, and it is served by a real question.
    const sells = await loadOwnSells()
    if (!alive()) return
    const q = nextQuestionByDeficit(put, counts, creatorQuestionsFor(niche, undefined, sells))
    setQuestion(q)
    // ⚠️ RECORDED HERE BECAUSE HERE IS WHERE IT IS TRUE. The impression is
    // written only once a question actually exists to render -- not on mount,
    // which happens on every Result page including the ones that show nothing.
    // Without it "nobody answers" and "nobody was asked" are the same zero, and
    // every fix for the first would be a guess. Best-effort: a failed
    // impression must never cost the creator the question.
    if (q) void markQuestionShown(q.id)
  }

  useEffect(() => {
    let live = true
    // ⚖️ ONE LOADER, CALLED FROM BOTH PLACES. This effect used to carry its own
    // copy of the sequence above; a skip needing the same sequence is exactly
    // how a second authority for one rule gets written.
    void loadNext(() => live)
    return () => { live = false }
    // ⚠️ `voiceId` IS A DEPENDENCY BECAUSE THE LOADER READS IT. It was an empty
    // array while the prop was only used by the submit handler; leaving it empty
    // once the niche is loaded would show the previous voice's wording after a
    // switch.
  }, [voiceId])

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
    //
    // ⚠️⚠️ AND THE SKIP IS AWAITED BEFORE THE NEXT QUESTION IS ASKED FOR,
    // deliberately. `nextQuestionByDeficit` reads the stored record; asking for
    // the next one before the skip has landed would hand back THE SAME
    // QUESTION, which reads as a button that does nothing.
    setBusy(true)
    setQuestion(null)
    await skipQuestion(question.id)
    // ⚖️ AND THEN THE SECTION REFILLS. Dismissing one question is not
    // dismissing the queue; when the bank is genuinely exhausted `loadNext`
    // sets null and the card retires on its own, which is the correct end.
    await loadNext(() => true)
    setBusy(false)
  }

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber">
        My Twin
      </p>
      {/* ⚖️ NO FRACTION HERE. "3/10" implies a target of 10 to hit — a number
          nobody set and the creator would end up optimising for. This is one
          question, asked because we don't know the answer, not a quest with a
          finish line. See twinStrength.ts for the same call made elsewhere. */}
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
        {/* ⚠️ "Add to my voice" NAMED THE ACTION AND NOT THE CONSEQUENCE, on the
            one surface whose entire purpose is stated consequences. Every other
            line on this card says what a thing is FOR — "Only you can answer
            this — your videos cannot", and the strength sentence next door tells
            her what two or three more answers buy. The button that actually
            spends her effort said the least.

            ⚖️ AND THE CONSEQUENCE IS TRUE, WHICH IS THE ONLY REASON IT MAY BE
            PRINTED. Verified against production on 2026-09-12: the answer lands
            in `creator_knowledge` with `source: 'asked'`, and
            `generate-blueprint` runs a SECOND query specifically for those rows
            — because the top-40-by-`times_seen` ranking cannot see a row stated
            once — then places them FIRST in `knowledgeRows` so they survive
            truncation. A test holds this copy to that mechanism, so removing the
            read fails the promise rather than quietly making it a lie. */}
        <button
          type="button"
          disabled={busy || over || !text.trim()}
          onClick={() => void submit()}
          className="btn-gradient flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Add to my voice — scripts can use this'}
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
