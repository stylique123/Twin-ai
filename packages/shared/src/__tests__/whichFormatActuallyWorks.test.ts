// THE PRODUCT'S OWN GOAL WAS THE ONE THING IT NEVER MEASURED.
//
// ⚠️ BOTH HALVES ALREADY EXISTED. `recordPostStats` writes `posts.views` from
// the Dashboard, `OutcomeHistory` renders the series, and `posts.generation_id`
// has pointed at the producing generation since 0007. Nothing ever joined them,
// so a creator could see one video hit 40k and still not know whether their
// listicles beat their storytimes.
//
// ⚖️ THESE ASSERT THE PROPERTIES THAT MAKE A NUMBER TRUE RATHER THAN
// FLATTERING: the median resists one lucky video, a thin format is not
// reported at all, a null view count is not a zero, and silence explains
// itself instead of rendering an empty panel.
import { describe, it, expect } from 'vitest'
import {
  rankFormatsByOutcome, outcomeSpread, MIN_POSTS_PER_FORMAT,
  type OutcomePost, type OutcomeGeneration,
} from '../formatOutcomes'

const gen = (id: string, format: string): OutcomeGeneration =>
  ({ id, blueprint: { reference_read: { format_label: format } } })

function posts(spec: [string, number | null][]): OutcomePost[] {
  return spec.map(([gid, views], i) => ({ id: `p${i}`, generation_id: gid, views }))
}

/** n posts of one format, with the given view counts. */
function run(views: (number | null)[], format: string, offset = 0) {
  const gens = views.map((_, i) => gen(`${format}-${i + offset}`, format))
  const ps = posts(views.map((v, i) => [`${format}-${i + offset}`, v]))
  return { gens, ps }
}

describe('ranking a creator\'s formats by what actually happened', () => {
  it('one breakout video cannot crown a format', () => {
    // ⚠️ THE REASON THIS USES A MEDIAN. Storytime's mean is dragged over
    // Listicle's by a single 200k post while its typical video does 1k. A mean
    // would tell the creator to make more storytimes; the median tells the
    // truth, which is that listicles usually do better.
    const a = run([1000, 1000, 1000, 1000, 200000], 'Storytime')
    const b = run([4000, 4200, 3900, 4100, 4000], 'Listicle', 100)
    const v = rankFormatsByOutcome([...a.ps, ...b.ps], [...a.gens, ...b.gens])
    expect(v.kind).toBe('ranked')
    if (v.kind !== 'ranked') return
    expect(v.formats[0].format).toBe('Listicle')
    expect(v.formats[0].medianViews).toBe(4000)
    expect(v.formats[1].medianViews).toBe(1000)
  })

  it('a format below the floor is not reported at all', () => {
    // Two posts are not a rate. Reporting them produces a confident sentence
    // built on noise, and the creator will act on it.
    const thin = run([9000, 9000], 'Rare')
    const solid = run([100, 100, 100, 100, 100], 'Common', 50)
    const v = rankFormatsByOutcome([...thin.ps, ...solid.ps], [...thin.gens, ...solid.gens])
    expect(v.kind).toBe('only_one_format_reportable')
    if (v.kind !== 'only_one_format_reportable') return
    expect(v.format).toBe('Common')
  })

  it('a single reportable format is not called a finding', () => {
    // "Your best format is your only format" is a tautology wearing an
    // insight's clothes.
    const one = run([10, 20, 30, 40, 50], 'Only')
    expect(rankFormatsByOutcome(one.ps, one.gens).kind).toBe('only_one_format_reportable')
  })

  it('a post nobody has reported on is NOT a zero-view post', () => {
    // ⚠️ ABSENT IS NOT ZERO. Coercing null to 0 would punish every format whose
    // posts the creator simply has not filled in yet — and it would do it
    // silently, by moving a median.
    const withNulls = run([5000, 5000, 5000, 5000, 5000, null, null, null], 'Mixed')
    const v = rankFormatsByOutcome(withNulls.ps, withNulls.gens)
    expect(v.kind).toBe('only_one_format_reportable')
    const solo = rankFormatsByOutcome(withNulls.ps, withNulls.gens, 5)
    expect(solo.kind).toBe('only_one_format_reportable')
    // The five real posts are the population; the three nulls are not counted
    // as videos that got nothing.
    const both = rankFormatsByOutcome(
      [...withNulls.ps, ...run([1, 1, 1, 1, 1], 'Other', 200).ps],
      [...withNulls.gens, ...run([1, 1, 1, 1, 1], 'Other', 200).gens],
    )
    expect(both.kind).toBe('ranked')
    if (both.kind !== 'ranked') return
    expect(both.formats.find((f) => f.format === 'Mixed')!.posts).toBe(5)
    expect(both.formats.find((f) => f.format === 'Mixed')!.medianViews).toBe(5000)
  })

  it('explains its silence rather than returning an empty list', () => {
    // An empty array and "not enough data yet" are different facts, and only
    // one of them means the creator has learned something.
    expect(rankFormatsByOutcome([], []).kind).toBe('no_posts_with_views')
    const thin = run([1, 2], 'Thin')
    const v = rankFormatsByOutcome(thin.ps, thin.gens)
    expect(v.kind).toBe('no_format_reaches_minimum')
    if (v.kind !== 'no_format_reaches_minimum') return
    expect(v.best).toBe(2)
    expect(v.needed).toBe(MIN_POSTS_PER_FORMAT)
  })

  it('is stable across identical reads', () => {
    // A ranking that reshuffles between two reads of the same history reads as
    // new information and is not.
    const a = run([100, 100, 100, 100, 100], 'Bravo')
    const b = run([100, 100, 100, 100, 100], 'Alpha', 300)
    const one = rankFormatsByOutcome([...a.ps, ...b.ps], [...a.gens, ...b.gens])
    const two = rankFormatsByOutcome([...b.ps, ...a.ps], [...b.gens, ...a.gens])
    expect(one).toEqual(two)
  })

  it('refuses to print a multiple it cannot mean', () => {
    // "Infinity times better" is not a sentence anyone can act on, and it is
    // the one number a creator would remember off the panel.
    expect(outcomeSpread([
      { format: 'A', posts: 5, medianViews: 900 },
      { format: 'B', posts: 5, medianViews: 0 },
    ])).toBeNull()
    expect(outcomeSpread([
      { format: 'A', posts: 5, medianViews: 2400 },
      { format: 'B', posts: 5, medianViews: 1000 },
    ])).toBe(2.4)
  })

  it('ignores a post whose generation is unknown', () => {
    // A post with no generation cannot be attributed to a format. Bucketing it
    // anywhere would put a video the creator wrote by hand into a Twin format's
    // score.
    const solid = run([100, 100, 100, 100, 100], 'Known')
    const orphan: OutcomePost[] = [{ id: 'x', generation_id: null, views: 99999 }]
    const v = rankFormatsByOutcome([...solid.ps, ...orphan], solid.gens)
    expect(v.kind).toBe('only_one_format_reportable')
  })
})
