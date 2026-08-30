// @vitest-environment jsdom
//
// CONFIRM INSTEAD OF ASK — AND THE FOUR WAYS THAT GOES WRONG SILENTLY.
//
// 1. A confirmed suggestion takes a DIFFERENT storage path from a typed answer,
//    so the writer reads it differently or not at all.
// 2. An unconfirmed suggestion gets written anyway, and the creator is recorded
//    as having attested to a sentence they never read. Silence is not consent.
// 3. Discard hides the suggestion and leaves the creator with nothing to do.
// 4. A slot with no extracted item loses its blank box, and the creator who
//    most needs asking is asked nothing.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StoryInterview } from './StoryInterview'

const mocks = vi.hoisted(() => ({
  answerQuestion: vi.fn(async (_q: { id: string }, _a: string, _v: string | null) => ({ ok: true as const })),
  skipQuestion: vi.fn(async (_id: string) => true),
  markQuestionShown: vi.fn(async (_id: string) => {}),
  loadExtractedKnowledge: vi.fn(async () => [] as unknown[]),
}))
const { answerQuestion, skipQuestion, markQuestionShown, loadExtractedKnowledge } = mocks

vi.mock('../lib/creatorAnswers', () => mocks)

// A real production row that genuinely fills `best_result`.
const RESULT_ROW = {
  kind: 'experience',
  text: 'Sold a black Birkin bag for £13,500 in roughly 40 seconds by posting a single Instagram story.',
  basis: 'stated',
  source: 'transcript',
}

beforeEach(() => {
  answerQuestion.mockClear(); skipQuestion.mockClear()
  markQuestionShown.mockClear(); loadExtractedKnowledge.mockReset()
  loadExtractedKnowledge.mockResolvedValue([])
})
afterEach(() => cleanup())

const boxes = () => screen.queryAllByPlaceholderText(/A couple of sentences is plenty/)

describe('a slot the scan could not fill still gets its blank box', () => {
  it('shows all three boxes when nothing was extracted', async () => {
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(loadExtractedKnowledge).toHaveBeenCalled())
    expect(boxes()).toHaveLength(3)
    expect(screen.queryByText(/We found this in your videos/)).toBeNull()
  })

  it('leaves the other two blank when only one slot could be filled', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We found this in your videos/)).toBeTruthy())
    // One slot became a confirmation, the other two are still questions.
    expect(boxes()).toHaveLength(2)
  })
})

describe('a confirmed suggestion travels the path a typed answer travels', () => {
  it('is written through answerQuestion with the best_result question, not a second store', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    const onDone = vi.fn()
    render(<StoryInterview voiceId="v1" onDone={onDone} />)
    await waitFor(() => expect(screen.getByText(/We found this in your videos/)).toBeTruthy())

    fireEvent.click(screen.getByText('Yes, that is right'))
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    expect(answerQuestion).toHaveBeenCalledTimes(1)
    const [question, answer, voiceId] = answerQuestion.mock.calls[0]
    // ⚠️ THE SAME QUESTION OBJECT A TYPED ANSWER WOULD CARRY. `answerToKnowledge`
    // derives `source_ref: 'asked:<id>'` from exactly this, which is what makes
    // the confirmed sentence indistinguishable downstream from a typed one.
    expect(question.id).toBe('best_result')
    expect(answer).toContain('£13,500')
    expect(voiceId).toBe('v1')
    // The two slots with no suggestion were resolved as skips, as always.
    expect(skipQuestion.mock.calls.map((c) => c[0]).sort())
      .toEqual(['contrarian', 'expensive_lesson'])
  })

  it('carries an edit through the same single path', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We found this in your videos/)).toBeTruthy())

    fireEvent.click(screen.getByText('Close, but let me fix it'))
    const field = screen.getByLabelText(/most specific result/i) as HTMLTextAreaElement
    expect(field.value).toContain('£13,500')
    fireEvent.change(field, { target: { value: 'Sold a Birkin for £13,500 in about 40 seconds off one story.' } })
    fireEvent.click(screen.getByText('Continue'))

    await waitFor(() => expect(answerQuestion).toHaveBeenCalledTimes(1))
    const [question, answer] = answerQuestion.mock.calls[0]
    expect(question.id).toBe('best_result')
    expect(answer).toBe('Sold a Birkin for £13,500 in about 40 seconds off one story.')
  })
})

describe('silence is not confirmation', () => {
  it('writes nothing for a suggestion the creator never acted on', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    const onDone = vi.fn()
    render(<StoryInterview voiceId={null} onDone={onDone} />)
    await waitFor(() => expect(screen.getByText(/We found this in your videos/)).toBeTruthy())

    // They read the three prompts and pressed Continue. That is a skip.
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    expect(answerQuestion).not.toHaveBeenCalled()
    expect(skipQuestion.mock.calls.map((c) => c[0]).sort())
      .toEqual(['best_result', 'contrarian', 'expensive_lesson'])
  })

  it('writes nothing for a shown suggestion when they skip all', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We found this in your videos/)).toBeTruthy())

    fireEvent.click(screen.getByText('Skip all'))
    await waitFor(() => expect(skipQuestion).toHaveBeenCalledTimes(3))
    expect(answerQuestion).not.toHaveBeenCalled()
  })
})

describe('discard gives the creator the blank box back', () => {
  it('reveals the question rather than quietly writing the rejected line', async () => {
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText(/We found this in your videos/)).toBeTruthy())
    expect(boxes()).toHaveLength(2)

    fireEvent.click(screen.getByText('Not this — I will write my own'))

    // The suggestion is gone and the third box is back.
    expect(screen.queryByText(/We found this in your videos/)).toBeNull()
    expect(boxes()).toHaveLength(3)
    const field = screen.getByLabelText(/most specific result/i) as HTMLTextAreaElement
    expect(field.value).toBe('')

    // ⚠️ AND IT IS RECORDED AS SHOWN, so "never put" and "put and rejected"
    // stay two different states.
    expect(markQuestionShown).toHaveBeenCalledWith('best_result')

    // Continuing from here writes nothing for that slot.
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(skipQuestion).toHaveBeenCalledTimes(3))
    expect(answerQuestion).not.toHaveBeenCalled()
  })
})
