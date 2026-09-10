// @vitest-environment jsdom
//
// "NOT THIS ONE" ENDED THE QUEUE.
//
// ⚠️⚠️ REPORTED LIVE. Dismissing one question emptied the whole My Twin section
// until the page was reloaded. `dismiss` set `question` to null, `if (!question)
// return null` unmounted the card, and the loader depended on `voiceId` alone —
// so nothing ever reloaded. One question at a time is right; ONE QUESTION EVER
// is not.
//
// ⚖️ AND THE FIX HAD TO BE SERVER-ORDERED, NOT A LOCAL CURSOR. The next question
// is chosen by `nextQuestionByDeficit` from the STORED record of what has been
// put, so the skip must land before the next one is asked for — otherwise the
// same question comes straight back and the button reads as doing nothing. That
// ordering is what the second test here pins.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { CreatorQuestionCard } from './CreatorQuestionCard'

// ⚠️ THE PUT RECORD GROWS AS THINGS ARE SKIPPED, which is the whole mechanism.
// A mock returning a fixed list would let a card that never re-reads it pass.
const put: string[] = []
const skipped: string[] = []
const shown: string[] = []

vi.mock('../lib/creatorAnswers', () => ({
  loadQuestionsPut: vi.fn(async () => [...put]),
  markQuestionShown: vi.fn(async (id: string) => { shown.push(id) }),
  answerQuestion: vi.fn(async () => ({ ok: true })),
  // ⚠️⚠️ THE WRITE LANDS AFTER A TICK, ON PURPOSE, AND WITHOUT THAT THIS FILE
  // PROVED NOTHING ABOUT ORDERING. The first version pushed to `put`
  // SYNCHRONOUSLY before its first await, so a raced `void skipQuestion(...)`
  // still landed before the next read and the mutant survived — a test asserting
  // an ordering it could not observe. A real skip is a network call; this one
  // now behaves like one.
  skipQuestion: vi.fn(async (id: string) => {
    skipped.push(id)
    await new Promise((r) => setTimeout(r, 0))
    // The server records the skip; only now must the next read see it.
    put.push(id)
    return true
  }),
  loadKnowledgeCounts: vi.fn(async () => null),
}))

afterEach(() => {
  cleanup()
  put.length = 0
  skipped.length = 0
  shown.length = 0
})

describe('dismissing a question serves the next one', () => {
  it('the section still has a question after "Not this one"', async () => {
    render(<CreatorQuestionCard />)
    await waitFor(() => expect(screen.getByText('My Twin')).toBeTruthy())
    const first = shown[0]
    expect(first, 'no question was shown at all').toBeTruthy()

    screen.getByText('Not this one').click()

    // ⚠️ THIS IS THE ASSERTION THAT FAILS WITHOUT THE FIX: the card unmounted
    // and "My Twin" left the document entirely.
    await waitFor(() => {
      expect(shown.length, 'dismissing did not serve another question').toBeGreaterThan(1)
    })
    expect(screen.getByText('My Twin'), 'the section emptied instead of refilling').toBeTruthy()
    expect(screen.getByText('Not this one')).toBeTruthy()
  })

  it('the next question is a DIFFERENT one, and the skip was recorded', async () => {
    render(<CreatorQuestionCard />)
    await waitFor(() => expect(screen.getByText('My Twin')).toBeTruthy())
    const first = shown[0]

    screen.getByText('Not this one').click()
    await waitFor(() => expect(shown.length).toBeGreaterThan(1))

    // ⚖️ RECORDED, NOT JUST HIDDEN. A skip that only unmounts comes straight
    // back on the next script.
    expect(skipped).toEqual([first])
    // ⚠️ AND NOT THE SAME QUESTION AGAIN. If the next one were asked for before
    // the skip landed, `nextQuestionByDeficit` would hand back the same id and
    // the button would read as doing nothing.
    expect(shown[1]).not.toBe(first)
  })

  it('skipping repeatedly walks the bank rather than stalling on one', async () => {
    render(<CreatorQuestionCard />)
    await waitFor(() => expect(screen.getByText('My Twin')).toBeTruthy())

    for (let i = 0; i < 3; i++) {
      const before = shown.length
      const button = screen.queryByText('Not this one')
      if (!button) break // the bank retired on its own, which is the correct end
      button.click()
      await waitFor(() => expect(shown.length).toBeGreaterThan(before))
    }

    // Four distinct questions seen, none repeated.
    expect(shown.length).toBeGreaterThanOrEqual(4)
    expect(new Set(shown).size, 'the same question was served twice').toBe(shown.length)
  })

  // ⚖️ AND THE END IS STILL AN END. When the bank is genuinely exhausted the
  // card must retire rather than loop — an empty section is correct there, and
  // is the one case the original behaviour got right by accident.
  it('retires when the bank runs out instead of looping', async () => {
    render(<CreatorQuestionCard />)
    await waitFor(() => expect(screen.getByText('My Twin')).toBeTruthy())

    for (let i = 0; i < 40; i++) {
      const button = screen.queryByText('Not this one')
      if (!button) break
      const before = shown.length
      button.click()
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(shown.length === before || shown.length > before).toBe(true))
      if (shown.length === before) break
    }

    expect(screen.queryByText('Not this one'), 'the card kept asking past the bank').toBeNull()
    expect(new Set(shown).size).toBe(shown.length)
  })
})
