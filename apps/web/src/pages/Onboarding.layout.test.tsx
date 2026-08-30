// @vitest-environment jsdom
//
// THE LAYOUT CLAIMS, ASSERTED WHERE THEY ARE ASSERTABLE.
//
// ⚠️ THESE ARE NOT STYLE PREFERENCES. Each one is a reported failure: a
// selected chip nobody could see, a chip grid that reflowed under long labels,
// a "pick up to two" printed under the options it limits, and a skip target
// too small to hit. jsdom cannot measure pixels, but it can hold the class
// contract that produces them — which is what silently regresses.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProfileQuestion, AnswerSummary } from './Onboarding'
import { emptyProfileAnswers, type OnboardingDraft } from '../lib/onboardingDraft'

const draftOf = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  version: 3, userId: 'u1', voiceId: null, platform: 'instagram', handle: 'h',
  profile: null, audience: '', product: '', goal: '', workKind: null,
  ...emptyProfileAnswers(),
  workKindOther: null, forbiddenClaims: null, q4: null, ownsEntity: null,
  offerFromCreator: false, canRecordScreen: null, canFilmObjects: null,
  ...patch,
} as OnboardingDraft)

const show = (id: 'whoYouAre' | 'contentGoals', patch: Partial<OnboardingDraft> = {}) =>
  render(<ProfileQuestion id={id} draft={draftOf(patch)} onDraftChange={() => {}} />)

afterEach(() => cleanup())

describe('selected is a fill, not an outline', () => {
  // ⚠️ THE REPORTED FAILURE: a thin low-contrast outline on a near-black
  // background. A creator could not tell what they had picked.
  it('the chosen chip inverts — solid fill, dark text', () => {
    show('whoYouAre', { audienceSeg: 'founders' })
    const chosen = screen.getByText('Founders / business owners').closest('button')!
    expect(chosen.className).toContain('bg-coral')
    expect(chosen.className).toContain('text-ink')
    expect(chosen.className).not.toContain('bg-coral/15')
  })

  it('and an unchosen chip does not', () => {
    show('whoYouAre', { audienceSeg: 'founders' })
    const other = screen.getByText('Other creators').closest('button')!
    expect(other.className).not.toContain('bg-coral')
  })

  // MUTATION GUARD: the state must be exposed to assistive tech too, not only
  // painted. A fill nobody can query is a fill a screen reader cannot report.
  it('reports the selection as pressed', () => {
    show('whoYouAre', { audienceSeg: 'founders' })
    expect(screen.getByText('Founders / business owners').closest('button')!
      .getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Other creators').closest('button')!
      .getAttribute('aria-pressed')).toBe('false')
  })
})

describe('the chip grid is fixed, and cells do not grow', () => {
  it('is two columns on a phone and three on a desktop', () => {
    show('whoYouAre')
    const grid = screen.getByText('Other creators').closest('div')!
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('sm:grid-cols-3')
    // The wrapping flex row this replaced produced the ragged, reflowing edge.
    expect(grid.className).not.toContain('flex-wrap')
  })

  it('every chip is the same height and at least a fingertip tall', () => {
    show('whoYouAre')
    for (const label of ['Other creators', 'Founders / business owners']) {
      expect(screen.getByText(label).closest('button')!.className)
        .toContain('min-h-[44px]')
    }
  })

  // ⚠️ A LONG LABEL MUST TRUNCATE RATHER THAN RESHAPE THE GRID — the failure
  // that made the whole grid jump when one value's wording grew.
  it('truncates a long label instead of reflowing the row', () => {
    show('whoYouAre')
    expect(screen.getByText('Founders / business owners').className).toContain('truncate')
  })
})

describe('a limit is an instruction, not a correction', () => {
  // ⚠️ "Pick up to two" was printed UNDER the options it constrains, where it
  // is read only after a third tap did nothing.
  it('states the cap ABOVE the chips it caps', () => {
    const { container } = show('contentGoals')
    const text = container.textContent ?? ''
    const hint = text.indexOf('Pick up to two.')
    const firstChip = text.indexOf('Reach more people')
    expect(hint).toBeGreaterThanOrEqual(0)
    expect(firstChip).toBeGreaterThanOrEqual(0)
    expect(hint).toBeLessThan(firstChip)
  })

  it('and says something different once the cap is reached', () => {
    show('contentGoals', { contentGoals: ['followers', 'sell'] })
    expect(screen.getByText('Two is the limit — tap one to swap it.')).toBeTruthy()
  })
})

describe('the answers so far stay in view', () => {
  // ⚖️ NOTHING TO SAY, NOTHING RENDERED. A summary bar that appears empty is a
  // band of chrome charging rent on a phone screen — and it is empty for the
  // whole of the first question and for every screen of a creator who skips.
  it('renders nothing at all before anything is answered', () => {
    const { container } = render(<AnswerSummary draft={draftOf()} />)
    expect(container.textContent).toBe('')
  })

  it('shows each answer given so far, so nobody scrolls back to check one', () => {
    render(<AnswerSummary draft={draftOf({
      workKind: 'coach', audienceSeg: 'founders', audienceKnowledge: 'basics',
      contentGoals: ['followers'], commercialTies: ['unspecified'],
    })} />)
    expect(screen.getByText('Founders / business owners')).toBeTruthy()
    expect(screen.getByText('Reach more people')).toBeTruthy()
    // The commercial answer reads back as the yes/no, not as the raw tie.
    expect(screen.getByText('Yes')).toBeTruthy()
  })

  // ⚠️ READ-ONLY ON PURPOSE. Two ways to change one answer on one screen is how
  // an answer gets changed by accident; the confirm screen owns editing.
  it('is not tappable', () => {
    const { container } = render(<AnswerSummary draft={draftOf({ workKind: 'coach' })} />)
    expect(container.querySelectorAll('button').length).toBe(0)
  })
})
