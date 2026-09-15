// TWO COPIES OF THE RULE, AND THE SCRIPT ONLY EVER SEES ONE.
//
// ⚠️ EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`, so generate-blueprint
// carries an inlined copy. The shared module has the tests; the inlined one
// decides what a real generation counts about a real creator's script.
//
// ⚖️ EXECUTED, NOT READ. Pattern-matching the source would catch a spelling
// change and miss the one that matters — a craft term exempted on one side and
// not the other, which is precisely the distinction this rule exists to keep.
// The owner's condition is about FALSE POSITIVES on a bookbinder's vocabulary,
// so drift in the exempt set is the failure that costs a good script.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { nominalisationsIn } from '../nominalisation'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE_RAW = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

function edgeCopy(): (t: unknown) => Array<{ word: string; verb: string | null }> {
  const start = EDGE_RAW.indexOf('// ── NOMINALISATION, INLINED ─')
  const end = EDGE_RAW.indexOf('// ── END NOMINALISATION ─', start)
  expect(start, 'the inlined block markers are gone').toBeGreaterThan(-1)
  expect(end, 'the inlined block end marker is gone').toBeGreaterThan(start)
  const js = transformSync(EDGE_RAW.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  return new Function(`${js}; return nominalisationsInInline`)() as
    (t: unknown) => Array<{ word: string; verb: string | null }>
}
const edge = edgeCopy()

// ⚠️ THE TABLE MUST DISCRIMINATE OR THE PARITY IS VACUOUS. Two copies that both
// return [] for everything agree perfectly and measure nothing, so the fixtures
// are asserted below to produce hits, misses, craft survivals and a verb.
const FIXTURES: string[] = [
  // The four measured abstractions.
  'What matters here is the repairability of the thing.',
  'The durability is the point.',
  'A glued binding is about disposability.',
  'Consistency is the foundation of success.',
  // The owner's three named controls, alone and in a sentence.
  'Oxford hollow',
  'saddle stitch',
  'signatures',
  'I cut the old glued binding off, take the pages apart into signatures, and sew '
    + 'those signatures back together by hand on tapes.',
  // Good lines quoted verbatim from the session report.
  'It goes in the bin. That is the actual end of it.',
  'I stood there holding a sheet pan.',
  'I did not lose speed. I lost the exact thing people were paying for.',
  'nobody dismisses a broken Bible here.',
  'it can be opened flat',
  // The compound, and an unlisted suffix hit.
  'It is about nutrient density.',
  'the washability of the cover',
  // Exempt terms that WOULD collide with the suffix rule.
  'accessibility matters',
  'availability is limited',
  // Refusals and edges.
  '',
  '   ',
  'ability',
  'durability and durability and more durability',
]

describe('the two copies agree on every fixture', () => {
  for (const [i, text] of FIXTURES.entries()) {
    it(`#${i}: "${text.slice(0, 44)}${text.length > 44 ? '…' : ''}"`, () => {
      expect(edge(text)).toEqual(nominalisationsIn(text))
    })
  }

  it('and on the non-string refusals, where a coercion would diverge', () => {
    for (const bad of [null, undefined, 42, { toString: () => 'durability' }]) {
      expect(edge(bad), `diverged on ${String(bad)}`).toEqual(nominalisationsIn(bad))
    }
  })
})

describe('the fixture table is not vacuous', () => {
  const all = FIXTURES.map((t) => nominalisationsIn(t))

  it('produces hits', () => {
    expect(all.filter((h) => h.length > 0).length).toBeGreaterThan(5)
  })

  it('produces clean lines, so a flag-everything rule would fail', () => {
    expect(all.filter((h) => h.length === 0).length).toBeGreaterThan(8)
  })

  it('produces at least one named verb, so dropping it would diverge', () => {
    expect(all.flat().some((h) => h.verb !== null)).toBe(true)
  })

  it('produces at least one suffix-only hit with a null verb', () => {
    expect(all.flat().some((h) => h.verb === null)).toBe(true)
  })

  it("and the owner's three controls are among the clean ones", () => {
    for (const term of ['Oxford hollow', 'saddle stitch', 'signatures']) {
      expect(nominalisationsIn(term), `${term} was flagged`).toEqual([])
      expect(edge(term), `${term} was flagged by the edge copy`).toEqual([])
    }
  })
})

describe('the count is stored where it can be read back', () => {
  it('written by mutation, not into the literal that predates it', () => {
    expect(EDGE_RAW).toMatch(/beatAudit\.nominalisations_found = nominalisationsFound/)
  })

  it('counted over the same lines as the other script-derived counter', () => {
    const count = EDGE_RAW.indexOf('nominalisationsFound += nom.length')
    const progress = EDGE_RAW.indexOf('progressChecks++')
    expect(count).toBeGreaterThan(-1)
    expect(progress).toBeGreaterThan(-1)
    // Same loop over `declared`, so the two rates share a denominator.
    expect(Math.abs(count - progress)).toBeLessThan(900)
  })

  it('emits the words and their verbs, not just a total', () => {
    const block = EDGE_RAW.slice(EDGE_RAW.indexOf("event: 'nominalisation_found'"))
    const emit = block.slice(0, block.indexOf('}))'))
    expect(emit).toMatch(/words: nom\.map/)
    expect(emit).toMatch(/verbs: nom\.map/)
  })

  it('the prompt asks for the verb, and protects her craft words by name', () => {
    // ⚖️ BOTH HALVES, OR THE INSTRUCTION IS A TRAP. Telling a model to avoid
    // abstractions without naming the technical vocabulary is how "signatures"
    // and "Oxford hollow" get written around — the exact accuracy this
    // creator's report records as already working.
    const ask = EDGE_RAW.slice(EDGE_RAW.indexOf('- SAY THE VERB, NOT THE ABSTRACTION'))
    const line = ask.slice(0, ask.indexOf('\n-', 1))
    expect(line).toMatch(/it can be repaired/)
    expect(line).toMatch(/never "repairability"/)
    for (const term of ['Oxford hollow', 'saddle stitch', 'signatures']) {
      expect(line, `${term} is not protected in the prompt`).toContain(term)
    }
    // And it must not read as a deletion order.
    expect(line).not.toMatch(/delete|remove|rewrite/i)
  })

  it('and it counts rather than deleting, rewriting or refusing', () => {
    // The ruling this file's own header records. A repair here would be the
    // shape that had to be walked back every time it shipped unmeasured.
    const start = EDGE_RAW.indexOf('// ── NOMINALISATION, INLINED ─')
    const body = EDGE_RAW.slice(start, EDGE_RAW.indexOf('// ── END NOMINALISATION ─', start))
    expect(body).not.toMatch(/\.replace\(|splice\(|filter\(\(b\)/)
  })
})
