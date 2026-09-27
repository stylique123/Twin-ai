import { describe, it, expect } from 'vitest'
import { tidySubNiche } from '../nicheQuestions'
import { referenceLengthFit, tooLongMatters } from '../editor/referenceCheck'
import { unsourcedFigures } from '../script/scriptIntegrity'

describe('Sunflower batch 3', () => {
  it('#1 drops a wrapper tail but keeps a real phrase', () => {
    expect(tidySubNiche('micro coffee roasting business')).toBe('micro coffee roasting')
    expect(tidySubNiche('custom Bible rebinding')).toBe('custom Bible rebinding')
    expect(tidySubNiche('small business')).toBe('small business')
  })
  it('#11–#12 judges length against the chosen option', () => {
    expect(referenceLengthFit(240, 60, 'structure')).toBeNull()
    expect(referenceLengthFit(240, 60, 'pacing')).toMatch(/4:00/)
    expect(referenceLengthFit(90, 60, 'stay_close')).toBeNull()
    expect(tooLongMatters('structure')).toBe(false)
  })
  it('#23 flags a figure nothing she gave contains', () => {
    const out = unsourcedFigures(['My cupping score is above 82.', 'I roast 2 pounds at a time.', 'Our 12oz bag is $18.'],
      'Creator note: 12oz bag costs $18. Roasting since 2019.')
    expect(out.map((o) => o.figure)).toEqual(['82', '2'])
  })
})
