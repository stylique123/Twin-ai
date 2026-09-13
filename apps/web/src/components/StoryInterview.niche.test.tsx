// @vitest-environment jsdom
//
// THE THREE QUESTIONS READ AS GENERIC BECAUSE THE NICHE ARRIVES AFTER THEY DO.
//
// ⚠️⚠️ THE BANK WAS READ RAW AND THE NICHE-AWARE BUILDER WAS NEVER CALLED.
// `creatorQuestionsFor` has existed and been correct the whole time —
// `CreatorQuestionCard` (Settings) calls it, `StoryInterview` (onboarding) read
// `CREATOR_QUESTIONS` directly. Built, right, and one of two callers reads around
// it: this codebase's signature defect in its two-caller form.
//
// ⚖️ AND THE SEQUENCING IS REAL, WHICH IS WHY THIS IS A PROP AND NOT A FETCH.
// These are asked WHILE THE SCAN RUNS, so at first render there genuinely is no
// niche and the plain bank is the honest answer. The parent parks the finished
// profile until the stories are done, so for a creator still answering when the
// scan lands the niche is already in hand — and from that moment the wording can
// be hers. Null before, never a guess.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { StoryInterview } from './StoryInterview'
import { CREATOR_QUESTIONS, OPENING_THREE, creatorQuestionsFor } from '@twinai/shared'

vi.mock('../lib/creatorAnswers', () => ({
  answerQuestion: vi.fn(async () => ({ ok: true as const })),
  skipQuestion: vi.fn(async () => true),
  markQuestionShown: vi.fn(async () => {}),
  loadExtractedKnowledge: vi.fn(async () => []),
}))

afterEach(cleanup)

const askOf = (id: string, niche: string | null) =>
  creatorQuestionsFor(niche, CREATOR_QUESTIONS, null).find((q) => q.id === id)!.ask

describe('the wording follows the niche once it arrives', () => {
  it('renders the PLAIN bank while the scan is still running', async () => {
    render(<StoryInterview voiceId="v1" onDone={() => {}} />)
    const first = OPENING_THREE[0]
    await waitFor(() => expect(screen.getByText(askOf(first, null))).toBeTruthy())
  })

  it('⚠⚠ TODAY THE OPENING THREE HAVE NO NICHE WORDING AT ALL, AND THIS PINS IT', () => {
    // MEASURED: OPENING_THREE is expensive_lesson / best_result / contrarian.
    // The niche OVERRIDES cover number_that_matters / own_method /
    // first_thing_asked -- a DISJOINT set -- and `sells` rewrites only
    // first_thing_asked. `nicheQuestions.ts` says so on purpose: "Three of ten.
    // 'What is something you learned the expensive way?' needs no translation
    // for anybody."
    //
    // ⚖️ SO WIRING THE BUILDER IN IS PLUMBING, NOT A FIX. It is still right --
    // the component must not read around the module that owns the rules -- but
    // the wording does not change until the opening three are given entries.
    // This test states that plainly so nobody reads the wiring as the feature,
    // AND it starts failing the moment wording is added, which is when the
    // rendering assertion above should be replaced by a real one.
    const unchanged = OPENING_THREE.filter((id) =>
      ['business', 'tech', 'food', 'fitness'].every((n) => askOf(id, n) === askOf(id, null)))
    expect(unchanged, 'an opening question gained niche wording -- update this test')
      .toEqual([...OPENING_THREE])
  })

  it('and it is the BUILDER doing it, not a copy of the bank', () => {
    // The component must not restate the wording rules; it must call the one
    // module that owns them.
    const code = readFileSync(
      resolve(process.cwd(), 'apps/web/src/components/StoryInterview.tsx'), 'utf8')
    expect(code).toMatch(/creatorQuestionsFor\(niche, CREATOR_QUESTIONS,/)
    expect(code).toMatch(/openingQuestionsFor\(byNiche, sells, stageBand\)/)
  })
})

describe('the question IDs never change, only the words', () => {
  it('the same three ids are asked regardless of niche', () => {
    for (const niche of [null, 'business', 'food', 'fitness', 'reed basketry']) {
      const ids = creatorQuestionsFor(niche, CREATOR_QUESTIONS, null)
        .filter((q) => (OPENING_THREE as readonly string[]).includes(q.id))
        .map((q) => q.id)
      expect([...ids].sort()).toEqual([...OPENING_THREE].sort())
    }
  })
})
