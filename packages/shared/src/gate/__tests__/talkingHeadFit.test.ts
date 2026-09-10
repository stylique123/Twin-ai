import { describe, it, expect } from 'vitest'
import {
  judgeFit, warningForPickedVideo, messageForOwnAccount, ENOUGH_TO_SOUND_LIKE_YOU,
  type EarlyLook,
} from '../talkingHeadFit'

const look = (o: Partial<EarlyLook>): EarlyLook => ({
  someoneTalkingToCamera: null, peopleOnCamera: null, looksAnimated: null, framesLookedAt: 4, ...o,
})

// ⚠️ THIS FIXTURE SAYS 4 AND PRODUCTION SENDS 2. `EARLY_LOOK_FRAMES` in
// worker/src/earlyLookRules.ts is 2, so every real verdict rests on two still
// pictures. The fixture is not wrong -- judgeFit must work at any count -- but
// nobody reading only this file would learn how thin the real evidence is.

describe('judgeFit — what was actually seen', () => {
  it('a person talking to camera fits', () => {
    expect(judgeFit(look({ someoneTalkingToCamera: true, peopleOnCamera: 'one' })))
      .toEqual({ verdict: 'fits', reason: 'TALKING_TO_CAMERA', framesLookedAt: 4 })
  })

  // ⚖️ THE PODCAST CASE. Excluding `multiple` outright would refuse interviews
  // to catch sketches; what makes a skit a skit is that nobody addresses camera.
  it('two people talking to camera still fits', () => {
    expect(judgeFit(look({ someoneTalkingToCamera: true, peopleOnCamera: 'multiple' })).verdict).toBe('fits')
  })

  it('a skit — people on camera, none of them addressing it — does not fit', () => {
    expect(judgeFit(look({ someoneTalkingToCamera: false, peopleOnCamera: 'multiple' })))
      .toEqual({ verdict: 'does_not_fit', reason: 'NOBODY_TALKING_TO_CAMERA', framesLookedAt: 4 })
  })

  it('nobody on camera does not fit', () => {
    expect(judgeFit(look({ peopleOnCamera: 'none', someoneTalkingToCamera: true })).reason).toBe('NOBODY_ON_CAMERA')
  })

  // ⚠️ ORDER IS THE RULE. Animation is checked before anything else, because a
  // cartoon can appear to talk to camera all day and there is still no person.
  it('animation beats an apparent talking-to-camera answer', () => {
    expect(judgeFit(look({ looksAnimated: true, someoneTalkingToCamera: true, peopleOnCamera: 'one' })))
      .toEqual({ verdict: 'does_not_fit', reason: 'ANIMATED', framesLookedAt: 4 })
  })
})

describe('judgeFit — not knowing is not a no', () => {
  it('all-null is unsure, never does_not_fit', () => {
    expect(judgeFit(look({}))).toEqual({ verdict: 'unsure', reason: 'CANNOT_TELL', framesLookedAt: 4 })
  })

  // ⚠️ ABSENT IS NOT ZERO. If `looksAnimated: null` were read as false the
  // verdict would be unchanged here, but if `peopleOnCamera: null` were read as
  // 'none' this would wrongly say does_not_fit. That is the mistake being pinned.
  it('an unknown people count does not become "nobody"', () => {
    expect(judgeFit(look({ peopleOnCamera: null, someoneTalkingToCamera: null })).verdict).toBe('unsure')
  })

  it('zero frames is unsure however confident the other fields read', () => {
    expect(judgeFit(look({ framesLookedAt: 0, someoneTalkingToCamera: false, peopleOnCamera: 'none' })))
      .toEqual({ verdict: 'unsure', reason: 'NOTHING_LOOKED_AT', framesLookedAt: 0 })
  })

  // ⚠️ NaN < 1 IS FALSE, so a bare `< 1` test would let NaN through as a look.
  it('a NaN frame count is nothing looked at, not a look', () => {
    expect(judgeFit(look({ framesLookedAt: Number.NaN, someoneTalkingToCamera: false })).reason)
      .toBe('NOTHING_LOOKED_AT')
  })
})

