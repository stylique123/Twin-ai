import { describe, expect, it } from 'vitest'
import { observedVisualBlock, observedVisualCount, observedVisualLines } from '../observedVisual'
import { emptyVisualProfile, type ReferenceVisualProfile } from '../../referenceProfile'

function profileWithFrames(overrides: Partial<ReferenceVisualProfile>): ReferenceVisualProfile {
  return { ...emptyVisualProfile(), visualPassRan: true, framesSampled: 4, ...overrides }
}

describe('the pass never ran, or ran and read nothing', () => {
  it('null profile produces no lines', () => {
    expect(observedVisualLines(null)).toEqual([])
    expect(observedVisualBlock(null)).toBeNull()
    expect(observedVisualCount(null)).toBe(0)
  })

  it('visualPassRan: false produces no lines even with fields set', () => {
    // Should never happen per extractVisualProfile's own contract, but the
    // reader must not trust a field value it has no business reading.
    // ⚠️ `as const` ON THE FRAMES WAS DOING THE OPPOSITE OF WHAT IT LOOKED LIKE.
    // It froze `frames` to `readonly [1]` and left `value` inferred as `string`,
    // so `primaryMode` was NOT a `VisualObservation<ProductionMode>` and the whole
    // object was not a `ReferenceVisualProfile`. An annotation on the binding is
    // what makes the literal contextually typed, so `'talking_head'` is checked
    // against the union rather than widened past it.
    const p: ReferenceVisualProfile = {
      ...emptyVisualProfile(),
      primaryMode: { value: 'talking_head', evidence: { frames: [1] } },
    }
    expect(observedVisualLines(p)).toEqual([])
    expect(observedVisualBlock(p)).toBeNull()
  })

  it('the pass ran but every field is null: no lines, no block, count 0', () => {
    const p = profileWithFrames({ fieldsObserved: 0 })
    expect(observedVisualLines(p)).toEqual([])
    expect(observedVisualBlock(p)).toBeNull()
    expect(observedVisualCount(p)).toBe(0)
  })
})

describe('setting and camera work are here BECAUSE a transcript cannot see them', () => {
  it('renders a setting-changes line', () => {
    const p = profileWithFrames({
      setting: { changes: { value: true, evidence: { frames: [1, 3] } }, complexity: null },
    })
    const lines = observedVisualLines(p)
    expect(lines).toContainEqual({ dimension: 'setting_changes', line: 'The setting changes during the video.' })
  })

  it('renders a shot-type line', () => {
    const p = profileWithFrames({
      camera: { framingChanges: null, positionChanges: null, shotType: { value: 'close', evidence: { frames: [2] } } },
    })
    expect(observedVisualLines(p)).toContainEqual({ dimension: 'shot_type', line: 'Shot in a close shot.' })
  })
})

describe('false is data, not silence', () => {
  it('a false requirement renders as an explicit negative, not an omission', () => {
    const p = profileWithFrames({
      requirements: {
        physicalProduct: { value: false, evidence: { frames: [1] } },
        secondPerson: null, multipleLocations: null, unusualProps: null,
      },
    })
    expect(observedVisualLines(p)).toContainEqual({
      dimension: 'requires_physical_product',
      line: 'No physical product is required to shoot this.',
    })
  })
})

describe('the block is labeled observed_visual, matching the spec', () => {
  it('the rendered block names itself', () => {
    const p = profileWithFrames({
      people: { count: { value: 'one', evidence: { frames: [1] } } },
    })
    const block = observedVisualBlock(p)
    expect(block).not.toBeNull()
    expect(block).toContain('observed_visual')
    expect(block).toContain('Only one person appears on camera.')
  })
})

describe('the beat_audit counter reads fieldsObserved, not the rendered line count', () => {
  it('counts fields observed by the pass, including ones this module renders no line for yet', () => {
    // fieldsObserved comes from the extraction pass itself and may exceed the
    // count of dimensions this reader currently renders lines for -- the
    // counter must never re-derive its own number from the lines array.
    const p = profileWithFrames({ fieldsObserved: 7 })
    expect(observedVisualCount(p)).toBe(7)
  })

  it('is 0 when the pass never ran', () => {
    expect(observedVisualCount(emptyVisualProfile())).toBe(0)
  })
})

describe('determinism: same input, same output', () => {
  it('field order is fixed, not derived from object key order', () => {
    const p = profileWithFrames({
      requirements: {
        physicalProduct: { value: true, evidence: { frames: [1] } },
        secondPerson: { value: false, evidence: { frames: [2] } },
        multipleLocations: null,
        unusualProps: null,
      },
      people: { count: { value: 'multiple', evidence: { frames: [1] } } },
    })
    const a = observedVisualLines(p)
    const b = observedVisualLines({ ...p })
    expect(a).toEqual(b)
    expect(a.map((l) => l.dimension)).toEqual(['people_count', 'requires_physical_product', 'requires_second_person'])
  })
})

describe('a gallery item with a cached analysis produces >4 observed', () => {
  it('a fully-answered profile reports more than four lines', () => {
    const p = profileWithFrames({
      primaryMode: { value: 'talking_head', evidence: { frames: [1] } },
      people: { count: { value: 'one', evidence: { frames: [1] } } },
      setting: {
        changes: { value: false, evidence: { frames: [1, 4] } },
        complexity: { value: 'simple', evidence: { frames: [1] } },
      },
      performance: {
        talkingHead: { value: true, evidence: { frames: [1] } },
        walking: { value: false, evidence: { frames: [1, 4] } },
        acting: null, productInteraction: null, screenInteraction: null,
      },
      fieldsObserved: 6,
    })
    expect(observedVisualLines(p).length).toBeGreaterThan(4)
  })
})
