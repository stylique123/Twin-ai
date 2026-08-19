// THE PASS THAT IS EASIEST TO FAKE, TESTED HARDEST.
//
// ⚠️ THE SECOND HALF OF THIS FILE IS THE POINT. Parser edge cases prove the
// reader is careful; the ADVERSARIAL FRAME scenarios prove it cannot be talked
// into a story the frames do not contain. That is the difference between visual
// enrichment and fan fiction with screenshots.
import { describe, it, expect } from 'vitest'
import {
  extractVisualProfile, readCitation, citationSupports, recreationBlockers,
  VISUAL_FIELDS, VISUAL_FIELD_COUNT, BLOCKER_CODES,
} from '../visualExtraction'
import { emptyVisualProfile, CLAIM_CLASSES } from '../referenceProfile'

const F = 4
const at = (...frames: number[]) => ({ frames })
/** Every field answered with a citation wide enough for any claim class. */
function talkingHeadResponse() {
  const s = (value: unknown) => ({ value, evidence: at(2) })       // static-safe
  const t = (value: unknown) => ({ value, evidence: at(1, 4) })    // temporal-safe
  return {
    primaryMode: t('talking_head'),
    people: { count: s('one') },
    setting: { changes: t(false), complexity: s('simple') },
    performance: {
      talkingHead: s(true), walking: t(false), acting: t(false),
      productInteraction: s(false), screenInteraction: s(false),
    },
    camera: { framingChanges: t(false), positionChanges: t(false) },
    requirements: {
      physicalProduct: s(false), secondPerson: s(false),
      multipleLocations: t(false), unusualProps: s(false),
    },
  }
}
const run = (r: unknown, framesSampled = F) => extractVisualProfile(r, { framesSampled })

describe('no evidence pointer, no claim', () => {
  it('a full, well-cited response is read', () => {
    const r = run(talkingHeadResponse())
    expect(r.rejections).toEqual([])
    expect(r.profile.fieldsObserved).toBe(VISUAL_FIELD_COUNT)
    expect(r.profile.primaryMode).toEqual({ value: 'talking_head', evidence: { frames: [1, 4] } })
  })

  it('a claim with null evidence is not a claim', () => {
    const bad = talkingHeadResponse()
    bad.people = { count: { value: 'multiple', evidence: null as never } }
    const r = run(bad)
    expect(r.profile.people.count).toBeNull()
    expect(r.rejections.map((x) => x.field)).toEqual(['people.count'])
  })

  // ⚠️ THE STRUCTURAL POINT. The value is unreachable except through the object
  // carrying its frames, so no consumer can read one without the other.
  it('the value and its frames arrive together or not at all', () => {
    const r = run(talkingHeadResponse())
    for (const [path] of VISUAL_FIELDS) {
      let cur: unknown = r.profile
      for (const part of path.split('.')) cur = (cur as Record<string, unknown>)[part]
      expect(cur).toHaveProperty('value')
      expect(cur).toHaveProperty('evidence.frames')
    }
  })
})

describe('frames are checked against the sample we sent', () => {
  it('accepts a single frame and an ordered range', () => {
    expect(readCitation([3], F)).toEqual([3])
    expect(readCitation([2, 4], F)).toEqual([2, 4])
  })

  // ⚖️ NOT THE SOURCE VIDEO'S FRAME UNIVERSE. The model sees N frames numbered
  // 1..N; anything else describes a video it was never shown.
  it('rejects a frame outside the sample', () => {
    expect(readCitation([9], F)).toBeNull()
    expect(readCitation([0], F)).toBeNull()
    expect(readCitation([2, 9], F)).toBeNull()
  })

  it('rejects a range that runs backwards or repeats', () => {
    expect(readCitation([4, 2], F)).toBeNull()
    expect(readCitation([3, 3], F)).toBeNull()
  })

  it('rejects a shape that is not a citation at all', () => {
    for (const junk of ['frame 3', 3, null, [], [1, 2, 3], [1.5], ['2']]) {
      expect(readCitation(junk, F)).toBeNull()
    }
  })
})

