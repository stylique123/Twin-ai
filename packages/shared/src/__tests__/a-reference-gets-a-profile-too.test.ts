// THE REFERENCE'S HALF OF THE COMPARISON, AND WHAT IT REFUSES TO PRETEND.
//
// ⚠️ THE SCHEMA IS BEING FROZEN BEFORE 9,504 MEDIA-BEARING CALLS RUN AGAINST IT,
// so these assertions are the contract the batch is built to satisfy. The
// expensive failure is not a bad extraction — it is industrialising a shape that
// cannot answer the gallery's question, discovered after the spend.
//
// ⚖️ AND THE TWO PASSES STAY APART. What Twin heard and what Twin saw are
// separate objects, because merged they average a confident reading of the
// speech with an unlooked-at picture into a card that reads half-known and is
// half-invented.
import { describe, expect, it } from 'vitest'
import {
  emptyReferenceProfile, emptyVisualProfile, observedFieldCount,
  PRODUCTION_MODES, type ReferenceProfile,
} from '../referenceProfile'
import {
  emptyContentProfile, frameSampleTargets, CONTAINER_TYPES, CONTENT_SLOT_KINDS,
  type Beat, type ReferenceContentProfile,
} from '../referenceContentProfile'
import {
  ASSESSMENT_BASIS, isKnown, worthChecking, unchecked, indeterminate,
  type Assessed,
} from '../assessed'

const AT = '2026-01-01T00:00:00.000Z'
const observed = <T,>(value: T, evidence: string): Assessed<T> =>
  ({ value, basis: 'observed', evidence, assessedAt: AT })

/** Every assessed field in a profile, flattened, so a test can say "all of
 *  them" without listing them and going stale the next time one is added. */
const allFields = (p: ReferenceProfile): Assessed<unknown>[] => {
  const out: Assessed<unknown>[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if ('basis' in (node as Record<string, unknown>)) {
      out.push(node as Assessed<unknown>)
      return
    }
    for (const v of Object.values(node as Record<string, unknown>)) walk(v)
  }
  walk(p)
  return out
}

describe('an unassessed card is a valid profile, because that is every card', () => {
  const p = emptyReferenceProfile('ref-1', 'Beauty')

  it('every field starts not_checked', () => {
    const fields = allFields(p)
    expect(fields.length).toBeGreaterThan(20)
    for (const f of fields) expect(f.basis).toBe('not_checked')
  })

  it('and nothing is silently false', () => {
    // ⚠️ THE DEFECT THIS SHAPE EXISTS TO PREVENT. `physicalProduct: false` on a
    // card nobody looked at would tell a creator who cannot film objects that a
    // product montage is a perfect fit — a video they cannot shoot.
    for (const f of allFields(p)) expect(isKnown(f)).toBe(false)
  })

  it('every unchecked field names the measurement that would answer it', () => {
    // ⚖️ SO THE BATCH'S WORKLIST LIVES IN THE TYPE rather than in somebody's
    // head, and an unbuilt signal is one measurement away rather than a mystery.
    for (const f of allFields(p)) {
      expect(f.basis).toBe('not_checked')
      if (f.basis === 'not_checked') expect(f.needs.trim().length).toBeGreaterThan(8)
    }
  })

  it('and reports itself as unassessed rather than as assessed-with-nothing', () => {
    expect(observedFieldCount(p)).toEqual({ content: 0, visual: 0 })
    expect(p.content.transcriptAvailable).toBe(false)
    expect(p.visual.framesSampled).toBe(false)
  })

  it('keeps the scraped niche as-is, and infers nothing from it', () => {
    // ⚠️ "Beauty" IS A TOPIC, NOT A PRODUCTION FACT. Reading "films objects" out
    // of it would have invented an answer for 689 cards nobody looked at.
    expect(p.content.niche).toBe('Beauty')
    expect(p.content.topic.basis).toBe('not_checked')
    expect(p.visual.requirements.physicalProduct.basis).toBe('not_checked')
  })
})

describe('how a fact was learned travels with it', () => {
  it('observed, inferred, indeterminate and not_checked are four different claims', () => {
    // ⚠️ A VALUE READ OFF A TRANSCRIPT AND ONE GUESSED FROM A TITLE ARE NOT THE
    // SAME CLAIM, and the weaker must never be laundered into the stronger.
    expect(ASSESSMENT_BASIS).toEqual(['observed', 'inferred', 'indeterminate', 'not_checked'])
  })

  it('a claimed value cannot exist without its evidence', () => {
    const f = observed('founders', 'says "if you run a SaaS" at 0:03')
    expect(f.basis === 'observed' && f.evidence.length > 0).toBe(true)
  })
})

describe('"we looked and it does not say" is not "nobody looked"', () => {
  // ⚠️ THE STATE THE BATCH MADE NECESSARY. Without it, a card whose transcript
  // genuinely never names an audience is indistinguishable from one never
  // opened — so the next run pays for all 9,504 again to learn the same nothing.
  const never = unchecked<string>('a transcript or caption for this video')
  const asked = indeterminate<string>('full transcript read; no audience named', AT)

  it('neither yields a value', () => {
    expect(isKnown(never)).toBe(false)
    expect(isKnown(asked)).toBe(false)
  })

  it('but only one is worth spending another call on', () => {
    expect(worthChecking(never)).toBe(true)
    expect(worthChecking(asked)).toBe(false)
  })

  it('and the finished one says what was examined', () => {
    expect(asked.basis === 'indeterminate' && asked.evidence).toContain('transcript')
  })
})

