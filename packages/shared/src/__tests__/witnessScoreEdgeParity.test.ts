// THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL.
//
// ⚠️ `witnessScore.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint` HAS
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
import { witnessScore } from '../script/witnessScore'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  // `witnessScoreInline` calls `claimedValues`/`canonicalValue`/`CLAIM_VALUE`,
  // defined much earlier in the file for the entailment check -- pull both
  // ranges rather than the whole file between them (which would also carry
  // unrelated code with syntax this loader's strips don't cover).
  const valueStart = EDGE.indexOf('const CLAIM_VALUE')
  const valueEnd = EDGE.indexOf('function findEntailmentGaps')
  const witnessStart = EDGE.indexOf('const FIRST_PERSON_MARKER_INLINE')
  const witnessBodyStart = EDGE.indexOf('function witnessScoreInline')
  const witnessEnd = EDGE.indexOf('\n}', witnessBodyStart) + 2
  expect(valueStart, 'CLAIM_VALUE must exist').toBeGreaterThan(-1)
  expect(valueEnd).toBeGreaterThan(valueStart)
  expect(witnessStart, 'the inline witness block must exist').toBeGreaterThan(-1)
  expect(witnessEnd).toBeGreaterThan(witnessBodyStart)
  const ts = EDGE.slice(valueStart, valueEnd) + EDGE.slice(witnessStart, witnessEnd)
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return witnessScoreInline`)() as
    (beats: unknown) => { firstPersonBeats: number; figuresSpoken: number }
}

const inline = loadInline()

const FIXTURES: Array<{ name: string; beats: unknown }> = [
  {
    name: 'first-person creator_knowledge beat',
    beats: [{ substance: 'creator_knowledge', line: 'I tried this for six months before it worked.' }],
  },
  {
    name: 'creator_knowledge without a first-person marker',
    beats: [{ substance: 'creator_knowledge', line: 'This approach works for most people.' }],
  },
  {
    name: 'first-person text with a different substance',
    beats: [{ substance: 'reference', line: 'I built this from scratch over a weekend.' }],
  },
  {
    name: 'the sermon-without-witness shape: figures from a reference, zero first-person',
    beats: [
      { substance: 'reference', line: 'This creator grew to 100K followers in a year.' },
      { substance: 'reference', line: 'They posted every day for 6 months straight.' },
    ],
  },
  {
    name: 'mixed my/we/our markers plus a figure',
    beats: [
      { substance: 'creator_knowledge', line: 'My first attempt failed completely.' },
      { substance: 'creator_knowledge', line: 'I spent $500 on the first batch.' },
      { substance: 'general', line: 'Nothing numeric here at all.' },
    ],
  },
  { name: 'empty script', beats: [] },
  { name: 'non-array input', beats: null },
]

describe('the edge copy agrees with the tested one', () => {
  it.each(FIXTURES)('$name', ({ beats }) => {
    expect(inline(beats)).toEqual(witnessScore(beats))
  })
})

describe('the counter is actually written into beat_audit', () => {
  it('is wired', () => {
    expect(EDGE).toMatch(/witness_score: witnessScoreInline\(/)
  })
})