describe('the evidence must be able to carry the claim', () => {
  it('one frame can settle a static attribute', () => {
    expect(citationSupports('static', [3])).toBe(true)
  })

  // ⚠️ THE HOLE A CITATION CHECK ALONE LEAVES OPEN: "frame 3" for "changes
  // location" is a valid pointer to evidence that cannot establish the claim.
  it('one frame can never settle a change', () => {
    expect(citationSupports('temporal', [3])).toBe(false)
    expect(citationSupports('transition', [3])).toBe(false)
    expect(citationSupports('temporal', [1, 3])).toBe(true)
    expect(citationSupports('transition', [1, 2])).toBe(true)
  })

  it('every field declares a class from the known set', () => {
    expect(VISUAL_FIELDS).toHaveLength(VISUAL_FIELD_COUNT)
    for (const [, cls] of VISUAL_FIELDS) expect(CLAIM_CLASSES).toContain(cls)
  })

  it('a temporal claim cited to one frame is refused', () => {
    const bad = talkingHeadResponse()
    bad.setting.changes = { value: true, evidence: at(3) }
    const r = run(bad)
    expect(r.profile.setting.changes).toBeNull()
    expect(r.rejections[0]).toMatchObject({ field: 'setting.changes', reason: 'out_of_range' })
  })
})

describe('false is data; null is absence of knowledge', () => {
  it('false is kept with its evidence', () => {
    const r = run(talkingHeadResponse())
    expect(r.profile.requirements.secondPerson).toEqual({ value: false, evidence: { frames: [2] } })
  })

  it('a parser failure is null, never a default', () => {
    const bad = talkingHeadResponse()
    bad.primaryMode = { value: 'cinematic_drone', evidence: at(1, 4) }
    const r = run(bad)
    expect(r.profile.primaryMode).toBeNull()
  })

  it('"nothing required" is a successful assessment, not an empty one', () => {
    const r = run(talkingHeadResponse())
    expect(recreationBlockers(r.profile)).toEqual([])
    expect(r.profile.fieldsUnreadable).toBe(0)
  })
})

describe('ran, informative, and settled are three different facts', () => {
  it('no frames discards the response entirely', () => {
    const r = run(talkingHeadResponse(), 0)
    expect(r.profile).toEqual(emptyVisualProfile())
    expect(r.profile.visualPassRan).toBe(false)
    expect(r.rejections).toEqual([])
  })

  it('a pass that learned nothing still ran', () => {
    const r = run({})
    expect(r.profile.visualPassRan).toBe(true)
    expect(r.profile.framesSampled).toBe(F)
    expect(r.profile.fieldsObserved).toBe(0)
    expect(r.profile.fieldsUnreadable).toBe(VISUAL_FIELD_COUNT)
  })

  // ⚖️ "THE FRAMES CANNOT SAY" RETIRES THE QUESTION; a malformed field does not.
  // Without the split the batch pays forever to re-ask what is already settled.
  it('an explicit undeterminable is settled, not unreadable', () => {
    const bad = talkingHeadResponse()
    bad.setting.complexity = { value: 'NOT_DETERMINED', evidence: at(1) }
    const r = run(bad)
    expect(r.profile.setting.complexity).toBeNull()
    expect(r.profile.indeterminate).toEqual(['setting.complexity'])
    expect(r.profile.fieldsUnreadable).toBe(0)
    expect(r.rejections).toEqual([])
  })
})

