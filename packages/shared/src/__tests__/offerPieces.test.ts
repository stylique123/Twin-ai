import { describe, it, expect } from 'vitest'
import { offerPieces } from '../productSplit'

const SCAN = 'Fresh roasted-to-order specialty coffee beans (Sunflower Coffee Roasters) and practical mentorship/tips for building a mobile coffee cart business.'

describe('a bundled offer splits by kind', () => {
  it('uses the scan items while the text is the scan’s', () => {
    const p = offerPieces(SCAN, SCAN, [
      { name: 'Roasted-to-order coffee beans', kind: 'product' },
      { name: 'Coffee cart mentorship', kind: 'service' },
      { name: 'Coffee cart tips', kind: 'content' },
    ])
    expect(p.map((x) => x.kind)).toEqual(['product', 'service', 'content'])
  })
  it('her own edit wins over the scan', () => {
    expect(offerPieces('Mugs, bowls', SCAN, [{ name: 'x', kind: 'product' }, { name: 'y', kind: 'service' }]))
      .toEqual([{ name: 'Mugs', kind: 'product' }, { name: 'bowls', kind: 'product' }])
  })
  it('one item or junk kinds do not split', () => {
    expect(offerPieces(SCAN, SCAN, [{ name: 'Beans', kind: 'product' }])).toEqual([])
    expect(offerPieces(SCAN, SCAN, [{ name: 'A', kind: 'thing' }, { name: 'B', kind: 'product' }])).toEqual([])
  })
})
