// THE NICHE-ANCHOR RULE LIVES TWICE, AND THIS EXECUTES BOTH COPIES.
//
// ⚠️ `generate-blueprint` cannot import `@twinai/shared`, so the rule is
// mirrored. A second authority for one rule is the defect class this codebase
// keeps closing; the only thing that makes a mirror survivable is a test that
// FAILS when the two drift.
//
// ⚖️ AND THE TABLE HAS TO DISCRIMINATE. Two copies that both return 0 on every
// fixture agree about nothing, so the fixtures include anchored beats, the
// slash-joined entry that a naive matcher misses, an inflection, silent beats
// and an empty vocabulary — and the test asserts the table produced BOTH
// outcomes before it trusts the agreement.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { nicheAnchoredBeats, usableNicheTerms } from '../nicheAnchor'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** ⚖️ EXECUTED, NOT READ. Transpiled with esbuild — the compiler that builds
 *  this repo — because a regex that strips just enough to parse can quietly
 *  change what the code does. */
function loadInline() {
  const start = EDGE.indexOf('// ── NICHE ANCHOR, INLINED ─')
  const end = EDGE.indexOf('// ── END NICHE ANCHOR ─', start)
  expect(start, 'inlined block marker missing — fix the marker, do not delete it').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return {
    usableNicheTermsInline, nicheAnchoredBeatsInline }`)() as {
      usableNicheTermsInline: typeof usableNicheTerms
      nicheAnchoredBeatsInline: typeof nicheAnchoredBeats
    }
}

// @woodsyleather's real vocabulary, verbatim from `brand_voices`.
const LEATHER = [
  'rebind', 'text block', 'Oxford hollow', 'Tokonole', 'semi yap',
  'edge lined', 'Smyth sewn', 'perfect bind / glued binding',
]

const CASES: Array<{ name: string; lines: unknown[]; vocab: unknown }> = [
  { name: 'anchored on a plain term', lines: ['The text block gets sewn on tapes.'], vocab: LEATHER },
  {
    name: 'anchored on the SLASH-JOINED half a naive matcher misses',
    lines: ['I cut the old glued binding off.'],
    vocab: LEATHER,
  },
  { name: 'anchored on an inflection', lines: ['Rebinding takes a week.'], vocab: LEATHER },
  {
    name: 'transplantable — the owner\'s own example',
    lines: ['Consistency is the foundation of success.'],
    vocab: LEATHER,
  },
  {
    name: 'silent beats excluded from the denominator',
    lines: ['Tokonole on the edges.', '', null, '  ', undefined],
    vocab: LEATHER,
  },
  { name: 'empty vocabulary anchors nothing', lines: ['Anything at all.'], vocab: [] },
  { name: 'vocabulary is not an array', lines: ['The text block.'], vocab: 'text block' },
  { name: 'terms below the length floor are dropped', lines: ['A semi yap cover.'], vocab: ['yap'] },
  { name: 'no beats at all', lines: [], vocab: LEATHER },
  {
    name: 'several terms in one beat still count once',
    lines: ['The text block, an Oxford hollow, and Tokonole.'],
    vocab: LEATHER,
  },
]

describe('niche anchor parity', () => {
  const inline = loadInline()

  it.each(CASES)('$name', ({ lines, vocab }) => {
    const shared = nicheAnchoredBeats(lines, vocab)
    const mirrored = inline.nicheAnchoredBeatsInline(lines, vocab)
    // Compared WHOLE, including `hits`. Comparing fewer fields would be the
    // check doing less — the drift that caught the nominalisation mirror was a
    // missing field, not a wrong count.
    expect(mirrored).toEqual(shared)
  })

  it.each(CASES)('term selection agrees: $name', ({ vocab }) => {
    expect(inline.usableNicheTermsInline(vocab)).toEqual(usableNicheTerms(vocab))
  })

  it('the fixture table produced BOTH outcomes, so agreement means something', () => {
    const results = CASES.map((c) => nicheAnchoredBeats(c.lines, c.vocab).anchored)
    expect(results.some((n) => n > 0), 'no fixture anchored — the table stopped discriminating')
      .toBe(true)
    expect(results.some((n) => n === 0), 'every fixture anchored — the table stopped discriminating')
      .toBe(true)
  })

  it('and the slash-joined case is genuinely load-bearing', () => {
    // If this ever returns 0, the mirror could drop the split and still pass
    // every other row in the table.
    expect(nicheAnchoredBeats(['I cut the old glued binding off.'], LEATHER).anchored).toBe(1)
  })
})
