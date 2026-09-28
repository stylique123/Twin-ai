import { describe, expect, it } from 'vitest'
import { planUseItems } from '../planUse'

const about = 'Someone told me they could taste the difference between my roast and the grocery store bag'
const rows = [
  { id: 'a', kind: 'experience', source: 'asked', text: 'Someone told me they could taste the difference between my roast and the grocery store bag their mom bought.' },
  { id: 'b', kind: 'claim', source: 'transcript', text: 'Defines specialty coffee roasting as using only coffee beans that achieve cup scores above 80.' },
  { id: 'c', kind: 'claim', source: 'transcript', text: 'She only sources and roasts specialty coffee that has cup scores above 80.' },
  { id: 'd', kind: 'experience', source: 'transcript', text: 'She had 26 days to move Sunflower Coffee from her home to a commercial space to avoid fines or a court date.' },
  { id: 'e', kind: 'experience', source: 'caption', text: 'Navigated commercial permitting and inspections as the first dedicated coffee roastery in Farmington.' },
  { id: 'f', kind: 'claim', source: 'transcript', text: 'Operates with zero inventory by roasting coffee strictly to order in small two-pound batches.' },
]

describe('What I will use (owner, 2026-09-28)', () => {
  const items = planUseItems(rows, about)
  const byId = (id: string) => items.find((i) => i.id === id)
  it('labels her own words and unconfirmed video facts', () => {
    expect(byId('a')?.reason).toBe('You wrote this')
    expect(byId('f')?.reason).toBe('From your videos, not confirmed')
  })
  it('merges the two cup-score facts into one', () => {
    expect(items.filter((i) => /cup scores/.test(i.text))).toHaveLength(1)
  })
  it('starts legal items, unconfirmed numbers and "first/only" claims off', () => {
    expect(byId('d')?.sensitive).toBe(true)
    expect(byId('d')?.defaultOff).toBe(true)
    expect(byId('e')?.defaultOff).toBe(true)
    expect(byId('f')?.defaultOff).toBe(true)
    expect(byId('a')?.defaultOff).toBe(false)
  })
  it('marks what fits this idea, and keeps full sentences', () => {
    expect(byId('a')?.fits).toBe(true)
    expect(byId('a')?.text.endsWith('bought.')).toBe(true)
  })
})
