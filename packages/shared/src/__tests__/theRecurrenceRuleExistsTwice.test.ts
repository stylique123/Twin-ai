// THE RULE EXISTS TWICE, SO SOMETHING MUST FAIL WHEN THE COPIES DISAGREE.
//
// ⚠️ `generate-blueprint` CANNOT IMPORT @twinai/shared, so the retry/repeat rule
// is mirrored inline there. A second authority for one rule is the defect class
// this codebase keeps closing; the only thing that makes it survivable is a test
// that executes BOTH and fails when they drift.
//
// ⚖️ IT EXECUTES THE MIRROR, IT DOES NOT READ IT. A textual check would pass on
// two functions that look alike and behave differently — which is precisely the
// failure a mirror invites. The edge source is extracted and evaluated, so what
// is compared is BEHAVIOUR on the real population.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { classifyOne, draftedSubjects, type PriorPremise } from '../subjectRecurrence.js'

const EDGE = readFileSync(fileURLToPath(new URL(
  '../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)), 'utf8')

/** Lift the mirror's declarations out of the edge file and evaluate them. */
function loadMirror(): (priorAt: number, now: number, a: string, b: string) => string {
  const start = EDGE.indexOf('const REC_RETRY_MINUTES')
  const end = EDGE.indexOf('const MIN_PRIOR_VIDEOS')
  // ⚠️ REFUSES TO RUN ON AN EMPTY CUT. A parity test that silently evaluates
  // nothing passes forever while the copies drift — the exact way the previous
  // generation of this guard shipped looking correct.
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const src = EDGE.slice(start, end)
  expect(src).toContain('function recKind')
  expect(src).toContain('function recOverlap')
  // ⚠️ TRANSPILED BY esbuild, NOT BY A REGEX HERE. A hand-rolled type-stripper
  // is a second parser, and the first draft of this test shipped one that could
  // not handle a union return type. The repo's own bundler does it correctly.
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return (priorAt, now, a, b) => recKind(priorAt, now, recOverlap(a, b))`)() as never
}

/** The drafted-subject selector from the same mirror block. */
function loadMirrorDrafted(): (priors: Array<{ premise: string; at: number }>, now: number) => string[] {
  const start = EDGE.indexOf('const REC_RETRY_MINUTES')
  const end = EDGE.indexOf('const MIN_PRIOR_VIDEOS')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const src = EDGE.slice(start, end)
  expect(src).toContain('function recDrafted')
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return (priors, now) => recDrafted(priors, now)`)() as never
}

const A = 'waiting for commercial gear holds back beginner microbakers'
const B = 'waiting for commercial kitchen equipment holds back beginner microbakers'
const UNRELATED = 'pricing a sourdough loaf for local pickup orders'
// ⚠️ TWO FIXTURES ADDED BECAUSE TWO MUTANTS SURVIVED, AND THE TEST WAS WRONG
// RATHER THAN THE MUTANTS. Dropping the mirror's threshold 0.6 -> 0.3 and
// dividing by the SHORTER premise both passed the first table: it held only a
// high-overlap pair and a zero-overlap pair, so nothing sat in the band either
// mutant moves. Both mutants are genuinely broken -- one calls weakly related
// premises duplicates, the other lets a fragment score 1.0 against a paragraph
// containing it -- so the table needed the cases, not the bar lowering.
/** Shares 3 of 7 content words with A: 0.43, inside the 0.3-0.6 band. */
const MID = 'commercial gear for beginner bakers costs too much'
/** One word of A. Scores 0.14 against the longer premise and 1.0 against the shorter. */
const FRAGMENT = 'microbakers'
const NOW = Date.UTC(2026, 8, 13, 20, 0)
const ago = (min: number) => NOW - min * 60000

describe('the shared rule and its edge mirror agree', () => {
  const mirror = loadMirror()
  // The fourteen measured gaps, plus the two verdicts either side of the
  // boundary and a non-duplicate control.
  const CASES: ReadonlyArray<[number, string, string]> = [
    ...[28, 18, 6, 6, 2, 3, 5, 7, 14, 23, 30, 214, 219, 224].map(
      (g) => [g, A, B] as [number, string, string]),
    [241, A, B], [60 * 24 * 31, A, B], [10, A, UNRELATED],
    // The two discriminating cases. Each kills a mutant the rest could not see.
    [10, A, MID], [241, A, MID], [10, A, FRAGMENT], [241, A, FRAGMENT],
  ]

  it.each(CASES)('gap %i minutes agrees across both implementations', (gap, a, b) => {
    const prior: PriorPremise = { premise: a, at: new Date(ago(gap)) }
    expect(mirror(ago(gap), NOW, a, b)).toBe(classifyOne(prior, b, new Date(NOW)))
  })

  it('and the table exercises all three verdicts, or it proves nothing', () => {
    const seen = new Set(CASES.map(([g, a, b]) =>
      classifyOne({ premise: a, at: new Date(ago(g)) }, b, new Date(NOW))))
    expect(seen).toEqual(new Set(['retry', 'repeat', 'fresh']))
  })
})


describe('the drafted-subject selector agrees across both implementations', () => {
  const mirror = loadMirrorDrafted()
  const OLD = 241
  // ⚠️ EACH CASE CARRIES ITS OWN PREMISE TEXTS, NOT `premise ${i}` FOR ALL. The
  // first version numbered every fixture distinctly, so the table contained no
  // duplicate and removing the mirror's dedupe survived — a mutant that is
  // genuinely broken (it lists one subject as several prior videos). The test
  // was wrong, so the case was added rather than the assertion loosened.
  const CASES: ReadonlyArray<[string, Array<[number, string]>]> = [
    ['inside the sitting', [[10, 'a'], [30, 'b']]],
    ['older than the sitting', [[OLD, 'a'], [OLD + 10, 'b']]],
    ['mixed', [[10, 'a'], [OLD, 'b'], [60 * 24 * 31, 'c']]],
    ['past the repeat window', [[60 * 24 * 31, 'a']]],
    ['the same subject drafted twice is listed once', [[OLD, 'a'], [OLD + 10, 'a'], [OLD + 20, 'b']]],
    ['and case does not defeat that', [[OLD, 'Sourdough Pricing'], [OLD + 10, 'sourdough pricing']]],
  ]

  it.each(CASES)('%s', (_label, rows) => {
    const priors: PriorPremise[] = rows.map(([g, t]) => ({ premise: t, at: new Date(ago(g)) }))
    const mirrored = mirror(rows.map(([g, t]) => ({ premise: t, at: ago(g) })), NOW)
    expect(mirrored).toEqual([...draftedSubjects(priors, new Date(NOW))])
  })

  it('the table actually contains a duplicate, or the dedupe is untested', () => {
    const dupes = CASES.filter(([, rows]) =>
      new Set(rows.map(([, t]) => t.toLowerCase())).size < rows.length)
    expect(dupes.length).toBeGreaterThan(0)
  })

  it('and the table produces both an empty and a non-empty selection', () => {
    const sizes = CASES.map(([, rows]) => draftedSubjects(
      rows.map(([g, t]) => ({ premise: t, at: new Date(ago(g)) })), new Date(NOW)).length)
    expect(sizes.some((n) => n === 0)).toBe(true)
    expect(sizes.some((n) => n > 0)).toBe(true)
  })
})
