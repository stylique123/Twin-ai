// THE PASS THAT IS EASIEST TO FAKE, TESTED HARDEST.
//
// ⚠️ A MODEL HANDED FRAMES CAN WRITE "two people, changing locations, product in
// hand" ABOUT A STATIC TALKING-HEAD, because those words go together. Nothing
// downstream can tell afterwards — every field looks equally certain in a
// database row. These tests are the part that can refuse.
import { describe, it, expect } from 'vitest'
import {
  extractVisualProfile, framesCited, recreationBlockers,
  VISUAL_FIELDS, VISUAL_FIELD_COUNT,
} from '../visualExtraction'
import { emptyVisualProfile } from '../referenceProfile'

const AT = '2026-08-19T00:00:00.000Z'
const ev = (s: string) => s

/** A response where every field is answered and cites a frame. */
function goodResponse() {
  const f = (value: unknown) => ({ value, evidence: 'frame 2' })
  return {
    primaryMode: f('talking_head'),
    people: { count: f('one') },
    setting: { changes: f(false), complexity: f('simple') },
    performance: {
      talkingHead: f(true), walking: f(false), acting: f(false),
      productInteraction: f(false), screenInteraction: f(false),
    },
    camera: { framingChanges: f(false), positionChanges: f(false) },
    requirements: {
      physicalProduct: f(false), secondPerson: f(false),
      multipleLocations: f(false), unusualProps: f(false),
    },
  }
}

describe('evidence must point at a frame somebody could go and check', () => {
  it('accepts a citation and reads the value', () => {
    const r = extractVisualProfile(goodResponse(), { assessedAt: AT, framesSeen: 4 })
    expect(r.rejections).toEqual([])
    expect(r.fieldsAccepted).toBe(VISUAL_FIELD_COUNT)
    expect(r.profile.primaryMode).toMatchObject({ value: 'talking_head', basis: 'observed' })
  })

  // ⚠️ THE SHAPE A MODEL PRODUCES WHEN IT IS GENERALISING RATHER THAN LOOKING.
  it('rejects prose that never names a frame', () => {
    const bad = goodResponse()
    bad.primaryMode = { value: 'talking_head', evidence: 'the video shows a person speaking' }
    const r = extractVisualProfile(bad, { assessedAt: AT, framesSeen: 4 })
    expect(r.rejections.map((x) => x.field)).toEqual(['primaryMode'])
    expect(r.profile.primaryMode.basis).toBe('not_checked')
  })

  // ⚖️ THE VISUAL EQUIVALENT OF A REHOOK POINTING AT A BEAT THAT DOES NOT EXIST.
  it('rejects a frame we never sent', () => {
    const bad = goodResponse()
    bad.primaryMode = { value: 'talking_head', evidence: 'frame 9' }
    const r = extractVisualProfile(bad, { assessedAt: AT, framesSeen: 4 })
    expect(r.rejections.map((x) => x.field)).toEqual(['primaryMode'])
  })

  it('reads ranges and single frames alike', () => {
    expect(framesCited('frames 2-4 show it', 4)).toEqual([2, 3, 4])
    expect(framesCited('see f3', 4)).toEqual([3])
    expect(framesCited('frames 3 to 5', 4)).toEqual([3, 4])
    expect(framesCited('no citation here', 4)).toEqual([])
    expect(framesCited('frames 5-2', 4)).toEqual([])
  })
})

describe('a legal answer never collides with a rejection signal', () => {
  // ⚠️ THE BUG THAT COST 15 WRONGLY-REJECTED FIELDS IN THE CONTENT PASS. `false`
  // is the most common true answer in this whole schema; a parser that used
  // `null` for both "false" and "unreadable" would throw away most of it.
  it('false is an answer, not a failure', () => {
    const r = extractVisualProfile(goodResponse(), { assessedAt: AT, framesSeen: 4 })
    expect(r.profile.performance.walking).toMatchObject({ value: false, basis: 'observed' })
    expect(r.profile.requirements.secondPerson).toMatchObject({ value: false, basis: 'observed' })
    expect(r.rejections).toEqual([])
  })

  it('a value outside the vocabulary is rejected, not coerced', () => {
    const bad = goodResponse()
    bad.primaryMode = { value: 'cinematic_drone', evidence: 'frame 1' }
    const r = extractVisualProfile(bad, { assessedAt: AT, framesSeen: 4 })
    expect(r.rejections[0]).toMatchObject({ field: 'primaryMode', reason: 'not_in_vocabulary' })
  })
})

