// A CHECK CONSTRAINT WAS APPLIED TO PRODUCTION AND ITS SQL NEVER REACHED main.
//
// ⚠️ MEASURED 2026-09-14. The production ledger carries
// `0208_four_spellings_two_of_them_the_same_word` (applied 2026-09-13 19:19),
// and `pg_constraint` confirms `ops_events_severity_known` is live:
//   CHECK (severity IS NULL OR severity = ANY ('info','warn','error','critical'))
// The SQL file existed only on an unmerged branch. So main described a database
// that does not exist, and three live inserts in generate-blueprint went on
// writing 'warning' -- a value the database now rejects.
//
// ⚠️⚠️ AND THE REJECTION IS SWALLOWED. Every one of those inserts ends
// `.then(() => {}, () => {})`. A CHECK violation there is not an error anyone
// sees; the row simply never lands. `generation_instrumentation_failed` is one
// of the three, and it exists precisely because "edge logs expire and were
// unreadable when it mattered".
//
// ⚖️ WHAT IS SEEN AND WHAT IS NOT. Seen: the constraint rejects 'warning', and
// the code wrote 'warning'. NOT seen: that an insert was attempted since the
// constraint landed. `generation_rescued` holds 17 rows, all 'warn' (0208's
// backfill rewrote them), newest 2026-09-12 -- BEFORE the constraint. Zero rows
// since is equally consistent with "no rescue occurred" and "every attempt was
// rejected", and this test does not claim to tell them apart.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  allowedFromMigrations, isFixture, severityLiteralsIn, type SeverityLiteral,
} from '../../../../scripts/ci/check_ops_event_severity.mjs'

// ⚠️ PATHS RESOLVE FROM THIS FILE, NOT FROM cwd. The first version read
// 'supabase/migrations' relative to the working directory. That passes when
// vitest is invoked from the repo root and FAILS in CI, where the workspace
// script runs `vitest run` inside packages/shared -- ENOENT on
// generate-blueprint, 462 files green and this one unable even to load. It
// passed locally for the wrong reason. Every other file-reading test in this
// directory resolves from import.meta.url; so does this one now.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIG = join(REPO, 'supabase/migrations')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the repo carries the constraint production is running', () => {
  it('a migration defines ops_events_severity_known', () => {
    const found = allowedFromMigrations(MIG)
    expect(found).not.toBeNull()
    expect(found!.file).toContain('0208')
  })

  it('names exactly the four levels the live constraint names', () => {
    // Read back from pg_constraint on 2026-09-14, not chosen here.
    expect(allowedFromMigrations(MIG)!.allowed.sort())
      .toEqual(['critical', 'error', 'info', 'warn'])
  })

  it('keeps NULL legal, because one writer sends no severity at all', () => {
    // ⚠️ NOT NULL would turn `heartbeat_digest`'s insert into a REJECTED write,
    // and a telemetry write that fails is the defect this all exists to stop.
    // NULL means "the writer did not say", which is not a level.
    const sql = readFileSync(join(MIG, '0208_four_spellings_two_of_them_the_same_word.sql'), 'utf8')
    expect(sql).toMatch(/severity is null/i)
    expect(sql).not.toMatch(/set not null/i)
  })

  it('is re-runnable, so applying it twice is not an error', () => {
    const sql = readFileSync(join(MIG, '0208_four_spellings_two_of_them_the_same_word.sql'), 'utf8')
    expect(sql).toMatch(/drop constraint if exists ops_events_severity_known/i)
  })
})

describe('no writer sends a severity the database rejects', () => {
  const allowed = new Set(allowedFromMigrations(MIG)!.allowed)

  it('generate-blueprint writes only accepted levels', () => {
    const lits = severityLiteralsIn(EDGE)
    expect(lits.length).toBeGreaterThan(0)
    for (const l of lits) expect(allowed.has(l.value)).toBe(true)
  })

  it("the three sites that shipped 'warning' now write 'warn'", () => {
    // Reader-removal: put 'warning' back at any of the three and this fails.
    for (const kind of [
      'empty_voice_scan_enqueued',
      'generation_instrumentation_failed',
      'generation_rescued',
    ]) {
      const at = EDGE.indexOf(`kind: '${kind}'`)
      expect(at, kind).toBeGreaterThan(-1)
      // Bounded to this insert's own object literal; an unbounded search would
      // be satisfied by a neighbouring insert's correct value.
      const block = EDGE.slice(at, at + 400)
      expect(block, kind).toMatch(/severity: 'warn'/)
      expect(block, kind).not.toMatch(/severity: 'warning'/)
    }
  })

  it('finds a literal on a single-line insert as well as a multi-line one', () => {
    // billing-webhook writes both of its inserts on one line each. A scanner
    // that only understood the multi-line shape would report those as absent
    // and pass while they drifted.
    const bw = readFileSync(join(REPO, 'supabase/functions/billing-webhook/index.ts'), 'utf8')
    expect(severityLiteralsIn(bw).map((l: SeverityLiteral) => l.value).sort()).toEqual(['critical', 'warn'])
  })
})

