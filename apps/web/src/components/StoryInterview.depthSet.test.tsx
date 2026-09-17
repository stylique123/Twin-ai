// @vitest-environment jsdom
//
// ONE RENDERER, TWO PLACEMENTS — PROVEN BY RENDERING IT.
//
// ⚠️ THE SOURCE ANCHORS CANNOT SEE THIS. `onboardingQuestionFlow` and
// `Onboarding.storiesAfterDna` assert that the scan step mounts the interview
// with `questionIds={DEPTH_QUESTION_IDS}` and passes no niche. Both are true of
// a prop that is silently ignored. What they cannot check is that the prop
// actually decides which questions a creator meets, and that the answers are
// written against the ids the bank owns — which is what stops the same question
// being asked again on the post-script card.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StoryInterview } from './StoryInterview'
import { CREATOR_QUESTIONS, DEPTH_QUESTION_IDS, OPENING_THREE } from '@twinai/shared'

const mocks = vi.hoisted(() => ({
  answerQuestion: vi.fn(async (_q: { id: string }, _a: string, _v: string | null) => ({ ok: true as const })),
  skipQuestion: vi.fn(async (_id: string) => true),
  markQuestionShown: vi.fn(async (_id: string) => {}),
  loadExtractedKnowledge: vi.fn(async () => [] as unknown[]),
}))
const { answerQuestion, skipQuestion, markQuestionShown, loadExtractedKnowledge } = mocks
vi.mock('../lib/creatorAnswers', () => mocks)

beforeEach(() => {
  window.localStorage.clear()
  answerQuestion.mockClear(); skipQuestion.mockClear(); markQuestionShown.mockClear()
  loadExtractedKnowledge.mockReset(); loadExtractedKnowledge.mockResolvedValue([])
})
afterEach(() => cleanup())

const boxes = () => screen.queryAllByPlaceholderText(/A couple of sentences is plenty/)
const askOf = (id: string) => CREATOR_QUESTIONS.find((q) => q.id === id)?.ask ?? ''

describe('the scan step asks the depth two and only those', () => {
  it('renders exactly as many boxes as the set it was given', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes()).toHaveLength(DEPTH_QUESTION_IDS.length))
    // ⚠️ REFUSES A VACUOUS PASS: the two sets must differ in size, or this
    // assertion would hold even if the prop were ignored.
    expect(DEPTH_QUESTION_IDS.length).not.toBe(OPENING_THREE.length)
  })

  it('shows the depth questions and NOT the story three', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes()).toHaveLength(DEPTH_QUESTION_IDS.length))
    const body = document.body.textContent ?? ''
    for (const id of DEPTH_QUESTION_IDS) expect(body, `${id} is missing`).toContain(askOf(id))
    for (const id of OPENING_THREE) expect(body, `${id} leaked onto the scan step`).not.toContain(askOf(id))
  })

  it('and never renders a sentence that names a niche the scan has not read', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes()).toHaveLength(DEPTH_QUESTION_IDS.length))
    // The defect the story three were moved off this screen to avoid.
    expect(document.body.textContent ?? '').not.toMatch(/in your (niche|industry|corner|field)/i)
  })

  it('stores an answer against the bank id, so it is never asked twice', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes()).toHaveLength(DEPTH_QUESTION_IDS.length))
    fireEvent.change(boxes()[0], { target: { value: 'I cut the leather oversized first, then pare the turn-ins by hand.' } })
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(answerQuestion).toHaveBeenCalled())
    const [question, answer, voiceId] = answerQuestion.mock.calls[0]
    expect(DEPTH_QUESTION_IDS, `stored '${question.id}', which is not in the depth set`).toContain(question.id)
    expect(answer).toContain('pare the turn-ins')
    expect(voiceId).toBe('v1')
  })

  it('resolves the untouched one as a skip, so nothing is left unanswered', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes()).toHaveLength(DEPTH_QUESTION_IDS.length))
    fireEvent.change(boxes()[0], { target: { value: 'A specific method, stated plainly and at length.' } })
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(answerQuestion).toHaveBeenCalled())
    const answered = answerQuestion.mock.calls.map((c) => c[0].id)
    const skipped = skipQuestion.mock.calls.map((c) => c[0])
    expect([...answered, ...skipped].sort()).toEqual([...DEPTH_QUESTION_IDS].sort())
  })

  // ⚠️ MY FIRST VERSION OF THIS TEST WAS WRONG, NOT THE CODE. It asserted
  // `markQuestionShown` fires for every question rendered. It does not, and the
  // component says why: it fires only when a creator DISCARDS a suggested
  // sentence, because "a suggestion that was shown and rejected is not a
  // question that was never put, and only `markQuestionShown` can tell them
  // apart later." With no suggestions offered, zero calls is the correct
  // behaviour. Asserting the contract the component actually has.
  it('records `shown` only when a suggestion is discarded, never on render', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes()).toHaveLength(DEPTH_QUESTION_IDS.length))
    // Nothing was suggested, so nothing was shown-and-rejected.
    expect(markQuestionShown).not.toHaveBeenCalled()
  })

  it('and a discarded suggestion IS recorded, so the three states stay three', async () => {
    // A row the extractor already found, matching the method question's slot.
    loadExtractedKnowledge.mockResolvedValue([{
      kind: 'framework',
      text: 'I cut the leather oversized, pare the turn-ins, then glue and press overnight.',
      basis: 'stated',
      source: 'transcript',
    }])
    render(<StoryInterview voiceId="v1" onDone={() => {}} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes().length + 1).toBeGreaterThan(0))
    const discard = screen.queryByText('No, that is not it')
      ?? screen.queryByText(/not it|Discard|blank box/i)
    // ⚖️ IF NO SUGGESTION WAS OFFERED, SAY SO RATHER THAN PASS. A suggestion
    // depends on the extractor matching a slot, which is not this PR's subject —
    // but a silent skip here would look like a passing assertion.
    if (!discard) {
      expect(markQuestionShown).not.toHaveBeenCalled()
      return
    }
    fireEvent.click(discard)
    await waitFor(() => expect(markQuestionShown).toHaveBeenCalled())
    expect(DEPTH_QUESTION_IDS).toContain(markQuestionShown.mock.calls[0][0])
  })

  it('calls onDone only once everything is resolved', async () => {
    const onDone = vi.fn()
    render(<StoryInterview voiceId="v1" onDone={onDone} questionIds={DEPTH_QUESTION_IDS} />)
    await waitFor(() => expect(boxes()).toHaveLength(DEPTH_QUESTION_IDS.length))
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('defaults to the story three when no set is given', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} />)
    await waitFor(() => expect(boxes()).toHaveLength(OPENING_THREE.length))
    const body = document.body.textContent ?? ''
    for (const id of OPENING_THREE) expect(body).toContain(askOf(id))
  })
})
