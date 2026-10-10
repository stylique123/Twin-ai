import { describe, it, expect } from 'vitest'
import { unconfirmedRoleClaims } from '../roleClaims.js'

const STATED = 'I roast coffee in small batches in Riverton. Maya Coffee Co is my roastery. I do one-on-one coffee cart planning calls.'

describe('role claims only when she said them (owner, script B)', () => {
  it('flags "my coffee cart business" when she only advises on carts', () => {
    expect(unconfirmedRoleClaims('Building my coffee cart business in Riverton taught me there is no clean formula.', STATED + ' cart'.replace('cart', 'calls')))
      .toEqual(['coffee cart business'])
  })
  it('allows the roastery she stated', () => {
    expect(unconfirmedRoleClaims('My roastery is tiny, and every batch is different.', STATED)).toEqual([])
  })
  it('flags "I run a bakery" with nothing stated about one', () => {
    expect(unconfirmedRoleClaims('I run a bakery on weekends.', STATED)).toEqual(['bakery'])
  })
  it('ignores ventures that are not hers ("your business")', () => {
    expect(unconfirmedRoleClaims('Your coffee cart business needs a menu first.', STATED)).toEqual([])
  })
})
