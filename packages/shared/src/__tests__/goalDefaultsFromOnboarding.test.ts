// D1: the onboarding "content goals" question is a real DEFAULT for the
// remix screen's per-video goal chip, not a duplicate of it. The server side
// of this precedence (`theStandingAnswersReachTheWriter.test.ts`) already
// pins that the per-video answer wins and the standing one only fills
// silence; this file pins the UX half — that the standing answer is offered
// as a starting point on screen, not thrown away and re-asked from blank.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BRIEF_GOALS, VIDEO_GOALS, INTENT_QUESTIONS, CANONICAL_GOAL_LABELS,
  defaultVideoGoalFromContentGoals,
} from '../index'

describe('defaultVideoGoalFromContentGoals', () => {
  it('maps a recognised standing goal straight across', () => {
    expect(defaultVideoGoalFromContentGoals(['sell'])).toBe('sell')
    expect(defaultVideoGoalFromContentGoals(['educate'])).toBe('educate')
  });

  // ⚖️ THE FIRST IN STORED ORDER, NEVER A BLEND — same rule the server's
  // `standingGoalDirectiveInline` uses for this same stored list, so the
  // suggestion on screen agrees with what would silently back the writer up
  // if the creator left the chip untouched.
  it('takes the first recognised goal, not a blend of two', () => {
    expect(defaultVideoGoalFromContentGoals(['authority', 'sell'])).toBe('authority')
  });

  it('every value in the onboarding vocabulary maps to something offered on screen', () => {
    const offered = new Set(
      INTENT_QUESTIONS.find((q) => q.field === 'video_goal')!.options.map((o) => o.value))
    for (const g of BRIEF_GOALS) {
      const mapped = defaultVideoGoalFromContentGoals([g])
      expect(mapped, g).not.toBeNull()
      expect(VIDEO_GOALS as readonly string[], g).toContain(mapped)
      // ⚠️ REVERSED, AND THE OLD EXPECTATION WAS RECORDING A DOWNGRADE. This
      // used to assert `personal_brand` → `authority`, because `personal_brand`
      // has no top-level chip and pre-SELECTING a chip that does not exist made
      // no sense. But the pre-selected chip is SENT: mapping it onto `authority`
      // rewrote the creator's standing goal on its way to the writer, so they
      // received the authority directive instead of the personal-brand one that
      // the server's `standingGoalDirectiveInline` would have given them had the
      // chip been left blank. Pre-filling a field must not change its value.
      //
      // ⚖️ THE GOAL IS NOW DISPLAYED RATHER THAN PRE-SELECTED, which is what
      // makes the identity mapping possible: a displayed value only has to be
      // NAMEABLE, not tappable. Every standing goal maps to itself.
      expect(mapped).toBe(g)
      // ⚖️ SO THE CHIP LIST IS NO LONGER THE CONSTRAINT — the label set is.
      // `personal_brand` is displayable and is deliberately not offered as a
      // chip; tapping "Change" hands the creator the options that ARE choices.
      expect(CANONICAL_GOAL_LABELS[mapped!], g).toBeTruthy()
      if (g !== 'personal_brand') expect(offered, g).toContain(mapped)
    }
  });

  it('nothing stored suggests nothing', () => {
    expect(defaultVideoGoalFromContentGoals(null)).toBeNull()
    expect(defaultVideoGoalFromContentGoals(undefined)).toBeNull()
    expect(defaultVideoGoalFromContentGoals([])).toBeNull()
  });

  it('an unrecognised or non-string entry is skipped, not thrown', () => {
    expect(defaultVideoGoalFromContentGoals(['not_a_real_goal', 'leads'] as string[])).toBe('leads')
  });
})

describe('the remix screen offers the standing goal as a starting point, not a blank slate', () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'),
    'utf8')

  // ⚠️ THIS TEST USED TO PIN THE OPPOSITE, AND THE OPPOSITE WAS THE HALF-FIX.
  // It asserted the standing goal was consulted AFTER the ask list was built —
  // i.e. that it could only ever pre-select a chip in a question the creator was
  // still shown. That is the same fact asked in two places with the second one
  // merely cheaper to answer.
  //
  // ⚖️ NOW IT IS CONSULTED BEFORE THE LIST IS BUILT, because it is what REMOVES
  // the question. The goal is displayed with a "Change" affordance instead of
  // re-asked, so the standing preference must be known before the card decides
  // what to ask.
  it('the standing goal is resolved before the ask list is built, so it can remove the question', () => {
    const suggestAt = src.indexOf('defaultVideoGoalFromContentGoals(')
    const askAt = src.indexOf('const ask: AskItem[] = [')
    expect(suggestAt).toBeGreaterThan(-1)
    expect(askAt).toBeGreaterThan(suggestAt)
  });

  // ⚖️ AND THE QUESTION IS ACTUALLY TAKEN OUT, not merely pre-answered. Without
  // this filter the chip row renders anyway and nothing has been consolidated.
  it('drops video_goal from the questions when a standing goal answers it', () => {
    expect(src).toMatch(/goalIsDisplayed && q\.field === 'video_goal'/)
    expect(src).toMatch(/const goalIsDisplayed = Boolean\(standingGoal\)/)
  });

  // ⚖️ ZERO TAPS FOR THE COMMON CASE, ONE TAP FOR THE EXCEPTION. A displayed
  // fact with no way to change it would be Twin deciding, not Twin remembering.
  it('displays the goal with a change affordance rather than a question', () => {
    expect(src).toMatch(/setChangingGoal\(true\)/)
    expect(src).toMatch(/>Change</)
    expect(src).toMatch(/CANONICAL_GOAL_LABELS\[displayedGoal\]/)
    // Says where the value came from: a prefilled value with no provenance is
    // indistinguishable from a guess.
    expect(src).toMatch(/From what you told us your content is for/)
  });

  // ⚖️ NEVER OVERWRITES AN ANSWER ALREADY ON THIS BUILD. A tab reclaimed
  // mid-answer, or a value the creator already tapped this session, must not
  // be replaced by the onboarding default.
  it('only fills in when this build has no answer yet', () => {
    expect(src).toMatch(/!\(askAnswers\.video_goal[^)]*\)\.trim\(\)/)
  });
})
