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
  BRIEF_GOALS, VIDEO_GOALS, INTENT_QUESTIONS,
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
      // ⚠️ `personal_brand` HAS NO TOP-LEVEL CHIP ON THIS SCREEN (it is reached
      // by picking authority + a personal focus). Suggesting it directly would
      // pre-select a chip that does not exist, so it must map to a chip that
      // does — everything else maps onto its own name unchanged.
      if (g === 'personal_brand') {
        expect(mapped).toBe('authority')
      } else {
        expect(mapped).toBe(g)
      }
      expect(offered, g).toContain(mapped)
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

  // ⚠️ THE QUESTION STILL SHOWS. This pins that the fix is a pre-fill, not a
  // skip — `defaultVideoGoalFromContentGoals` is only consulted where the
  // chip is already in `unanswered` (about to be asked), never used to keep
  // the card off screen.
  it('the default is only used inside the unanswered/ask branch', () => {
    const askAt = src.indexOf('const ask: AskItem[] = [...unanswered')
    const suggestAt = src.indexOf('defaultVideoGoalFromContentGoals(')
    expect(askAt).toBeGreaterThan(-1)
    expect(suggestAt).toBeGreaterThan(askAt)
  });

  // ⚖️ NEVER OVERWRITES AN ANSWER ALREADY ON THIS BUILD. A tab reclaimed
  // mid-answer, or a value the creator already tapped this session, must not
  // be replaced by the onboarding default.
  it('only fills in when this build has no answer yet', () => {
    const at = src.indexOf('defaultVideoGoalFromContentGoals(')
    const before = src.slice(Math.max(0, at - 400), at)
    expect(before).toMatch(/!\(askAnswers\.video_goal[^)]*\)\.trim\(\)/)
  });
})
