import { describe, it, expect } from 'vitest'
import { originConflict } from '../factConflicts.js'

describe('originConflict (owner 2026-10-06: the writer never chooses between conflicting facts)', () => {
  const rows = [
    { id: 1, text: 'Offers a signature Brazil roast geared toward espresso, roasted to order.' },
    { id: 2, text: 'Sunflower Signature Blend is a Colombia washed medium roast.' },
    { id: 3, text: 'Offers an Ethiopia light roast with blueberry notes.' },
    { id: 4, text: 'I roast in small batches.' },
  ]
  it('finds two origins stated for the same product', () => {
    expect(originConflict(rows, 'Signature Blend Beans')).toEqual({ values: ['brazil', 'colombia'], rows: [rows[0], rows[1]] })
  })
  it('one origin is not a conflict, and other products do not count', () => {
    expect(originConflict(rows.slice(1), 'Signature Blend Beans')).toBeNull()
    expect(originConflict(rows, 'Brew Bar Setup Call')).toBeNull()
  })
})
