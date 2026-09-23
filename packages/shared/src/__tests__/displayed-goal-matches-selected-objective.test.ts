// ITEM 29: "Get people to try it" was selected and "Get leads or clients" was
// displayed. Every objective must display as the words it was chosen with.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PRODUCT_OBJECTIVES, CANONICAL_GOAL_LABELS, VIDEO_GOALS, goalDisplayLabel, type VideoGoal,
} from '../videoIntent'

describe('the displayed goal matches the selected objective', () => {
  for (const o of PRODUCT_OBJECTIVES) {
    it(`product objective "${o.label}" displays as itself`, () => {
      expect(goalDisplayLabel(o.value as VideoGoal, { isProductSubject: true })).toBe(o.label)
    })
  }
  it('"Get people to try it" is never shown as "Get leads or clients" on a product build', () => {
    expect(goalDisplayLabel('leads', { isProductSubject: true })).toBe('Get people to try it')
  })
  for (const g of VIDEO_GOALS) {
    it(`generic goal ${g} displays its canonical label off the product door`, () => {
      expect(goalDisplayLabel(g)).toBe(CANONICAL_GOAL_LABELS[g])
    })
  }
  it('V2Building renders the chip through goalDisplayLabel and "Change" through the product form', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')
    expect(src).not.toMatch(/CANONICAL_GOAL_LABELS\[displayedGoal\]/)
    expect(src).toMatch(/intentQuestionsFor\(\{ hasReference: true, isProductSubject \}\)/)
  })
})
