import { describe, it, expect } from 'vitest'
import { blueprintCompliance, spokenLines } from '../blueprintCompliance.js'

describe('blueprintCompliance', () => {
  it('passes a complete sell script (set 4 #1 shape)', () => {
    const s = '1. I tossed an entire coffee batch before getting this right.\n2. I bought green beans from a new supplier without testing a sample first, and the whole batch roasted uneven.\n3. Now I always order a tiny test batch first.\n4. It is my best seller, restocked — grab yours through the link in my bio.'
    const c = blueprintCompliance(s, 'sell')
    expect(c.body && c.hookPaid && c.arcFitsGoal && c.oneSpine).toBe(true)
  })
  it('fails a stub (set 4 #17)', () => {
    const c = blueprintCompliance('1. I almost gave up my first month of roasting.\n2. That is honestly the whole story. If starting a coffee cart is your dream, stick around.', 'personal_brand')
    expect(c.body).toBe(false)
    expect(c.compliant).toBe(false)
  })
  it('needs a closing question on conversations and no pitch on entertain', () => {
    expect(blueprintCompliance('Dark roast is overrated.\nMost people drink dark roast to hide stale beans.\nFresh medium roast tastes sweeter than dark roast.', 'conversations').arcFitsGoal).toBe(false)
    expect(blueprintCompliance('My dog barks at every roast.\nHe thinks the crack is a knock at the door.\nGrab a bag of the roast through the link in my bio.', 'entertain').arcFitsGoal).toBe(false)
  })
  it('reads numbered script text', () => {
    expect(spokenLines('1. One two three.\n2. Four five six.')).toEqual(['One two three.', 'Four five six.'])
  })
})
