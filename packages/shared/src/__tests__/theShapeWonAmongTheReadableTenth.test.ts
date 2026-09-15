// THE SHAPE WON AMONG THE READABLE TENTH, AND THE PROMPT NEVER SAID SO.
//
// ⚠️ MEASURED: of 596 usable shapes, `direct_question` 279 + `how_to` 151 +
// `number_promise` 124 = 554 — and those three are exactly what eight regex
// patterns detect well: a question mark, a leading "how to", a leading digit.
// The distribution is a fact about the DETECTOR before it is a fact about the
// corpus, and it flows into a live prompt today.
//
// ⚖️ AND THE BLOCK'S OWN ARITHMETIC WAS ALREADY HONEST — a claim I nearly got
// wrong. `tallyByShape` skips unclassified cards while `size` counts every
// selected one, which looks like a mismatched denominator. It is not, in
// production: the corpus query filters `.not('caption_shape','is',null)`, so
// the cards reaching the block are classified ONLY and "279 of 596" really is
// 279 out of 596. What was missing was never the denominator. It was that 596
// is what a pattern could read out of thousands scanned, and the model read
// "596 videos across all niches" as the corpus.
//
// ⚠️ WHOLE-LINE COMMENTS ARE STRIPPED BEFORE MATCHING, because this fix's own
// comments quote the sentences being asserted.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE_RAW = readFileSync(
  join(REPO, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const EDGE = EDGE_RAW.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

/** ⚖️ EXECUTED, NOT READ. The renderer is extracted and run, because the claim
 *  is about the SENTENCE a model receives, not about the source text. */
function loadRenderer() {
  const start = EDGE_RAW.indexOf('function renderDominantShapeInline(')
  const end = EDGE_RAW.indexOf('\n}', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const src = EDGE_RAW.slice(start, end + 2)
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return renderDominantShapeInline`)() as (
    b: {
      shape: string; n: number; basis: string; rung: string
      readable: number; scanned: number | null
    } | null,
  ) => string
}

const block = (over: Partial<{
  shape: string; n: number; basis: string; rung: string
  readable: number; scanned: number | null
}> = {}) => ({
  shape: 'direct_question',
  n: 279,
  basis: '596 videos across all niches',
  rung: 'all',
  readable: 596,
  scanned: 6276,
  ...over,
})

describe('the prompt states what the detector could read', () => {
  const render = loadRenderer()

  it('says the readable count AND the scanned count', () => {
    const out = render(block())
    expect(out).toContain('596')
    expect(out).toContain('6276')
    expect(out).toContain('a PATTERN could read')
  })

  it('says the shapes a pattern misses are UNDER-COUNTED, not absent', () => {
    // ⚠️ THE DISTINCTION THAT MATTERS. "absent" invites the model to treat the
    // five sub-floor shapes as things creators do not do. They are things this
    // detector cannot see.
    const out = render(block())
    expect(out).toContain('under-counted here rather than absent')
    expect(out).toContain('AMONG THE READABLE ONES')
  })

  it('omits the coverage sentence when the count failed — never guesses it', () => {
    // A coverage claim built on a failed count is worse than none: absent is
    // not the same as complete.
    const out = render(block({ scanned: null }))
    expect(out).not.toContain('a PATTERN could read')
    expect(out).not.toContain('scanned')
    // The rest of the block survives — the shape is still evidence.
    expect(out).toContain('direct_question')
    expect(out).toContain('596 videos across all niches')
  })

  it('omits it when the numbers are incoherent rather than printing a lie', () => {
    // scanned < readable cannot be true; printing "596 out of 40 scanned" would
    // be a sentence no reader can act on.
    const out = render(block({ scanned: 40 }))
    expect(out).not.toContain('a PATTERN could read')
  })

  it('still says nothing at all when there is no block', () => {
    expect(render(null)).toBe('')
  })

  it('keeps the two disclaimers it already carried', () => {
    const out = render(block())
    // Structure only, and frequency-not-performance. Neither may be lost to
    // make room for the new sentence.
    expect(out).toContain('STRUCTURE ONLY')
    expect(out).toContain('contributes NO WORDS')
    expect(out).toContain('NOT how well it performed')
  })
})

describe('the count that feeds it', () => {
  it('is a head-only count, so no rows cross the wire', () => {
    expect(EDGE).toContain("count: 'exact', head: true")
  })

  it('is recomputed per generation, never hard-coded', () => {
    // ⚠️ RULE 5.1. A hard-coded "9.5%" is a snapshot with no expiry date, and
    // this project has had three of those become planning inputs after the
    // world moved.
    expect(EDGE).toContain('let corpusScanned: number | null = null')
    expect(EDGE).not.toMatch(/scanned:\s*6276/)
    expect(EDGE).not.toMatch(/9\.5%/)
  })

  it('cannot fail a generation', () => {
    const at = EDGE.indexOf('let corpusScanned')
    const after = EDGE.slice(at, at + 400)
    expect(after).toContain('catch')
    const handler = after.slice(after.indexOf('catch'))
    expect(handler.slice(0, 120)).not.toMatch(/\bthrow\b/)
  })

  it('reaches the renderer — the reader-removal assertion', () => {
    // Delete the argument at the call site and the sentence can never appear.
    expect(EDGE).toMatch(/dominantShapeInline\([\s\S]{0,200}corpusScanned\)/)
    expect(EDGE).toContain('scanned,')
  })
})
