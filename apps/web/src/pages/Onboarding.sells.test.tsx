// @vitest-environment jsdom
//
// THIRTEEN OPTIONS BECAME ONE YES/NO — AND THE THREE WAYS THAT GOES WRONG.
//
// 1. The yes/no writes the wrong field, or writes a string that is not a real
//    commercial tie, so every downstream reader silently sees nothing.
// 2. The removed sub-questions still render for somebody whose stored answer
//    would have triggered them — the interrogation this change removed, back
//    again for exactly the creators it was removed for.
// 3. "Not right now" and "never answered" collapse into each other, which turns
//    silence into a commercial statement nobody made.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { ProfileQuestion } from './Onboarding'
import { emptyProfileAnswers, type OnboardingDraft } from '../lib/onboardingDraft'
import { COMMERCIAL_TIES, sellsAnswerOf, profileQuestionsFor } from '@twinai/shared'

const draftOf = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  version: 3, userId: 'u1', voiceId: null, platform: 'instagram', handle: 'h',
  profile: null, audience: '', product: '', goal: '', workKind: null,
  ...emptyProfileAnswers(),
  workKindOther: null, forbiddenClaims: null, q4: null, ownsEntity: null,
  offerFromCreator: false, canRecordScreen: null, canFilmObjects: null,
  ...patch,
} as OnboardingDraft)

const renderSells = (patch: Partial<OnboardingDraft> = {}) => {
  let latest = draftOf(patch)
  const view = render(
    <ProfileQuestion id="whoYouAre" draft={latest} onDraftChange={(n) => { latest = n }} />,
  )
  return { view, get: () => latest }
}

afterEach(() => cleanup())

describe('the question that survived', () => {
  it('asks one yes/no and offers exactly two answers', () => {
    renderSells()
    expect(screen.getByText('Do you sell or promote anything in your videos?')).toBeTruthy()
    expect(screen.getByText('Yes')).toBeTruthy()
    expect(screen.getByText('Not right now')).toBeTruthy()
  })

  // ⚠️ THE HEART OF THE CHANGE. Thirteen taps' worth of options must be gone,
  // and gone for everybody — including a creator whose STORED answer is one
  // that used to open a follow-up.
  it('renders none of the thirteen options it replaced', () => {
    renderSells({ commercialTies: ['own_product'], ownProductKind: 'software' })
    for (const gone of [
      'Something I sell', 'A service I offer', 'Products I earn commission on',
      'Sponsored products', 'Things I review', 'Nothing commercial',
      'What kind of service?', 'What kind of thing do you sell?',
      'Consulting', 'Coaching', 'An agency', 'Software or an app',
    ]) {
      expect(screen.queryByText(gone), gone).toBeNull()
    }
  })

  it('never renders the old six-chip question text', () => {
    renderSells()
    expect(screen.queryByText('Do you make content about anything you sell or promote?')).toBeNull()
  })
})

describe('the yes/no writes the right field', () => {
  it('Yes writes commercialTies, and writes a REAL tie value', () => {
    const { get } = renderSells()
    fireEvent.click(screen.getByText('Yes'))
    expect(get().commercialTies).toEqual(['unspecified'])
    for (const t of get().commercialTies) expect(COMMERCIAL_TIES).toContain(t)
    expect(sellsAnswerOf(get().commercialTies)).toBe('yes')
  })

  it('Not right now writes the exclusive `none`', () => {
    const { get } = renderSells()
    fireEvent.click(screen.getByText('Not right now'))
    expect(get().commercialTies).toEqual(['none'])
    expect(sellsAnswerOf(get().commercialTies)).toBe('not_right_now')
  })

  // ⚠️ IT MUST NOT TOUCH THE FIELDS IT STOPPED ASKING ABOUT. Stop writing, keep
  // reading: a creator's stored `ownServiceKind` survives this screen untouched.
  it('leaves the sub-answer fields exactly as it found them', () => {
    const { get } = renderSells({ ownServiceKind: 'consulting', ownProductKind: 'physical' })
    fireEvent.click(screen.getByText('Yes'))
    expect(get().ownServiceKind).toBe('consulting')
    expect(get().ownProductKind).toBe('physical')
  })

  // MUTATION GUARD on the toggle-off branch.
  it('tapping the chosen answer again clears it back to UNANSWERED, not to no', () => {
    const { get } = renderSells({ commercialTies: ['none'] })
    fireEvent.click(screen.getByText('Not right now'))
    expect(get().commercialTies).toEqual([])
    expect(sellsAnswerOf(get().commercialTies)).toBeNull()
  })
})

describe('what a returning creator sees', () => {
  // ⚖️ ANSWERS WRITTEN BY THE THIRTEEN-OPTION QUESTION STILL READ BACK. The two
  // rows in production at the time of this change were both `['own_service']`.
  it('shows a stored own_service answer as Yes', () => {
    renderSells({ commercialTies: ['own_service'], ownServiceKind: 'consulting' })
    expect(sellsAnswerOf(['own_service'])).toBe('yes')
    expect(screen.getByText('Yes')).toBeTruthy()
  })
})

describe('the step count is what the change claims', () => {
  // ⚠️ THE CLAIM IS "FOUR STEPS BECAME THREE", so it gets asserted rather than
  // asserted-in-a-commit-message. A creator with nothing to sell answers TWO
  // profile screens; the story screen is the third and is gated separately.
  it('a creator with nothing to sell sees two profile screens, not four', () => {
    const ids = profileQuestionsFor({
      workKind: 'creator', audience: 'consumers', audienceKnowledge: 'basics',
      commercialTies: ['none'],
    })
    expect(ids).toEqual(['whoYouAre', 'contentGoals'])
  })

  // ⚖️ AND THE CONDITIONAL ONE IS STILL CONDITIONAL. `capabilities` earns its
  // place only for somebody with a screen to record or a thing to hold up.
  it('a saas creator still gets the capabilities screen', () => {
    const ids = profileQuestionsFor({ workKind: 'saas' })
    expect(ids).toEqual(['whoYouAre', 'contentGoals', 'capabilities'])
  })

  // ⚠️ THE THREE MERGED QUESTIONS ARE ALL ON ONE SCREEN, which is the whole
  // point of the merge — three screens asking three halves of one thought.
  it('the merged screen carries all four of its questions', () => {
    renderSells()
    expect(screen.getByText('What best describes what you do?')).toBeTruthy()
    expect(screen.getByText('Who do you mainly want to reach?')).toBeTruthy()
    expect(screen.getByText('How much do they already know?')).toBeTruthy()
    expect(screen.getByText('Do you sell or promote anything in your videos?')).toBeTruthy()
  })
})
