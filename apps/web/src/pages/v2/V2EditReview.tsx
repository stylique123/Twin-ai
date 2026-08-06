// THE TRANSCRIPT IS THE EDITOR — §4.8's screen.
//
//   "Strike a sentence → the cut is removed. Fix a word → the caption changes.
//    Click a zoom marker → it is gone. No timeline, no scrubbing, no waveform —
//    because every renderer decision already derives from the transcript,
//    editing the words IS editing the video."
//
// So there is deliberately no player, no scrubber and no waveform here. The
// whole screen is the words, and every control is attached to a word or a
// sentence. Anything else would be a second way to say the same thing, and the
// creator would have to learn which one wins.
//
// ── WHAT A CLICK MAY MEAN IS NOT DECIDED HERE ────────────────────────────
//
// It may REMOVE and CORRECT; it may not INVENT. That rule lives in
// worker/src/jobs/reviewOverlay.ts and is enforced server-side on every overlay
// from every source — this screen, a future API, a support tool. This file
// builds an overlay in the shape the server accepts (packages/shared
// editor/review.ts) and submits it; it does not re-decide any of the rule, and
// a bug here can produce a REFUSED submit but never an unbounded edit.
//
// ── WHAT IS NOT PROVEN ───────────────────────────────────────────────────
//
// The overlay building and the sentence grouping are unit-tested. Whether this
// screen COMMUNICATES that editing the words edits the video is the actual
// claim of §4.8, and no test in this repository establishes it. It needs eyes
// on a real transcript.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, RotateCcw, Scissors, Sparkles, Type, ZoomIn } from 'lucide-react'
import ScreenLayout from '../../components/v2/ScreenLayout'
import { PrimaryButton, SectionTitle } from '../../components/v2/Primitives'
import {
  buildReviewOverlay, getReviewBundle, isEmptyReviewOverlay, reviewOverlayOverCaps,
  submitEditReview, SubmitEditReviewError,
  type ReviewBundle, type ReviewSentence,
} from '../../lib/api'

/** What the creator has done, kept in the shape the screen thinks in — sets of
 *  sentence indices and a map of respellings — and converted to the overlay's
 *  word-index vocabulary only at submit. Storing overlay ranges directly would
 *  make un-striking a sentence a range-splitting problem. */
interface Edits {
  struckSentences: Set<number>
  restoredSelections: Set<number>
  droppedZooms: Set<number>
  respellings: Map<number, string>
}

const EMPTY_EDITS: Edits = {
  struckSentences: new Set(),
  restoredSelections: new Set(),
  droppedZooms: new Set(),
  respellings: new Map(),
}

const REFUSALS: Record<string, string> = {
  review_wrong_stage: 'This video has moved on — it is no longer waiting for a review.',
  review_already_submitted: 'A review was already submitted for this video.',
  review_not_ready: 'Almost — the previous step is still finishing. Try again in a moment.',
  review_cancelled: 'This video is being cancelled.',
  review_forbidden: 'This video is not available on your account.',
  review_overlay_invalid: 'Something about these edits was refused. Nothing has been changed.',
}

