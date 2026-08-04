// The client half of the review gate.
//
// These tests cover the two things this module does that the server cannot:
// grouping words into sentences a person can point at, and building an overlay
// already in the shape the server accepts.
//
// WHAT THEY DO NOT COVER, said plainly: whether the SCREEN is usable. §4.8's
// claim is that editing the words IS editing the video, and no test here can
// prove a person understands that from looking at it. A test proving a
// component renders would be evidence of the wrong thing.
import { describe, expect, it } from 'vitest'
import {
  buildReviewOverlay, groupIntoSentences, isEmptyReviewOverlay, reviewOverlayOverCaps,
  classifySubmitEditReviewError, EMPTY_REVIEW_OVERLAY, SENTENCE_GAP_MS,
  MAX_REMOVE_RANGES, MAX_RESPELL_CHARS, type ReviewWord,
} from '../review'

const words = (specs: Array<[string, number, number]>): ReviewWord[] =>
  specs.map(([text, startMs, endMs], index) => ({ index, text, startMs, endMs }))

describe('grouping words into pointable sentences', () => {
  it('EVERY word lands in exactly one sentence, in order', () => {
    // The invariant the whole screen rests on: a strike is expressed as a
    // sentence's own word-index range. A word that fell out of the grouping
    // would be unstrikeable and invisible; one that appeared twice would be
    // struck by pointing at either copy.
    const w = words([
      ['I', 0, 200], ['stopped.', 200, 700],
      ['Here', 1400, 1600], ['is', 1600, 1800], ['why', 1800, 2100],
    ])
    const sentences = groupIntoSentences(w)
    const covered = sentences.flatMap((s) => s.words.map((x) => x.index))
    expect(covered).toEqual([0, 1, 2, 3, 4])
    expect(sentences.map((s) => [s.startWordIndex, s.endWordIndex])).toEqual([[0, 1], [2, 4]])
  })

  it('splits on terminal punctuation', () => {
    const w = words([['one.', 0, 100], ['two', 110, 200]])
    expect(groupIntoSentences(w).length).toBe(2)
  })

  it('splits on a real pause when punctuation is absent — the ASR often gives none', () => {
    const noPause = words([['one', 0, 100], ['two', 150, 300]])
    expect(groupIntoSentences(noPause).length).toBe(1)
    const withPause = words([['one', 0, 100], ['two', 100 + SENTENCE_GAP_MS, 900]])
    expect(groupIntoSentences(withPause).length).toBe(2)
  })

  it('an empty transcript groups into nothing rather than one empty sentence', () => {
    expect(groupIntoSentences([])).toEqual([])
  })

  it('the gap is a PARAMETER, so the split can be retuned without touching the loop', () => {
    const w = words([['one', 0, 100], ['two', 400, 500]])
    expect(groupIntoSentences(w, 1000).length).toBe(1)
    expect(groupIntoSentences(w, 200).length).toBe(2)
  })
})

