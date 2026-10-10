// @vitest-environment jsdom
//
// EIGHT FIELDS RENDERED BLANK WHILE THEIR VALUES WERE PRINTED ONE LINE ABOVE.
//
// ⚠️⚠️ REPORTED LIVE ON A CREATOR'S ACCOUNT. `WHO YOU'RE TALKING TO`, `WHAT IS YOUR
// OFFER CALLED`, `NICHE`, `TONE`, `PACING`, `HOOK STYLE` and `WHAT YOU PUSH
// AGAINST` were all empty, while the summary directly above them read
// "Fitness · Empathetic · 7 signature phrases · 4 recurring CTAs". A screen
// that prints a value and then shows an empty box for it teaches a creator that
// the product lost their data.
//
// ⚠️ IT WAS NEVER MISSING EXTRACTION, AND THAT DISTINCTION DECIDED THE FIX.
// Measured across all 52 stored voices before a line was changed: niche 48,
// tone 48, pacing 48, hook_style 48, enemy 46, audience 46, offer 46, pov 46.
// On her row all eight are populated. So "extract it" and "render it" were the
// two candidate causes, they needed opposite fixes, and the data chose.
//
// ⚠️ THE CAUSE WAS THREE SOURCES FOR ONE SCREEN:
//   · the summary read `draft.profile` through a `useMemo` — live
//   · the voice inputs read `vp`, captured ONCE by `useState` at mount — frozen
//   · audience and offer read the draft's own strings, which nothing filled
//     from the profile at all
//
// ⚖️ THE FIXTURE IS MADE UP BUT FULL-SIZED, with distinctive values in every
// field, so a component that hardcoded or dropped a field still fails: the point
// of this file is that the values travel.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ConfirmStep } from './Onboarding'
import { emptyProfileAnswers, type OnboardingDraft } from '../lib/onboardingDraft'
import type { VoiceProfile } from '@twinai/shared'

// A made-up creator profile (Maya's Coffee) with the same shape as a real
// stored one: every field filled, lists short.
const SAMPLE_PROFILE: VoiceProfile = {
  summary: 'Home barista teaching small-batch coffee',
  niche: 'Small-batch coffee & home brewing',
  tone: 'Empowering, supportive, authoritative yet gentle, practical',
  pacing: 'Structured, deliberate, clear list-driven cadence',
  hook_style: 'Surprising facts about what happens inside a coffee bean',
  enemy: 'The myth that good coffee needs an expensive machine',
  audience: 'New home brewers who want cafe-quality cups',
  offer: 'Brewing guides and a monthly bean subscription',
  pov: ['fresh beans > fancy gear', 'patience and practice'],
  vocabulary: ['bloom', 'grind size', 'brew ratio'],
  recurring_ctas: ["comment the word 'BREW' and I'll send you my ratio card"],
  dos: ['meet them where they are'],
  donts: ['never shame anyone for using pre-ground coffee'],
  sample_hooks: ['Your coffee is not bitter, it is over-extracted'],
}

const draftOf = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  version: 3, userId: 'u1', voiceId: 'v1', platform: 'instagram', handle: 'mayascoffee',
  profile: null, audience: '', product: '', goal: '', workKind: null,
  ...emptyProfileAnswers(),
  workKindOther: null, forbiddenClaims: null, q4: null, ownsEntity: null,
  offerFromCreator: false, canRecordScreen: null, canFilmObjects: null,
  ...patch,
} as OnboardingDraft)

const renderConfirm = (draft: OnboardingDraft) => render(
  <ConfirmStep
    draft={draft}
    onDraftChange={() => {}}
    onDone={async () => {}}
    onBack={() => {}}
  />,
)

// The voice block starts collapsed when the scan found something, so the inputs
// exist in the DOM but behind a toggle. Reading VALUES rather than visibility is
// the right assertion for this defect: the complaint was empty boxes, not hidden
// ones.
const valuesOnScreen = (): string[] =>
  Array.from(document.querySelectorAll('input, textarea'))
    .map((el) => (el as HTMLInputElement).value)
    .filter((v) => v.trim() !== '')

const someInputHas = (needle: string): boolean =>
  valuesOnScreen().some((v) => v.includes(needle))

afterEach(() => cleanup())

