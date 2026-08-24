import { describe, it, expect } from 'vitest'
import {
  messageForOwnAccount, OWN_VIDEOS_TO_CHECK, ENOUGH_TO_SOUND_LIKE_YOU,
} from '../talkingHeadFit'

/**
 * ⚠️ THE GUARD IS WRITTEN BEFORE THE SWITCH IS THROWN.
 *
 * The per-video talking-head check is moving OFF the onboarding critical path —
 * six extra 360p downloads and six model calls should not sit between a new
 * creator and their first script. The moment it runs asynchronously, counts
 * become readable while they are still climbing, and a state no existing caller
 * can produce becomes reachable in production.
 *
 * ⚖️ AND THE DISTINCTION IS COMPLETE-VS-PARTIAL, NOT BIG-VS-SMALL. My first
 * design refused to speak below a sample size, and it was wrong: a creator who
 * has posted one video yields `checked: 1` legitimately, and "None of the 1
 * video we looked at" is true and useful for them. Silencing that would throw
 * away a finished measurement to avoid an unfinished one.
 */
describe('a sample still being collected gets no verdict', () => {
  // ⚠️ THIS IS THE PRODUCTION BUG THE GUARD PREVENTS. One video checked, none
  // usable yet, five still downloading — without the guard this renders "None
  // of the 1 video we looked at are you talking to the camera" to a creator
  // whose account may be entirely talking heads.
  it('one checked so far, none usable yet, says nothing', () => {
    const m = messageForOwnAccount({ usable: 0, checked: 1, complete: false })
    expect(m.kind).toBe('fine')
    expect(m.headline).toBe('')
  })

  it.each([
    [0, 1],
    [1, 2],
    [2, 4],
    [0, OWN_VIDEOS_TO_CHECK - 1],
  ])('usable %i of %i checked so far stays silent', (usable, checked) => {
    expect(messageForOwnAccount({ usable, checked, complete: false }).kind).toBe('fine')
  })

  // ⚖️ EVEN A PARTIAL SAMPLE THAT ALREADY CLEARS THE BAR STAYS SILENT, and that
  // costs nothing: `fine` is what a cleared bar produces anyway. Special-casing
  // it would mean the partial path and the complete path disagree about what
  // counts as done, which is exactly the drift this guard exists to stop.
  it('a partial sample that already clears the bar is silent too', () => {
    expect(messageForOwnAccount({
      usable: ENOUGH_TO_SOUND_LIKE_YOU, checked: ENOUGH_TO_SOUND_LIKE_YOU, complete: false,
    }).kind).toBe('fine')
  })
})

describe('a finished sample still speaks, at every size', () => {
  // ⚠️ THE SMALL-BUT-COMPLETE CASE, which is the one a size rule would have
  // broken. A creator with a single video has been fully measured.
  it('one video, complete, still gets the true sentence', () => {
    const m = messageForOwnAccount({ usable: 0, checked: 1, complete: true })
    expect(m.kind).toBe('none')
    expect(m.headline).toBe('None of the 1 video we looked at are you talking to the camera')
  })

  it('a full sample with nothing usable still says no', () => {
    expect(messageForOwnAccount({ usable: 0, checked: OWN_VIDEOS_TO_CHECK, complete: true }).kind)
      .toBe('none')
  })

  it('a full sample below the bar is still thin', () => {
    expect(messageForOwnAccount({ usable: 1, checked: OWN_VIDEOS_TO_CHECK, complete: true }).kind)
      .toBe('thin')
  })
})

/**
 * ⚠️ ABSENT MEANS COMPLETE, AND THAT IS AN OBSERVATION RATHER THAN A DEFAULT.
 * Every call site shipped today asks only after its sample is finished, so
 * `undefined` describes them correctly. Had absent meant "partial", the shipped
 * gate would have gone silent for everybody the moment this landed.
 */
describe('existing callers are untouched', () => {
  it.each([
    [0, OWN_VIDEOS_TO_CHECK, 'none'],
    [1, OWN_VIDEOS_TO_CHECK, 'thin'],
    [ENOUGH_TO_SOUND_LIKE_YOU, OWN_VIDEOS_TO_CHECK, 'fine'],
    [0, 0, 'fine'],
  ] as const)('usable %i of %i with no flag is %s, exactly as before', (usable, checked, kind) => {
    expect(messageForOwnAccount({ usable, checked }).kind).toBe(kind)
  })

  // ⚖️ AND OMITTING THE FLAG MUST EQUAL SAYING `true`, or the two paths have
  // quietly diverged and every existing caller is on the untested one.
  it.each([
    [0, 1], [0, OWN_VIDEOS_TO_CHECK], [1, OWN_VIDEOS_TO_CHECK], [ENOUGH_TO_SOUND_LIKE_YOU, 30],
  ])('omitting the flag matches complete:true for %i of %i', (usable, checked) => {
    expect(messageForOwnAccount({ usable, checked }))
      .toEqual(messageForOwnAccount({ usable, checked, complete: true }))
  })
})

// ⚠️ ONLY AN EXPLICIT `false` SILENCES. A truthy-check would let any falsy value
// — 0, '', null from a loosely typed caller — silence a finished measurement.
it('a null-ish complete does not silence a finished sample', () => {
  expect(messageForOwnAccount({ usable: 0, checked: 6, complete: undefined }).kind).toBe('none')
  expect(messageForOwnAccount({ usable: 0, checked: 6, complete: null as never }).kind).toBe('none')
})