describe('the warning the creator reads', () => {
  it('says nothing at all when the video fits', () => {
    expect(warningForPickedVideo({ verdict: 'fits', reason: 'TALKING_TO_CAMERA', framesLookedAt: 2 })).toBeNull()
  })

  // ⚖️ WARNING ON OUR OWN UNCERTAINTY WOULD SPEND THEIR PATIENCE ON OUR
  // IGNORANCE, and the next real warning would be ignored too.
  it('says nothing when Twin could not tell', () => {
    expect(warningForPickedVideo({ verdict: 'unsure', reason: 'CANNOT_TELL', framesLookedAt: 2 })).toBeNull()
    expect(warningForPickedVideo({ verdict: 'unsure', reason: 'NOTHING_LOOKED_AT', framesLookedAt: 0 })).toBeNull()
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
    expect(warningForPickedVideo({ verdict: 'unsure', reason: 'NOBODY_TALKING_TO_CAMERA', framesLookedAt: 2 })).toBeNull()
  })

  it('names what was seen, the cost, and what to use instead', () => {
    const w = warningForPickedVideo({ verdict: 'does_not_fit', reason: 'NOBODY_TALKING_TO_CAMERA', framesLookedAt: 2 })!
    // ⚠️⚠️ THIS ASSERTION USED TO FREEZE 'Nobody in this video is talking to the
    // camera.' -- a claim about the WHOLE VIDEO, from two still pictures. THE
    // TEST WAS WRONG: it pinned an untrue sentence and kept it true-looking.
    // A creator was told this about a 19-second talking head.
    expect(w.saw).toBe('Nobody was talking to the camera in the two still pictures we checked.')
    // ⚖️ AND THE EVIDENCE MUST BE NAMED, not just the conclusion softened.
    expect(w.saw).toContain('we checked')
    expect(w.saw).not.toContain('in this video')
    expect(w.cost).toContain('sound generic')
    expect(w.instead).toContain('speaking straight to the camera')
  })

  // ⚠️ THE COST GOES ON THE BUTTON. A bare "Continue" hides what it costs, and
  // the whole design of warn-but-allow rests on the override being informed.
  it('the continue button states the cost in its own label', () => {
    const w = warningForPickedVideo({ verdict: 'does_not_fit', reason: 'ANIMATED', framesLookedAt: 2 })!
    expect(w.continueLabel).toBe('Use it anyway — the script may not sound like you')
  })

  it('every does_not_fit reason produces a card, none blank', () => {
    for (const reason of ['ANIMATED', 'NOBODY_ON_CAMERA', 'NOBODY_TALKING_TO_CAMERA'] as const) {
      const w = warningForPickedVideo({ verdict: 'does_not_fit', reason, framesLookedAt: 2 })
      expect(w, reason).not.toBeNull()
      expect(w!.saw.length, reason).toBeGreaterThan(10)
    }
  })

  // ⚠️ PLAIN ENGLISH IS A HARD RULE, not a preference. None of Twin's internal
  // words may reach a creator.
  it('uses none of Twin’s internal vocabulary', () => {
    const banned = ['talking-head', 'talking head', 'reference', 'profile', 'analysis', 'analyse', 'frame', 'model', 'pipeline']
    for (const reason of ['ANIMATED', 'NOBODY_ON_CAMERA', 'NOBODY_TALKING_TO_CAMERA'] as const) {
      const w = warningForPickedVideo({ verdict: 'does_not_fit', reason, framesLookedAt: 2 })!
      const all = `${w.saw} ${w.cost} ${w.instead} ${w.continueLabel}`.toLowerCase()
      for (const word of banned) expect(all, `${reason} / ${word}`).not.toContain(word)
    }
  })
})

// ⚠️⚠️ A WARNING MAY NOT CLAIM MORE THAN IT LOOKED AT.
//
// Three refusals were observed in one session, each true about the stills the
// model was shown and false about the video:
//   · "Nobody appears on camera in this video."      -- 227 seconds of a woman
//                                                       talking to camera
//   · "Nobody in this video is talking to the camera." -- a 19-second talking head
//
// EARLY_LOOK_FRAMES is 2. Every one of these sentences was a whole-video verdict
// drawn from two still pictures. The model answered honestly; the copy promoted
// its answer into a claim about footage nobody looked at.
//
// ⚖️ THE WARNING STILL FIRES. This is not a softening -- same trigger, same
// cost line, same override. It stops saying it watched the video.
describe('a warning says what was looked at, not what the video is', () => {
  for (const reason of ['ANIMATED', 'NOBODY_ON_CAMERA', 'NOBODY_TALKING_TO_CAMERA'] as const) {
    it(`${reason} names the evidence and makes no whole-video claim`, () => {
      const w = warningForPickedVideo({ verdict: 'does_not_fit', reason, framesLookedAt: 2 })!
      expect(w.saw).toContain('the two still pictures we checked')
      // Every one of these fails on the previous source, which said "in this video".
      expect(w.saw).not.toContain('in this video')
      expect(w.saw).not.toContain('this video is')
    })
  }

  it('the count is the real one, not a fixed phrase', () => {
    const one = warningForPickedVideo({ verdict: 'does_not_fit', reason: 'NOBODY_ON_CAMERA', framesLookedAt: 1 })!
    expect(one.saw).toContain('the one still picture we checked')
    const six = warningForPickedVideo({ verdict: 'does_not_fit', reason: 'NOBODY_ON_CAMERA', framesLookedAt: 6 })!
    expect(six.saw).toContain('the 6 still pictures we checked')
  })

  // ⚠️ ZERO FRAMES IS NOT A THING TO ACCUSE ANYBODY OVER. judgeFit cannot
  // produce this today -- zero returns NOTHING_LOOKED_AT -- but a hand-built
  // decision could, and "nobody was on camera in the 0 still pictures we
  // checked" is a sentence no creator should ever read.
  it('a does_not_fit with no evidence behind it shows nothing', () => {
    expect(warningForPickedVideo({ verdict: 'does_not_fit', reason: 'NOBODY_ON_CAMERA', framesLookedAt: 0 })).toBeNull()
    expect(warningForPickedVideo({ verdict: 'does_not_fit', reason: 'NOBODY_ON_CAMERA', framesLookedAt: Number.NaN })).toBeNull()
  })
})

