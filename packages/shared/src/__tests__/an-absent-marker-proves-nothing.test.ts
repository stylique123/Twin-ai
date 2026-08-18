// PRESENCE CONCLUDES. ABSENCE CONCLUDES NOTHING.
//
// ⚠️ THE TWO WRONG ANSWERS COST DIFFERENT AMOUNTS. A wrong `true` costs a
// creator one skipped card. A wrong `false` reaches `productionModeMatch` as
// "somebody established this video needs no objects", and shows a creator who
// cannot film objects a montage as a perfect fit — a video they cannot shoot.
// The states are not symmetric, so the classifier must not be either.
import { describe, expect, it } from 'vitest'
import {
  assessFromText, isConclusive, NON_MARKERS, type AssessableCard,
} from '../referenceAssessment'

const card = (over: Partial<AssessableCard> = {}): AssessableCard =>
  ({ title: '', why: '', ...over })

describe('a marker in the text concludes a requirement', () => {
  it('reads an unboxing as needing an object in shot', () => {
    const a = assessFromText(card({ title: 'The unboxing everyone got wrong' }))
    expect(a.requiresFilmingObjects).toBe(true)
    expect(a.evidence).toContain('unboxing')
  })

  it('reads a screen recording as needing a screen', () => {
    const a = assessFromText(card({ why: 'Built entirely from a screen recording' }))
    expect(a.requiresScreenRecording).toBe(true)
  })

  it('and can conclude both at once', () => {
    const a = assessFromText(card({ title: 'unboxing', why: 'then a screen capture of the app' }))
    expect(a.requiresFilmingObjects).toBe(true)
    expect(a.requiresScreenRecording).toBe(true)
  })

  it('looks at both text fields a scrape captures, not just the title', () => {
    expect(assessFromText(card({ why: 'A cooking video, start to finish' })).requiresFilmingObjects)
      .toBe(true)
  })

  it('and never reads the niche, because a topic is not a production fact', () => {
    // ⚠️ "Beauty" WOULD HAVE MEANT "films objects" FOR 689 CARDS nobody looked
    // at. The niche is not part of the input at all, by construction.
    const a = assessFromText({ title: 'Beauty', why: 'Beauty' } as never)
    expect(a.requiresFilmingObjects).toBeNull()
  })
})

describe('nothing here ever concludes FALSE', () => {
  it('an empty card answers null on both, not false', () => {
    // ⚠️ THE WHOLE ASYMMETRY. Most videos never describe their own production,
    // so silence is the common case and must stay unassessed.
    const a = assessFromText(card())
    expect(a.requiresFilmingObjects).toBeNull()
    expect(a.requiresScreenRecording).toBeNull()
  })

  it('a card full of unrelated words still answers null', () => {
    const a = assessFromText(card({ title: 'Why nobody talks about this', why: 'A sharp opinion' }))
    expect(a.requiresFilmingObjects).toBeNull()
    expect(a.requiresScreenRecording).toBeNull()
  })

  it('false is unreachable — no input produces it', () => {
    // ⚖️ ASSERTED OVER THE MARKERS THEMSELVES so a future edit that introduces a
    // negative conclusion fails here rather than in the gallery.
    const inputs = [card(), card({ title: 'unboxing' }), card({ why: 'screen recording' }),
      ...NON_MARKERS.map((w) => card({ title: w }))]
    for (const c of inputs) {
      const a = assessFromText(c)
      expect(a.requiresFilmingObjects, JSON.stringify(c)).not.toBe(false)
      expect(a.requiresScreenRecording, JSON.stringify(c)).not.toBe(false)
    }
  })
})

describe('the words that look like markers and are not', () => {
  it('"tutorial" is not a screen recording', () => {
    // ⚠️ THE TRAP THAT WOULD HAVE MARKED A THIRD OF THE GALLERY WRONGLY. A
    // tutorial can be a whiteboard, a piece to camera, or a screen capture.
    expect(assessFromText(card({ title: 'The tutorial that fixed it' })).requiresScreenRecording)
      .toBeNull()
  })

  it('a niche word is not a production fact', () => {
    // ⚖️ "Beauty" IS A TOPIC. It says nothing about what is in frame.
    for (const w of NON_MARKERS) {
      const a = assessFromText(card({ title: w, why: w }))
      expect(a.requiresFilmingObjects, w).toBeNull()
      expect(a.requiresScreenRecording, w).toBeNull()
    }
  })
})

describe('an inconclusive assessment is not a completed one', () => {
  it('concluding nothing is not worth writing', () => {
    // ⚠️ WRITING A NULL OVER A NULL WOULD STAMP THE ROW AS LOOKED-AT, hiding it
    // from the vision pass that could actually answer it.
    expect(isConclusive(assessFromText(card()))).toBe(false)
  })

  it('and a real conclusion is', () => {
    expect(isConclusive(assessFromText(card({ title: 'unboxing' })))).toBe(true)
  })
})

describe('every answer carries the words that produced it', () => {
  it('so a wrong assessment can be argued with', () => {
    // ⚖️ THE SAME RULE THE PRODUCT EXTRACTOR RUNS ON: a claim arrives with its
    // evidence or it does not arrive.
    const a = assessFromText(card({ title: 'haul', why: 'screenshare of the checkout' }))
    expect(a.evidence).toEqual(expect.arrayContaining(['haul', 'screenshare']))
    expect(a.source).toBe('text_markers')
  })

  it('and an inconclusive card carries no evidence', () => {
    expect(assessFromText(card()).evidence).toEqual([])
  })
})
