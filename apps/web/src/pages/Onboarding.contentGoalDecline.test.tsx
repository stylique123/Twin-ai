// @vitest-environment jsdom
//
// "NOT QUITE" RECORDED NOTHING, AND TWELVE OF THIRTEEN SELLERS WERE FILED AS
// SOMETHING ELSE.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-13. The content goal is INFERRED from the
// creator's recurring CTAs and offered as a yes/no. Of 13 creators whose brief
// records a commercial tie -- they sell something -- TWELVE have no `sell` among
// their content goals. What is stored instead:
//
//   followers 8 · leads 3 · authority 2 · sell 1 · educate 1
//
// The inference lands on `followers`, and a creator it mislabelled had no way to
// say otherwise: "Not quite" wrote an empty array, set the touched flag and
// moved on. `sell` was reachable only by the inference proposing it.
//
// ⚖️ THE OLD COMMENT'S OBJECTION IS KEPT, AND NARROWED. It said offering the
// seven chips would be "the third asking wearing a no button". That is true of
// showing them UP FRONT and this test pins that they stay hidden until a no. It
// is not true afterwards: the alternative to asking is not silence, it is a
// stored answer nobody gave.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { ProfileQuestion } from './Onboarding'
import { emptyProfileAnswers, type OnboardingDraft } from '../lib/onboardingDraft'

const PROFILE = { recurring_ctas: ['follow for more', 'follow me for more tips'] } as never

const draftOf = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  version: 3, userId: 'u1', voiceId: null, platform: 'instagram', handle: 'h',
  profile: PROFILE, audience: '', product: '', goal: '', workKind: null,
  ...emptyProfileAnswers(),
  workKindOther: null, forbiddenClaims: null, q4: null, ownsEntity: null,
  offerFromCreator: false, canRecordScreen: null, canFilmObjects: null,
  ...patch,
} as OnboardingDraft)

const renderGoal = (patch: Partial<OnboardingDraft> = {}) => {
  let latest = draftOf(patch)
  render(<ProfileQuestion id="contentGoals" draft={latest} onDraftChange={(n) => { latest = n }} />)
  return { get: () => latest }
}

afterEach(() => cleanup())

describe('the chips stay hidden until the creator says no', () => {
  it('offers only yes and no before any answer', () => {
    renderGoal()
    expect(screen.getByText("Yes, that's right")).toBeTruthy()
    expect(screen.getByText('Not quite')).toBeTruthy()
    // ⚠️ THE OLD OBJECTION, PINNED. Showing these up front is the third asking.
    expect(screen.queryByText('Sell what I offer')).toBeNull()
    expect(screen.queryByText('Then what are they for?')).toBeNull()
  })

  it('still shows no chips after the creator ACCEPTS the inference', () => {
    const { get } = renderGoal()
    fireEvent.click(screen.getByText("Yes, that's right"))
    expect(get().contentGoalsTouched).toBe(true)
    expect(screen.queryByText('Sell what I offer')).toBeNull()
  })
})

describe('after a no, the creator can say what it actually is', () => {
  it('offers the alternatives, including sell', () => {
    renderGoal({ contentGoals: [], contentGoalsTouched: true })
    expect(screen.getByText('Then what are they for?')).toBeTruthy()
    // The whole point of the change: the 12-of-13 case can be corrected.
    expect(screen.getByText('Sell what I offer')).toBeTruthy()
  })

  it('does not re-offer the one they just rejected', () => {
    renderGoal({ contentGoals: [], contentGoalsTouched: true })
    // The fixture's CTAs infer `followers`; offering it again after a no is the
    // question asked twice.
    expect(screen.queryByText('Reach more people')).toBeNull()
  })

  it('records the chosen goal, so the decline stops being silence', () => {
    let latest = draftOf({ contentGoals: [], contentGoalsTouched: true })
    render(<ProfileQuestion id="contentGoals" draft={latest} onDraftChange={(n) => { latest = n }} />)
    fireEvent.click(screen.getByText('Sell what I offer'))
    expect(latest.contentGoals).toEqual(['sell'])
    expect(latest.contentGoalsTouched).toBe(true)
  })

  it('is not shown to someone who simply has not answered yet', () => {
    // ⚠️ THE TWO EMPTIES MUST STAY APART. Untouched-and-empty is "not asked";
    // touched-and-empty is "no". Collapsing them shows the chips to everybody
    // and restores exactly the third asking the old comment refused.
    renderGoal({ contentGoals: [], contentGoalsTouched: false })
    expect(screen.queryByText('Then what are they for?')).toBeNull()
  })
})