describe('slots are what make "can Twin finish this" answerable', () => {
  const withSlots = (kind: string, count: number): ReferenceContentProfile => {
    const c = emptyContentProfile('r')
    return {
      ...c,
      requirements: {
        ...c.requirements,
        contentSlots: observed(
          Array.from({ length: count }, (_, i) => ({
            id: `${i + 1}`, kind: kind as never, label: `item_${i + 1}`, required: true,
          })),
          'three items named in sequence',
        ),
      },
    }
  }

  it('a slot names its role in the container, not the original\'s content', () => {
    // ⚖️ A THREE-ITEM LIST IS NOT THREE INTERCHANGEABLE HOLES. A recommendation
    // that puts the weakest item last is a worse video than the one it copied.
    const s = withSlots('product', 3).requirements.contentSlots
    expect(isKnown(s) && s.value.map((x) => x.label)).toEqual(['item_1', 'item_2', 'item_3'])
  })

  it('and the kinds cover both what a library can supply and what it cannot', () => {
    expect(CONTENT_SLOT_KINDS).toContain('product')
    expect(CONTENT_SLOT_KINDS).toContain('personal_experience')
    expect(CONTENT_SLOT_KINDS).toContain('current_fact')
  })

  it('a personal-experience slot is a different fact from a product slot', () => {
    // ⚠️ ONLY THE CREATOR CAN ASSERT A PERSONAL FAILURE. Counting it as fillable
    // would promise a video Twin cannot honestly write.
    const personal = withSlots('personal_experience', 3).requirements.contentSlots
    expect(isKnown(personal) && personal.value.every((x) => x.kind === 'personal_experience')).toBe(true)
  })
})

describe('the transcript pass tells the visual pass where to look', () => {
  // ⚠️ THE READER THAT JUSTIFIES STORING TIMESTAMPS. Without a consumer,
  // `Beat.startSec` is a field with no reader — the thing this codebase refuses
  // to add. With it, pass 2 samples the hook, rehook and payoff instead of five
  // arbitrary percentages, which is why pass 1 makes pass 2 cheaper AND better.
  const beats: Beat[] = [
    { role: 'hook', startSec: 0, endSec: 4, summary: 'negative claim' },
    { role: 'rehook', startSec: 19, endSec: 23, summary: 'second promise' },
    { role: 'payoff', startSec: 37, endSec: 43, summary: 'the reveal' },
    { role: 'cta', startSec: 44, endSec: 49, summary: 'follow' },
  ]
  const withBeats = (bs: Beat[]): ReferenceContentProfile => {
    const c = emptyContentProfile('r')
    return { ...c, structure: { ...c.structure, beats: observed(bs, 'timed transcript') } }
  }

  it('returns the beat starts, sorted and de-duplicated', () => {
    expect(frameSampleTargets(withBeats(beats))).toEqual([0, 19, 37, 44])
  })

  it('sorts out-of-order beats rather than trusting the extraction', () => {
    const jumbled = [beats[2], beats[0], beats[3], beats[1]]
    expect(frameSampleTargets(withBeats(jumbled))).toEqual([0, 19, 37, 44])
  })

  it('and returns nothing at all when there are no beats', () => {
    // ⚖️ SO THE CALLER DOES UNIFORM SAMPLING KNOWING THAT IS WHAT IT IS DOING.
    // A fabricated schedule would look like knowledge.
    expect(frameSampleTargets(emptyContentProfile('r'))).toEqual([])
  })

  it('and drops beats from a source with no clock, rather than inventing zeros', () => {
    // ⚠️ A CAPTION-ONLY SOURCE HAS NO TIMESTAMPS. Coercing null to 0 would aim
    // every sample at the first frame while looking deliberate.
    const clockless: Beat[] = [{ role: 'hook', startSec: null, endSec: null, summary: 'x' }]
    expect(frameSampleTargets(withBeats(clockless))).toEqual([])
  })
})

describe('the visual half exists, empty, and stays that way until frames are read', () => {
  it('ships unassessed rather than absent', () => {
    // ⚖️ THE CONTENT PASS NEEDS SOMEWHERE TO *NOT* PUT ITS FINDINGS. A transcript
    // saying "let me show you" is not a screen recording observed, and without a
    // separate home for the visual claim there is nowhere to draw that line.
    const v = emptyVisualProfile()
    expect(v.framesSampled).toBe(false)
    expect(v.primaryMode.basis).toBe('not_checked')
    expect(v.primaryMode.basis === 'not_checked' && v.primaryMode.needs).toMatch(/frames/)
  })

  it('and keeps "a production Twin cannot help with" as a real answer', () => {
    expect(PRODUCTION_MODES).toContain('other_unsupported')
  })
})

describe('what is deliberately absent', () => {
  it('there is no freshness field, because there is no source for one', () => {
    // ⚠️ AN EMPTY COLUMN IS NOT A REASON TO INVENT A VALUE. The scraped rows
    // carry no publication date and no performance history, so any "recency"
    // here would be a number filled in to stop the schema looking incomplete.
    const p = emptyReferenceProfile('r')
    const keys = JSON.stringify(p)
    expect(keys).not.toMatch(/fresh|recency|publishedAt|trending/i)
  })

  it('and the container list stays a closed vocabulary', () => {
    expect(CONTAINER_TYPES).toContain('other')
    expect(new Set(CONTAINER_TYPES).size).toBe(CONTAINER_TYPES.length)
  })
})
