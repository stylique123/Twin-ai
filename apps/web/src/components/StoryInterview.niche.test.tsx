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
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { StoryInterview } from './StoryInterview'
import { CREATOR_QUESTIONS, OPENING_THREE, creatorQuestionsFor } from '@twinai/shared'

/**
 * ⚠️ THE PATH MUST NOT ASSUME WHICH DIRECTORY VITEST WAS STARTED FROM. CI runs
 * this workspace's tests with cwd = apps/web, and the repo-root run has cwd =
 * the repo root. `process.cwd()` alone doubled the prefix into
 * apps/web/apps/web/... and the suite went green locally and red in CI.
 *
 * ⚖️ AND `import.meta.url` IS NOT THE FIX HERE, because this file runs under
 * jsdom, where it is an http: URL and `fileURLToPath` refuses it. So the
 * candidates are tried explicitly and EXACTLY ONE must exist -- a file that has
 * genuinely moved still fails, loudly, instead of resolving to nothing.
 */
function sourcePath(fromRepoRoot: string): string {
  const candidates = [
    resolve(process.cwd(), fromRepoRoot),
    resolve(process.cwd(), '../..', fromRepoRoot),
  ]
  const found = candidates.filter((p) => existsSync(p))
  expect(found.length, `expected exactly one of ${candidates.join(' | ')}`).toBe(1)
  return found[0]
}


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

  it('⚠⚠ THE OPENING THREE NOW CARRY NICHE WORDING, WHICH IS WHAT THIS PINNED FOR', () => {
    // ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE, ON PURPOSE. It read "TODAY THE
    // OPENING THREE HAVE NO NICHE WORDING AT ALL" and said the wiring was
    // "plumbing, not a fix... this test states that plainly so nobody reads the
    // wiring as the feature, AND it starts failing the moment wording is added."
    // It fired. The owner had reported the same thing from the screen: three
    // identical questions on every account, with a screenshot of the `none`
    // bucket on a leatherworker's onboarding.
    //
    // ⚖️ SO THE ASSERTION IS INVERTED RATHER THAN DELETED. Every one of the
    // opening three must now read differently for at least one bucket, or the
    // table has gone missing again.
    const stillGeneric = OPENING_THREE.filter((id) =>
      ['business', 'tech', 'Leathercraft & Custom Bible Rebinding', 'Entertainment, challenges, and giveaways']
        .every((n) => askOf(id, n) === askOf(id, null)))
    expect(stillGeneric, 'an opening question lost its niche wording').toEqual([])
  })

  it('the leatherworker no longer meets the commentator wording', () => {
    // The three sentences from the reported screenshot, verbatim.
    const leather = OPENING_THREE.map((id) => askOf(id, 'Leathercraft & Custom Bible Rebinding'))
    expect(leather).not.toContain('What did you get wrong publicly, and what changed after?')
    expect(leather.some((a) => /your trade insist on/i.test(a))).toBe(true)
  })

  it('and it is the BUILDER doing it, not a copy of the bank', () => {
    // The component must not restate the wording rules; it must call the one
    // module that owns them.
    const code = readFileSync(
      sourcePath('apps/web/src/components/StoryInterview.tsx'), 'utf8')
    expect(code).toMatch(/creatorQuestionsFor\(\s*\n?\s*niche, CREATOR_QUESTIONS,/)
    // ⚠️ AND `subNiche` IS PASSED, which is what puts a creator back in her
    // bucket after a re-scan broadened her `niche` to something that matches
    // nothing — "Handmade candle crafting" became "Home Decor" in production
    // and the maker questions silently reverted to the generic bank.
    expect(code).toMatch(/sells === 'none' \? null : sells, subNiche\)/)
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
