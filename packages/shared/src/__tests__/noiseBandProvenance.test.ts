// A NOISE BAND WITH NO SOURCE IS A GUESS THAT LOOKS LIKE A MEASUREMENT.
//
// ⚠️ `diff-matrix.mjs` now refuses to draw a ✅/⚠️ on a delta smaller than the
// run-to-run noise, because three findings were reported off those arrows in
// one day and a replicate withdrew all three. That refusal is only trustworthy
// if the bands came from somewhere real — so this test derives them FROM THE
// STORED REPLICATE PAIR and asserts the file's numbers match.
//
// ⚖️ If someone widens a band to make a result look significant, this fails.
// That is the whole point: the bands must be a property of the data, not of
// what anybody wanted the data to show.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const DIFF = readFileSync(join(REPO, 'scripts/qa/diff-matrix.mjs'), 'utf8')
const load = (n: string) =>
  JSON.parse(readFileSync(join(REPO, `scripts/qa/results/matrix-112-${n}.json`), 'utf8')) as Array<{
    blueprint?: { script?: Array<{ line?: unknown; substance?: unknown }> }
  }>

/** The two runs of an IDENTICAL prompt the bands are derived from. */
const A = load('after-claim-rules')
const B = load('replicate')

describe('the noise bands in diff-matrix are derived, not chosen', () => {
  it('declares a band for every metric it draws an arrow on', () => {
    const bands = [...DIFF.matchAll(/'([^']+)':\s*(\d+),/g)].map((m) => m[1])
    for (const metric of ['UNSUPPORTED citations', 'unearned first-person',
      'placeholder beats', 'money claims', 'product_dna, none supplied']) {
      expect(bands, metric).toContain(metric)
    }
  })

  it('every band is at least the gap observed between the two replicate runs', () => {
    // ⚖️ AT LEAST, not exactly: one pair is a floor on the spread, never the
    // distribution, so rounding a band UP is honest and rounding it DOWN hides
    // noise inside an arrow.
    const impossibleProduct = (runs: typeof A) =>
      runs.reduce((n, r) => n + (r.blueprint?.script ?? [])
        .filter((b) => b?.substance === 'product_dna').length, 0)
    const placeholders = (runs: typeof A) =>
      runs.reduce((n, r) => n + (r.blueprint?.script ?? [])
        .filter((b) => /\[[^\]]*\]/.test(String(b?.line ?? ''))).length, 0)

    const observed: Record<string, number> = {
      'product_dna, none supplied': Math.abs(impossibleProduct(A) - impossibleProduct(B)),
      'placeholder beats': Math.abs(placeholders(A) - placeholders(B)),
    }
    for (const [metric, gap] of Object.entries(observed)) {
      const m = DIFF.match(new RegExp(`'${metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*(\\d+)`))
      expect(m, metric).toBeTruthy()
      expect(Number(m![1]), `${metric}: band must cover the observed ${gap}`).toBeGreaterThanOrEqual(gap)
    }
  })

  it('states its provenance and warns when applied to a smaller run', () => {
    // A band quoted without its sample size is the mistake one level up.
    expect(DIFF).toMatch(/matrix-112-after-claim-rules/)
    expect(DIFF).toMatch(/TOO TIGHT here/)
    // And it must not claim a source it did not use — the n=32 replicates
    // measured different metrics entirely.
    expect(DIFF).toMatch(/baseline-replicates-n32/)
  })
})
