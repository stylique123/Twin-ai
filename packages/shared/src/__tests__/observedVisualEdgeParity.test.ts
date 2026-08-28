// THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL.
//
// ⚠️ `observedVisual.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint` HAS
// THE INLINE COPY THAT ACTUALLY FEEDS THE PROMPT AND `beat_audit`. Deno cannot
// import the shared package at deploy time, so a rule proved correct in one
// file and absent from the other is worth nothing to anybody using the
// product.
//
// ⚖️ EXECUTED, NOT READ. Transpiled with esbuild, not with regexes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { observedVisualBlock, observedVisualCount, observedVisualLines } from '../script/observedVisual'
import { emptyVisualProfile, type ReferenceVisualProfile } from '../referenceProfile'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  const start = EDGE.indexOf('interface VisualObservationInline')
  const bodyStart = EDGE.indexOf('function observedVisualCountInline')
  const end = EDGE.indexOf('\n}', bodyStart) + 2
  expect(start, 'the inline observedVisual block must exist').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(bodyStart)
  const ts = EDGE.slice(start, end)
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { observedVisualLinesInline, observedVisualBlockInline, observedVisualCountInline }`)() as {
    observedVisualLinesInline: (p: unknown) => Array<{ dimension: string; line: string }>
    observedVisualBlockInline: (p: unknown) => string | null
    observedVisualCountInline: (p: unknown) => number
  }
}

const inline = loadInline()

function profileWithFrames(overrides: Partial<ReferenceVisualProfile>): ReferenceVisualProfile {
  return { ...emptyVisualProfile(), visualPassRan: true, framesSampled: 4, ...overrides }
}

const FIXTURES: Array<{ name: string; profile: ReferenceVisualProfile | null }> = [
  { name: 'null profile', profile: null },
  { name: 'pass never ran', profile: emptyVisualProfile() },
  {
    name: 'pass ran, every field null',
    profile: profileWithFrames({ fieldsObserved: 0 }),
  },
  {
    name: 'setting changes observed',
    profile: profileWithFrames({
      setting: { changes: { value: true, evidence: { frames: [1, 3] } }, complexity: null },
    }),
  },
  {
    name: 'a false requirement, plain camera and people fields',
    profile: profileWithFrames({
      people: { count: { value: 'multiple', evidence: { frames: [1] } } },
      camera: { framingChanges: null, positionChanges: null, shotType: { value: 'wide', evidence: { frames: [2] } } },
      requirements: {
        physicalProduct: { value: false, evidence: { frames: [1] } },
        secondPerson: null, multipleLocations: null, unusualProps: null,
      },
      fieldsObserved: 3,
    }),
  },
  {
    name: 'fully answered profile',
    profile: profileWithFrames({
      primaryMode: { value: 'talking_head', evidence: { frames: [1] } },
      people: { count: { value: 'one', evidence: { frames: [1] } } },
      setting: {
        changes: { value: false, evidence: { frames: [1, 4] } },
        complexity: { value: 'simple', evidence: { frames: [1] } },
      },
      performance: {
        talkingHead: { value: true, evidence: { frames: [1] } },
        walking: { value: false, evidence: { frames: [1, 4] } },
        acting: null, productInteraction: null, screenInteraction: null,
      },
      fieldsObserved: 6,
    }),
  },
]

describe('the edge copy agrees with the tested one', () => {
  it.each(FIXTURES)('$name — lines', ({ profile }) => {
    expect(inline.observedVisualLinesInline(profile)).toEqual(observedVisualLines(profile))
  })
  it.each(FIXTURES)('$name — block', ({ profile }) => {
    expect(inline.observedVisualBlockInline(profile)).toEqual(observedVisualBlock(profile))
  })
  it.each(FIXTURES)('$name — count', ({ profile }) => {
    expect(inline.observedVisualCountInline(profile)).toEqual(observedVisualCount(profile))
  })
})

describe('it is actually wired into the prompt and beat_audit', () => {
  it('the fetch selects visual_profile alongside profile', () => {
    expect(EDGE).toMatch(/\.select\('profile, visual_profile'\)/)
  })
  it('the observed_visual block is appended to containerBlock, which reaches the prompt', () => {
    expect(EDGE).toMatch(/if \(visualBlock\) containerBlock \+= `\\n\\n\$\{visualBlock\}`/)
  })
  it('the counter is written into beat_audit', () => {
    expect(EDGE).toMatch(/visual_dimensions_observed: visualDimensionsObserved,/)
  })
})
