// THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL.
//
// ⚠️ `hookBodyCollision.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint`
// HAS THE INLINE COPY THAT ACTUALLY FEEDS `beat_audit`. Deno cannot import
// the shared package at deploy time, so a rule proved correct in one file
// and absent from the other is worth nothing to anybody using the product.
//
// ⚖️ EXECUTED, NOT READ. Transpiled with esbuild, not with regexes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { hookBodyCollisionBeatCount } from '../script/hookBodyCollision'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  // ⚠️ ENDS RIGHT AFTER hookBodyCollisionBeatCountInline'S OWN CLOSING BRACE,
  // NOT AT THE NEXT NAMED FUNCTION. Other inline blocks (FIX 4, unsupplyable
  // shots) now sit between this one and `premiseDemandInline`, and their type
  // annotations aren't covered by the strips a sibling parity test needed to
  // add for the same reason.
  const start = EDGE.indexOf('const HOOK_BODY_CONTAINMENT_THRESHOLD_INLINE')
  const bodyStart = EDGE.indexOf('function hookBodyCollisionBeatCountInline')
  const end = EDGE.indexOf('\n}', bodyStart) + 2
  expect(start, 'the inline block must exist in the edge').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(bodyStart)
  const ts = EDGE.slice(start, end)
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return hookBodyCollisionBeatCountInline`)() as
    (hookOptions: unknown, beats: unknown) => number
}

const inline = loadInline()

const HOOK_OPTIONS = [
  'Your fear of judgement is cementing you into a life you hate.',
  'Stop chasing motivation — build a system that works without it.',
  'The comfort zone is a trap, and you built it yourself.',
  'Nobody is coming to save your career but you.',
  'Three habits that quietly ruined my twenties.',
]

const FIXTURES: Array<{ name: string; hookOptions: unknown; beats: unknown }> = [
  {
    name: 'the audited fixture: scene 4 restates hook option 2',
    hookOptions: HOOK_OPTIONS,
    beats: [
      { line: HOOK_OPTIONS[0] },
      { line: 'Here is the actual system I used to change course.' },
      { line: 'Most people quit at step two, which is the whole problem.' },
      { line: 'Stop chasing motivation, and build a system that works without it.' },
    ],
  },
  {
    name: 'no collisions',
    hookOptions: HOOK_OPTIONS,
    beats: [
      { line: HOOK_OPTIONS[0] },
      { line: 'Here is a totally unrelated line about something else entirely.' },
    ],
  },
  {
    name: 'a beat colliding with two hooks counts once',
    hookOptions: ['irrelevant opener here today', 'stop chasing motivation every single day', 'stop chasing motivation every single morning'],
    beats: [{ line: 'You should stop chasing motivation every single day and morning.' }],
  },
  { name: 'empty hook options', hookOptions: [], beats: [{ line: 'anything at all here' }] },
  { name: 'empty beats', hookOptions: HOOK_OPTIONS, beats: [] },
  { name: 'non-array input', hookOptions: null, beats: null },
]

describe('the edge copy agrees with the tested one', () => {
  it.each(FIXTURES)('$name', ({ hookOptions, beats }) => {
    expect(inline(hookOptions, beats)).toBe(hookBodyCollisionBeatCount(hookOptions, beats))
  })
})

describe('the counter is actually written into beat_audit', () => {
  it('is wired', () => {
    expect(EDGE).toMatch(/hook_body_collisions: hookBodyCollisionBeatCountInline\(/)
  })
})
