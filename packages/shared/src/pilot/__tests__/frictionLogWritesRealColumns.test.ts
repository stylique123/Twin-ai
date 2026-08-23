// THE ENDPOINT MAY ONLY WRITE COLUMNS THAT EXIST, AND THE CLIENT MAY ONLY SEND
// KINDS THE CONSTRAINT ALLOWS.
//
// ⚠️ EVERY FILE INVOLVED WAS INDIVIDUALLY CORRECT. The table was well-formed,
// the endpoint's insert was well-formed, the client's calls were well-formed —
// and the friction log recorded nothing for its entire existence, because
// pilot-review inserts `reviewer` and `detail` into a table that has neither,
// and the browser swallows the 500. Only the PAIR is wrong, so only a check that
// reads both can see it. That is the whole reason this file exists.
//
// ⚠️ AND IT IS WHY A TWO-HOUR OUTAGE COULD NOT BE DIAGNOSED. On 2026-08-23
// Finish & Lock was broken for every reviewer and there was no record of what
// anyone clicked. An empty table looks exactly like a table nobody used.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(__dirname, '..', '..', '..', '..', '..')
const MIGRATIONS = join(REPO, 'supabase', 'migrations')

/** Every migration, oldest first — later ones amend earlier ones, so the
 *  current shape is the whole directory read in order, never one file. */
const ALL_SQL = readdirSync(MIGRATIONS).sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n')

const ENDPOINT = readFileSync(
  join(REPO, 'supabase', 'functions', 'pilot-review', 'index.ts'), 'utf8')
const REVIEW_PAGE = readFileSync(
  join(REPO, 'apps', 'web', 'src', 'pages', 'PilotVisualReview.tsx'), 'utf8')
const PILOT_CORE = readFileSync(join(REPO, 'scripts', 'pilot-core.mjs'), 'utf8')

/** ⚠️ COMMENTS STRIPPED FIRST. This very migration explains the bug by quoting
 *  the wrong column names, so a raw scan would match the EXPLANATION. */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/^\s*--.*$/gm, ' ')

const SQL = strip(ALL_SQL)
const CODE = strip(ENDPOINT)
const PAGE = strip(REVIEW_PAGE)
const CORE = strip(PILOT_CORE)

/** Columns the table actually has: those in the CREATE plus every ADD COLUMN. */
function columnsOfEventsTable(): Set<string> {
  const create = SQL.match(
    /create table if not exists public\.visual_pilot_events\s*\(([\s\S]*?)\n\);/)
  expect(create, 'visual_pilot_events must be created somewhere').toBeTruthy()
  const cols = new Set<string>()
  for (const line of create![1].split('\n')) {
    const m = line.match(/^\s*([a-z_]+)\s+[a-z]/)
    if (m && !['constraint', 'check', 'primary', 'unique', 'foreign'].includes(m[1])) cols.add(m[1])
  }
  for (const m of SQL.matchAll(
    /alter table public\.visual_pilot_events\s*\n?\s*add column if not exists ([a-z_]+)/g)) {
    cols.add(m[1])
  }
  return cols
}

describe('the friction log can actually be written to', () => {
  it('every column the endpoint inserts exists on the table', () => {
    const insert = CODE.match(
      /from\('visual_pilot_events'\)\.insert\(\{([\s\S]*?)\}\)/)
    expect(insert, 'pilot-review must insert into visual_pilot_events').toBeTruthy()
    const written = [...insert![1].matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1])
    expect(written.length).toBeGreaterThan(0)

    const columns = columnsOfEventsTable()
    for (const col of written) {
      // ⚠️ THIS IS THE ASSERTION THAT WAS MISSING. `reviewer` and `detail` both
      // failed here, on every insert, silently, for the life of the table.
      expect(columns.has(col), `endpoint writes "${col}" — not a column of visual_pilot_events`).toBe(true)
    }
  })

  it('every kind the review page sends is allowed by the constraint', () => {
    const allowed = new Set<string>()
    // The LAST kind-check wins: a later migration may replace an earlier one.
    const checks = [...SQL.matchAll(/kind in \(([\s\S]*?)\)/g)]
    expect(checks.length).toBeGreaterThan(0)
    for (const m of checks.at(-1)![1].matchAll(/'([a-z_]+)'/g)) allowed.add(m[1])

    const sent = new Set<string>()
    for (const m of PAGE.matchAll(/logPilotEvent\([^,]+,\s*'([a-z_]+)'/g)) sent.add(m[1])
    // The label call passes a ternary rather than a literal; those three kinds
    // are named in it and must be covered too.
    for (const k of ['label', 'relabel', 'skip']) if (PAGE.includes(`'${k}'`)) sent.add(k)

    expect(sent.size).toBeGreaterThan(3)
    for (const kind of sent) {
      // ⚠️ 'jump' FAILED HERE. The picker has always logged it; the constraint
      // never listed it, so those rows were rejected even once the columns were
      // right.
      expect(allowed.has(kind), `page sends kind "${kind}" — the check constraint forbids it`).toBe(true)
    }
  })
})

// ⚠️ THE SAME DEFECT, ONE TABLE OVER, AND IT COST THE OWNER A FAILED START.
// Pressing Start on the with-speech cohort returned "could not freeze the pilot
// sample: new row for relation visual_pilot_references violates check constraint
// visual_pilot_references_stratum_check". 0163 wrote the strata when there was
// ONE cohort; #475 added a second whose bands are speech_short / speech_long and
// moved everything except that line.
//
// ⚖️ THE NO-SPEECH RUN PASSING IS WHAT HID IT. A constraint that has only ever
// seen the population it was written for looks like a working constraint. So
// this reads every band the code can EMIT and asserts the constraint ADMITS it,
// rather than checking the one path that happens to be exercised.
describe('every cohort’s strata are admitted by the table', () => {
  it('COHORT_BANDS and the stratum constraint agree', () => {
    const spec = CORE.match(/export const COHORT_BANDS = Object\.freeze\(\{([\s\S]*?)\}\)/)
    expect(spec, 'COHORT_BANDS must be findable in pilot-core.mjs').toBeTruthy()
    const emitted = new Set<string>()
    for (const m of spec![1].matchAll(/bands:\s*\[([^\]]*)\]/g)) {
      for (const b of m[1].matchAll(/'([a-z_]+)'/g)) emitted.add(b[1])
    }
    // Both cohorts, two bands each: if this drops to one cohort's worth the
    // regex has stopped matching and the assertion below is vacuous.
    expect(emitted.size).toBeGreaterThanOrEqual(4)

    const checks = [...SQL.matchAll(/stratum in \(([\s\S]*?)\)/g)]
    expect(checks.length).toBeGreaterThan(0)
    const allowed = new Set<string>()
    for (const m of checks.at(-1)![1].matchAll(/'([a-z_]+)'/g)) allowed.add(m[1])

    for (const band of emitted) {
      expect(allowed.has(band), `pilot-core can emit stratum "${band}" — the check constraint forbids it`).toBe(true)
    }
  })
})
