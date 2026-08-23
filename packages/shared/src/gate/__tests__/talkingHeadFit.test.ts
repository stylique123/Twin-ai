import { describe, it, expect } from 'vitest'
import {
  judgeFit, warningForPickedVideo, messageForOwnAccount, ENOUGH_TO_SOUND_LIKE_YOU,
  type EarlyLook,
} from '../talkingHeadFit'

const look = (o: Partial<EarlyLook>): EarlyLook => ({
  someoneTalkingToCamera: null, peopleOnCamera: null, looksAnimated: null, framesLookedAt: 4, ...o,
})

describe('judgeFit — what was actually seen', () => {
  it('a person talking to camera fits', () => {
    expect(judgeFit(look({ someoneTalkingToCamera: true, peopleOnCamera: 'one' })))
      .toEqual({ verdict: 'fits', reason: 'TALKING_TO_CAMERA' })
  })

  // ⚖️ THE PODCAST CASE. Excluding `multiple` outright would refuse interviews
  // to catch sketches; what makes a skit a skit is that nobody addresses camera.
  it('two people talking to camera still fits', () => {
    expect(judgeFit(look({ someoneTalkingToCamera: true, peopleOnCamera: 'multiple' })).verdict).toBe('fits')
  })

  it('a skit — people on camera, none of them addressing it — does not fit', () => {
    expect(judgeFit(look({ someoneTalkingToCamera: false, peopleOnCamera: 'multiple' })))
      .toEqual({ verdict: 'does_not_fit', reason: 'NOBODY_TALKING_TO_CAMERA' })
  })

  it('nobody on camera does not fit', () => {
    expect(judgeFit(look({ peopleOnCamera: 'none', someoneTalkingToCamera: true })).reason).toBe('NOBODY_ON_CAMERA')
  })

  // ⚠️ ORDER IS THE RULE. Animation is checked before anything else, because a
  // cartoon can appear to talk to camera all day and there is still no person.
  it('animation beats an apparent talking-to-camera answer', () => {
    expect(judgeFit(look({ looksAnimated: true, someoneTalkingToCamera: true, peopleOnCamera: 'one' })))
      .toEqual({ verdict: 'does_not_fit', reason: 'ANIMATED' })
  })
})

describe('judgeFit — not knowing is not a no', () => {
  it('all-null is unsure, never does_not_fit', () => {
    expect(judgeFit(look({}))).toEqual({ verdict: 'unsure', reason: 'CANNOT_TELL' })
  })

  // ⚠️ ABSENT IS NOT ZERO. If `looksAnimated: null` were read as false the
  // verdict would be unchanged here, but if `peopleOnCamera: null` were read as
  // 'none' this would wrongly say does_not_fit. That is the mistake being pinned.
  it('an unknown people count does not become "nobody"', () => {
    expect(judgeFit(look({ peopleOnCamera: null, someoneTalkingToCamera: null })).verdict).toBe('unsure')
  })

  it('zero frames is unsure however confident the other fields read', () => {
    expect(judgeFit(look({ framesLookedAt: 0, someoneTalkingToCamera: false, peopleOnCamera: 'none' })))
      .toEqual({ verdict: 'unsure', reason: 'NOTHING_LOOKED_AT' })
  })

  // ⚠️ NaN < 1 IS FALSE, so a bare `< 1` test would let NaN through as a look.
  it('a NaN frame count is nothing looked at, not a look', () => {
    expect(judgeFit(look({ framesLookedAt: Number.NaN, someoneTalkingToCamera: false })).reason)
      .toBe('NOTHING_LOOKED_AT')
  })
})