describe('the creator’s own account — option 3', () => {
  // ⚠️ THE WHOLE POINT OF OPTION 3. The account message is a FACT ABOUT THEIR
  // VIDEOS, not a verdict on them. "Twin isn't for you" must never appear while
  // we did find something usable.
  it('a thin account is told the count, not that Twin is not for them', () => {
    const m = messageForOwnAccount({ usable: 3, checked: 6 })
    expect(m.kind).toBe('thin')
    expect(m.headline).toBe('We could only read 3 of the 6 videos we looked at clearly enough to learn from')
    expect(m.detail).toBe('Twin will keep learning as you post.')
    expect(`${m.headline} ${m.detail}`.toLowerCase()).not.toContain('not for you')
  })

  // ⚠️ THE SAMPLE SIZE IS THE HONESTY. Twin does not watch every video on an
  // account — frames cost a download each. "We found 3 videos" told someone with
  // forty videos a fact about their whole account that nobody measured.
  it('names how many were actually looked at, never implying the whole account', () => {
    const m = messageForOwnAccount({ usable: 3, checked: 6 })
    expect(m.headline).toContain('6 videos we looked at')
    expect(m.headline).not.toMatch(/^We found/)
  })

  it('one video looked at reads as "video", not "videos"', () => {
    expect(messageForOwnAccount({ usable: 0, checked: 1 }).headline)
      .toBe('We could not read any of the 1 video we looked at clearly enough to learn from')
  })

  // ⚠️ THE DETECTOR IS WHAT FAILS, SO THE SENTENCE MUST NOT INSTRUCT HER.
  // "Post one video where you talk straight to the camera" was measured wrong
  // on 10 of 10 accounts, Hormozi included at 1 usable of 6 — an account that
  // is nothing BUT talking to camera. Telling a creator to fix Twin's false
  // negative reads as a permanent statement about her account, not a retryable
  // refusal. Every branch that speaks must locate the limit in OUR reading.
  it('never tells the creator to post, film, or scan again — on any branch', () => {
    for (const [usable, checked] of [[0, 1], [0, 6], [1, 6], [3, 6]] as const) {
      const m = messageForOwnAccount({ usable, checked })
      const said = `${m.headline} ${m.detail}`.toLowerCase()
      for (const blame of ['post one', 'scan again', 'straight to the camera', 'come back']) {
        expect(said).not.toContain(blame)
      }
      expect(said).toContain('we could')
    }
  })

  // ⚖️ AND IT STAYS TRUE AFTER THE DETECTOR IS FIXED. A better detector does
  // not make this sentence a lie; it makes it report a bigger number. That is
  // the test that the wording is a measurement and not a promise.
  it('the same sentence survives a better detector, reporting a better number', () => {
    expect(messageForOwnAccount({ usable: 1, checked: 6 }).headline)
      .toBe('We could only read 1 of the 6 videos we looked at clearly enough to learn from')
    expect(messageForOwnAccount({ usable: 4, checked: 6 }).headline)
      .toBe('We could only read 4 of the 6 videos we looked at clearly enough to learn from')
  })

  // ⚖️ THE ZERO CASE STILL SAYS NO — but as a measurement of what WE could
  // read, not a verdict on the person, and it names the sample it read.
  it('zero usable says no and names the sample, without naming a culprit', () => {
    const m = messageForOwnAccount({ usable: 0, checked: 6 })
    expect(m.kind).toBe('none')
    expect(m.headline).toBe('We could not read any of the 6 videos we looked at clearly enough to learn from')
    expect(m.detail).toBe('Twin will keep learning as you post.')
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
