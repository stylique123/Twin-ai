// THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL.
//
// ⚠️ `sceneVariety.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint` HAS
// THE INLINE COPY THAT ACTUALLY FEEDS `beat_audit`. Deno cannot import the
// shared package at deploy time, so a rule proved correct in one file and
// absent from the other is worth nothing to anybody using the product.
//
// ⚖️ EXECUTED, NOT READ. Pattern-matching the source would catch a spelling
// change and miss a behavioural drift. Transpiled with esbuild, not with
// regexes — a hand-written strip parses but can quietly change behaviour.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { sceneMonotonyBeatCount } from '../script/sceneVariety'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  const start = EDGE.indexOf('const SCENE_MONOTONY_RUN_LENGTH_INLINE')
  const end = EDGE.indexOf('function premiseDemandInline')
  expect(start, 'the inline block must exist in the edge').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const ts = EDGE.slice(start, end)
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return sceneMonotonyBeatCountInline`)() as (beats: unknown) => number
}

const inline = loadInline()

const FIXTURES: Array<{ name: string; beats: unknown }> = [
  {
    name: 'the screenshot fixture: four identical scenes',
    beats: [
      { line: 'Line one.', location: 'center of the room facing a window', direction: 'chest-up' },
      { line: 'Line two.', location: 'Center of the room facing a window.', direction: 'chest-up' },
      { line: 'Line three.', location: 'center of the room facing a window', direction: 'chest-up' },
      { line: 'Line four.', location: 'center of the room facing a window', direction: 'chest-up' },
    ],
  },
  {
    name: 'changed framing on an unchanged location',
    beats: [
      { line: 'Line one.', location: 'kitchen counter', direction: 'chest-up' },
      { line: 'Line two.', location: 'kitchen counter', direction: 'overlay' },
      { line: 'Line three.', location: 'kitchen counter', direction: 'insert' },
    ],
  },
  {
    name: 'a silent beat sandwiched between identical speaking beats',
    beats: [
      { line: 'Line one.', location: 'studio', direction: 'chest-up' },
      { line: '[No spoken audio]', location: 'studio', direction: 'chest-up' },
      { line: 'Line two.', location: 'studio', direction: 'chest-up' },
      { line: 'Line three.', location: 'studio', direction: 'chest-up' },
    ],
  },
  {
    name: 'two identical beats only (below the run threshold)',
    beats: [
      { line: 'a', location: 'studio', direction: 'chest-up' },
      { line: 'b', location: 'studio', direction: 'chest-up' },
    ],
  },
  {
    name: 'no location recorded on any beat',
    beats: [
      { line: 'a', location: '', direction: '' },
      { line: 'b', location: '', direction: '' },
      { line: 'c', location: '', direction: '' },
    ],
  },
  { name: 'empty input', beats: [] },
  { name: 'non-array input', beats: null },
]

describe('the edge copy agrees with the tested one', () => {
  it.each(FIXTURES)('$name', ({ beats }) => {
    expect(inline(beats)).toBe(sceneMonotonyBeatCount(beats))
  })
})

describe('the counter is actually written into beat_audit', () => {
  it('is wired', () => {
    expect(EDGE).toMatch(/scene_monotony_beats: sceneMonotonyBeatCountInline\(/)
  })
})
