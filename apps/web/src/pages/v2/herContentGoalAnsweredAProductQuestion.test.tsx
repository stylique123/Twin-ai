// HER CONTENT GOAL SILENTLY ANSWERED A QUESTION ABOUT HER PRODUCT.
//
// ⚠️⚠️ ONE CAUSE, THREE SYMPTOMS, ALL OBSERVED ON LIVE PRODUCT RUNS.
// `intentQuestionsFor` substitutes `PRODUCT_OBJECTIVE_QUESTION` and
// `PRODUCT_OBJECTIVES` onto the SAME `video_goal` field — deliberately, so that
// nothing downstream learns a second vocabulary. The standing prefill in
// V2Building matched on that field name and therefore could not tell the two
// questions apart:
//
//   1. she never saw the ten commercial objectives at all — the question was
//      answered and removed before it rendered;
//   2. the chip then showed the GENERIC goal label ("Sell something") rather
//      than the objective she would have picked ("Launch it");
//   3. and it carried "From what you told us your content is for" — true about
//      where the value came from, FALSE about the question it was presented as
//      answering.
//
// The audit's "she chose neither" was exactly right: she chose neither the
// generic label nor the objective.
//
// ⚖️ THE FIX IS ONE CONDITION, AND IT DOES NOT TAKE THE AFFORDANCE AWAY. A
// standing content goal still answers the GENERIC question, where it answers the
// question actually asked. What it may no longer do is cross from a standing
// preference into a per-video commercial decision.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  intentQuestionsFor, PRODUCT_OBJECTIVES, PRODUCT_OBJECTIVE_QUESTION,
  CANONICAL_GOAL_LABELS,
} from '@twinai/shared'

const BUILD = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'V2Building.tsx'), 'utf8')

describe('the two questions share a field, which is why this was invisible', () => {
  it('the product objective IS the video_goal field', () => {
    // ⚠️ THE PRECONDITION FOR THE WHOLE DEFECT. If these were separate fields
    // the prefill could never have crossed, and the fix would be unnecessary.
    const product = intentQuestionsFor({ hasReference: true, isProductSubject: true })
      .find((q) => q.field === 'video_goal')
    expect(product).toBeTruthy()
    expect(product!.question).toBe(PRODUCT_OBJECTIVE_QUESTION)
    expect(product!.options).toBe(PRODUCT_OBJECTIVES)
  })

  it('and the generic one carries a different question on the same field', () => {
    const generic = intentQuestionsFor({ hasReference: true, isProductSubject: false })
      .find((q) => q.field === 'video_goal')
    expect(generic!.question).not.toBe(PRODUCT_OBJECTIVE_QUESTION)
    expect(generic!.options).not.toBe(PRODUCT_OBJECTIVES)
  })

  it('the objective labels are NOT the canonical goal labels she was shown', () => {
    // ⚠️ SYMPTOM 2, AS DATA. "Launch it" resolves to `sell`, whose canonical
    // label is "Sell something" — so displaying the canonical label renamed her
    // choice into words that appear nowhere on the product sheet.
    const launch = PRODUCT_OBJECTIVES.find((o) => o.value === 'sell')
    expect(launch!.label).toBe('Launch it')
    expect(CANONICAL_GOAL_LABELS.sell).not.toBe(launch!.label)
  })
})

describe('a standing content goal may not answer the product objective', () => {
  it('the prefill is gated on it NOT being a product subject', () => {
    const at = BUILD.indexOf('const standingGoal = defaultVideoGoalFromContentGoals')
    expect(at, 'the standing prefill must exist').toBeGreaterThan(-1)
    const block = BUILD.slice(at, BUILD.indexOf('const goalIsDisplayed', at))
    expect(block).toMatch(/if \(standingGoal\s*\n\s*&& !isProductSubject/)
  })

  it('and the chip follows the same condition rather than restating it', () => {
    // ⚖️ TWO COPIES OF "DID WE PREFILL" IS HOW ONE KEEPS THE OLD ANSWER. This
    // file already records that exact failure one screen up, where a value read
    // back out of `answersRef` saw a stale write.
    expect(BUILD).toMatch(/const goalIsDisplayed = Boolean\(standingGoal\) && !isProductSubject/)
  })

  it('isProductSubject is one definition, not re-derived at each site', () => {
    // ⚠️ IT USED TO LIVE INLINE INSIDE THE `intentQuestionsFor` CALL, which is
    // precisely why the prefill below could not read it. A second derivation
    // here would be a second thing that can disagree.
    expect(BUILD).toMatch(
      /const isProductSubject = state\.door === 'product' \|\| !!state\.selected_product_id/)
    expect(BUILD.match(/state\.door === 'product' \|\| !!state\.selected_product_id/g)!.length)
      .toBe(1)
  })

  it('the generic path keeps the prefill, so zero-taps survives', () => {
    // ⚖️ THE THING THIS MUST NOT BREAK. The fix is a narrowing, not a removal:
    // on the generic question the standing answer still answers the question
    // that is actually being asked.
    const at = BUILD.indexOf('const standingGoal = defaultVideoGoalFromContentGoals')
    const block = BUILD.slice(at, BUILD.indexOf('const goalIsDisplayed', at))
    expect(block).toMatch(/answer\('video_goal', standingGoal\)/)
  })
})
