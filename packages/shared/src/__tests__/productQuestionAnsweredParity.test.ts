// THE "HAS THIS CREATOR ANSWERED?" RULE LIVES TWICE, AND THIS EXECUTES BOTH.
//
// ⚠️ `generate-blueprint` cannot import `@twinai/shared`, so the rule is
// mirrored. A drift here is not cosmetic: the edge copy decides whether the
// product capture card ever renders, so a mirror that answers differently
// silences the question for a different set of people than the Product Library
// thinks it has.
//
// ⚖️ AND THE TABLE HAS TO DISCRIMINATE IN BOTH DIRECTIONS. Two copies that both
// return `true` on everything agree about nothing, so the fixtures carry the
// too-loose case (a bare mint), the too-strict case (an explicit NONE, nameless
// by design), the summary-only case that is two of production's three nameless
// rows, and the empty string that a PostgREST filter cannot express. The test
// asserts the table produced BOTH outcomes before trusting the agreement.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { rowAnswersProductQuestion, type ProductAnswerFields } from '../productQuestionAnswered'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** ⚖️ EXECUTED, NOT READ. Transpiled with esbuild, because a regex that strips
 *  just enough to parse can quietly change what the code does. */
function loadInline() {
  const start = EDGE.indexOf('// ── PRODUCT QUESTION ANSWERED, INLINED ─')
  const end = EDGE.indexOf('// ── END PRODUCT QUESTION ANSWERED ─', start)
  expect(start, 'inlined block marker missing — fix the marker, do not delete it').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { rowAnswersProductQuestionInline, ANSWER_SCAN_CAP }`)() as {
    rowAnswersProductQuestionInline: (r: ProductAnswerFields | null | undefined) => boolean
    ANSWER_SCAN_CAP: number
  }
}

const FIXTURES: ReadonlyArray<{ why: string; row: ProductAnswerFields | null }> = [
  { why: 'a named owned product', row: { name: 'Custom Bible Rebind', relationship: 'OWN_PRODUCT' } },
  { why: 'summary only — two of three nameless production rows', row: { name: null, creatorSummary: 'Workshops for scaling businesses.', relationship: 'OWN_PRODUCT' } },
  { why: 'an explicit NONE, nameless by design', row: { name: null, creatorSummary: null, relationship: 'NONE' } },
  { why: 'a bare mint, the shipped defect', row: { name: null, creatorSummary: null, relationship: 'OWN_PRODUCT' } },
  { why: 'a bare OWN_SERVICE mint', row: { name: null, creatorSummary: null, relationship: 'OWN_SERVICE' } },
  { why: 'whitespace in both fields', row: { name: '  ', creatorSummary: '\n', relationship: 'OWN_PRODUCT' } },
  { why: 'empty strings, which no .or() filter can exclude', row: { name: '', creatorSummary: '', relationship: 'OWN_PRODUCT' } },
  { why: 'NONE with a name as well', row: { name: 'whatever', creatorSummary: null, relationship: 'NONE' } },
  { why: 'an affiliate with a name', row: { name: 'Ziwi Air-Dried Dog Food', relationship: 'AFFILIATE' } },
  { why: 'a relationship we do not recognise, with a name', row: { name: 'x', relationship: 'SOMETHING_NEW' } },
  { why: 'a relationship we do not recognise, bare', row: { name: null, creatorSummary: null, relationship: 'SOMETHING_NEW' } },
  { why: 'an absent relationship with a summary', row: { name: null, creatorSummary: 'I sell candles.' } },
  { why: 'nothing at all', row: {} },
  { why: 'a missing row', row: null },
]

describe('the two copies agree, row for row', () => {
  const inline = loadInline()

  for (const { why, row } of FIXTURES) {
    it(`agrees on ${why}`, () => {
      expect(inline.rowAnswersProductQuestionInline(row)).toBe(rowAnswersProductQuestion(row))
    })
  }

  // ⚠️ REFUSES A VACUOUS PASS. If every fixture came back the same way, the
  // agreement above would be worthless.
  it('the table produced BOTH outcomes', () => {
    const results = FIXTURES.map((f) => rowAnswersProductQuestion(f.row))
    expect(results).toContain(true)
    expect(results).toContain(false)
  })

  it('the scan cap is a real bound, not a placeholder', () => {
    expect(inline.ANSWER_SCAN_CAP).toBeGreaterThan(50)
  })
})