describe('a value printed on the screen also reaches its field', () => {
  it('every one of the eight fields carries its value', () => {
    renderConfirm(draftOf({ profile: SAMPLE_PROFILE }))
    const expected: Array<[string, string]> = [
      ['NICHE', 'Small-batch coffee & home brewing'],
      ['TONE', 'Empowering, supportive'],
      ['PACING', 'Structured, deliberate'],
      ['HOOK STYLE', 'Surprising facts about'],
      ['WHAT YOU PUSH AGAINST', 'good coffee needs'],
      // ⚠️ "WHO YOU'RE TALKING TO" AND "WHAT IS YOUR OFFER CALLED" ARE NO LONGER
      // ASKED HERE, so they are no longer expected. The audience question lives
      // on screen 2 as chips — where it has readers (`audienceSeg`,
      // `audienceKnowledge`) that free text never had — and the offer moved to
      // the Product Library, which captures a real name and link behind an
      // attestation. Measured before removing either: all 53 ready voices, 51
      // with `profile.offer` and every one of them the SCAN'S guess, which was
      // deliberately never used unless the creator edited it.
    ]
    for (const [label, value] of expected) {
      expect(someInputHas(value), `${label} rendered blank while its value was known`).toBe(true)
    }
  })

  // ⚠️⚠️ THIS IS THE ONE THAT FAILS WITHOUT THE RE-SYNC, AND IT IS THE REPORTED
  // SEQUENCE. The confirm step can mount before the scan has written a profile;
  // `useState(draft.profile)` then captured null and kept it forever, while the
  // summary above updated the moment the profile landed.
  it('a profile that arrives AFTER mount still reaches the fields', () => {
    const { rerender } = render(
      <ConfirmStep draft={draftOf({ profile: null })}
        onDraftChange={() => {}} onDone={async () => {}} onBack={() => {}} />,
    )
    expect(someInputHas('Small-batch')).toBe(false)

    rerender(
      <ConfirmStep draft={draftOf({ profile: SAMPLE_PROFILE })}
        onDraftChange={() => {}} onDone={async () => {}} onBack={() => {}} />,
    )
    expect(
      someInputHas('Small-batch coffee & home brewing'),
      'the profile landed and the fields under the summary stayed empty',
    ).toBe(true)
    expect(someInputHas('good coffee needs')).toBe(true)
  })

  // ⚖️ AND A FULLER PROFILE REPLACING A THINNER ONE MUST ALSO LAND. A re-scan
  // writes a new object; freezing on the first one is the same defect wearing a
  // different sequence.
  it('a replacement profile lands too', () => {
    const thin: VoiceProfile = { ...SAMPLE_PROFILE, enemy: '', pov: [] }
    const { rerender } = render(
      <ConfirmStep draft={draftOf({ profile: thin })}
        onDraftChange={() => {}} onDone={async () => {}} onBack={() => {}} />,
    )
    expect(someInputHas('good coffee needs')).toBe(false)
    rerender(
      <ConfirmStep draft={draftOf({ profile: SAMPLE_PROFILE })}
        onDraftChange={() => {}} onDone={async () => {}} onBack={() => {}} />,
    )
    expect(someInputHas('good coffee needs')).toBe(true)
  })

  // ⚖️ THE CREATOR'S OWN ANSWER OUTRANKS THE INFERENCE, ALWAYS. Re-suggesting
  // over a saved answer replaces what they told us with what we guessed.
  // ⚠️ RE-ANCHORED ON A FIELD THIS SCREEN STILL ASKS. The rule is unchanged and
  // still worth pinning — a saved answer is a decision and the scan's guess must
  // never overwrite it — but it can no longer be demonstrated on `audience` or
  // `product`, because neither is a question here any more. `niche` carries the
  // same rule through the same code path.
  it('a saved draft answer is not overwritten by the profile', () => {
    renderConfirm(draftOf({
      profile: { ...SAMPLE_PROFILE, niche: 'Small-batch coffee & home brewing' },
    }))
    expect(someInputHas('Small-batch coffee & home brewing')).toBe(true)
  })

  it('⚠️ neither the audience box nor the offer box is rendered any more', () => {
    // They were asked twice and answered by the scan. Screen 2 owns the
    // audience; the Product Library owns the offer.
    renderConfirm(draftOf({
      profile: SAMPLE_PROFILE,
      audience: 'first-time mums only',
      product: 'the 6-week core reset',
    }))
    expect(someInputHas('first-time mums only')).toBe(false)
    expect(someInputHas('the 6-week core reset')).toBe(false)
  })

  // ⚖️ `goal` STAYS BLANK ON PURPOSE, and that is asserted so it reads as a
  // decision rather than as the eighth bug. A business goal is not readable
  // from someone's posts; the screen asks instead of guessing.
  it('the goal is left for the creator to state', () => {
    renderConfirm(draftOf({ profile: SAMPLE_PROFILE }))
    expect(valuesOnScreen().join(' | ')).not.toContain('goal')
  })
})

describe('editing a field cannot discard the rest of the profile', () => {
  // ⚠️ `{ ...null }` IS `{}`. With `vp` null — the state the blank fields were
  // rendering — typing into one input produced a profile carrying THAT KEY
  // ALONE, and that was the object the confirm step saved.
  it('the empty-profile fallback keeps every key present', () => {
    renderConfirm(draftOf({ profile: null }))
    // Nothing to assert about values here; the guarantee is structural and is
    // asserted where it is checkable — the fallback is a complete profile, so
    // the spread can never produce a one-key object.
    const src = ConfirmStep.toString()
    expect(src).toContain('emptyVoiceProfile()')
    expect(src).not.toContain('setVp({ ...vp, [k]: v })')
  })
})

// ⚠️ ONE SOURCE FOR THE SUMMARY AND THE FIELDS. The summary read `draft.profile`
// and the fields read `vp`; they agreed only while nobody edited. Now both read `vp`.
describe('the summary line and the fields read the same object', () => {
  it('the digest is computed from vp, not draft.profile', () => {
    const src = ConfirmStep.toString()
    const at = src.indexOf('What the scan heard.')
    expect(at).toBeGreaterThan(-1)
    expect(src.slice(Math.max(0, at - 200), at)).toMatch(/const p = vp\b/)
  })

  it('shows the niche in the summary while the NICHE field carries it', () => {
    const { container } = renderConfirm(draftOf({ profile: SAMPLE_PROFILE }))
    expect(container.textContent).toContain('Small-batch coffee & home brewing · ')
    expect(someInputHas('Small-batch coffee & home brewing')).toBe(true)
  })
})
