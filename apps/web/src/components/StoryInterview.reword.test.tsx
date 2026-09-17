// @vitest-environment jsdom
//
// THE QUESTION REWORDS ITSELF WHILE SHE IS ANSWERING IT.
//
// ⚠️ THIS IS NOT A HYPOTHETICAL AND IT IS NOT A BUG — IT IS THE DESIGN. These
// questions are asked DURING the scan, so at first render there is no niche and
// `creatorQuestionsFor` correctly returns the plain bank. The parent parks the
// finished scan until the answers are in, so for most creators the profile lands
// WHILE THEY ARE STILL TYPING, and from that moment the wording becomes theirs.
// `StoryInterview` states exactly that.
//
// ⚠️ SO THE RISK IS NOT THE REWORD, IT IS WHAT THE REWORD COULD TAKE WITH IT.
// `CreatorQuestion.id` is what "already answered" is keyed on, and the file's
// own warning is that a creator who answered one "must never meet it again
// wearing different wording". If the typed text, the restored draft or the
// suggestion slots were keyed on anything but that stable id, a profile arriving
// mid-sentence would silently empty the box she was typing in — and it would
// look exactly like a creator who changed her mind.
//
// ⚖️ NOTHING COVERED THIS. No StoryInterview test used `rerender` at all, so the
// mid-answer profile arrival — the single most likely moment in this screen's
// life — was untested. It matters more now that the wording also splices her
// `sub_niche`, which changes MORE of the sentence than the niche bucket did.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StoryInterview } from './StoryInterview'
import { readStoryDraft } from '../lib/storyDraft'
import { openingSetFor } from '@twinai/shared'

const SET = openingSetFor().length

const mocks = vi.hoisted(() => ({
  answerQuestion: vi.fn(async (_q: { id: string }, _a: string, _v: string | null) => ({ ok: true as const })),
  skipQuestion: vi.fn(async (_id: string) => true),
  markQuestionShown: vi.fn(async (_id: string) => {}),
  loadExtractedKnowledge: vi.fn(async () => [] as unknown[]),
}))
const { answerQuestion, loadExtractedKnowledge } = mocks
vi.mock('../lib/creatorAnswers', () => mocks)

beforeEach(() => {
  window.localStorage.clear()
  answerQuestion.mockClear()
  loadExtractedKnowledge.mockReset(); loadExtractedKnowledge.mockResolvedValue([])
})
afterEach(() => cleanup())

const boxes = () => screen.queryAllByPlaceholderText(/A couple of sentences is plenty/)
const HERS = 'The week I rebound four family Bibles and the goatskin arrived two shades off.'

/** The DNA the scan eventually returns, for a real production shape. */
const LATE = { niche: 'Business & Entrepreneurship', subNiche: 'custom Bible rebinding' }

describe('a profile arriving mid-answer must not cost her the answer', () => {
  it('keeps what she typed when the wording changes under her', async () => {
    const view = render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))

    // ⚠️ READ THE RENDERED TEXT, NOT `labels[0]`. That returned empty strings for
    // every box and the vacuity guard below caught it — which is the whole reason
    // that guard is there: the comparison measured nothing and would have passed
    // on a broken implementation just as happily.
    const before = document.body.textContent ?? ''
    expect(before).toMatch(/your niche|your industry/)
    fireEvent.change(boxes()[0], { target: { value: HERS } })
    await waitFor(() => expect(Object.values(readStoryDraft())).toContain(HERS))

    // The scan lands.
    view.rerender(<StoryInterview voiceId={null} onDone={() => {}} niche={LATE.niche} subNiche={LATE.subNiche} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))

    // ⚠️ REFUSES A VACUOUS PASS. If the wording did NOT change, this test proves
    // nothing about surviving a reword — so the change is asserted first, and
    // asserted specifically rather than as "something differs".
    const after = document.body.textContent ?? ''
    expect(after, 'the wording did not change, so this test is vacuous').not.toBe(before)
    expect(after).toContain('custom Bible rebinding')

    // And the answer is still there, in the box and in the draft.
    expect((boxes()[0] as HTMLTextAreaElement).value).toBe(HERS)
    expect(Object.values(readStoryDraft())).toContain(HERS)
  })

  it('the reword reaches her actual craft, not just the bucket', async () => {
    const view = render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))
    view.rerender(<StoryInterview voiceId={null} onDone={() => {}} niche={LATE.niche} subNiche={LATE.subNiche} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))
    // The sub_niche splice is the thing #922 added; prove it renders.
    expect(document.body.textContent).toContain('custom Bible rebinding')
  })

  it('the same number of boxes, so no question is lost or duplicated by the reword', async () => {
    const view = render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))
    view.rerender(<StoryInterview voiceId={null} onDone={() => {}} niche={LATE.niche} subNiche={LATE.subNiche} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))
  })

  // ⚠️ THE ID IS THE CONTRACT. Whatever the wording became, the answer must be
  // written against the id the bank owns — a reworded question that stored under
  // a new key would be asked again later, which is the one thing the file says
  // must never happen.
  it('stores the answer against the stable id, not the wording', async () => {
    const view = render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))
    fireEvent.change(boxes()[0], { target: { value: HERS } })
    view.rerender(<StoryInterview voiceId={null} onDone={() => {}} niche={LATE.niche} subNiche={LATE.subNiche} />)
    await waitFor(() => expect(boxes()).toHaveLength(SET))

    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(answerQuestion).toHaveBeenCalled())
    // ⚠️ NO CAST. My first version wrote `as [{ id: string }, string]` and tsc
    // refused it: the mock takes THREE arguments and the tuple claimed two. A
    // cast would have silenced that instead of fixing it, which is the standing
    // rule here — a cast defeats the compiler.
    const [question, answer] = answerQuestion.mock.calls[0]
    expect(answer).toBe(HERS)
    const ids = openingSetFor().map((q) => q.id)
    expect(ids, `stored under '${question.id}', which the bank does not own`).toContain(question.id)
  })
})
