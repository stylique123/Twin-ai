// THE GATE WAS RIGHT AND IT REACHED ONE CREATOR IN SEVEN.
//
// ⚠️⚠️ MEASURED 2026-09-13. By niche bucket, 1 of 7 buckets clears MIN_COHORT 20
// with 2σ separation: entertainment 46v6 (σ 5.55) emits; business 91v66 is σ 2.00
// and the bar is a strict `>`; tech 1.73, beauty_fashion 0.77, food 0.65, health
// 0.00, creator 0.00. Across all niches: 596 cards, direct_question 279 vs how_to
// 151, σ 6.17 — decisive where six of seven niche cohorts are not.
//
// ⚖️ SO A SECOND RUNG, AND IT IS HONEST ONLY BECAUSE THE BASIS SAYS WHAT IT IS.
// A global shape reaching the writer described as her niche would be evidence
// from every niche disguised as advice about hers. That lie is the only thing
// that could make this rung worse than having none, so it is the property this
// file guards hardest.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { transformSync } from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(
  join(ROOT, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

type Card = { niche: unknown; caption_shape: unknown }
type Block = { shape: string; n: number; basis: string; rung: string } | null

/** The REAL rule, executed out of the edge file — not a restatement of it. */
function loadRule(): (cards: readonly Card[], herNiche: unknown) => Block {
  const start = EDGE.indexOf('const NICHE_BUCKET_PATTERNS_INLINE')
  const end = EDGE.indexOf('function renderDominantShapeInline')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end) + '\nreturn dominantShapeInline',
    { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(js)() as (cards: readonly Card[], herNiche: unknown) => Block
}
const rule = loadRule()

const many = (niche: string, shape: string, n: number): Card[] =>
  Array.from({ length: n }, () => ({ niche, caption_shape: shape }))

describe('her own bucket wins whenever it qualifies', () => {
  it('a decisive niche cohort returns the domain rung and names her niche', () => {
    const cards = [...many('comedy skits', 'direct_question', 46), ...many('comedy skits', 'how_to', 6)]
    const b = rule(cards, 'comedy skits')
    expect(b).not.toBeNull()
    expect(b!.rung).toBe('domain')
    expect(b!.shape).toBe('direct_question')
    expect(b!.basis).toMatch(/creators in/)
    expect(b!.basis).not.toMatch(/across all niches/)
  })

  it('a bigger but INDECISIVE niche cohort does NOT win — it falls through', () => {
    // ⚠️ THE BUSINESS CASE, EXACTLY: 91 v 66 is σ 2.00 and the bar is a strict >.
    // Returning it because it is large would ship the tie the gate exists to refuse.
    const cards = [...many('business', 'direct_question', 91), ...many('business', 'how_to', 66)]
    const b = rule(cards, 'business')
    expect(b === null || b.rung === 'all').toBe(true)
  })
})

describe('the global rung answers where the niche cohort cannot', () => {
  const corpus = [
    ...many('business', 'direct_question', 91), ...many('business', 'how_to', 66),
    ...many('fitness', 'direct_question', 188), ...many('fitness', 'how_to', 85),
  ]

  it('a creator in a tied bucket still gets a block, from the all rung', () => {
    const b = rule(corpus, 'business')
    expect(b).not.toBeNull()
    expect(b!.rung).toBe('all')
    expect(b!.shape).toBe('direct_question')
  })

  it('⚠️ AND ITS BASIS SAYS "across all niches", never her niche', () => {
    const b = rule(corpus, 'business')
    expect(b!.basis).toMatch(/across all niches/)
    expect(b!.basis).not.toMatch(/business/)
    expect(b!.basis).not.toMatch(/creators in/)
  })

  it('a creator whose niche maps to no bucket at all still gets the global answer', () => {
    const b = rule(corpus, 'reed basketry and medieval falconry')
    expect(b).not.toBeNull()
    expect(b!.rung).toBe('all')
    expect(b!.basis).toMatch(/across all niches/)
  })

  it('and the n is the GLOBAL count, matching the basis it is printed beside', () => {
    const b = rule(corpus, 'business')
    // Rendered as "Seen in {n} of {basis}" — an n from one bucket beside a
    // global basis would be a sentence that cannot be checked.
    expect(b!.n).toBe(91 + 188)
  })
})

describe('the gates still refuse — the rung is a fallback, not a loophole', () => {
  it('a tiny corpus returns null even globally', () => {
    const b = rule([...many('fitness', 'direct_question', 8), ...many('food', 'how_to', 3)], 'fitness')
    expect(b).toBeNull()
  })

  it('a global tie returns null rather than picking one', () => {
    const b = rule([...many('a', 'direct_question', 60), ...many('b', 'how_to', 58)], 'nothing')
    expect(b).toBeNull()
  })

  it('MIN_COHORT still binds at exactly 20, not 19', () => {
    expect(rule(many('x', 'direct_question', 19), 'nothing')).toBeNull()
    expect(rule(many('x', 'direct_question', 20), 'nothing')).not.toBeNull()
  })

  it('no cards at all is null, never an empty-looking block', () => {
    expect(rule([], 'fitness')).toBeNull()
  })
})

describe('the shared module carries the same rung, and says why it is last', () => {
  const SHARED = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'corpus', 'cohort.ts'), 'utf8')

  it("'all' is in the rung union", () => {
    expect(SHARED).toMatch(/export type CohortRung = [^\n]*'all'/)
  })

  it('it is the LAST rung tried, after domain', () => {
    const ladder = SHARED.slice(SHARED.indexOf('const rungs:'), SHARED.indexOf(']\n\n  for (const [rung'))
    expect(ladder.indexOf("'domain'")).toBeLessThan(ladder.indexOf("'all'"))
  })

  it('and it does NOT borrow her facets for its basis', () => {
    expect(SHARED).toMatch(/rung === 'all'[\s\S]{0,200}across all niches/)
  })
})