describe('building an overlay the server will accept', () => {
  it('an untouched screen produces the empty overlay', () => {
    const o = buildReviewOverlay({})
    expect(o).toEqual(EMPTY_REVIEW_OVERLAY)
    expect(isEmptyReviewOverlay(o)).toBe(true)
  })

  it('TOUCHING ranges are merged — the server refuses them as a client bug', () => {
    // Striking two neighbouring sentences produces ranges that touch, and
    // `validateReviewOverlay` refuses `start <= previous end` outright. Merging
    // here keeps that refusal a real integrity check instead of a routine UI
    // failure on work the creator already did.
    const o = buildReviewOverlay({ struckWordRanges: [
      { startWordIndex: 5, endWordIndex: 9 },
      { startWordIndex: 10, endWordIndex: 14 },
    ] })
    expect(o.removeWordRanges).toEqual([{ startWordIndex: 5, endWordIndex: 14 }])
  })

  it('overlapping and out-of-order ranges merge to the same span either way', () => {
    const o = buildReviewOverlay({ struckWordRanges: [
      { startWordIndex: 10, endWordIndex: 14 },
      { startWordIndex: 5, endWordIndex: 11 },
    ] })
    expect(o.removeWordRanges).toEqual([{ startWordIndex: 5, endWordIndex: 14 }])
  })

  it('a GAP between ranges is preserved — merging is not swallowing', () => {
    const o = buildReviewOverlay({ struckWordRanges: [
      { startWordIndex: 0, endWordIndex: 2 },
      { startWordIndex: 4, endWordIndex: 6 },
    ] })
    expect(o.removeWordRanges).toEqual([
      { startWordIndex: 0, endWordIndex: 2 }, { startWordIndex: 4, endWordIndex: 6 },
    ])
  })

  it('an inverted or negative range is dropped, never repaired into a real one', () => {
    const o = buildReviewOverlay({ struckWordRanges: [
      { startWordIndex: 9, endWordIndex: 5 }, { startWordIndex: -1, endWordIndex: 3 },
    ] })
    expect(o.removeWordRanges).toEqual([])
  })

  it('a respelling of a STRUCK word is dropped — the word has no caption to change', () => {
    const o = buildReviewOverlay({
      struckWordRanges: [{ startWordIndex: 5, endWordIndex: 9 }],
      respellings: [{ wordIndex: 6, text: 'TwinAI' }, { wordIndex: 20, text: 'TwinAI' }],
    })
    expect(o.respellWords).toEqual([{ wordIndex: 20, text: 'TwinAI' }])
  })

  it('a respelling with whitespace inside is dropped — that is invented speech', () => {
    // "twinny" -> "Twin AI and also buy my course" is the one door a spelling
    // fix could become new words. Dropped here and refused server-side too.
    const o = buildReviewOverlay({ respellings: [
      { wordIndex: 1, text: 'Twin AI and also buy my course' },
      { wordIndex: 2, text: '   ' },
      { wordIndex: 3, text: 'x'.repeat(MAX_RESPELL_CHARS + 1) },
    ] })
    expect(o.respellWords).toEqual([])
  })

  it('a respelling is trimmed, and the last edit of a word wins', () => {
    const o = buildReviewOverlay({ respellings: [
      { wordIndex: 4, text: 'Twinai' }, { wordIndex: 4, text: '  TwinAI  ' },
    ] })
    expect(o.respellWords).toEqual([{ wordIndex: 4, text: 'TwinAI' }])
  })

  it('restores and dropped zooms are deduplicated and sorted', () => {
    const o = buildReviewOverlay({
      restoredSelections: [3, 1, 3], droppedZoomAnchors: [9, 2, 9],
    })
    expect(o.keepSelections).toEqual([1, 3])
    expect(o.dropZoomAnchors).toEqual([2, 9])
  })

  it('the caps are NAMED rather than silently enforced', () => {
    // Truncating a creator's edits to fit a cap is the same failure as dropping
    // one: they watch the video and find their change missing. The screen has
    // to be able to say which limit was hit.
    const many = Array.from({ length: MAX_REMOVE_RANGES + 1 },
      (_, i) => ({ startWordIndex: i * 3, endWordIndex: i * 3 + 1 }))
    const o = buildReviewOverlay({ struckWordRanges: many })
    expect(o.removeWordRanges.length).toBe(MAX_REMOVE_RANGES + 1)
    expect(reviewOverlayOverCaps(o)).toEqual(['removeWordRanges'])
    expect(reviewOverlayOverCaps(EMPTY_REVIEW_OVERLAY)).toEqual([])
  })
})

describe('the submit refusals are readable', () => {
  it('names each stable code the RPC raises', () => {
    expect(classifySubmitEditReviewError('review_wrong_stage: project x is compiling'))
      .toBe('review_wrong_stage')
    expect(classifySubmitEditReviewError('review_already_submitted: ...'))
      .toBe('review_already_submitted')
    expect(classifySubmitEditReviewError('review_not_ready: the previous run has not settled'))
      .toBe('review_not_ready')
  })

  it('an unrecognised message is `unknown`, never guessed into a known code', () => {
    expect(classifySubmitEditReviewError('connection reset by peer')).toBe('unknown')
  })
})
