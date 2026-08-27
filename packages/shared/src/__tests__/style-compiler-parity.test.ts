// TWO COPIES OF THE COMPILER, AND THE PROMPT ONLY EVER SEES ONE OF THEM.
//
// ⚠️ EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`, so `generate-blueprint`
// carries an inlined copy. The shared module is the one with the tests; the
// inlined one is the one that runs in production. A drift between them is
// invisible in every other test in this repo.
//
// ⚖️ SO THIS RUNS BOTH OVER THE SAME FIXTURES AND COMPARES THE RENDERED BLOCK
// BYTE FOR BYTE — the property that matters, since the rendered block IS what
// reaches the model. Comparing the numeric profile alone would pass while the
// wording drifted.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { compileStyle, renderStyleRules, renderPartialStyleRules, MIN_SENTENCES, SHORT_SENTENCE_WORDS, PARTIAL_MIN_SENTENCES } from '../styleCompiler'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

// ⚖️ THE INLINE COPY IS EXECUTED, NOT PATTERN-MATCHED. Extracting the three
// functions and running them is the only way to catch a drift in behaviour
// rather than in spelling.
function loadInline(): {
  compile: (s: string[]) => Record<string, unknown>
  render: (s: Record<string, unknown>) => string
  renderPartial: (s: Record<string, unknown>) => string
} {
  const start = EDGE.indexOf('const STYLE_MIN_SENTENCES')
  const end = EDGE.indexOf('const SUBSTANCE_ENUM')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const src = EDGE.slice(start, end)
    // Strip the TS-only annotations the Function constructor cannot parse.
    .replace(/interface InlineStyle \{[\s\S]*?\n\}/, '')
    .replace(/: InlineStyle\b/g, '').replace(/<InlineStyle>/g, '')
    .replace(/: Array<'claim' \| 'question' \| 'address'>/g, '')
    .replace(/: 'claim' \| 'question' \| 'address' \| 'mixed' \| 'unknown'/g, '')
    .replace(/: string\[\]/g, '').replace(/: string\b/g, '').replace(/: number\b/g, '')
    .replace(/function (\w+)\(([^)]*)\)\s*\{/g, 'function $1($2) {')
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${src}; return { compile: compileStyleInline, render: renderStyleRulesInline, renderPartial: renderPartialStyleRulesInline }`)
  return factory() as ReturnType<typeof loadInline>
}

const inline = loadInline()

const FIXTURES: Array<[string, string[]]> = [
  ['empty', []],
  ['whitespace only', ['   ', '\n']],
  ['below threshold', ['You should stop. You must move. You will win.']],
  ['punchy second-person', [Array.from({ length: 45 },
    (_, i) => `You need to stop this now. It costs you ${i} hours a week.`).join(' ')]],
  ['long-form claims with contractions', [Array.from({ length: 50 }, () =>
    "Here's the thing nobody tells you about building a business that actually lasts more than a year.").join(' ')]],
  ['caption-wrapped, the production shape', [
    Array.from({ length: 44 }, () =>
      'This is the most dangerous\nproblem in mathematics, one that\nyoung mathematicians avoid. Pick a number.').join(' '),
  ]],
  ['mixed openers across samples', [
    `Do you know this? ${Array.from({ length: 20 }, () => 'It works well.').join(' ')}`,
    `The truth is simple. ${Array.from({ length: 20 }, () => 'It works well.').join(' ')}`,
  ]],
  ['questions throughout', [Array.from({ length: 45 },
    () => 'What if the whole model is wrong?').join(' ')]],
]

describe('the inlined compiler matches the shared one', () => {
  for (const [name, samples] of FIXTURES) {
    it(`renders identically: ${name}`, () => {
      const shared = renderStyleRules(compileStyle(samples))
      const edge = inline.render(inline.compile(samples))
      expect(edge).toBe(shared)
    })

    it(`profiles identically: ${name}`, () => {
      expect(inline.compile(samples)).toEqual({ ...compileStyle(samples) })
    })
  }
})

const PARTIAL_FIXTURES: Array<[string, string[]]> = [
  ['empty', []],
  ['below the partial floor', ['You should stop. You must move.']],
  ['between the two floors', [Array.from({ length: 10 },
    (_, i) => `You need to stop this now. It costs you ${i} hours a week.`).join(' ')]],
  ['crosses the full floor — silent, renderStyleRules takes over', [Array.from({ length: 45 },
    (_, i) => `You need to stop this now. It costs you ${i} hours a week.`).join(' ')]],
]

describe('the inlined partial card matches the shared one (Voice Cause 1c)', () => {
  for (const [name, samples] of PARTIAL_FIXTURES) {
    it(`renders identically: ${name}`, () => {
      const shared = renderPartialStyleRules(compileStyle(samples))
      const edge = inline.renderPartial(inline.compile(samples))
      expect(edge).toBe(shared)
    })
  }
})

describe('the constants cannot drift apart', () => {
  it('agrees on the reporting threshold', () => {
    expect(EDGE).toContain(`const STYLE_MIN_SENTENCES = ${MIN_SENTENCES}`)
  })

  it('agrees on the short-sentence boundary', () => {
    expect(EDGE).toContain(`const STYLE_SHORT_WORDS = ${SHORT_SENTENCE_WORDS}`)
  })

  it('agrees on the partial-card floor', () => {
    expect(EDGE).toContain(`const STYLE_PARTIAL_MIN_SENTENCES = ${PARTIAL_MIN_SENTENCES}`)
  })
})

describe('the prompt reads OWN speech and nothing else', () => {
  it('filters transcripts on subject = own', () => {
    // ⚠️ THE ONE ASSERTION THAT PREVENTS A STRANGER'S CADENCE FROM BEING LABELLED
    // THIS CREATOR'S. 50 of 58 production transcripts are pasted references.
    expect(EDGE).toMatch(/\.from\('transcripts'\)[\s\S]{0,200}\.eq\('subject', 'own'\)/)
  })

  it('scopes the read to the owner as well as the subject', () => {
    expect(EDGE).toMatch(/\.from\('transcripts'\)[\s\S]{0,200}\.eq\('owner_id', ownerId\)/)
  })

  it('renders the block into the DNA rather than computing it and dropping it', () => {
    // ⚠️ MUTATION-CHECKED: removing this interpolation leaves every other test
    // green and the compiler write-only — the defect this repo has now found in
    // product_entities, six counters and capability_flags.
    expect(EDGE).toMatch(/\$\{styleRules \? `\n\$\{styleRules\}` : ''\}/)
  })

  it('a failed read yields no block rather than a partial one', () => {
    expect(EDGE).toMatch(/catch \{[\s\S]{0,300}styleRules = ''/)
  })
})