// ── ADVERSARIAL FRAMES ────────────────────────────────────────────────────
//
// ⚠️ EACH CASE IS A REAL SAMPLE SHAPE AND THE STORY A MODEL WOULD LIKE TO TELL
// ABOUT IT. The assertion is always the same: the story does not survive unless
// the evidence can carry it.
describe('the model cannot manufacture a temporal story from stills', () => {
  it('four near-identical talking-head frames cannot yield a location change', () => {
    const r = run({ ...talkingHeadResponse(), setting: {
      changes: { value: true, evidence: at(2) },
      complexity: { value: 'simple', evidence: at(2) },
    } })
    expect(r.profile.setting.changes).toBeNull()
  })

  it('same person, two backgrounds CAN yield a location change', () => {
    const r = run({ ...talkingHeadResponse(), setting: {
      changes: { value: true, evidence: at(1, 3) },
      complexity: { value: 'simple', evidence: at(1) },
    } })
    expect(r.profile.setting.changes).toEqual({ value: true, evidence: { frames: [1, 3] } })
    expect(recreationBlockers(r.profile)).toEqual([])
  })

  it('a product visible in one frame is a real requirement', () => {
    const res = talkingHeadResponse()
    res.requirements.physicalProduct = { value: true, evidence: at(3) }
    const b = recreationBlockers(run(res).profile) ?? []
    expect(b).toEqual([{
      blocker: 'requires_physical_product',
      because: 'You need the product in your hands.',
      evidence: { frames: [3] },
    }])
  })

  it('a second person in one frame is a blocker, and carries the frame', () => {
    const res = talkingHeadResponse()
    res.requirements.secondPerson = { value: true, evidence: at(2) }
    const b = recreationBlockers(run(res).profile) ?? []
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ blocker: 'requires_second_person', evidence: { frames: [2] } })
  })

  it('a screen recording in one frame is a static observation', () => {
    const res = talkingHeadResponse()
    res.performance.screenInteraction = { value: true, evidence: at(4) }
    expect(run(res).profile.performance.screenInteraction)
      .toEqual({ value: true, evidence: { frames: [4] } })
  })

  // ⚠️ AN EMPTY STAGE IS AN OBSERVATION, NOT A GAP.
  it('no person at all reads as false, with evidence', () => {
    const res = talkingHeadResponse()
    res.performance.talkingHead = { value: false, evidence: at(1) }
    const r = run(res)
    expect(r.profile.performance.talkingHead).toEqual({ value: false, evidence: { frames: [1] } })
    expect(r.rejections).toEqual([])
  })

  it('frames cited out of chronological order are refused', () => {
    const res = talkingHeadResponse()
    res.camera.positionChanges = { value: true, evidence: at(4, 1) }
    const r = run(res)
    expect(r.profile.camera.positionChanges).toBeNull()
    expect(r.rejections[0]).toMatchObject({ field: 'camera.positionChanges', reason: 'no_evidence' })
  })

  it('a blank frame the model calls undeterminable settles rather than fails', () => {
    const res = talkingHeadResponse()
    res.people = { count: { value: 'NOT_DETERMINED', evidence: at(2) } }
    const r = run(res)
    expect(r.profile.indeterminate).toContain('people.count')
    expect(recreationBlockers(r.profile)).toEqual([])
  })

  // ⚖️ WALKING IS THE HARDEST ONE. A still shows a person mid-stride; it does
  // not show them walking, and `transition` is what refuses that.
  it('a person mid-stride in one frame is not walking', () => {
    const res = talkingHeadResponse()
    res.performance.walking = { value: true, evidence: at(2) }
    expect(run(res).profile.performance.walking).toBeNull()
  })
})

describe('a blocker explains itself where it is read', () => {
  it('unassessed is null, so the gallery promises nothing', () => {
    expect(recreationBlockers(emptyVisualProfile())).toBeNull()
  })

  it('two fields agreeing state the blocker once', () => {
    const res = talkingHeadResponse()
    res.people = { count: { value: 'multiple', evidence: at(1) } }
    res.requirements.secondPerson = { value: true, evidence: at(2) }
    const b = recreationBlockers(run(res).profile) ?? []
    expect(b).toHaveLength(1)
  })

  it('every reason is plain English a creator can read', () => {
    const res = talkingHeadResponse()
    res.requirements.unusualProps = { value: true, evidence: at(2) }
    res.requirements.multipleLocations = { value: true, evidence: at(1, 3) }
    for (const b of recreationBlockers(run(res).profile) ?? []) {
      expect(BLOCKER_CODES).toContain(b.blocker)
      expect(b.because).toMatch(/^[A-Z].*\.$/)
      expect(b.because).not.toMatch(/_|requires|profile|evidence/)
    }
  })
})
