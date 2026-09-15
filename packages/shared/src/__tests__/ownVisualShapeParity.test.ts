// TWO COPIES OF THE RULE, AND THE PROMPT ONLY EVER SEES ONE.
//
// ⚠️ EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`, so generate-blueprint
// carries an inlined copy. The shared module has the tests; the inlined one
// decides what a real creator's prompt is told about her own published videos,
// and a drift between them is invisible to every other test here.
//
// ⚠️ AND A SOURCE-TEXT PASS IS NOT ENOUGH HERE, WHICH `check_symbol_readers`
// SAYS ITSELF. Its rule 1 counts a `<name>Inline` twin as a reader of the
// shared rule — deliberately — and its own registry records the time a mirror
// named to CONTAIN the shared symbol as a substring made the grep report the
// shared copy as read when nothing called it. `ownVisualShapeBlockInline`
// contains `ownVisualShape`, so that guard passing is a naming fact, not a
// behavioural one. This test is the behavioural one.
//
// ⚖️ SO BOTH ARE EXECUTED OVER THE SAME FIXTURES AND COMPARED. Pattern-matching
// the source would catch a spelling change and miss the one that matters — a
// floor that fires on one side and not the other.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { ownVisualShape, ownVisualShapeBlock, type OwnPostVisual } from '../ownVisualShape'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** ⚖️ EXECUTED, NOT READ. Transpiled with esbuild — the compiler that builds
 *  this repo — because a regex that strips just enough to parse can quietly
 *  change what the code does. */
function loadInline() {
  const start = EDGE.indexOf('// ── OWN VISUAL SHAPE, INLINED ─')
  const end = EDGE.indexOf('// ── END OWN VISUAL SHAPE ─', start)
  expect(start, 'inlined block marker missing — fix the marker, do not delete it').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { ownVisualShapeInline, ownVisualShapeBlockInline }`)() as {
    ownVisualShapeInline: (posts: OwnPostVisual[]) => unknown
    ownVisualShapeBlockInline: (shape: unknown) => string | null
  }
}

const TH = 'Filmed as a person talking to camera.'
const WALK = 'She is walking while she talks.'
const CLOSE = 'Shot close.'

const post = (
  url: string, plays: number | null, observations: Record<string, string>, ran = true,
): OwnPostVisual => ({ url, plays, visualPassRan: ran, observations })

/** ⚠️ FIXTURES CHOSEN TO STRADDLE EVERY BOUNDARY IN THE RULE, because a table
 *  that never crosses a floor cannot tell the two copies apart. Two mutants
 *  survived a too-narrow table earlier in this repo's history. */
const CASES: ReadonlyArray<{ name: string; posts: OwnPostVisual[] }> = [
  { name: 'empty', posts: [] },
  { name: 'one read post', posts: [post('a', 100, { talking_head: TH })] },
  { name: 'two read posts — below the pooled floor', posts: [
    post('a', 100, { talking_head: TH }), post('b', 200, { talking_head: TH }) ] },
  { name: 'exactly the pooled floor', posts: [
    post('a', 300, { talking_head: TH }), post('b', 200, { talking_head: TH }),
    post('c', 100, { talking_head: TH }) ] },
  { name: 'four read, a 3/1 split — split refused', posts: [
    post('a', 900, { talking_head: TH }), post('b', 800, { talking_head: TH }),
    post('c', 700, { talking_head: TH }), post('d', 100, { talking_head: WALK }) ] },
  { name: 'exactly 3/3 — split allowed', posts: [
    post('a', 900, { talking_head: TH }), post('b', 800, { talking_head: TH }),
    post('c', 700, { talking_head: TH }), post('d', 100, { talking_head: WALK }),
    post('e', 90, { talking_head: WALK }), post('f', 80, { talking_head: WALK }) ] },
  { name: 'same counts scaled 1000x', posts: [
    post('a', 900_000, { talking_head: TH }), post('b', 800_000, { talking_head: TH }),
    post('c', 700_000, { talking_head: TH }), post('d', 100_000, { talking_head: WALK }),
    post('e', 90_000, { talking_head: WALK }), post('f', 80_000, { talking_head: WALK }) ] },
  { name: 'all plays null', posts: [
    post('a', null, { talking_head: TH }), post('b', null, { talking_head: TH }),
    post('c', null, { talking_head: TH }) ] },
  { name: 'some plays null', posts: [
    post('a', 900, { talking_head: TH }), post('b', null, { talking_head: TH }),
    post('c', 700, { talking_head: WALK }), post('d', null, { talking_head: WALK }),
    post('e', 90, { talking_head: TH }), post('f', 80, { talking_head: WALK }) ] },
  { name: 'unread posts mixed in', posts: [
    post('a', 900, { talking_head: TH }), post('b', 800, { talking_head: TH }),
    post('c', 700, { talking_head: TH }), post('d', 600, {}, false),
    post('e', 500, {}, false) ] },
  { name: 'multiple dimensions, unevenly answered', posts: [
    post('a', 900, { talking_head: TH, shot: CLOSE }),
    post('b', 800, { talking_head: TH }),
    post('c', 700, { talking_head: TH, shot: CLOSE }),
    post('d', 100, { talking_head: WALK, shot: CLOSE }),
    post('e', 90, { talking_head: WALK }),
    post('f', 80, { talking_head: WALK }) ] },
  { name: 'an even number of posts — median between two values', posts: [
    post('a', 400, { talking_head: TH }), post('b', 300, { talking_head: TH }),
    post('c', 200, { talking_head: WALK }), post('d', 100, { talking_head: WALK }) ] },
  { name: 'every post identical', posts: [
    post('a', 100, { talking_head: TH }), post('b', 100, { talking_head: TH }),
    post('c', 100, { talking_head: TH }), post('d', 100, { talking_head: TH }),
    post('e', 100, { talking_head: TH }), post('f', 100, { talking_head: TH }) ] },
  { name: 'zero plays, which is a real reach and not a null', posts: [
    post('a', 10, { talking_head: TH }), post('b', 5, { talking_head: TH }),
    post('c', 0, { talking_head: WALK }), post('d', 0, { talking_head: WALK }),
    post('e', 0, { talking_head: WALK }), post('f', 20, { talking_head: TH }) ] },
]

describe('the shared rule and the edge mirror agree', () => {
  const inline = loadInline()

  it('the fixture table actually crosses the boundaries it claims to', () => {
    // ⚠️ A VACUOUS PASS IS REFUSED. If every case returned null the comparison
    // below would be trivially true and would prove nothing.
    const shapes = CASES.map((c) => ownVisualShape(c.posts))
    expect(shapes.filter((s) => s === null).length).toBeGreaterThan(0)
    expect(shapes.filter((s) => s !== null).length).toBeGreaterThan(4)
    expect(shapes.filter((s) => s?.split !== null && s !== null).length).toBeGreaterThan(0)
    expect(shapes.filter((s) => s !== null && s.split === null).length).toBeGreaterThan(0)
  })

  for (const c of CASES) {
    it(`agrees on the shape: ${c.name}`, () => {
      expect(inline.ownVisualShapeInline(c.posts)).toEqual(ownVisualShape(c.posts))
    })

    it(`agrees on the block: ${c.name}`, () => {
      const shape = ownVisualShape(c.posts)
      expect(inline.ownVisualShapeBlockInline(inline.ownVisualShapeInline(c.posts)))
        .toEqual(ownVisualShapeBlock(shape))
    })
  }
})
