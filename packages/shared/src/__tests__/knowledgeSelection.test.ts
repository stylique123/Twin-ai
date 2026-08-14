// RELEVANCE ALONE STARVED THE PROMPT OF SUBSTANCE, AND ONLY A REALISTIC STORE SHOWED IT.
//
// ⚠️ THE DEFECT, MEASURED. A prompt carries ten knowledge items. The selector
// ranked by lexical overlap with the video topic and sliced to ten. An A/B on
// three creators — same references, same arms, only the size of the store
// differing — found that adding 382 caption-derived items took grounding DOWN
// from 63% to 52% and generic beats UP from 20% to 25%.
//
// The supplied mix says why: `claim 22 · experience 4` became
// `product 44 · topic 25 · experience 3`. The small hand-curated store never
// filled the cap, so the writer saw every substantive item there was; a
// realistic store fills all ten and the thin rows win on keyword overlap.
//
// ⚖️ EVERY ESTABLISHED CREATOR HAS THE REALISTIC STORE. Knowledge accumulates
// across every scan. So the fix is not about the test pack — a creator with a lot
// to say was crowding their own claims out of their own prompt.
import { describe, expect, it } from 'vitest'
import {
  selectSpeakable, selectionShape, SUBSTANCE_KINDS, SUBSTANCE_FLOOR, carriesFigure, wasSpoken,
} from '../knowledgeSelection'

const item = (kind: string, text = kind) => ({ kind, text })
/** The shape that caused the defect: a flood of thin rows ahead of the substance. */
const floodedStore = [
  ...Array.from({ length: 20 }, (_, i) => item('product', `product ${i}`)),
  ...Array.from({ length: 20 }, (_, i) => item('topic', `topic ${i}`)),
  item('claim', 'grew it 3x in a year'),
  item('experience', 'bootstrapped a gym'),
  item('opinion', 'megapixels are oversold'),
  item('framework', 'the three-offer test'),
]

describe('substance cannot be crowded out of the prompt', () => {
  it('keeps substance in a store where thin rows outrank it', () => {
    // ⚠️ THE EXACT FAILING CASE. Old behaviour: ten products, zero claims.
    const got = selectSpeakable(floodedStore, 10)
    const substance = got.filter((i) => SUBSTANCE_KINDS.has(i.kind))
    expect(substance.length).toBeGreaterThanOrEqual(4)
    expect(got.map((i) => i.text)).toContain('grew it 3x in a year')
    expect(got.map((i) => i.text)).toContain('bootstrapped a gym')
  })

  it('still returns exactly the cap', () => {
    expect(selectSpeakable(floodedStore, 10)).toHaveLength(10)
  })

  it('never duplicates an item across the two passes', () => {
    const got = selectSpeakable(floodedStore, 10)
    expect(new Set(got.map((i) => i.text)).size).toBe(got.length)
  })
})