describe('rejected is not the same as answered', () => {
  // ⚠️ FILING A MALFORMED RESPONSE AS `indeterminate` WOULD RETIRE THE QUESTION
  // FOREVER — `worthChecking` skips it, so the field is lost rather than queued.
  it('a malformed field lands on not_checked so it can be asked again', () => {
    const bad = goodResponse()
    bad.people = { count: { value: 'one' } as never }
    const r = extractVisualProfile(bad, { assessedAt: AT, framesSeen: 4 })
    expect(r.profile.people.count.basis).toBe('not_checked')
  })

  it('an explicit NOT_DETERMINED is a finding and is kept as one', () => {
    const bad = goodResponse()
    bad.setting.complexity = { value: 'NOT_DETERMINED', evidence: 'frames are too dark' }
    const r = extractVisualProfile(bad, { assessedAt: AT, framesSeen: 4 })
    expect(r.profile.setting.complexity.basis).toBe('indeterminate')
    expect(r.rejections).toEqual([])
  })
})

describe('a pass that never ran must not look like one that found nothing', () => {
  // ⚠️ A MODEL ANSWERING WITH NO FRAMES IS ANSWERING FROM THE CAPTION, which is
  // the content pass's job or nobody's. Laundering it into `observed` here is
  // the confusion the two profiles were split apart to prevent.
  it('no frames means the response is not read at all', () => {
    const r = extractVisualProfile(goodResponse(), { assessedAt: AT, framesSeen: 0 })
    expect(r.profile).toEqual(emptyVisualProfile())
    expect(r.profile.framesSampled).toBe(false)
    expect(r.fieldsAccepted).toBe(0)
    expect(r.rejections).toEqual([])
  })

  it('frames with an unusable response is a rejection, and the pass still ran', () => {
    const r = extractVisualProfile('not an object', { assessedAt: AT, framesSeen: 4 })
    expect(r.rejections.map((x) => x.field)).toEqual(['response'])
    expect(r.framesSeen).toBe(4)
  })

  // ⚖️ `framesSampled` RECORDS THAT THE PASS RAN, not that it went well.
  it('every field rejected still counts as sampled', () => {
    const r = extractVisualProfile({}, { assessedAt: AT, framesSeen: 4 })
    expect(r.profile.framesSampled).toBe(true)
    expect(r.fieldsAccepted).toBe(0)
    expect(r.rejections).toHaveLength(VISUAL_FIELD_COUNT)
  })
})

describe('the field list is the field list', () => {
  it('every named field is read, and nothing else is', () => {
    const r = extractVisualProfile({}, { assessedAt: AT, framesSeen: 4 })
    expect(r.rejections.map((x) => x.field).sort()).toEqual([...VISUAL_FIELDS].sort())
  })
})

describe('what the gallery is allowed to say', () => {
  it('an unassessed video blocks nobody, and says so as null', () => {
    // ⚠️ NOT AN EMPTY LIST. "No blockers" and "nobody looked" would then be the
    // same value, and 97% of the library is the second one.
    expect(recreationBlockers(emptyVisualProfile())).toBeNull()
  })

  it('a simple talking-head has no blockers', () => {
    const r = extractVisualProfile(goodResponse(), { assessedAt: AT, framesSeen: 4 })
    expect(recreationBlockers(r.profile)).toEqual([])
  })

  it('a second person is a blocker whichever field reports it', () => {
    const two = goodResponse()
    two.people = { count: { value: 'multiple', evidence: 'frame 1' } }
    const r = extractVisualProfile(two, { assessedAt: AT, framesSeen: 4 })
    expect(recreationBlockers(r.profile)).toEqual(['Someone else has to be on camera.'])
  })

  it('and it is said once, not twice, when both fields agree', () => {
    const two = goodResponse()
    two.people = { count: { value: 'multiple', evidence: 'frame 1' } }
    two.requirements.secondPerson = { value: true, evidence: 'frame 1' }
    const r = extractVisualProfile(two, { assessedAt: AT, framesSeen: 4 })
    expect(recreationBlockers(r.profile)).toEqual(['Someone else has to be on camera.'])
  })

  // ⚖️ EVERY LINE IS PLAIN ENGLISH. A creator reads these on a card.
  it('speaks to a creator, not about a schema', () => {
    const hard = goodResponse()
    hard.requirements.multipleLocations = { value: true, evidence: ev('frames 1-3') }
    hard.requirements.unusualProps = { value: true, evidence: ev('frame 2') }
    const r = extractVisualProfile(hard, { assessedAt: AT, framesSeen: 4 })
    const lines = recreationBlockers(r.profile) ?? []
    expect(lines).toContain('It moves between places.')
    expect(lines).toContain('It needs props you may not have.')
    for (const l of lines) {
      expect(l).toMatch(/^[A-Z].*\.$/)
      expect(l).not.toMatch(/_|requirements|profile|basis/)
    }
  })
})
