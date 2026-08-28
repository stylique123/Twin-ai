// THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL.
//
// ⚠️ `timingMath.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint` HAS
// THE INLINE COPY THAT ACTUALLY FEEDS `beat_audit`. Deno cannot import the
// shared package at deploy time, so a rule proved correct in one file and
// absent from the other is worth nothing to anybody using the product.
//
// ⚖️ EXECUTED, NOT READ. Transpiled with esbuild, not with regexes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { timingFlagCount } from '../script/timingMath'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  const start = EDGE.indexOf('const NATURAL_WPM_INLINE')
  const bodyStart = EDGE.indexOf('function timingFlagCountInline')
  const end = EDGE.indexOf('\n}', bodyStart) + 2
  expect(start, 'the inline timing-math block must exist').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(bodyStart)
  const ts = EDGE.slice(start, end)
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return timingFlagCountInline`)() as
    (script: unknown, beatPlan: unknown) => number
}

const inline = loadInline()

const FIXTURES: Array<{ name: string; script: unknown; beatPlan: unknown }> = [
  {
    name: 'the spec fixture: 31 words in an 8s beat',
    script: [{ line: Array(31).fill('word').join(' ') }],
    beatPlan: [{ target_sec: '8s' }],
  },
  {
    name: 'a 15-word/6s beat does not flag',
    script: [{ line: Array(15).fill('word').join(' ') }],
    beatPlan: [{ target_sec: '6 seconds' }],
  },
  {
    name: 'an unwritten needs_user beat has no line to measure',
    script: [{ line: '' }, { line: null }],
    beatPlan: [{ target_sec: '6s' }, { target_sec: '6s' }],
  },
  {
    name: 'an unparseable target excludes the beat',
    script: [{ line: Array(40).fill('word').join(' ') }],
    beatPlan: [{ target_sec: 'a moment' }],
  },
  {
    name: 'mismatched array lengths compare only the overlap',
    script: [
      { line: Array(15).fill('word').join(' ') },
      { line: Array(31).fill('word').join(' ') },
    ],
    beatPlan: [{ target_sec: '6s' }],
  },
  { name: 'empty script and plan', script: [], beatPlan: [] },
  { name: 'non-array input', script: null, beatPlan: undefined },
]

describe('the edge copy agrees with the tested one', () => {
  it.each(FIXTURES)('$name', ({ script, beatPlan }) => {
    expect(inline(script, beatPlan)).toEqual(timingFlagCount(script as never, beatPlan as never))
  })
})

describe('it is actually wired into beat_audit', () => {
  it('the counter is written into beat_audit, reading declared and beat_plan', () => {
    expect(EDGE).toMatch(/timing_flags: timingFlagCountInline\(/)
  })
})
