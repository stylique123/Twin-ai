// @vitest-environment jsdom
//
// CONFIRM *AND* ASK — AND THE WAYS THAT GO WRONG SILENTLY.
//
// ⚠️⚠️ REWRITTEN 2026-09-19, AND THE OLD CONTRACT WAS THE DEFECT. This file used
// to assert that "a confirmed suggestion travels the path a typed answer
// travels" — that confirming wrote through `answerQuestion` and resolved the
// slot. That is precisely the runway bug 0218 exists to stop: the suggested row
// ALREADY EXISTS in `creator_knowledge`, so confirming it adds no supply, and
// resolving the question marks it answered under 0128's never-ask-twice rule.
// One tap permanently traded the story we do not have for a re-label of one we
// do. Reported by the owner as: if it is all extractor material, where does the
// new material for the next video come from?
//
// The contract now:
// 1. Confirming marks the EXISTING row and writes no answer. The box stays open.
// 2. An unconfirmed suggestion is never written. Silence is not consent.
// 3. Every slot keeps its blank box, whether or not we had something to show.
// 4. What we already have is shown so she does not repeat it — and so the
//    question can honestly ask for another one.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StoryInterview } from './StoryInterview'

// ⚠️ THE COUNTS HERE ARE DERIVED, NOT LITERAL, AND THAT IS THE POINT. They read
// 3 while the screen asked three, and the day the opening set became FIVE all
// fourteen of them failed on a screen that was working correctly. The claims
// were never about the number — "every question gets a blank box", "silence
// writes nothing" — so they now count `OPENING_THREE`, the same source the
// component renders from. A count changed by decision must not read as a
// regression.
import { OPENING_THREE } from '@twinai/shared'
const SET = OPENING_THREE.length


const mocks = vi.hoisted(() => ({
  answerQuestion: vi.fn(async (_q: { id: string }, _a: string, _v: string | null) => ({ ok: true as const })),
  skipQuestion: vi.fn(async (_id: string) => true),
  markQuestionShown: vi.fn(async (_id: string) => {}),
  loadExtractedKnowledge: vi.fn(async () => [] as unknown[]),
  confirmExtractedRow: vi.fn(async (_id: string) => true),
}))
const { answerQuestion, skipQuestion, markQuestionShown, loadExtractedKnowledge, confirmExtractedRow } = mocks

vi.mock('../lib/creatorAnswers', () => mocks)

// A real production row that genuinely fills `best_result`.
const RESULT_ROW = {
  id: 'row-1',
  kind: 'experience',
  text: 'Sold a black Birkin bag for £13,500 in roughly 40 seconds by posting a single Instagram story.',
  basis: 'stated',
  source: 'transcript',
}

beforeEach(() => {
  answerQuestion.mockClear(); skipQuestion.mockClear()
  markQuestionShown.mockClear(); loadExtractedKnowledge.mockReset()
  confirmExtractedRow.mockClear()
  loadExtractedKnowledge.mockResolvedValue([])
})
afterEach(() => cleanup())

const boxes = () => screen.queryAllByPlaceholderText(/A couple of sentences is plenty/)

describe('every slot keeps its blank box — the question is never consumed', () => {
  it('shows all three boxes when nothing was extracted', async () => {
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(loadExtractedKnowledge).toHaveBeenCalled())
    expect(boxes()).toHaveLength(SET)
    expect(screen.queryByText(/We already heard you say/)).toBeNull()
  })

  it('⚠️ STILL shows all three when a slot HAS something — the card is extra, not instead', async () => {
    // ⚠️⚠️ THE REGRESSION THIS FILE EXISTS FOR. It previously asserted
    // `SET - 1`: a filled slot LOST its box, so the only way to answer that
    // question was to accept material we already had. A creator with a rich
    // scan could therefore add nothing at all, which is the opposite of what
    // these three questions are for.
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())
    expect(boxes()).toHaveLength(SET)
  })

  it('asks for something DIFFERENT once it has shown her what it has', async () => {
    // Asking flat for a best result straight after showing her hers reads as
    // not having listened — and invites the answer we already hold.
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())
    expect(screen.getByText(/Something different from those/)).toBeTruthy()
  })
})