describe('relevance still chooses, and that is the point of a floor', () => {
  it('gives a product video its product', () => {
    // ⚖️ THE REASON THIS IS NOT "SORT BY DEPTH". Depth-first would hand a phone
    // review a generic business claim ahead of the phone. The caller's order is
    // preserved; only the floor is imposed.
    const ranked = [item('product', 'Z Fold 8'), item('claim', 'unrelated claim')]
    expect(selectSpeakable(ranked, 2).map((i) => i.text)).toContain('Z Fold 8')
  })

  it('preserves the caller\'s order within the substance it reserves', () => {
    const ranked = [
      item('claim', 'most relevant claim'), item('product', 'p'),
      item('claim', 'less relevant claim'),
    ]
    const got = selectSpeakable(ranked, 2)
    expect(got[0].text).toBe('most relevant claim')
  })

  it('does not re-sort a store that is already all substance', () => {
    const ranked = ['a', 'b', 'c', 'd'].map((t) => item('claim', t))
    expect(selectSpeakable(ranked, 4).map((i) => i.text)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('a floor is a minimum, never a quota', () => {
  it('does not leave slots empty when substance is scarce', () => {
    // ⚠️ RESERVING SIX WHEN ONLY ONE EXISTS would ship a prompt of four items
    // and call it ten. The remainder returns to the general pool.
    const ranked = [item('claim', 'the one claim'),
      ...Array.from({ length: 9 }, (_, i) => item('product', `p${i}`))]
    expect(selectSpeakable(ranked, 10)).toHaveLength(10)
  })

  it('does not cap substance when the creator has plenty', () => {
    // A creator with ten strong items gets ten strong items — the floor
    // guarantees a minimum and imposes no maximum.
    const ranked = Array.from({ length: 12 }, (_, i) => item('claim', `c${i}`))
    const got = selectSpeakable(ranked, 10)
    expect(got.every((i) => i.kind === 'claim')).toBe(true)
  })

  it('handles an empty store and a zero cap without inventing anything', () => {
    expect(selectSpeakable([], 10)).toEqual([])
    expect(selectSpeakable(floodedStore, 0)).toEqual([])
  })

  it('returns everything when the store is smaller than the cap', () => {
    const ranked = [item('claim', 'a'), item('product', 'b')]
    expect(selectSpeakable(ranked, 10)).toHaveLength(2)
  })
})

describe('what counts as substance is a decision, written down', () => {
  it('excludes product and topic, which a caption can prove but a beat cannot rest on', () => {
    expect(SUBSTANCE_KINDS.has('product')).toBe(false)
    expect(SUBSTANCE_KINDS.has('topic')).toBe(false)
    // `covered` is excluded upstream — it steers choice and is never spoken.
    expect(SUBSTANCE_KINDS.has('covered')).toBe(false)
  })

  it('includes the kinds that carry a position, a method or a number', () => {
    for (const k of ['claim', 'experience', 'framework', 'opinion', 'fact', 'example'])
      expect(SUBSTANCE_KINDS.has(k)).toBe(true)
  })

  it('reserves a minority of the slots, so relevance keeps most of them', () => {
    // A floor at or above the cap would BE depth-first ordering wearing a
    // different name, which is the design this one was chosen over.
    expect(SUBSTANCE_FLOOR).toBeLessThan(10)
    expect(SUBSTANCE_FLOOR).toBeGreaterThan(0)
  })
})

describe('the shape is counted, so the fix can be confirmed on real stores', () => {
  it('reports starvation when substance existed and did not make it', () => {
    // ⚠️ A FIX SHIPPED WITHOUT A COUNTER IS A FIX NOBODY CAN CONFIRM. This
    // defect was invisible because nothing recorded the MIX that reached the
    // writer, only that ten things did.
    const available = floodedStore
    const starved = available.filter((i) => i.kind === 'product').slice(0, 10)
    expect(selectionShape(starved, available).starved).toBe(true)
    expect(selectionShape(selectSpeakable(available, 10), available).starved).toBe(false)
  })

  it('does not call a creator with nothing to say starved', () => {
    // ⚖️ "They have no claims" and "their claims were pushed out" are different
    // facts, and only one is a bug.
    const thinOnly = Array.from({ length: 10 }, (_, i) => item('product', `p${i}`))
    expect(selectionShape(thinOnly, thinOnly).starved).toBe(false)
  })
})

// ── GAP 5: "NUMBERS VANISH FOR THE CHANNELS BUILT ON NUMBERS" ──────────────
//
// The gap assumed the selector was dropping the creator's figures. Measured on
// every corpus available, it is not — so what shipped is the counter that can
// settle it on production data, and NOT the floor that was written for it.
describe('carriesFigure', () => {
  it.each([
    ['grew the channel 3x in a year', true],
    ['made $50k from one launch', true],
    ['cut editing from 10 hours to two', true],
    ['conversion went up 40%', true],
  ])('%j is a measurement', (text, expected) => {
    expect(carriesFigure({ kind: 'claim', text })).toBe(expected)
  })

  it('a bare count is NOT a figure', () => {
    // ⚠️ THE COUNT CONTRACT'S OWN LINE. "3 ways to do X" promises three items and
    // asserts nothing about an outcome; treating it as a measurement would report
    // every list-format creator as numeric.
    expect(carriesFigure({ kind: 'claim', text: '3 ways to grow a channel' })).toBe(false)
  })

  it('a figure in a thin kind does not count', () => {
    // ⚖️ THIS NARROWING IS THE FINDING. Counting figures across every kind says
    // ten creators in the pack have numbers; counting only the kinds that can
    // carry a beat says almost none do. A `topic` row is not something the
    // creator can assert.
    expect(carriesFigure({ kind: 'topic', text: 'top 10 products that made $50k' })).toBe(false)
    expect(carriesFigure({ kind: 'covered', text: 'grew 3x in a year' })).toBe(false)
  })

  it('survives a missing kind or text', () => {
    expect(carriesFigure({})).toBe(false)
    expect(carriesFigure({ kind: 'claim' })).toBe(false)
  })
})

describe('selectionShape records both halves', () => {
  it('reports what was available, not only what got through', () => {
    const avail = [
      { kind: 'claim', text: 'grew 3x in a year' },
      { kind: 'claim', text: 'thumbnails matter' },
    ]
    const shape = selectionShape([avail[1]], avail)
    // ⚠️ ONE FIGURE EXISTED AND NONE WAS SELECTED. Without the denominator this
    // is indistinguishable from a creator who simply has no numbers — and those
    // two have opposite fixes.
    expect(shape.figures).toBe(0)
    expect(shape.availableFigures).toBe(1)
  })
})

// ── SPOKEN MATERIAL FILLS THE RESERVATION FIRST ───────────────────────────
//
// Measured on production: caption-derived knowledge is 13% substance with ZERO
// experiences; transcript is 78% with 50. And the same eight creators scored
// 58% grounded / 23% generic on their full store against 73% / 8% on transcript
// rows alone — mixing captions in scored BELOW the hand-curated pack.
describe('wasSpoken', () => {
  it('is true only for transcript', () => {
    expect(wasSpoken({ source: 'transcript' })).toBe(true)
    expect(wasSpoken({ source: 'caption' })).toBe(false)
  })

  it('treats an ABSENT source as unrecorded, not as caption', () => {
    // ⚠️ THREE STATES. Rows stored before 0122 have no source at all. Demoting
    // them would silently downgrade every voice scanned before that migration —
    // "we never recorded it" is not "the creator did not say it".
    expect(wasSpoken({})).toBe(false)
    expect(wasSpoken({ source: null })).toBe(false)
  })
})

describe('selectSpeakable prefers spoken material within the floor', () => {
  const cap10 = (items: any[]) => selectSpeakable(items, 10)
  const cap = (kind: string, text: string, source?: string) => ({ kind, text, source })

  it('a spoken experience outranks eight caption claims for the reserved slots', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => cap('claim', `caption claim ${i}`, 'caption')),
      cap('experience', 'I spent two years failing at this', 'transcript'),
      cap('framework', 'the three-pass method', 'transcript'),
    ]
    const chosen = cap10(items)
    // Both spoken items must survive; before this they were ranked 9th and 10th.
    expect(chosen.filter(wasSpoken)).toHaveLength(2)
    expect(chosen.slice(0, 2).every(wasSpoken)).toBe(true)
  })

  it('is a stable partition, not a sort — relevance still orders within a group', () => {
    // ⚖️ THE PROPERTY THAT MAKES THIS SAFE. Re-sorting would replace the caller's
    // relevance with this module's, which the floor exists NOT to do.
    const items = [
      cap('claim', 'spoken A', 'transcript'),
      cap('claim', 'spoken B', 'transcript'),
      cap('claim', 'written C', 'caption'),
    ]
    expect(cap10(items).map((i) => i.text)).toEqual(['spoken A', 'spoken B', 'written C'])
  })

  it('changes nothing when no item records a source', () => {
    // Every voice scanned before 0122. The order must be exactly as before.
    const items = [cap('claim', 'one'), cap('opinion', 'two'), cap('fact', 'three')]
    expect(cap10(items).map((i) => i.text)).toEqual(['one', 'two', 'three'])
  })

  it('still returns the same NUMBER of items', () => {
    const items = [
      cap('claim', 'a', 'caption'), cap('experience', 'b', 'transcript'),
      cap('product', 'c', 'caption'), cap('opinion', 'd', 'caption'),
    ]
    expect(cap10(items)).toHaveLength(4)
  })
})
