import { describe, it, expect } from 'vitest'
import { recentlySaid, renderRecentlySaid } from '../recentlySaid.js'

const G = 'Grocery store beans are consistently burned or overly acidic compared to specialty coffee.'
describe('what her last videos already said', () => {
  it('finds the line repeated across scripts (batch part-13: 16 of 54)', () => {
    const got = recentlySaid([`Hook here. ${G} Close.`, `Another start.\n${G}`, 'A different video about permits and carts entirely.'])
    expect(got).toHaveLength(1)
    expect(got[0]).toContain('consistently burned')
  })
  it('a line said once is not flagged; short lines are ignored', () => {
    expect(recentlySaid([G, 'Something else about the roaster and its drum speed today.'])).toEqual([])
    expect(recentlySaid(['Link in bio.', 'Link in bio.'])).toEqual([])
  })
  it('tells the writer to reach for other material first', () => {
    expect(renderRecentlySaid([])).toBe('')
    expect(renderRecentlySaid(['x y z'])).toMatch(/OTHER material/)
    expect(renderRecentlySaid([], ['I threw out an entire coffee batch last month.'])).toMatch(/open differently/)
  })
})
