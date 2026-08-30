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
