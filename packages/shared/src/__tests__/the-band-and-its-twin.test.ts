// ONE BAND RULE, TWO IMPLEMENTATIONS, EXECUTED SIDE BY SIDE.
//
// ⚠️ 0191 LISTED FOUR OUTCOME DIMENSIONS THAT EXIST "ONLY AS PROSE INSIDE THE
// PROMPT TEXT" and refused to add columns nothing writes. This is the first to
// become a value, and it needed no new input: the handler already loads the
// creator's brand_voices row, and the follower count is on it. 0191's own note
// said the count "is not carried into the request" — true, and the wrong place
// to look, because asking a client for a fact the server holds is how a
// derivable fact becomes a parameter some caller omits.
//
// ⚖️ MEASURED COVERAGE BEFORE BUILDING: of 53 voices, 41 carry a `followers`
// key and only 20 a non-zero value. So the column is NULL on about three
// generations in five — the honest outcome, not a defect. NULL means the scan
// never produced a count, which is a different fact from a small account.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { stageBandOf } from '../corpus/facets'

const EDGE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline(): (f: unknown) => string | null {
  const start = EDGE.indexOf('function followerBandInline')
  const end = EDGE.indexOf('async function recordWhatWasChosen')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(
    EDGE.slice(start, end) + '\nreturn followerBandInline',
    { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(js)() as (f: unknown) => string | null
}
const inline = loadInline()

describe('the two band readers agree on every boundary', () => {
  const CASES: unknown[] = [
    // The boundaries themselves, from both sides — where an off-by-one lives.
    0, 1, 999, 1_000, 1_001, 9_999, 10_000, 10_001,
    99_999, 100_000, 100_001, 5_000_000,
    // And the shapes a scan actually stores.
    '0', '999', '1000', '250000', null, undefined, '', 'not a number',
    -1, -0.5, NaN, Infinity, 1.5, {}, [], true,
  ]
  for (const f of CASES) {
    it(`agrees on ${JSON.stringify(f) ?? String(f)}`, () => {
      expect(inline(f)).toBe(stageBandOf(f))
    })
  }

  it('the table covers every band, or a mirror that always returns null passes', () => {
    const got = new Set(CASES.map((f) => stageBandOf(f)).filter((b) => b !== null))
    expect(got).toEqual(new Set(['under_1k', '1k_10k', '10k_100k', 'over_100k']))
  })

  it('and it covers null too — absent is not a band', () => {
    expect(stageBandOf(null)).toBeNull()
    expect(inline(null)).toBeNull()
  })
})

describe('the value reaches the row', () => {
  const code = EDGE.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')
      && !l.trim().startsWith('/*')).join('\n')

  it('every call site computes it — a second one added later must too', () => {
    // ⚠️ THERE ARE TWO CALL SITES (the normal path and the rescue path), and a
    // dimension recorded on one of them is a column that lies by omission.
    //
    // ⚠️ COUNTING WAS THE FIRST DRAFT AND IT WAS WRONG: `creatorStageBand:`
    // appears three times, because the INTERFACE declares it too, so a count
    // compared passes against declaration-plus-passes. Each call site is now
    // checked for the field inside its own argument object.
    const calls = [...code.matchAll(/recordWhatWasChosen\(admin, \{/g)]
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) {
      const args = code.slice(c.index!, c.index! + 1200)
      const close = args.indexOf('})')
      expect(close).toBeGreaterThan(-1)
      expect(args.slice(0, close)).toMatch(/creatorStageBand:/)
    }
  })

  it('it is read from the voice the handler already loaded, not from the request', () => {
    expect(code).toMatch(/followerBandInline\(\s*\(voice\?\.stats/)
    // A request field would make it omittable by any caller.
    expect(code).not.toMatch(/body\.(creator_stage_band|creatorStageBand|followers)/)
  })

  it('and it is inserted into generation_outcomes', () => {
    expect(code).toMatch(/creator_stage_band:\s*input\.creatorStageBand/)
  })
})

describe('the migration admits exactly these bands', () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
      'supabase', 'migrations', '0203_the_stage_band_was_prose_and_the_scan_had_it.sql'), 'utf8')

  it('the CHECK admits EXACTLY the bands the rule cuts, and no fifth', () => {
    // ⚠️ "CONTAINS ALL FOUR" WAS THE FIRST DRAFT AND A FIFTH BAND WALKED IN.
    // The migration's own claim is that a band cannot arrive from a drifting
    // mirror without a migration saying so — so the test has to compare the
    // SET, not check for presence.
    const clause = sql.slice(sql.indexOf('creator_stage_band is null'))
    const admitted = new Set(
      [...clause.slice(0, clause.indexOf(')')).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]))
    expect(admitted).toEqual(new Set(['under_1k', '1k_10k', '10k_100k', 'over_100k']))
    expect(sql).toMatch(/creator_stage_band is null/)
  })

  it('it drops the old constraint before adding its own, so it re-runs', () => {
    const drop = sql.indexOf('drop constraint if exists generation_outcomes_stage_band_known')
    const add = sql.indexOf('add constraint generation_outcomes_stage_band_known')
    expect(drop).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(drop)
  })

  it('and it does NOT add the three dimensions that have no writer', () => {
    // 0191's rule: a column nobody writes is the same defect as a field nobody
    // reads, pointed the other way.
    expect(sql).not.toMatch(/add column if not exists (door|hook_shape|angle_type)\b/)
  })
})
