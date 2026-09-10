// @vitest-environment jsdom
//
// AN EMPTY STEP IS WORSE THAN A WRONG ONE.
//
// ⚠️⚠️ THE REPORTED FAILURE, SEEN LIVE ON A REAL ACCOUNT. The second onboarding
// step rendered its header ("2 of 2"), the read-only summary of the previous
// answers, and then `Done` and `Skip all` — WITH NO QUESTION BETWEEN THEM. A
// creator's first minute in the product was a step that asked nothing.
//
// ⚠️ AND IT WAS NOT AN EDGE CASE, IT WAS THE MAJORITY. Two separate paths led
// there, and the renderer's own comment measures the first one:
//
//   1. `contentGoals` drew nothing when no goal could be read off the
//      creator's sign-offs — the inference fires on 23 of 42 stored
//      `recurring_ctas` sets, so 19 of 42 ACCOUNTS saw a blank step.
//   2. Worse, it drew nothing the instant somebody ANSWERED. Answering set
//      `contentGoals`, which sent the renderer's `inferred` to null, which
//      blanked the step they were standing on. That path was UNIVERSAL.
//
// ⚖️ THE DEFECT WAS A DISAGREEMENT, NOT A MISSING BRANCH. `profileQuestionsFor`
// counted the question; `ProfileQuestion` declined to draw it. Both were
// individually defensible and together they produced a screen that asked
// nothing. So the invariant below is the real fix, and it is stated once:
//
//   EVERY ID THE SELECTOR RETURNS MUST RENDER SOMETHING.
//
// That is what `asksContentGoal` buys, and it is why the condition moved out of
// the renderer and into the selector — where `capabilities` had always kept it.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProfileQuestion } from './Onboarding'
import { emptyProfileAnswers, profileAnswersOf, type OnboardingDraft } from '../lib/onboardingDraft'
import { profileQuestionsFor, asksContentGoal } from '@twinai/shared'

const draftOf = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  version: 3, userId: 'u1', voiceId: null, platform: 'instagram', handle: 'h',
  profile: null, audience: '', product: '', goal: '', workKind: null,
  ...emptyProfileAnswers(),
  workKindOther: null, forbiddenClaims: null, q4: null, ownsEntity: null,
  offerFromCreator: false, canRecordScreen: null, canFilmObjects: null,
  ...patch,
} as OnboardingDraft)

// ⚠️ A REAL SIGN-OFF FROM A REAL ACCOUNT, because the inference is the whole
// subject of this file and a made-up CTA would not exercise it. This is the
// keyword mechanic extracted from @carlaangelfit, the account the blank step
// was reported on.
const REAL_CTA = ["comment the word 'CORE' and I'll send you a pregnancy-safe routine"]
// A genuine sign-off that asks for nothing. The renderer's comment names this
// class explicitly — "Do the work", "Take a deep breath" — as the reason the
// inference cannot be widened to everybody.
const ASKS_NOTHING = ['Do the work.']

const profileWith = (ctas: string[]) => ({ recurring_ctas: ctas } as OnboardingDraft['profile'])

afterEach(() => cleanup())