describe('the warning the creator reads', () => {
  it('says nothing at all when the video fits', () => {
    expect(warningForPickedVideo({ verdict: 'fits', reason: 'TALKING_TO_CAMERA' })).toBeNull()
  })

  // ⚖️ WARNING ON OUR OWN UNCERTAINTY WOULD SPEND THEIR PATIENCE ON OUR
  // IGNORANCE, and the next real warning would be ignored too.
  it('says nothing when Twin could not tell', () => {
    expect(warningForPickedVideo({ verdict: 'unsure', reason: 'CANNOT_TELL' })).toBeNull()
    expect(warningForPickedVideo({ verdict: 'unsure', reason: 'NOTHING_LOOKED_AT' })).toBeNull()
  })

  // ⚠️ THE VERDICT IS WHAT SILENCES IT, NOT THE MISSING COPY. The two cases
  // above pass even if the verdict check is deleted, because CANNOT_TELL and
  // NOTHING_LOOKED_AT have no card text to find — so they were proving the copy
  // table, not the rule. A mutation that warned on `unsure` escaped them.
  //
  // This pairs an `unsure` verdict with a reason that DOES have copy. The
  // combination cannot arise from judgeFit; that is the point. It isolates the
  // verdict check as the only thing that can return null here.
  it('an unsure verdict stays silent even when card text exists for its reason', () => {
    expect(warningForPickedVideo({ verdict: 'unsure', reason: 'NOBODY_TALKING_TO_CAMERA' })).toBeNull()
  })

  it('names what was seen, the cost, and what to use instead', () => {
    const w = warningForPickedVideo({ verdict: 'does_not_fit', reason: 'NOBODY_TALKING_TO_CAMERA' })!
    expect(w.saw).toBe('Nobody in this video is talking to the camera.')
    expect(w.cost).toContain('sound generic')
    expect(w.instead).toContain('speaking straight to the camera')
  })

  // ⚠️ THE COST GOES ON THE BUTTON. A bare "Continue" hides what it costs, and
  // the whole design of warn-but-allow rests on the override being informed.
  it('the continue button states the cost in its own label', () => {
    const w = warningForPickedVideo({ verdict: 'does_not_fit', reason: 'ANIMATED' })!
    expect(w.continueLabel).toBe('Use it anyway — the script may not sound like you')
  })

  it('every does_not_fit reason produces a card, none blank', () => {
    for (const reason of ['ANIMATED', 'NOBODY_ON_CAMERA', 'NOBODY_TALKING_TO_CAMERA'] as const) {
      const w = warningForPickedVideo({ verdict: 'does_not_fit', reason })
      expect(w, reason).not.toBeNull()
      expect(w!.saw.length, reason).toBeGreaterThan(10)
    }
  })

  // ⚠️ PLAIN ENGLISH IS A HARD RULE, not a preference. None of Twin's internal
  // words may reach a creator.
  it('uses none of Twin’s internal vocabulary', () => {
    const banned = ['talking-head', 'talking head', 'reference', 'profile', 'analysis', 'analyse', 'frame', 'model', 'pipeline']
    for (const reason of ['ANIMATED', 'NOBODY_ON_CAMERA', 'NOBODY_TALKING_TO_CAMERA'] as const) {
      const w = warningForPickedVideo({ verdict: 'does_not_fit', reason })!
      const all = `${w.saw} ${w.cost} ${w.instead} ${w.continueLabel}`.toLowerCase()
      for (const word of banned) expect(all, `${reason} / ${word}`).not.toContain(word)
    }
  })
})

describe('the creator’s own account — option 3', () => {
  // ⚠️ THE WHOLE POINT OF OPTION 3. The account message is a FACT ABOUT THEIR
  // VIDEOS, not a verdict on them. "Twin isn't for you" must never appear while
  // we did find something usable.
  it('a thin account is told the count, not that Twin is not for them', () => {
    const m = messageForOwnAccount({ usable: 3, checked: 30 })
    expect(m.kind).toBe('thin')
    expect(m.headline).toBe('We found 3 videos of you talking to the camera')
    expect(m.detail).toContain('enough to get started')
    expect(`${m.headline} ${m.detail}`.toLowerCase()).not.toContain('not for you')
  })

  it('one usable video reads as one video, not "1 videos"', () => {
    expect(messageForOwnAccount({ usable: 1, checked: 30 }).headline)
      .toBe('We found 1 video of you talking to the camera')
  })

  // ⚖️ THE ZERO CASE STILL SAYS NO — but names the one thing that changes it.
  it('zero usable says no, and says what would change the answer', () => {
    const m = messageForOwnAccount({ usable: 0, checked: 30 })
    expect(m.kind).toBe('none')
    expect(m.detail).toContain('come back and scan again')
  })

  it('a healthy account is shown nothing at all', () => {
    const m = messageForOwnAccount({ usable: ENOUGH_TO_SOUND_LIKE_YOU, checked: 30 })
    expect(m).toEqual({ kind: 'fine', headline: '', detail: '' })
  })

  // ⚠️ A SCAN THAT CHECKED NOTHING IS NOT A SCAN THAT FOUND NOTHING. We have no
  // standing to tell somebody about videos we never looked at.
  it('checked zero is silent, NOT the zero-usable rejection', () => {
    expect(messageForOwnAccount({ usable: 0, checked: 0 }).kind).toBe('fine')
  })
})