describe('⚠️ confirming is NOT answering', () => {
  it('marks the existing row and writes no answer at all', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    const onDone = vi.fn()
    render(<StoryInterview voiceId="v1" onDone={onDone} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())

    fireEvent.click(screen.getByText('Yes, that is right'))
    await waitFor(() => expect(confirmExtractedRow).toHaveBeenCalledWith('row-1'))

    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    // ⚠️ NO SUPPLY WAS ADDED, because none could be: the row already existed.
    expect(answerQuestion).not.toHaveBeenCalled()
  })

  it('leaves the question open, so she is asked again another day', async () => {
    // ⚠️⚠️ THE WHOLE POINT. `creator_questions_put` never asks twice, so a
    // confirmation that resolved the slot would end this creator's chance of
    // ever giving us that story.
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId="v1" onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())
    fireEvent.click(screen.getByText('Yes, that is right'))
    await waitFor(() => expect(confirmExtractedRow).toHaveBeenCalled())
    // Not marked answered by the confirmation itself.
    expect(answerQuestion).not.toHaveBeenCalled()
    // And the box she could still fill is right there.
    expect(boxes()).toHaveLength(SET)
  })

  it('a NEW story typed beside a confirmation is what actually gets stored', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId="v1" onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())
    fireEvent.click(screen.getByText('Yes, that is right'))

    const field = screen.getByLabelText(/most specific result/i) as HTMLTextAreaElement
    // ⚠️ IT STARTS EMPTY. Pre-filling it with the suggestion is how the old
    // shape smuggled the existing row back in as a new answer.
    expect(field.value).toBe('')
    fireEvent.change(field, { target: { value: 'Cleared £40k of dead stock in one week with a live sale.' } })
    fireEvent.click(screen.getByText('Continue'))

    await waitFor(() => expect(answerQuestion).toHaveBeenCalledTimes(1))
    const [question, answer] = answerQuestion.mock.calls[0]
    expect(question.id).toBe('best_result')
    expect(answer).toContain('£40k')
  })
})

describe('silence is not confirmation', () => {
  it('writes nothing for a card the creator never acted on', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    const onDone = vi.fn()
    render(<StoryInterview voiceId={null} onDone={onDone} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())

    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    expect(answerQuestion).not.toHaveBeenCalled()
    expect(confirmExtractedRow).not.toHaveBeenCalled()
    expect(skipQuestion.mock.calls.map((c) => c[0]).sort())
      .toEqual([...OPENING_THREE].sort())
  })

  it('writes nothing for a shown card when they skip all', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())

    fireEvent.click(screen.getByText('Skip all'))
    await waitFor(() => expect(skipQuestion).toHaveBeenCalledTimes(SET))
    expect(answerQuestion).not.toHaveBeenCalled()
    expect(confirmExtractedRow).not.toHaveBeenCalled()
  })

  it('does not claim a confirmation the write refused', async () => {
    // ⚖️ Showing "Confirmed" for a write that failed is worse than not offering
    // the button: it tells her we recorded something we did not.
    confirmExtractedRow.mockResolvedValue(false)
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())
    fireEvent.click(screen.getByText('Yes, that is right'))
    await waitFor(() => expect(confirmExtractedRow).toHaveBeenCalled())
    expect(screen.queryByText(/Confirmed ✓/)).toBeNull()
  })
})

describe('hiding the card leaves the question exactly as it was', () => {
  it('keeps every box, because the box was never the card', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We already heard you say/)).toBeTruthy())
    expect(boxes()).toHaveLength(SET)
    fireEvent.click(screen.getByText('Hide these'))
    await waitFor(() => expect(screen.queryByText(/We already heard you say/)).toBeNull())
    expect(boxes()).toHaveLength(SET)
  })
})
