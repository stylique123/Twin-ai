import { describe, it, expect } from 'vitest'
import { passageTags } from '../passages'

// Fictional: Maya's Coffee.
describe('passageTags (plan 2.2)', () => {
  it('a full story gets Moment, Meaning and Detail, text untouched', () => {
    const t = 'Last spring I roasted 40 bags for a market and the whole batch tasted burnt. But then I slowed the drum down, and now I always taste one bean before I bag them.'
    expect(passageTags(t)).toEqual(['moment', 'meaning', 'detail'])
  })
  it('advice to the viewer gets no story tags', () => {
    expect(passageTags('If you want better coffee you should grind it fresh and it will be better.')).toEqual([])
  })
  it('a detail alone is tagged detail', () => {
    expect(passageTags('We bag about 200 grams per order and ship on Mondays.')).toEqual(['detail'])
  })
})