describe('the scanner tells a mention from a write', () => {
  // ⚠️ THIS IS THE CASE THE REPO HAS BEEN BITTEN BY TWICE: a guard that greps
  // source text counted the comment protecting the thing it was checking. There
  // is no such comment in the tree today, so without this fixture the
  // comment-stripping would be an UNVALIDATED defence -- it survived a mutant
  // for lack of a failing case, which is not the same as being right.
  it('ignores a severity named in a whole-line comment', () => {
    // ⚠️ THE COMMENT MUST SIT INSIDE THE INSERT. The scanner reads FORWARD
    // from the table anchor, so a comment ABOVE the anchor is never in scope --
    // a fixture placing it there passes whether the stripping exists or not,
    // and the first version of this test did exactly that. The test was wrong.
    const src = [
      "await admin.from('ops_events').insert({",
      "  kind: 'x',",
      "  // was severity: 'warning' until 0208 landed",
      "  severity: 'warn',",
      '})',
    ].join('\n')
    expect(severityLiteralsIn(src).map((l: SeverityLiteral) => l.value)).toEqual(['warn'])
  })

  it('still sees a write that follows a string containing a slash', () => {
    // ⚠️ Stripping everything after `//` rather than whole comment lines would
    // delete this write, and the guard would stop catching what it is for.
    const src = [
      "await admin.from('ops_events').insert({",
      "  detail: { url: 'https://example.com/a' },",
      "  severity: 'warning',",
      '})',
    ].join('\n')
    expect(severityLiteralsIn(src).map((l: SeverityLiteral) => l.value)).toEqual(['warning'])
  })

  it('does not attribute one insert\'s severity to the insert before it', () => {
    const src = [
      "await admin.from('ops_events').insert({ kind: 'a', severity: 'warn' })",
      "await admin.from('ops_events').insert({ kind: 'b', severity: 'critical' })",
    ].join('\n')
    expect(severityLiteralsIn(src).map((l: SeverityLiteral) => l.value)).toEqual(['warn', 'critical'])
  })

  it('ignores a severity field on a table that is not ops_events', () => {
    // scripts/ci/assert_chrome_exposure.mjs carries `severity: 'low'` on a local
    // object. A scanner without the table anchor would accuse correct code --
    // and a guard that accuses correct code teaches people to ignore it.
    const src = "const report = { severity: 'low', present: false }"
    expect(severityLiteralsIn(src)).toEqual([])
  })
})

describe('the fixture exclusion cannot be widened into a blindfold', () => {
  it('skips test files, so the evidence this guard works is not an accusation', () => {
    expect(isFixture('packages/shared/src/__tests__/x.test.ts')).toBe(true)
    expect(isFixture('worker/src/__tests__/y.ts')).toBe(true)
  })

  it('never skips a path that actually writes to the database', () => {
    // ⚠️ THIS IS THE MUTATION THAT WOULD BE INVISIBLE. Widening the exclusion to
    // cover an edge function or the worker makes the guard report OK while
    // production rejects every row — the same shape as a guard reporting success
    // on the violation it exists to catch.
    for (const p of [
      'supabase/functions/generate-blueprint/index.ts',
      'supabase/functions/billing-webhook/index.ts',
      'worker/src/jobs/assessReference.ts',
      'worker/src/index.ts',
      'scripts/ops/heartbeat.mjs',
    ]) {
      expect(isFixture(p), p).toBe(false)
    }
  })
})

describe('the newest statement of the constraint is the one that counts', () => {
  // ⚠️ ONLY ONE MIGRATION DEFINES THIS CONSTRAINT TODAY, so "last one wins"
  // survived a mutant purely for lack of a failing case — which is not the same
  // as being right. A later migration restating the CHECK is exactly how this
  // column's history goes (0208 itself drops and re-adds it), and reading the
  // OLDER statement would validate against a database that no longer exists.
  const dir = mkdtempSync(join(tmpdir(), 'ops-sev-'))
  const stmt = (levels: string[]) => `alter table public.ops_events
  drop constraint if exists ops_events_severity_known;
alter table public.ops_events
  add constraint ops_events_severity_known check (
    severity is null
    or severity in (${levels.map((l) => `'${l}'`).join(', ')})
  );
`

  beforeAll(() => {
    writeFileSync(join(dir, '0208_first.sql'), stmt(['info', 'warn']))
    writeFileSync(join(dir, '0299_later.sql'), stmt(['info', 'warn', 'error', 'critical']))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('reads the later migration, not the first one it finds', () => {
    const found = allowedFromMigrations(dir)
    expect(found!.file).toBe('0299_later.sql')
    expect(found!.allowed.sort()).toEqual(['critical', 'error', 'info', 'warn'])
  })

  it('is not fooled by the `drop constraint if exists` line above the ADD', () => {
    // ⚠️ AND A MUTANT DISPROVED THE FIRST VERSION OF THIS COMMENT. It claimed
    // anchoring on the constraint NAME alone would find no level list -- but
    // slicing from the drop line still contains the ADD's list further down, so
    // that mutant PASSED. The `add constraint` anchor is therefore defensive
    // with no failing case today, and this test says so rather than asserting a
    // property mutation showed is not load-bearing. What IS asserted is the
    // outcome that matters: the levels read are the ADD's, not something else.
    expect(allowedFromMigrations(dir)!.allowed).toContain('critical')
  })
})
