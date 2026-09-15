// THE CATEGORY-TRANSPLANT TEST, MEASURED RATHER THAN ASSERTED.
//
// ⚠️ THE OWNER'S RULE: "Swap the niche. If the sentence survives, delete it."
// MEASURED on production 2026-09-15 over 109 scripts / 531 beats: 117 beats
// (22.0%) carry a word from the creator's own vocabulary, 58 of 109 scripts
// have at least one, and 51 of 109 — 47% — have NONE.
//
// ⚖️ WHICH IS WHY THIS SHIPS AS A COUNT. A floor would refuse 47% of
// production. These tests pin the COUNTING, and one of them pins that nothing
// here rejects anything.
import { describe, expect, it } from 'vitest'
import { MIN_NICHE_TERM_CHARS, nicheAnchoredBeats, usableNicheTerms } from '../nicheAnchor'

// The real vocabulary from `brand_voices` for @woodsyleather, verbatim.
const LEATHER = [
  'rebind', 'text block', 'Oxford hollow', 'Tokonole', 'semi yap',
  'edge lined', 'Smyth sewn', 'perfect bind / glued binding',
]

describe('usableNicheTerms', () => {
  it('lowercases, trims and de-duplicates', () => {
    expect(usableNicheTerms(['  Rebind ', 'REBIND', 'text block']))
      .toEqual(['rebind', 'text block'])
  })

  it('drops terms too short to be more than a coincidence', () => {
    // "yap" is a real leather term and still too short to match on safely.
    expect(usableNicheTerms(['yap', 'tab', 'the', 'rebind'])).toEqual(['rebind'])
    expect(MIN_NICHE_TERM_CHARS).toBe(4)
  })

  it('measures the TRIMMED length, not the padded one', () => {
    // "  ab  " is a two-character term wearing six characters.
    expect(usableNicheTerms(['  ab  '])).toEqual([])
  })

  it('survives a non-array and non-string entries', () => {
    expect(usableNicheTerms(null)).toEqual([])
    expect(usableNicheTerms('rebind')).toEqual([])
    expect(usableNicheTerms([42, null, undefined, { term: 'rebind' }, 'rebind']))
      .toEqual(['rebind'])
  })
})

describe('nicheAnchoredBeats', () => {
  it('anchors a beat that carries one of her own terms', () => {
    const r = nicheAnchoredBeats(['I cut the old glued binding off.'], LEATHER)
    expect(r.anchored).toBe(1)
    expect(r.hits[0]).toEqual({ beat: 0, term: 'glued binding' })
  })

  it('does NOT anchor the transplantable sentence', () => {
    // The owner's own example of a line that survives a niche swap.
    const r = nicheAnchoredBeats(['Consistency is the foundation of success.'], LEATHER)
    expect(r.anchored).toBe(0)
    expect(r.withLines).toBe(1)
  })

  it('matches an inflection of a stored term', () => {
    // Stored "rebind"; she says "rebinding". A word-boundary match on the
    // stored term would miss this, which is why matching is substring.
    expect(nicheAnchoredBeats(['Rebinding a Bible takes a week.'], LEATHER).anchored).toBe(1)
  })

  it('counts a beat once however many terms it carries', () => {
    // A rate that rose with verbosity would reward padding.
    const r = nicheAnchoredBeats(
      ['The text block gets an Oxford hollow and Tokonole on the edges.'], LEATHER)
    expect(r.anchored).toBe(1)
    expect(r.hits).toHaveLength(1)
  })

  it('silent beats are not in the denominator', () => {
    // An ask-beat has no line. Counting it would invent a rate from a beat
    // nobody wrote — absent is not zero.
    const r = nicheAnchoredBeats(['I sew the signatures.', '', null, '   ', undefined], LEATHER)
    expect(r.withLines).toBe(1)
    expect(r.anchored).toBe(0) // "signatures" is not in this vocabulary
  })

  it('an empty vocabulary anchors nothing but still counts the lines', () => {
    // The honest shape: we cannot judge her niche, so we say 0 of N rather
    // than pretending N of N or dividing by nothing.
    const r = nicheAnchoredBeats(['Anything at all.', 'A second line.'], [])
    expect(r).toEqual({ anchored: 0, withLines: 2, hits: [] })
  })

  it('reports beat INDEXES that survive silent beats', () => {
    // A panel that says "beat 3" must mean the third beat, not the third
    // non-empty one.
    const r = nicheAnchoredBeats(
      ['Generic opener.', '', 'The Oxford hollow is why it opens flat.'], LEATHER)
    expect(r.hits).toEqual([{ beat: 2, term: 'oxford hollow' }])
  })

  it('never rejects anything — it only ever returns a count', () => {
    // The falsifiable half of "count, not ban": no throw, no verdict, no
    // boolean that a caller could read as permission.
    const bad = nicheAnchoredBeats(
      ['Consistency is key.', 'Show up every day.', 'Trust the process.'], LEATHER)
    expect(bad.anchored).toBe(0)
    expect(Object.keys(bad).sort()).toEqual(['anchored', 'hits', 'withLines'])
  })
})
