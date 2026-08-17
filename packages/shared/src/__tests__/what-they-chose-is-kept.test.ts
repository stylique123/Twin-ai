// FORTY-ONE GENERATIONS, ZERO RECORDS OF WHAT ANYBODY CHOSE.
//
// ⚠️ MEASURED ON PRODUCTION. The goal, focus and reference preference reach the
// writer and are then gone — absent from `generations`, from `blueprint` and from
// `beat_audit`, all three checked. So "does anyone ever pick `authority`?" has no
// answer, and neither does "how often is `sell` chosen with nothing to sell",
// which is the rate a pending safety fix needs before it can be built on evidence
// rather than a guess.
//
// ⚖️ THESE OPTIONS ARE SUPPOSED TO DRIVE Gallery ranking, the Creative Decision
// Plan, script structure and CTA behaviour. Trimming or expanding them without
// usage data is designing from what we imagine people click.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
/** The migration that CREATES the table — matched on what it does, not on what
 *  it is called.
 *
 *  ⚠️ MATCHING THE FILENAME FOUND THE WRONG FILE. `0014_generation_choices.sql`
 *  has existed for months and creates no table at all — it adds `selected_hook`
 *  and `edit_style` columns to `generations`. A name search returned it first and
 *  every assertion below failed against a file that was never the subject.
 *
 *  ⚖️ AND IT RAISED A REAL QUESTION BEFORE IT WAS A TEST BUG: if a table of that
 *  name already existed, `create table if not exists` would be a silent no-op and
 *  the insert would fail on missing columns in production. Confirmed against the
 *  live database that no such table exists. */
const MIG = (() => {
  const dir = join(REPO, 'supabase/migrations')
  const f = readdirSync(dir).filter((x) => x.endsWith('.sql'))
    .find((x) => /create table if not exists public\.generation_choices/
      .test(readFileSync(join(dir, x), 'utf8')))
  expect(f, 'no migration creates generation_choices').toBeTruthy()
  return readFileSync(join(dir, f!), 'utf8')
})()

describe('the choice is written where it can be counted', () => {
  it('records one row per generation', () => {
    expect(EDGE).toMatch(/from\('generation_choices'\)\s*\n?\s*\.insert\(/)
    // ⚠️ A RETRY MUST NOT DOUBLE-COUNT. Every question this table answers is a
    // count, and a duplicated row is a wrong answer rather than a tidy-up job.
    expect(MIG).toMatch(/unique \(generation_id\)/)
  })

  it('reads the CHOICE, not the directive that shares its name', () => {
    // ⚠️ THE TRAP THAT NEARLY SHIPPED. In the scope where this insert lives,
    // `goal` is `intent.goalDirective` — a paragraph of model instructions — so
    // `selected_goal: goal` would have filled the table with essays and made
    // every count meaningless. The name RESOLVES, so the parse check is silent;
    // only reading the surrounding scope catches it.
    const region = EDGE.slice(EDGE.indexOf("from('generation_choices')"))
      .slice(0, 1400)
    expect(region).toMatch(/selected_goal: typeof body\.goal === 'string'/)
    expect(region).not.toMatch(/selected_goal: goal\b/)
    expect(region).not.toMatch(/selected_focus: focus\b/)
  })

  it('uses the field name the wire actually sends', () => {
    // ⚖️ The request carries `reference_use`; the compiler takes `referenceUse`.
    // Reading the camelCase name off the body yields undefined forever — a column
    // that is always null and looks like "nobody sets a preference".
    expect(EDGE).toMatch(/reference_use: typeof body\.reference_use === 'string'/)
  })

  it('cannot fail the paid generation it runs inside', () => {
    // ⚖️ This is an observation about a script that already succeeded and was
    // already charged for. Losing the observation is a gap in analytics; throwing
    // here would lose the creator their script.
    const region = EDGE.slice(EDGE.indexOf("from('generation_choices')"))
      .slice(0, 1800)
    expect(region).toMatch(/choices not recorded/)
    expect(region).not.toMatch(/throw |return json\(/)
  })

  it('stores an unanswered question as null rather than a default', () => {
    // ⚠️ A creator who picked no goal is a real case — the silence the intent
    // compiler treats as "no directive" — and defaulting it would invent a
    // choice, which is the one thing this table must never do.
    expect(EDGE).toMatch(/\.trim\(\)\.slice\(0, 64\) : null/)
  })
})

describe('what the table refuses', () => {
  it('is readable by its owner and writable by nobody', () => {
    // ⚠️ A CLIENT THAT COULD INSERT HERE COULD REPORT CHOICES NOBODY MADE, and
    // the entire value of the table is that it records what actually happened.
    expect(MIG).toMatch(/enable row level security/)
    expect(MIG).toMatch(/for select to authenticated/)
    expect(MIG).not.toMatch(/for insert to authenticated/)
    expect(MIG).toMatch(/grant select on public\.generation_choices to authenticated/)
    expect(MIG).not.toMatch(/grant insert|grant update|grant all/)
  })

  it('takes its rows with the video when a video is deleted', () => {
    // ⚖️ "Delete a video deletes it" is an existing promise, and a choice about a
    // deleted video is not a fact anybody can use.
    expect(MIG).toMatch(/references public\.generations\(id\) on delete cascade/)
  })

  it('lets a product be absent, because most videos promote nothing', () => {
    expect(MIG).toMatch(/selected_product_id uuid references public\.product_entities\(id\) on delete set null/)
  })

  it('does not claim to record a default that does not exist', () => {
    // ⚖️ `changed_from_default` WAS ASKED FOR AND IS DELIBERATELY ABSENT. Twin
    // does not pre-select or recommend a goal — the chips start empty — so a
    // column recording "changed from nothing" would answer a different question
    // than the one intended and would read as evidence about a default that does
    // not exist. It belongs with the change that introduces one.
    expect(MIG).not.toMatch(/changed_from_default [a-z]/)
    expect(MIG).toMatch(/NO `changed_from_default` COLUMN/)
  })
})

describe('the write grants that arrive without being asked for', () => {
  it('revokes the defaults Supabase hands out on a new table', () => {
    // ⚠️ MEASURED ON PRODUCTION IMMEDIATELY AFTER CREATING IT: `authenticated`
    // held INSERT, UPDATE, DELETE and TRUNCATE. `grant select` ADDS to the
    // default privileges rather than replacing them, so a migration that only
    // grants what it wants leaves everything it did not mention in place.
    //
    // ⚖️ RLS already denied those writes, so this is defence in depth — but a
    // table-level write grant plus one permissive policy added later is a
    // writable audit table, and this one exists to record what actually
    // happened. `generations` sets the precedent: revoke, then re-grant.
    expect(MIG).toMatch(/revoke insert, update, delete, truncate on public\.generation_choices from authenticated/)
    expect(MIG).toMatch(/revoke all on public\.generation_choices from anon/)
  })

  it('grants back only reading', () => {
    expect(MIG).toMatch(/grant select on public\.generation_choices to authenticated/)
    expect(MIG).not.toMatch(/grant (insert|update|delete|all) on public\.generation_choices/)
  })
})
