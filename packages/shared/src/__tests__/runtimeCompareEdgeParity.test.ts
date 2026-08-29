// THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL.
//
// ⚠️ `runtimeCompare.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint` HAS
// THE INLINE COPY THAT ACTUALLY FEEDS `beat_audit.runtime_ceiling_warning`.
// Deno cannot import the shared package at deploy time, so a rule proved
// correct in one file and absent from the other is worth nothing to anybody
// using the product. Same discipline as `timingMathEdgeParity.test.ts`.
//
// ⚖️ EXECUTED, NOT READ. Transpiled with esbuild, not with regexes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { compareRuntime } from '../script/runtimeCompare'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  const start = EDGE.indexOf('const RUNTIME_CEILING_SEC_INLINE')
  const bodyStart = EDGE.indexOf('function runtimeCeilingWarningInline')
  const end = EDGE.indexOf('\n}', bodyStart) + 2
  expect(start, 'the inline runtime block must exist').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(bodyStart)
  // `estimateDurationSecInline` is defined earlier in the same file (FIX 7's
  // block) and reused here rather than redefined a third time — pull that in
  // too so the extracted snippet actually runs standalone.
  const wpmStart = EDGE.indexOf('const NATURAL_WPM_INLINE')
  const wpmFnEnd = EDGE.indexOf('\n}', EDGE.indexOf('function estimateDurationSecInline')) + 2
  const ts = `${EDGE.slice(wpmStart, wpmFnEnd)}\n${EDGE.slice(start, end)}`
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { computedRuntimeSecInline, runtimeCeilingWarningInline }`)() as {
    computedRuntimeSecInline: (script: unknown) => number
    runtimeCeilingWarningInline: (script: unknown, referenceDurationSec: unknown) => unknown
  }
}

const { computedRuntimeSecInline, runtimeCeilingWarningInline } = loadInline()

function words(n: number): string {
  return Array(n).fill('word').join(' ')
}

const FIXTURES: Array<{ name: string; script: unknown; referenceSec: number | null }> = [
  { name: 'the audited run-a script (~34s)', script: [
    { line: words(10) }, { line: words(24) }, { line: words(20) }, { line: words(17) }, { line: words(15) },
  ], referenceSec: null },
  { name: 'with a known reference duration', script: [{ line: words(15) }], referenceSec: 20 },
  { name: 'a script over the ceiling', script: [{ line: words(500) }], referenceSec: null },
  { name: 'a reference duration of 0 reads as unknown, not zero', script: [{ line: words(15) }], referenceSec: 0 },
  { name: 'a negative reference duration reads as unknown', script: [{ line: words(15) }], referenceSec: -5 },
  { name: 'empty script', script: [], referenceSec: null },
  { name: 'non-array script', script: null, referenceSec: null },
]

describe('the edge copy agrees with the tested one', () => {
  it.each(FIXTURES)('$name', ({ script, referenceSec }) => {
    const shared = compareRuntime(script as never, referenceSec)
    expect(computedRuntimeSecInline(script)).toBe(shared.computedSec)
  })
})

describe('runtimeCeilingWarningInline: null exactly when there is no script to measure', () => {
  it('an empty or non-array script returns null, never a zeroed object', () => {
    expect(runtimeCeilingWarningInline([], null)).toBeNull()
    expect(runtimeCeilingWarningInline(null, null)).toBeNull()
    expect(runtimeCeilingWarningInline(undefined, null)).toBeNull()
  })
  it('a real script returns the full object, with exceeded computed correctly', () => {
    const under = runtimeCeilingWarningInline([{ line: words(15) }], 20) as {
      computed_seconds: number; reference_seconds: number | null; ceiling_seconds: number; exceeded: boolean
    }
    expect(under).toEqual({ computed_seconds: 6, reference_seconds: 20, ceiling_seconds: 180, exceeded: false })
    const over = runtimeCeilingWarningInline([{ line: words(500) }], null) as { exceeded: boolean }
    expect(over.exceeded).toBe(true)
  })
})

describe('it is actually wired into beat_audit', () => {
  it('the counter is written into beat_audit, reading declared and the reference duration', () => {
    expect(EDGE).toMatch(/runtime_ceiling_warning: runtimeCeilingWarningInline\(/)
  })
})
