// THE REVIEW GATE'S CONTRACT — Phase 10 item 4, the half that is not a screen.
//
// The load-bearing test in this file is the byte-identical one. Until a creator
// edits something, review must change nothing: an empty overlay composes to the
// decision it was given, unchanged, so this lands ahead of the UI without
// altering a single render. Everything else here is about the one rule that
// makes an edit surface safe — it may REMOVE and CORRECT, never INVENT.
import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const {
  validateReviewOverlay, applyReviewOverlay, isEmptyOverlay, EMPTY_OVERLAY,
  MAX_REMOVE_RANGES, MAX_RESPELL_CHARS,
} = await import('../jobs/reviewOverlay.js')

const WORDS = 100
const ov = (over: Record<string, unknown> = {}) =>
  validateReviewOverlay({ ...EMPTY_OVERLAY, ...over }, WORDS)

const decision = () => ({
  schemaVersion: 1,
  selections: [{ index: 0 }, { index: 1 }, { index: 2 }] as never,
  keptBoundaries: [4, 5],
  summary: 'tightened the middle',
  pacing: 'balanced' as never,
  music: 'none' as never,
  emphasisWordIndices: [3, 42, 77],
  hookTreatment: 'open_at_word' as never,
  hookStartWordIndex: 12,
  visualWasteSelections: [] as never,
  captionPresetId: 'caption-clean-keyword-v1' as never,
  transitionPolicy: 'hard_cuts_only' as never,
  zoomRequests: [{ anchorWordIndex: 42, intensity: 'subtle', reasonCode: 'emphasis' }] as never,
})

describe('AN EMPTY OVERLAY CHANGES NOTHING — the safety property', () => {
  it('composes to the SAME OBJECT, not merely an equal one', () => {
    // Identity, deliberately. An equal-but-copied object would pass a
    // deep-equality test while still proving that composition ran and produced
    // something new — and "something new" is exactly what must not happen to a
    // project nobody has reviewed.
    const d = decision()
    expect(applyReviewOverlay(d as never, EMPTY_OVERLAY)).toBe(d)
  })

  it('and is byte-identical when serialised', () => {
    const d = decision()
    expect(JSON.stringify(applyReviewOverlay(d as never, EMPTY_OVERLAY))).toBe(JSON.stringify(d))
  })

  it('isEmptyOverlay agrees with the constant', () => {
    expect(isEmptyOverlay(EMPTY_OVERLAY)).toBe(true)
    expect(isEmptyOverlay(ov({ dropZoomAnchors: [42] }))).toBe(false)
  })
})

describe('restoring a cut removes it from selections', () => {
  it('a kept selection index is dropped', () => {
    const out = applyReviewOverlay(decision() as never, ov({ keepSelections: [1] }))
    expect(out.selections).toHaveLength(2)
    expect(JSON.stringify(out.selections)).toBe(JSON.stringify([{ index: 0 }, { index: 2 }]))
  })

  it('restoring everything leaves no removals, and that is legal', () => {
    // "Twin, leave my video alone" is a valid review outcome.
    expect(applyReviewOverlay(decision() as never, ov({ keepSelections: [0, 1, 2] })).selections).toEqual([])
  })
})

describe('dropping a zoom', () => {
  it('a dismissed anchor removes its zoom', () => {
    expect(applyReviewOverlay(decision() as never, ov({ dropZoomAnchors: [42] })).zoomRequests).toEqual([])
  })

  it('dismissing an anchor with no zoom is a no-op, not an error', () => {
    // The client may not know which anchors carry zooms. Refusing here would
    // make a harmless click fail.
    expect(applyReviewOverlay(decision() as never, ov({ dropZoomAnchors: [99] })).zoomRequests).toHaveLength(1)
  })
})

describe('striking a sentence takes its consequences with it', () => {
  const struck = ov({ removeWordRanges: [{ startWordIndex: 40, endWordIndex: 45 }] })

  it('an emphasis inside the struck range is dropped', () => {
    // Left in place it would emphasise whatever word slid into index 42 after
    // the cut — a decision nobody made, applied to a word nobody chose.
    expect(applyReviewOverlay(decision() as never, struck).emphasisWordIndices).toEqual([3, 77])
  })

  it('emphasis OUTSIDE the range survives', () => {
    expect(applyReviewOverlay(decision() as never, struck).emphasisWordIndices).toContain(3)
    expect(applyReviewOverlay(decision() as never, struck).emphasisWordIndices).toContain(77)
  })

  it('a hook anchored on a STRUCK word falls back to keeping the real opening', () => {
    const hookStruck = ov({ removeWordRanges: [{ startWordIndex: 10, endWordIndex: 14 }] })
    const out = applyReviewOverlay(decision() as never, hookStruck)
    expect(out.hookTreatment).toBe('keep')
    expect(out.hookStartWordIndex).toBeNull()
  })

  it('a hook OUTSIDE the struck range is untouched', () => {
    const out = applyReviewOverlay(decision() as never, struck)
    expect(out.hookTreatment).toBe('open_at_word')
    expect(out.hookStartWordIndex).toBe(12)
  })
})

