// NOTHING TWIN HAS EVER WRITTEN HAS AN OUTCOME.
//
// ⚠️ MEASURED, 2026-09-09: 85 generations, and `post_outcome_observations`
// holds ZERO rows. So every ranking in the product — which references to
// surface, which angles to offer — rests on what creators CLICK, which measures
// what looks appealing in a gallery and not what became a video.
//
// ⚖️ THE ROW MUST BE OPENED AT GENERATION TIME OR NOT AT ALL. The context it
// freezes exists for the duration of one request and is then discarded; a
// column added in three months can be backfilled with nothing, and the 85 rows
// already written are permanently unattributable.
//
// ⚠️⚠️ AND THE THREE-STATE `was_filmed` IS THE WHOLE POINT. `false` means she
// looked at the script and did not film it — the ONLY negative signal in this
// product, because everything else measures enthusiasm at the moment of
// clicking and nothing measures regret. A boolean defaulting to false records
// every unanswered script as a rejection and drowns the real ones.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIG = readFileSync(
  join(REPO, 'supabase/migrations/0191_no_video_twin_wrote_has_an_outcome.sql'), 'utf8')
const EDGE = readFileSync(
  join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MATRIX = readFileSync(join(REPO, '.github/workflows/staging-integration.yml'), 'utf8')

/** Whole-line comments dropped, so prose NAMING a column cannot pass for the
 *  column itself — and nothing after `--`/`//` on a code line is removed. */
const codeOnly = (s: string, marker: string) =>
  s.split('\n').filter((l) => !new RegExp(`^\\s*(${marker}|\\*|/\\*)`).test(l)).join('\n')

const MIG_CODE = codeOnly(MIG, '--')
const EDGE_CODE = codeOnly(EDGE, '//')

describe('the answer she has not given is not an answer', () => {
  it('was_filmed is nullable and carries no default', () => {
    // ⚠️ EITHER `not null` OR A `default` COLLAPSES "declined" INTO "not asked".
    expect(MIG_CODE).toMatch(/was_filmed boolean,/)
    expect(MIG_CODE).not.toMatch(/was_filmed boolean[^,\n]*not null/i)
    expect(MIG_CODE).not.toMatch(/was_filmed boolean[^,\n]*default/i)
  })

  it('so is was_published, and so are the view counts', () => {
    // Absent is not zero: a video with 0 views at 24h is a finding; a video
    // nobody measured is not.
    for (const col of ['was_published boolean', 'views_24h integer', 'views_7d integer']) {
      expect(MIG_CODE).toContain(`${col},`)
      expect(MIG_CODE).not.toMatch(new RegExp(`${col}[^,\\n]*(not null|default)`, 'i'))
    }
  })

  it('and the table says out loud what false means', () => {
    // ⚖️ IN THE MIGRATION ITSELF, so a future reader meets it before the data.
    // ⚠️ ASSERTED ON THE COLUMN COMMENT, NOT THE TABLE COMMENT. The table
    // comment says the same thing, but SQL string concatenation splits it across
    // two literals — "the only negative " + "signal in the product" — so a
    // phrase match on the file is testing the line breaks, not the sentence.
    expect(MIG).toMatch(/comment on column public\.generation_outcomes\.was_filmed/i)
    expect(MIG).toMatch(/only measure of regret/i)
  })
})

describe('the caveat travels with the table', () => {
  it('warns that thin data is not a finding', () => {
    // ⚠️ AT ~2.7 GENERATIONS A DAY this needs months. Written into the table
    // comment so it cannot be separated from the rows it qualifies.
    expect(MIG).toMatch(/comment on table public\.generation_outcomes/i)
    expect(MIG).toMatch(/state\s*'?\s*the sample size|sample size/i)
  })
})

describe('the row is opened at generation time, because it cannot be opened later', () => {
  it('is inserted where the generation is created', () => {
    expect(EDGE_CODE).toMatch(/from\('generation_outcomes'\)/)
    expect(EDGE_CODE).toMatch(/generation_id: gen\.id/)
  })

  it('never fails the build, because the script is already paid for', () => {
    // ⚠️ THE WINDOW ENDS AT THE INSERT'S OWN `.then`, not at an arbitrary
    // character count. A wider slice runs into the idempotency race handler
    // below, which throws legitimately — so the first version of this test was
    // reading unrelated code and failing on it.
    const at = EDGE_CODE.indexOf("from('generation_outcomes')")
    const end = EDGE_CODE.indexOf("outcome row not opened:", at)
    expect(end).toBeGreaterThan(at)
    const block = EDGE_CODE.slice(at, end)
    // A warning, never a throw — same severity as `generation_choices`.
    expect(EDGE_CODE.slice(at)).toMatch(/console\.warn\('outcome row not opened:/)
    expect(block).not.toMatch(/\bthrow\b/)
  })

  it('freezes the niche rather than leaving it to be joined later', () => {
    const at = EDGE_CODE.indexOf("from('generation_outcomes')")
    const block = EDGE_CODE.slice(at, at + 2200)
    expect(block).toMatch(/niche:/)
    // ⚖️ AND IT DOES NOT DEFAULT. 'unknown' would aggregate as though it were
    // an answer, which is the defect `isConclusive` exists to prevent.
    expect(block).not.toMatch(/niche:[^,]*'unknown'/)
  })

  it('does not duplicate what generation_choices already owns', () => {
    // ⚖️ ONE FACT, ONE HOME. Two copies of `selected_goal` is two things that
    // can disagree, and an analysis would have to pick a winner.
    const at = EDGE_CODE.indexOf("from('generation_outcomes')")
    const block = EDGE_CODE.slice(at, at + 2200)
    expect(block).not.toMatch(/selected_goal|selected_focus|reference_use/)
  })
})

describe('the migration is exercised rather than assumed', () => {
  it('is APPLIED by the staging matrix, never excluded', () => {
    // ⚠️ STAGING CANNOT EXERCISE WHAT IT HAS NOT GOT, and the gate goes green
    // anyway — which is how six migrations reached main unapplied.
    expect(MATRIX).toMatch(/0191_no_video_twin_wrote_has_an_outcome/)
    const excludedAt = MATRIX.indexOf('EXCLUDED')
    const appliedAt = MATRIX.indexOf('0191_no_video_twin_wrote_has_an_outcome')
    expect(appliedAt).toBeGreaterThan(-1)
    if (excludedAt > -1) {
      const after = MATRIX.slice(excludedAt, excludedAt + 4000)
      expect(after).not.toMatch(/0191_no_video_twin_wrote_has_an_outcome/)
    }
  })

  it('grants select only, and takes the default writes back', () => {
    // A table that records what happened must not be writable by the people it
    // records. `grant select` ADDS to Supabase's default ALL rather than
    // replacing it — verified on production for 0137.
    expect(MIG_CODE).toMatch(/grant select on public\.generation_outcomes to authenticated/)
    expect(MIG_CODE).toMatch(/revoke insert, update, delete, truncate on public\.generation_outcomes from authenticated/)
    expect(MIG_CODE).toMatch(/revoke all on public\.generation_outcomes from anon/)
    expect(MIG_CODE).not.toMatch(/for insert to authenticated/)
  })
})
