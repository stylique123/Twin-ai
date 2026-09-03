// @vitest-environment jsdom
//
// FIX (Task 8, "Teach Your Twin" card): the card used to show a raw "N/10"
// fraction next to the header — the same theatre `twinStrength.ts` was built
// to end elsewhere in this product ("87% ready" implies a measurement nobody
// took and invites the creator to optimise a number we invented). This proves
// that fraction is gone, without depending on which honest copy replaces it.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { CreatorQuestionCard } from './CreatorQuestionCard'

vi.mock('../lib/creatorAnswers', () => ({
  loadQuestionsPut: vi.fn(async () => ['q1', 'q2', 'q3']),
  markQuestionShown: vi.fn(async () => {}),
  answerQuestion: vi.fn(async () => ({ ok: true })),
  skipQuestion: vi.fn(async () => true),
  // ⚠️ THE STORE READ THE CARD NOW DEPENDS ON. Returning null here is the
  // unreadable-store case, which must fall back to the fixed bank order — so
  // this test still exercises the same question it always did.
  loadKnowledgeCounts: vi.fn(async () => null),
}))

afterEach(() => cleanup())

describe('the card never shows an invented target', () => {
  it('renders the question with no N/10-style fraction anywhere', async () => {
    render(<CreatorQuestionCard />)
    await waitFor(() => expect(screen.getByText('Teach your twin')).toBeTruthy())
    // The bank is 10 questions long and 3 are already put — if a progress
    // fraction still rendered it would say "3/10". It must not.
    expect(screen.queryByText(/^\d+\/10$/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b3\/10\b/)
  })
})

describe('the card asks about what the store lacks', () => {
  it('a store full of opinions and empty of experience produces an EXPERIENCE question', async () => {
    // ⚠️ THE READER ASSERTION. `nextQuestionByDeficit` is only worth having if
    // the card actually consults it; a pure function nobody calls is the defect
    // this repo keeps finding. Deleting the `loadKnowledgeCounts` call in the
    // card makes this fail.
    const mod = await import('../lib/creatorAnswers')
    vi.mocked(mod.loadQuestionsPut).mockResolvedValueOnce([])
    vi.mocked(mod.loadKnowledgeCounts).mockResolvedValueOnce({
      opinion: 20, experience: 0, framework: 5, claim: 5,
    })
    render(<CreatorQuestionCard />)
    // The bank's first question is an OPINION ("what does everyone believe that
    // is wrong"). With no experience on record, the card must not ask it.
    await waitFor(() => expect(screen.getByText('Teach your twin')).toBeTruthy())
    expect(screen.queryByText(/almost everyone in your niche believe/i)).toBeNull()
    expect(screen.getByText(/learned the expensive way/i)).toBeTruthy()
  })
})
