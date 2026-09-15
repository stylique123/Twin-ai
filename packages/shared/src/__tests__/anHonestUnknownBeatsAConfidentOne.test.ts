// "ONE" MEANS THERE WAS ONE IDEA. "NULL" MEANS NOBODY LOOKED FOR MORE.
//
// ⚠️ MEASURED 2026-09-14: zero of 134 generations carry any record of what a
// creator's paragraph contained or which idea survived into the script. So
// "the writer used her input" has never been a measurable claim.
//
// ⚠️ THE DISTINCTION THIS FILE EXISTS TO ENFORCE: a confident 1 is
// indistinguishable from a writer that never read past the first sentence, and
// a retention rate built on those measures nothing. Every null path below is a
// refusal, not a fallback.

import { describe, it, expect } from 'vitest'
import {
  paragraphUsed, paragraphUsedRow, MAX_DROPPED, MAX_LABEL_CHARS,
} from '../paragraphDecomposition.js'

describe('a decomposition is recorded only when the writer actually gave one', () => {
  it('one found, nothing dropped, is a REAL answer and not a null', () => {
    const got = paragraphUsed({
      candidates_found: '1', candidate_chosen: 'the cold-email opener', candidates_dropped: [],
    })
    expect(got).not.toBeNull()
    expect(got!.candidatesFound).toBe(1)
    expect(got!.candidatesDropped).toEqual([])
    expect(got!.countDisagreesWithList).toBe(false)
  })

  it('a missing count is null — never 1, and never 0', () => {
    // ⚠️ THE WHOLE POINT. Defaulting either way manufactures a measurement.
    expect(paragraphUsed({ candidate_chosen: 'x', candidates_dropped: [] })).toBeNull()
    expect(paragraphUsed({ candidates_found: '', candidate_chosen: 'x' })).toBeNull()
    expect(paragraphUsed({ candidates_found: null, candidate_chosen: 'x' })).toBeNull()
  })

  it('a count that is not a whole number is null, not coerced', () => {
    // Real model outputs. Reading "3-4" as 3 would invent precision the writer
    // explicitly declined to give.
    for (const v of ['unknown', 'a few', '3-4', 'several', 'one', '2.5', '-1', '0', 'many']) {
      expect(paragraphUsed({ candidates_found: v, candidate_chosen: 'x' }), v).toBeNull()
    }
  })

  it('a count with no named choice is null', () => {
    // Idea retention is unmeasurable without knowing WHICH idea survived, so a
    // bare count is not a row.
    expect(paragraphUsed({ candidates_found: '3', candidates_dropped: ['a', 'b'] })).toBeNull()
    expect(paragraphUsed({ candidates_found: '3', candidate_chosen: '   ' })).toBeNull()
  })

  it('accepts a real number as well as the schema string', () => {
    // The response schema carries scalars as STRING, but a number must not be
    // thrown away if one arrives.
    expect(paragraphUsed({ candidates_found: 2, candidate_chosen: 'x', candidates_dropped: ['y'] })!
      .candidatesFound).toBe(2)
  })

  it('records a disagreement between the writer\'s own two answers, never fixes it', () => {
    // ⚠️ found should be 1 + dropped.length. Quietly repairing either number
    // would destroy the only evidence that the writer contradicted itself.
    const got = paragraphUsed({
      candidates_found: '5', candidate_chosen: 'a', candidates_dropped: ['b', 'c'],
    })!
    expect(got.candidatesFound).toBe(5)
    expect(got.candidatesDropped).toEqual(['b', 'c'])
    expect(got.countDisagreesWithList).toBe(true)
  })

  it('agreement is reported as agreement', () => {
    const got = paragraphUsed({
      candidates_found: '3', candidate_chosen: 'a', candidates_dropped: ['b', 'c'],
    })!
    expect(got.countDisagreesWithList).toBe(false)
  })

  it('drops empty and non-string dropped entries without counting them', () => {
    const got = paragraphUsed({
      candidates_found: '2', candidate_chosen: 'a', candidates_dropped: ['b', '', '   ', 7, null],
    })!
    expect(got.candidatesDropped).toEqual(['b'])
    // found 2 vs 1 + 1 kept = 2 → they agree.
    expect(got.countDisagreesWithList).toBe(false)
  })

  it('caps a runaway label and a runaway list, and SAYS it truncated', () => {
    const long = 'x'.repeat(MAX_LABEL_CHARS + 50)
    const many = Array.from({ length: MAX_DROPPED + 4 }, (_, i) => `idea ${i}`)
    const got = paragraphUsed({
      candidates_found: String(MAX_DROPPED + 5), candidate_chosen: long, candidates_dropped: many,
    })!
    expect(got.candidateChosen.length).toBe(MAX_LABEL_CHARS)
    expect(got.candidatesDropped.length).toBe(MAX_DROPPED)
    expect(got.droppedTruncated).toBe(true)
    // ⚠️ AND THE DISAGREEMENT FLAG MUST NOT FIRE ON OUR OWN TRUNCATION. The
    // writer's two answers agreed; the cap is ours. Comparing against the CUT
    // list would blame the model for our column limit.
    expect(got.countDisagreesWithList).toBe(false)
  })

  it('a short list is not reported as truncated', () => {
    const got = paragraphUsed({
      candidates_found: '2', candidate_chosen: 'a', candidates_dropped: ['b'],
    })!
    expect(got.droppedTruncated).toBe(false)
  })

  it('refuses anything that is not an object', () => {
    for (const v of [null, undefined, 'x', 3, [], [{ candidates_found: '2' }]]) {
      expect(paragraphUsed(v)).toBeNull()
    }
  })

  it('the row is null-in null-out, never an object of zeroes', () => {
    expect(paragraphUsedRow(null)).toBeNull()
    expect(paragraphUsedRow(paragraphUsed({
      candidates_found: '2', candidate_chosen: 'a', candidates_dropped: ['b'],
    }))).toEqual({
      candidates_found: 2,
      candidate_chosen: 'a',
      candidates_dropped: ['b'],
      count_disagrees_with_list: false,
      dropped_truncated: false,
    })
  })
})
