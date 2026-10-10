import { describe, it, expect } from 'vitest'
import { passageStoreOn } from '../passageStoreGate.js'

describe('passage store gate (plan 2.2)', () => {
  it('off unless the owner is listed', () => {
    expect(passageStoreOn('a', '')).toBe(false)
    expect(passageStoreOn('a', 'b, c')).toBe(false)
    expect(passageStoreOn('c', 'b, c')).toBe(true)
  })
})