export default function V2EditReview() {
  const { projectId = '' } = useParams()
  const nav = useNavigate()
  const [bundle, setBundle] = useState<ReviewBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [edits, setEdits] = useState<Edits>(EMPTY_EDITS)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [editingWord, setEditingWord] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const b = await getReviewBundle(projectId)
        if (!alive) return
        if (!b) { setLoadError('We could not find this video.'); return }
        setBundle(b)
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : 'We could not load your transcript.')
      }
    })()
    return () => { alive = false }
  }, [projectId])

  // Which words the DIRECTOR proposed to cut, by word index, and which of those
  // the creator has put back. A selection is restored as a whole: the Director
  // chose a span, and un-choosing half of it is not a thing the decision can
  // express.
  const directorCutWords = useMemo(() => {
    const byWord = new Map<number, number>()
    for (const cut of bundle?.directorCuts ?? []) {
      for (const w of cut.wordIndices) byWord.set(w, cut.selectionIndex)
    }
    return byWord
  }, [bundle])

  const zoomByWord = useMemo(() => {
    const m = new Map<number, string>()
    for (const z of bundle?.zooms ?? []) m.set(z.anchorWordIndex, z.intensity)
    return m
  }, [bundle])

  const overlay = useMemo(() => buildReviewOverlay({
    struckWordRanges: [...edits.struckSentences]
      .map((i) => bundle?.sentences[i])
      .filter((s): s is ReviewSentence => !!s)
      .map((s) => ({ startWordIndex: s.startWordIndex, endWordIndex: s.endWordIndex })),
    restoredSelections: [...edits.restoredSelections],
    droppedZoomAnchors: [...edits.droppedZooms],
    respellings: [...edits.respellings.entries()].map(([wordIndex, text]) => ({ wordIndex, text })),
  }), [edits, bundle])

  const overCaps = reviewOverlayOverCaps(overlay)
  const untouched = isEmptyReviewOverlay(overlay)

  const toggle = useCallback((key: keyof Edits, value: number) => {
    setEdits((prev) => {
      const next = new Set(prev[key] as Set<number>)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return { ...prev, [key]: next }
    })
  }, [])

  const respell = useCallback((wordIndex: number, text: string) => {
    setEdits((prev) => {
      const next = new Map(prev.respellings)
      // Clearing the box, or typing the word back exactly, REMOVES the edit
      // rather than recording a no-op respelling — so "I changed my mind" and
      // "I never touched it" produce the same overlay and therefore the same
      // video.
      const original = bundle?.words[wordIndex]?.text
      if (text.trim() === '' || text.trim() === original) next.delete(wordIndex)
      else next.set(wordIndex, text.trim())
      return { ...prev, respellings: next }
    })
  }, [bundle])

  const onSubmit = useCallback(async () => {
    if (!bundle || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitEditReview(bundle.projectId, overlay, bundle.spokenWordCount)
      // THE GENERATION, not the project. `/result/:id` loads a generation and
      // then finds its latest edit project; handing it a project id sent the
      // creator to a plan that does not exist, immediately after a submit that
      // had succeeded.
      nav(`/result/${bundle.generationId}`, { replace: true })
    } catch (e) {
      // NAMED, never a raw database string. The codes are stable and each one
      // has a different thing for the creator to do next.
      const code = e instanceof SubmitEditReviewError ? e.code : 'unknown'
      setSubmitError(REFUSALS[code] ?? 'We could not save your edits. Nothing has been changed.')
      setSubmitting(false)
    }
  }, [bundle, overlay, submitting, nav])

  if (loadError) {
    return (
      <ScreenLayout title="Review your video" subtitle="Edit the words, edit the video">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-sand/80">
          {loadError}
        </div>
      </ScreenLayout>
    )
  }

  if (!bundle) {
    return (
      <ScreenLayout title="Review your video" subtitle="Edit the words, edit the video">
        <div className="flex items-center gap-2 text-sm text-sand/70">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your transcript…
        </div>
      </ScreenLayout>
    )
  }

  if (bundle.status !== 'awaiting_review') {
    // Honest about WHICH state it is in rather than a generic "unavailable" —
    // "already rendering" and "already finished" mean different next steps.
    return (
      <ScreenLayout title="Review your video" subtitle="Edit the words, edit the video">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-sand/80">
            This video is no longer waiting for a review — it is <b>{bundle.status}</b>.
          </p>
          <button onClick={() => nav(`/result/${bundle.generationId}`)} className="btn-ghost mt-4 w-full">
            Go to the video
          </button>
        </div>
      </ScreenLayout>
    )
  }

  const struckCount = edits.struckSentences.size
  const changeCount = struckCount + edits.respellings.size
    + edits.restoredSelections.size + edits.droppedZooms.size

  return (
    <ScreenLayout
      title="Review your video"
      subtitle="Edit the words — that edits the video"
      cta={
        <div className="space-y-2">
          {overCaps.length > 0 && (
            <p className="text-center text-xs text-coral">
              That is more edits than one review can carry. Try removing a few.
            </p>
          )}
          {submitError && <p className="text-center text-xs text-coral">{submitError}</p>}
          <PrimaryButton onClick={onSubmit} disabled={submitting || overCaps.length > 0}>
            {submitting ? 'Saving your edits…' : 'Make my video'}
          </PrimaryButton>
          <p className="text-center text-[11px] text-sand/50">
            {untouched
              ? 'No changes — we will make it exactly as planned.'
              : `${changeCount} change${changeCount === 1 ? '' : 's'} will be applied.`}
          </p>
        </div>
      }
    >
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-sand/70">
        Tap a sentence to cut it. Tap a word to fix its spelling. Struck-through
        lines are cuts we already planned — tap one to keep it after all.
        Nothing here can add words you did not say.
      </div>

      <SectionTitle>Your transcript</SectionTitle>

      {bundle.sentences.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-sand/80">
          We did not find any speech in this recording, so there is nothing to review.
        </div>
      )}

      <div className="space-y-2">
        {bundle.sentences.map((s) => {
          const struckByCreator = edits.struckSentences.has(s.index)
          // A sentence counts as a planned cut only when the Director selected
          // EVERY word in it — a selection covering two words of a ten-word
          // sentence is a silence trim inside it, not a proposal to lose the
          // line, and showing the whole sentence struck through would be the
          // screen claiming a cut nobody made.
          const selections = new Set(
            s.words.map((w) => directorCutWords.get(w.index)).filter((v): v is number => v !== undefined))
          const whollyCut = selections.size === 1
            && s.words.every((w) => directorCutWords.has(w.index))
          const selectionIndex = whollyCut ? [...selections][0] : null
          const restored = selectionIndex !== null && edits.restoredSelections.has(selectionIndex)
          const cutAway = struckByCreator || (whollyCut && !restored)

          return (
            <div
              key={s.index}
              className={`rounded-2xl border p-3 transition ${
                cutAway
                  ? 'border-white/5 bg-white/[0.015]'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <p className={`text-[15px] leading-relaxed ${cutAway ? 'text-sand/35 line-through' : 'text-cream'}`}>
                {s.words.map((w) => {
                  const respelt = edits.respellings.get(w.index)
                  const zoom = zoomByWord.get(w.index)
                  const zoomDropped = edits.droppedZooms.has(w.index)
                  return (
                    <span key={w.index}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingWord(w.index) }}
                        className={`rounded px-0.5 -mx-0.5 hover:bg-white/10 ${
                          respelt ? 'text-teal underline decoration-dotted underline-offset-4' : ''
                        }`}
                        title={respelt ? `Was “${w.text}”` : 'Fix this word'}
                      >
                        {respelt ?? w.text}
                      </button>
                      {zoom && !zoomDropped && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggle('droppedZooms', w.index) }}
                          className="mx-1 inline-flex items-center rounded-full bg-amber/15 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber hover:bg-amber/25"
                          title="Remove this zoom"
                        >
                          <ZoomIn className="mr-0.5 h-3 w-3" />{zoom}
                        </button>
                      )}
                      {zoom && zoomDropped && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggle('droppedZooms', w.index) }}
                          className="mx-1 inline-flex items-center rounded-full bg-white/5 px-1.5 py-0.5 align-middle text-[10px] text-sand/40 line-through hover:bg-white/10"
                          title="Put this zoom back"
                        >
                          <ZoomIn className="mr-0.5 h-3 w-3" />{zoom}
                        </button>
                      )}
                      {' '}
                    </span>
                  )
                })}
              </p>

              <div className="mt-2 flex items-center gap-3 text-[11px]">
                {whollyCut && !struckByCreator ? (
                  <button
                    type="button"
                    onClick={() => selectionIndex !== null && toggle('restoredSelections', selectionIndex)}
                    className="inline-flex items-center gap-1 text-sand/60 hover:text-cream"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {restored ? 'Cut this after all' : 'Keep this line'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle('struckSentences', s.index)}
                    className={`inline-flex items-center gap-1 ${
                      struckByCreator ? 'text-teal hover:text-cream' : 'text-sand/60 hover:text-cream'
                    }`}
                  >
                    {struckByCreator ? <RotateCcw className="h-3 w-3" /> : <Scissors className="h-3 w-3" />}
                    {struckByCreator ? 'Put this back' : 'Cut this line'}
                  </button>
                )}
                {whollyCut && !struckByCreator && !restored && (
                  <span className="inline-flex items-center gap-1 text-sand/40">
                    <Sparkles className="h-3 w-3" /> we planned to cut this
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editingWord !== null && bundle.words[editingWord] && (
        <RespellSheet
          original={bundle.words[editingWord].text}
          value={edits.respellings.get(editingWord) ?? bundle.words[editingWord].text}
          onCancel={() => setEditingWord(null)}
          onSave={(text) => { respell(editingWord, text); setEditingWord(null) }}
        />
      )}
    </ScreenLayout>
  )
}

/**
 * Fixing one word's LETTERS.
 *
 * ONE WORD, ALWAYS. Whitespace is stripped from what the creator types rather
 * than accepted and refused later, because a space is the one door through
 * which a "spelling fix" becomes new speech — "twinny" -> "Twin AI and also buy
 * my course". The server refuses it regardless; taking it out here means the
 * creator learns the rule while typing instead of at submit.
 */
function RespellSheet({ original, value, onCancel, onSave }: {
  original: string
  value: string
  onCancel: () => void
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(value)
  const cleaned = text.replace(/\s+/g, '')
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-ink/70 backdrop-blur-sm sm:place-items-center" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-ink p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-cream">
          <Type className="h-4 w-4 text-teal" /> Fix this word
        </div>
        <p className="mt-1 text-xs text-sand/60">
          You said “{original}”. Change how it is SPELLED on screen — the video
          still plays the word you said.
        </p>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-4 w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-base text-cream outline-none focus:border-teal/60"
        />
        {cleaned !== text && (
          <p className="mt-2 text-[11px] text-amber">
            A caption word cannot contain a space — we will use “{cleaned}”.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-2xl border border-white/15 py-3 text-sm text-sand/80 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={() => onSave(cleaned)}
            disabled={cleaned === ''}
            className="flex-1 rounded-2xl bg-cream py-3 text-sm font-semibold text-ink disabled:opacity-40"
          >
            Use this spelling
          </button>
        </div>
      </div>
    </div>
  )
}
