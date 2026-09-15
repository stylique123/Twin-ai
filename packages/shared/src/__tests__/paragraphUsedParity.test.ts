// TWO COPIES OF THE RULE, AND THE ROW ONLY EVER SEES ONE.
//
// ⚠️ EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`, so generate-blueprint
// carries an inlined copy. The shared module has the tests; the inlined one
// decides what a real generation stores about a real creator's paragraph.
//
// ⚖️ EXECUTED, NOT READ. Pattern-matching the source would catch a spelling
// change and miss the one that matters — a null path that fires on one side and
// not the other, which is precisely the distinction this rule exists to keep.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { paragraphUsed, paragraphUsedRow } from '../paragraphDecomposition'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE_RAW = readFileSync(
  join(REPO, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const EDGE_CODE = EDGE_RAW.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

function loadInline() {
  const start = EDGE_RAW.indexOf('// ── PARAGRAPH DECOMPOSITION, INLINED ─')
  const end = EDGE_RAW.indexOf('// ── END PARAGRAPH DECOMPOSITION ─', start)
  expect(start, 'inlined block marker missing — fix the marker, do not delete it').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE_RAW.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { paragraphUsedInline, paragraphUsedRowInline }`)() as {
    paragraphUsedInline: (raw: unknown) => unknown
    paragraphUsedRowInline: (u: unknown) => Record<string, unknown> | null
  }
}

/** ⚠️ EVERY CASE STRADDLES A BOUNDARY, because a table that never crosses one
 *  cannot tell two copies apart. Two mutants survived a too-narrow table
 *  earlier in this repo's history. */
const CASES: ReadonlyArray<{ name: string; raw: unknown }> = [
  { name: 'absent', raw: undefined },
  { name: 'null', raw: null },
  { name: 'not an object', raw: 'three ideas' },
  { name: 'an array', raw: [{ candidates_found: '2' }] },
  { name: 'empty object', raw: {} },
  { name: 'count empty — the licensed refusal', raw: { candidates_found: '', candidate_chosen: 'a' } },
  { name: 'count "unknown"', raw: { candidates_found: 'unknown', candidate_chosen: 'a' } },
  { name: 'count "a few"', raw: { candidates_found: 'a few', candidate_chosen: 'a' } },
  { name: 'count "3-4"', raw: { candidates_found: '3-4', candidate_chosen: 'a' } },
  { name: 'count "0"', raw: { candidates_found: '0', candidate_chosen: 'a' } },
  { name: 'count "-2"', raw: { candidates_found: '-2', candidate_chosen: 'a' } },
  { name: 'count 1 as a number', raw: { candidates_found: 1, candidate_chosen: 'a', candidates_dropped: [] } },
  { name: 'count 2.5 as a number', raw: { candidates_found: 2.5, candidate_chosen: 'a' } },
  { name: 'one found, none dropped — a real answer', raw: { candidates_found: '1', candidate_chosen: 'the opener', candidates_dropped: [] } },
  { name: 'no chosen', raw: { candidates_found: '3', candidates_dropped: ['b', 'c'] } },
  { name: 'blank chosen', raw: { candidates_found: '3', candidate_chosen: '   ', candidates_dropped: [] } },
  { name: 'three found, two dropped — agreement', raw: { candidates_found: '3', candidate_chosen: 'a', candidates_dropped: ['b', 'c'] } },
  { name: 'five claimed, two listed — disagreement', raw: { candidates_found: '5', candidate_chosen: 'a', candidates_dropped: ['b', 'c'] } },
  { name: 'junk inside the dropped list', raw: { candidates_found: '2', candidate_chosen: 'a', candidates_dropped: ['b', '', '  ', 7, null, {}] } },
  { name: 'dropped not an array', raw: { candidates_found: '2', candidate_chosen: 'a', candidates_dropped: 'b' } },
  { name: 'runaway label and runaway list', raw: { candidates_found: '17', candidate_chosen: 'x'.repeat(260), candidates_dropped: Array.from({ length: 16 }, (_, i) => `idea ${i}`) } },
  { name: 'count at the 3-digit edge', raw: { candidates_found: '999', candidate_chosen: 'a', candidates_dropped: [] } },
  { name: 'count over 3 digits', raw: { candidates_found: '1000', candidate_chosen: 'a', candidates_dropped: [] } },
]

describe('the shared rule and the edge mirror agree', () => {
  const inline = loadInline()

  it('the fixture table crosses the boundaries it claims to', () => {
    // ⚠️ A VACUOUS PASS IS REFUSED. If every case returned null the comparison
    // below would be trivially true and would prove nothing.
    const out = CASES.map((c) => paragraphUsed(c.raw))
    expect(out.filter((x) => x === null).length).toBeGreaterThan(6)
    expect(out.filter((x) => x !== null).length).toBeGreaterThan(4)
    expect(out.some((x) => x?.countDisagreesWithList === true)).toBe(true)
    expect(out.some((x) => x?.droppedTruncated === true)).toBe(true)
    expect(out.some((x) => x?.candidatesFound === 1)).toBe(true)
  })

  for (const c of CASES) {
    it(`agrees: ${c.name}`, () => {
      expect(inline.paragraphUsedInline(c.raw)).toEqual(paragraphUsed(c.raw))
      expect(inline.paragraphUsedRowInline(inline.paragraphUsedInline(c.raw)))
        .toEqual(paragraphUsedRow(paragraphUsed(c.raw)))
    })
  }
})

describe('the row reaches the audit, and the writer is asked for it', () => {
  it('the schema declares the field', () => {
    // ⚠️ READER-REMOVAL, PART 1. Without the schema field the model has nowhere
    // to put the answer.
    expect(EDGE_CODE).toContain('input_decomposition: obj(')
    expect(EDGE_CODE).toMatch(/candidates_found:\s*str/)
    expect(EDGE_CODE).toMatch(/candidates_dropped:\s*arr\(str\)/)
  })

  it('the PROMPT asks for it — a schema field nobody asks for stays empty', () => {
    // ⚠️ READER-REMOVAL, PART 2, AND THE ONE MOST LIKELY TO ROT. Gemini's
    // `required` is advisory; this file says so itself. Delete the instruction
    // and the column is null forever with every other test still green.
    expect(EDGE_CODE).toContain('decompositionInstruction')
    const slots = EDGE_CODE.match(/\$\{decompositionInstruction\}/g) ?? []
    // Both prompt variants, not just one — the second is the branch a
    // reference-less "just an idea" generation takes.
    expect(slots.length).toBe(2)
  })

  it('the instruction licenses the empty answer, in words the model reads', () => {
    // A model told to count always produces a number. The honest failure has to
    // be an option it is TOLD to use, or every row carries a confident 1.
    expect(EDGE_CODE).toMatch(/leave\s*\n?\s*this EMPTY|leave this EMPTY/)
    expect(EDGE_CODE).toContain('An empty answer is correct and expected')
  })

  it('the audit row is written from the parsed response, not an initialiser', () => {
    // ⚠️ THE DEFECT THIS REPO HAS FOUND FOUR TIMES: a counter read into the
    // beatAudit literal before its value is computed stores nothing — null in
    // 30 of 30 rows, four separate counters. The computation must sit ABOVE the
    // literal.
    const compute = EDGE_CODE.indexOf('const paragraphUsedAudit =')
    const literal = EDGE_CODE.indexOf('beatAudit = {')
    expect(compute).toBeGreaterThan(-1)
    expect(literal).toBeGreaterThan(-1)
    expect(compute).toBeLessThan(literal)
    expect(EDGE_CODE).toContain('paragraph_used: paragraphUsedAudit')
  })
})
