import { describe, it, expect } from 'vitest'
import {
  OWN_VIDEOS_TO_CHECK,
  ENOUGH_TO_SOUND_LIKE_YOU,
  sampleCanBeSilent,
  messageForOwnAccount,
} from '../talkingHeadFit'

// ⚠️ WHAT THIS FILE EXISTS TO CATCH: a sample size chosen for cost alone.
// Checking the creator's own videos costs a 360p download and a model call
// EACH, so the pressure on this number is always downward. But below
// ENOUGH_TO_SOUND_LIKE_YOU the warning stops being a measurement: no account,
// however good, can reach the count that buys silence, so EVERY creator is
// told their account is thin. That is not a slightly worse message -- it is a
// permanent fixture of the product that no creator can ever clear.
describe('the sample can clear the bar', () => {
  it('checks at least as many videos as it takes to sound like you', () => {
    expect(sampleCanBeSilent(OWN_VIDEOS_TO_CHECK)).toBe(true)
  })

  // The rule itself, validated on the case it exists for -- a sample one short.
  it('refuses a sample that is one short of the threshold', () => {
    expect(sampleCanBeSilent(ENOUGH_TO_SOUND_LIKE_YOU - 1)).toBe(false)
  })

  // ⚠️ ABSENT IS NOT ZERO, and Number(null) is 0 with isFinite(0) true, so the
  // null case is asserted rather than assumed to fall out of the arithmetic.
  it('treats an absent size as unable to be silent, not as a zero that passes', () => {
    expect(sampleCanBeSilent(null)).toBe(false)
    expect(sampleCanBeSilent(undefined)).toBe(false)
    expect(sampleCanBeSilent(Number.NaN)).toBe(false)
  })

  // The end-to-end statement: with the shipped sample size, a perfect account
  // is actually told nothing. This is the sentence the constant is for.
  it('says nothing to a creator whose whole sample is talking head', () => {
    const m = messageForOwnAccount({ usable: OWN_VIDEOS_TO_CHECK, checked: OWN_VIDEOS_TO_CHECK })
    expect(m.kind).toBe('fine')
    expect(m.headline).toBe('')
  })

  // ⚖️ AND THE SPARE IS DELIBERATE. A download fails now and then; if the sample
  // were exactly the threshold, one failed fetch would make silence unreachable
  // for that scan. One video may fail and a perfect account is still silent.
  it('still says nothing when one video of the sample failed to download', () => {
    const m = messageForOwnAccount({
      usable: OWN_VIDEOS_TO_CHECK - 1,
      checked: OWN_VIDEOS_TO_CHECK - 1,
    })
    expect(m.kind).toBe('fine')
  })
})