describe('the selector and the renderer agree on what is asked', () => {
  // ⚠️ THIS IS THE ONE THAT FAILS WITHOUT THE FIX. Before `asksContentGoal`,
  // `profileQuestionsFor` returned `contentGoals` regardless, and the render
  // below produced an empty container.
  it('every id the selector returns renders something', () => {
    const cases: Array<[string, OnboardingDraft]> = [
      ['no profile at all', draftOf()],
      ['a sign-off that asks for nothing', draftOf({ profile: profileWith(ASKS_NOTHING) })],
      ['a real keyword CTA', draftOf({ profile: profileWith(REAL_CTA) })],
      ['a real CTA, already answered', draftOf({
        profile: profileWith(REAL_CTA), contentGoals: ['followers'], contentGoalsTouched: true,
      })],
      ['a real CTA, declined', draftOf({
        profile: profileWith(REAL_CTA), contentGoals: [], contentGoalsTouched: true,
      })],
    ]

    for (const [label, draft] of cases) {
      const asked = profileQuestionsFor(profileAnswersOf(draft))
      expect(asked.length, `${label}: a step set may not be empty`).toBeGreaterThan(0)
      for (const id of asked) {
        const { container, unmount } = render(
          <ProfileQuestion id={id} draft={draft} onDraftChange={() => {}} />,
        )
        expect(
          container.textContent?.trim() ?? '',
          `${label}: the selector asked '${id}' and the renderer drew nothing`,
        ).not.toBe('')
        unmount()
      }
    }
  })

  // ⚖️ THE SECOND PATH, ASSERTED SEPARATELY BECAUSE IT HAS A DIFFERENT CAUSE.
  // A set that shrinks under somebody mid-step is a hazard this screen already
  // recorded once — "five questions announced, three seen, the rest gone" — so
  // answering must not change the size of the set.
  it('answering the goal question does not change the size of the set', () => {
    const before = profileQuestionsFor(profileAnswersOf(
      draftOf({ profile: profileWith(REAL_CTA) }),
    ))
    const after = profileQuestionsFor(profileAnswersOf(draftOf({
      profile: profileWith(REAL_CTA), contentGoals: ['followers'], contentGoalsTouched: true,
    })))
    expect(before).toContain('contentGoals')
    expect(after).toEqual(before)
  })

  it('the goal question is dropped entirely when nothing can be read off the sign-offs', () => {
    const asked = profileQuestionsFor(profileAnswersOf(
      draftOf({ profile: profileWith(ASKS_NOTHING) }),
    ))
    expect(asked).not.toContain('contentGoals')
    // ⚠️ AND THE STEP STILL EXISTS. Dropping the question must not drop the
    // whole set — that would trade a blank step for no step.
    expect(asked).toContain('whoYouAre')
  })

  it('asksContentGoal is false with no profile and true on a real sign-off', () => {
    expect(asksContentGoal({})).toBe(false)
    expect(asksContentGoal({ recurringCtas: null })).toBe(false)
    expect(asksContentGoal({ recurringCtas: [] })).toBe(false)
    expect(asksContentGoal({ recurringCtas: ASKS_NOTHING })).toBe(false)
    expect(asksContentGoal({ recurringCtas: REAL_CTA })).toBe(true)
  })
})

describe('declining is visibly different from not having been asked', () => {
  // ⚠️ AN EMPTY `contentGoals` MEANT TWO THINGS AND THE SCREEN SHOWED ONE.
  // Tapping "Not quite" left the step looking exactly as it had before anyone
  // touched it, so there was no sign the answer had registered.
  it('"Not quite" reads as pressed once tapped, and not before', () => {
    const { unmount } = render(<ProfileQuestion
      id="contentGoals" draft={draftOf({ profile: profileWith(REAL_CTA) })}
      onDraftChange={() => {}} />)
    expect(screen.getByText('Not quite').getAttribute('aria-pressed')).toBe('false')
    unmount()

    render(<ProfileQuestion
      id="contentGoals"
      draft={draftOf({ profile: profileWith(REAL_CTA), contentGoals: [], contentGoalsTouched: true })}
      onDraftChange={() => {}} />)
    expect(screen.getByText('Not quite').getAttribute('aria-pressed')).toBe('true')
  })

  it('the confirmed answer reads as pressed', () => {
    render(<ProfileQuestion
      id="contentGoals"
      draft={draftOf({
        profile: profileWith(REAL_CTA), contentGoals: ['followers'], contentGoalsTouched: true,
      })}
      onDraftChange={() => {}} />)
    expect(screen.getByText("Yes, that's right").getAttribute('aria-pressed')).toBe('true')
  })
})
