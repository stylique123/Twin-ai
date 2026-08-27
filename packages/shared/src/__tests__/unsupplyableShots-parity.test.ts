// TWO COPIES, AND THE PROMPT ONLY EVER SEES THE INLINE ONE.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { unsupplyableShotCount } from '../screenCaptureConversion'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline(): (script: unknown) => number {
  const start = EDGE.indexOf('const CAPTURE_PHRASES_INLINE')
  const end = EDGE.indexOf('function unsupplyableShotCountInline')
  const bodyStart = EDGE.indexOf('function unsupplyableShotCountInline')
  const bodyEnd = EDGE.indexOf('\n}', bodyStart) + 2
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const src = EDGE.slice(start, bodyEnd)
    .replace(/: RegExp\[\]/g, '')
    .replace(/: unknown\b/g, '').replace(/: Record<string, unknown>/g, '')
    .replace(/\s+as Record<string, unknown>/g, '')
    .replace(/function (\w+)\(([^)]*)\)\s*:\s*\w+\s*\{/g, 'function $1($2) {')
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${src}; return unsupplyableShotCountInline`)
  return factory() as (script: unknown) => number
}

const inline = loadInline()

const REAL_SCREEN_CAPTURE = 'Overlay the screen recording at fifty percent opacity so the creator is still visible.'
const REAL_BROLL = 'Hard cut to full screen b-roll for two seconds on the word unfulfilling, then back to creator.'

describe('the inlined unsupplyable-shot counter matches the shared one', () => {
  const FIXTURES: Array<[string, unknown]> = [
    ['empty', []],
    ['no violations', [{ editor_intent: 'Push in five percent on the word poor.' }]],
    ['screen capture only', [{ editor_intent: REAL_SCREEN_CAPTURE }]],
    ['broll only', [{ editor_intent: REAL_BROLL }]],
    ['both, mixed with clean beats', [
      { editor_intent: REAL_SCREEN_CAPTURE },
      { editor_intent: 'Leave one second of silence at the end before the loop.' },
      { editor_intent: REAL_BROLL },
    ]],
  ]

  for (const [name, script] of FIXTURES) {
    it(`counts identically: ${name}`, () => {
      expect(inline(script)).toBe(unsupplyableShotCount(script as never))
    })
  }
})

describe('the counter is actually written into beat_audit', () => {
  it('is computed from the final script', () => {
    expect(EDGE).toMatch(/unsupplyable_shots: unsupplyableShotCountInline\(\s*Array\.isArray\(declared\) \? declared : \[\]\)/)
  })
})
