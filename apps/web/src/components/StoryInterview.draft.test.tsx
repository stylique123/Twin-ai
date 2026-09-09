// @vitest-environment jsdom
//
// SHE TYPED IT AND THE TAB TOOK IT.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-09. Eleven creators reached these three
// questions. TWO ever produced a stored answer. Five skipped all three. FOUR
// carry `creator_questions_put` rows with outcome `shown` and NOTHING else —
// `submit()` resolves every question as answered-or-skipped before `onDone`, so
// a creator with neither never completed it. One of the four is the baker whose
// store holds eight caption-derived rows and none of the three stories she was
// asked for; her five `shown` rows span thirty-one minutes.
//
// ⚠️ AND THE WRITE PATH WAS NOT THE CAUSE — established before building.
// `outcome = 'answered'` is 6 and `creator_knowledge` with `source = 'asked'`
// is 6, exactly matched, so the 0189 CHECK-constraint failure that once marked
// twelve answers taken and stored none is closed.
//
// ⚖️ THE CAUSE IS THAT NOTHING SAVED UNTIL "Continue". These answers cannot be
// derived from anything else in the product — captions produce zero experience
// items, ever — so losing one loses it for good.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StoryInterview } from './StoryInterview'
import { readStoryDraft, STORY_DRAFT_IS_PER_DEVICE } from '../lib/storyDraft'

const mocks = vi.hoisted(() => ({
  answerQuestion: vi.fn(async (_q: { id: string }, _a: string, _v: string | null) => ({ ok: true as const })),
  skipQuestion: vi.fn(async (_id: string) => true),
  markQuestionShown: vi.fn(async (_id: string) => {}),
  loadExtractedKnowledge: vi.fn(async () => [] as unknown[]),
}))
const { answerQuestion, skipQuestion, loadExtractedKnowledge } = mocks
vi.mock('../lib/creatorAnswers', () => mocks)

const RESULT_ROW = {
  kind: 'experience',
  text: 'Sold a black Birkin bag for £13,500 in roughly 40 seconds by posting a single Instagram story.',
  basis: 'stated',
  source: 'transcript',
}

const HERS = 'The week I sold four hundred pounds of sourdough out of a domestic oven.'

beforeEach(() => {
  window.localStorage.clear()
  answerQuestion.mockClear(); skipQuestion.mockClear()
  loadExtractedKnowledge.mockReset(); loadExtractedKnowledge.mockResolvedValue([])
})
afterEach(() => cleanup())

const boxes = () => screen.queryAllByPlaceholderText(/A couple of sentences is plenty/)

describe('what she typed survives the tab closing', () => {
  it('is saved as she types, before any Continue', async () => {
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(boxes()).toHaveLength(3))
    fireEvent.change(boxes()[0], { target: { value: HERS } })

    // ⚠️ THE ASSERTION IS ON THE STORE, NOT ON THE BOX. A value that is only in
    // React state is exactly the defect — it looks identical on screen.
    await waitFor(() => expect(Object.values(readStoryDraft())).toContain(HERS))
    expect(answerQuestion).not.toHaveBeenCalled()
  })

  it('comes back on a remount, which is what a closed tab is', async () => {
    const first = render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(boxes()).toHaveLength(3))
    fireEvent.change(boxes()[0], { target: { value: HERS } })
    await waitFor(() => expect(Object.values(readStoryDraft())).toContain(HERS))
    first.unmount()

    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(
      boxes().some((b) => (b as HTMLTextAreaElement).value === HERS),
    ).toBe(true))
  })

  it('a late suggestion does not overwrite a restored sentence', async () => {
    // ⚠️ THE RESTORE AND THE SUGGESTION RACE, AND THE SUGGESTION IS SLOWER. The
    // existing rule protects a box being typed into right now; a sentence
    // restored from a previous visit is the same words, older, and losing it to
    // a suggestion would delete precisely what the restore saved.
    window.localStorage.setItem(
      'twinai.storyDraft.v1', JSON.stringify({ best_result: HERS }),
    )
    loadExtractedKnowledge.mockResolvedValue([RESULT_ROW])
    render(<StoryInterview voiceId={null} onDone={() => {}} />)
    await waitFor(() => expect(loadExtractedKnowledge).toHaveBeenCalled())

    expect(screen.queryByText(RESULT_ROW.text)).toBeNull()
    await waitFor(() => expect(
      boxes().some((b) => (b as HTMLTextAreaElement).value === HERS),
    ).toBe(true))
  })
})

describe('the draft is cleared only once the answer is safe', () => {
  it('is gone after Continue stores it', async () => {
    const onDone = vi.fn()
    render(<StoryInterview voiceId={null} onDone={onDone} />)
    await waitFor(() => expect(boxes()).toHaveLength(3))
    fireEvent.change(boxes()[0], { target: { value: HERS } })
    await waitFor(() => expect(Object.values(readStoryDraft())).toContain(HERS))

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(answerQuestion).toHaveBeenCalled()
    expect(readStoryDraft()).toEqual({})
  })

  it('survives a refusal, because a rejected answer is still hers', async () => {
    // ⚠️ THE ONE ORDERING THAT MATTERS. `submit()` returns early on a too-long
    // answer with the words still on screen; clearing before that check would
    // mean the next visit shows an empty box for a sentence she never withdrew.
    const onDone = vi.fn()
    render(<StoryInterview voiceId={null} onDone={onDone} />)
    await waitFor(() => expect(boxes()).toHaveLength(3))
    const tooLong = 'x'.repeat(5000)
    fireEvent.change(boxes()[0], { target: { value: tooLong } })
    await waitFor(() => expect(Object.values(readStoryDraft())).toContain(tooLong))

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => expect(screen.getByText(/Shorter is better/)).toBeTruthy())
    expect(onDone).not.toHaveBeenCalled()
    expect(Object.values(readStoryDraft())).toContain(tooLong)
  })

  it('"Skip all" takes the draft with it', async () => {
    // ⚖️ Every question is marked skipped, so nothing will ask again — restoring
    // declined sentences on the next visit would strand them forever.
    const onDone = vi.fn()
    render(<StoryInterview voiceId={null} onDone={onDone} />)
    await waitFor(() => expect(boxes()).toHaveLength(3))
    fireEvent.change(boxes()[0], { target: { value: HERS } })
    await waitFor(() => expect(Object.values(readStoryDraft())).toContain(HERS))

    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(skipQuestion).toHaveBeenCalled()
    expect(readStoryDraft()).toEqual({})
  })
})

describe('the limit is stated, not papered over', () => {
  it('says out loud that a draft does not travel between devices', () => {
    // ⚠️ A REAL GAP, KEPT VISIBLE. A creator who starts on a phone and finishes
    // on a laptop still loses the sentence. Closing that needs a stored draft
    // row and a migration; naming it here is what stops "it saves now" being
    // read as more than it is.
    expect(STORY_DRAFT_IS_PER_DEVICE).toMatch(/does not travel to another device/)
  })
})

describe('a blocked store costs the draft and never the screen', () => {
  it('renders when localStorage throws on every access', async () => {
    // ⚠️ NOT HYPOTHETICAL: a browser set to block site data THROWS here rather
    // than returning null, and an onboarding screen that white-screens is far
    // worse than one that forgets a sentence.
    const store = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('access denied') },
    })
    try {
      render(<StoryInterview voiceId={null} onDone={() => {}} />)
      await waitFor(() => expect(boxes()).toHaveLength(3))
      fireEvent.change(boxes()[0], { target: { value: HERS } })
      expect((boxes()[0] as HTMLTextAreaElement).value).toBe(HERS)
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: store })
    }
  })
})