describe('validation fails CLOSED — a dropped edit is worse than a refused one', () => {
  const rej = (over: Record<string, unknown>) => () => ov(over)

  it('an index past the transcript is refused', () => {
    expect(rej({ removeWordRanges: [{ startWordIndex: 0, endWordIndex: WORDS }] })).toThrow(/past the last spoken word/)
    expect(rej({ respellWords: [{ wordIndex: WORDS, text: 'x' }] })).toThrow(/past the last spoken word/)
  })

  it('an inverted range is refused', () => {
    expect(rej({ removeWordRanges: [{ startWordIndex: 9, endWordIndex: 4 }] })).toThrow(/ends .* before it starts/)
  })

  it('OVERLAPPING ranges are refused rather than merged', () => {
    // Merging quietly would make a client bug permanent and invisible.
    expect(rej({ removeWordRanges: [
      { startWordIndex: 0, endWordIndex: 10 }, { startWordIndex: 5, endWordIndex: 20 },
    ] })).toThrow(/overlap/)
  })

  it('adjacent ranges are NOT overlapping', () => {
    expect(ov({ removeWordRanges: [
      { startWordIndex: 0, endWordIndex: 10 }, { startWordIndex: 11, endWordIndex: 20 },
    ] }).removeWordRanges).toHaveLength(2)
  })

  it('duplicates are refused', () => {
    expect(rej({ keepSelections: [1, 1] })).toThrow(/duplicates/)
    expect(rej({ dropZoomAnchors: [7, 7] })).toThrow(/duplicates/)
    expect(rej({ respellWords: [{ wordIndex: 1, text: 'a' }, { wordIndex: 1, text: 'b' }] }))
      .toThrow(/same word twice/)
  })

  it('every cap is enforced', () => {
    const many = Array.from({ length: MAX_REMOVE_RANGES + 1 },
      (_, i) => ({ startWordIndex: i * 2, endWordIndex: i * 2 }))
    expect(() => validateReviewOverlay({ ...EMPTY_OVERLAY, removeWordRanges: many }, 100000))
      .toThrow(/over the .* cap/)
  })

  it('a wrong or missing schemaVersion is refused', () => {
    expect(() => validateReviewOverlay({ ...EMPTY_OVERLAY, schemaVersion: 2 }, WORDS)).toThrow(/schemaVersion/)
    expect(() => validateReviewOverlay({}, WORDS)).toThrow(/schemaVersion/)
    expect(() => validateReviewOverlay(null, WORDS)).toThrow(/not an object/)
  })

  it('non-array fields are refused rather than coerced', () => {
    expect(rej({ keepSelections: 'all' })).toThrow(/not an array/)
  })
})

describe('A RESPELLING IS SPELLING — the invention boundary', () => {
  it('a normal correction is accepted', () => {
    expect(ov({ respellWords: [{ wordIndex: 5, text: 'TwinAI' }] }).respellWords)
      .toEqual([{ wordIndex: 5, text: 'TwinAI' }])
  })

  it('WHITESPACE IS REFUSED — it would split one spoken word into two caption words', () => {
    // The one door through which an edit surface could invent speech. A
    // "spelling fix" of "twinny" to "Twin AI and also buy my course" must not
    // be expressible.
    expect(() => ov({ respellWords: [{ wordIndex: 5, text: 'Twin AI' }] })).toThrow(/one word/)
    expect(() => ov({ respellWords: [{ wordIndex: 5, text: 'a\nb' }] })).toThrow(/one word/)
    expect(() => ov({ respellWords: [{ wordIndex: 5, text: 'a\tb' }] })).toThrow(/one word/)
  })

  it('an EMPTY respelling is refused — deleting a word is a removal', () => {
    // Two ways to express one intent is how the two paths drift apart.
    expect(() => ov({ respellWords: [{ wordIndex: 5, text: '' }] })).toThrow(/removal, not a respelling/)
  })

  it('an over-long respelling is refused', () => {
    expect(() => ov({ respellWords: [{ wordIndex: 5, text: 'x'.repeat(MAX_RESPELL_CHARS + 1) }] }))
      .toThrow(/over 120/)
  })

  it('unicode and punctuation are fine — a brand name is not an attack', () => {
    expect(ov({ respellWords: [{ wordIndex: 5, text: 'L’Oréal' }] }).respellWords[0].text).toBe('L’Oréal')
  })
})

describe('the composition is deterministic', () => {
  it('validation SORTS, so two clients sending the same edits agree byte-for-byte', () => {
    // The record is hash-pinned downstream; an order-dependent representation
    // would make the same review produce two different digests.
    const a = ov({ keepSelections: [2, 0, 1], dropZoomAnchors: [9, 3] })
    const b = ov({ keepSelections: [0, 1, 2], dropZoomAnchors: [3, 9] })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('applying the same overlay twice gives the same result', () => {
    const o = ov({ keepSelections: [1], dropZoomAnchors: [42] })
    expect(JSON.stringify(applyReviewOverlay(decision() as never, o)))
      .toBe(JSON.stringify(applyReviewOverlay(decision() as never, o)))
  })

  it('THE DECISION IS NOT MUTATED — it is evidence, and evidence is not edited', () => {
    const d = decision()
    const before = JSON.stringify(d)
    applyReviewOverlay(d as never, ov({ keepSelections: [0, 1, 2], dropZoomAnchors: [42] }))
    expect(JSON.stringify(d)).toBe(before)
  })
})
