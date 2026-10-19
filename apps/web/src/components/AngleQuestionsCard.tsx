import { useEffect, useState } from 'react'
import { loadAnglePlan, sendAngleAnswer, type AngleCardView, type AngleQuestionView } from '../lib/angleQuestions'

// Plan v5.1 M+N (trial only). Three angle cards; after she picks one, the
// questions under it, each with Skip. Answers and skips go to the server
// (angle_answer); answered text is handed up as `mn_answers` for the build.
// Renders nothing when the server says the trial is off for this account.
export function AngleQuestionsCard(props: {
  goal?: string
  objective?: string
  productId?: string
  onAnswers: (answers: Record<string, string>) => void
}) {
  const { goal, objective, productId, onAnswers } = props
  const [cards, setCards] = useState<AngleCardView[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [questions, setQuestions] = useState<AngleQuestionView[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Record<string, 'answered' | 'skipped'>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    loadAnglePlan({ goal, objective, product_id: productId }).then((p) => { if (live) setCards(p.disabled ? [] : p.cards) })
    return () => { live = false }
  }, [goal, objective, productId])

  useEffect(() => {
    if (!picked) return
    let live = true
    loadAnglePlan({ goal, objective, product_id: productId, angle: picked }).then((p) => { if (live) setQuestions(p.questions) })
    return () => { live = false }
  }, [picked, goal, objective, productId])

  useEffect(() => { onAnswers(answers) }, [answers, onAnswers])

  if (!cards.length) return null
  const finish = (q: AngleQuestionView, text: string | null) => {
    void sendAngleAnswer(q, text, productId)
    setDone((d) => ({ ...d, [q.key]: text ? 'answered' : 'skipped' }))
    if (text) setAnswers((a) => ({ ...a, [q.key]: text }))
  }
  return (
    <div className="mt-4" data-testid="mn-angles">
      <span className="text-sm text-cream">Pick an angle</span>
      <div className="mt-2 space-y-2">
        {cards.map((c) => (
          <button key={c.angle} type="button" aria-pressed={picked === c.angle} onClick={() => setPicked(c.angle)}
            className={'block w-full rounded-xl border px-3 py-2 text-left ' + (picked === c.angle ? 'border-coral/50 bg-coral/[0.08]' : 'border-white/12')}>
            <span className="block text-[12px] text-stone">{c.label}{c.twins_pick ? " · Twin's pick" : ''}</span>
            {c.opening.text && <span className="block text-[13px] text-cream">{c.opening.text}</span>}
          </button>
        ))}
      </div>
      {picked && questions.length > 0 && (
        <div className="mt-3 space-y-3" data-testid="mn-questions">
          {questions.map((q) => (
            <div key={q.key}>
              <span className="block text-sm text-cream">{q.text}</span>
              {done[q.key] ? (
                <span className="text-[12px] text-stone">{done[q.key] === 'answered' ? 'Saved' : 'Skipped'}</span>
              ) : (
                <div className="mt-1 flex gap-2">
                  <input aria-label={q.text} className="flex-1 rounded-lg border border-white/12 bg-transparent px-2 py-1 text-[13px] text-cream"
                    value={drafts[q.key] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [q.key]: e.target.value }))} />
                  <button type="button" disabled={!(drafts[q.key] ?? '').trim()} onClick={() => finish(q, (drafts[q.key] ?? '').trim())}
                    className="rounded-lg border border-white/12 px-2 text-[12px] text-cream">Save</button>
                  <button type="button" onClick={() => finish(q, null)} className="px-2 text-[12px] text-stone">Skip</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
