// THE DEPTH NUMBERS HAD NO HOME, SO EVERY ANSWER EXPIRED IN A TRANSCRIPT.
//
// ⚠️ "How many voices clear the substance floor", "how many have a month of
// runway", "which of the seven questions does nobody's speech answer", "how much
// of the store is caption filler" — each of those has been answered by composing
// joins under pressure, and each answer was gone by the next session. The four
// migrations before this one (0214 version stamp, 0215 spend ledger, 0216
// evidence and question id) were built to make a decision possible; without a
// place to read them from, the decision still takes a hand-written query.
//
// ⚖️ AND THE VIEW HAS A CODE READER IN THE SAME CHANGE. A view nobody reads is
// the defect this repo keeps shipping — `openingSetFor`, `knowledgePromptLine`,
// `commentsDatasetUrl`. `admin-metrics` already serves `metrics_overview` the
// same way, so the panel lands on a surface that exists.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SUBSTANCE_KINDS } from '../knowledgeSelection'
import { TARGETED_QUESTION_IDS } from '../../../../worker/src/targetedQuestions'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIG = readFileSync(
  join(REPO, 'supabase/migrations/0217_nobody_could_see_which_creators_had_nothing_to_say.sql'), 'utf8')
const ADMIN = readFileSync(join(REPO, 'supabase/functions/admin-metrics/index.ts'), 'utf8')

describe('the view answers the questions that keep being asked by hand', () => {
  it('one row per voice, not one headline row', () => {
    // ⚠️ A MEAN WOULD HIDE THE 19 VOICES THAT NEED WORK. The remedy is per
    // creator — re-mine this one, ask that one a question — so the shape has to
    // be "which creators", which is what `metrics_overview` cannot be.
    expect(MIG).toMatch(/from public\.brand_voices v/)
    expect(MIG).toMatch(/group by v\.id, v\.owner_id, v\.handle, v\.platform, v\.status/)
  })

  it('reads every column the last four migrations added', () => {
    for (const col of ['extractor_version', 'used_count', 'last_used_at', 'question_id', 'evidence']) {
      expect(MIG, `${col} is not read, so its migration is still unanswerable`).toContain(col)
    }
  })

  it('a LEFT join, so a voice with no knowledge appears as a zero', () => {
    // ⚠️ THE VOICES WITH NOTHING ARE THE POINT. An inner join would omit exactly
    // the creators the view exists to find — the same shape as the cohort query
    // that needed `coalesce(max(...), 0)` because NULL < N is not true.
    expect(MIG).toMatch(/left join public\.creator_knowledge k on k\.voice_id = v\.id/)
    expect(MIG).toMatch(/coalesce\(max\(k\.extractor_version\), 0\)/)
  })

  it('the substance set matches the selector\'s, or the column means nothing', () => {
    const m = MIG.match(/where k\.kind in \(([^)]*)\)/)
    expect(m, 'the substance filter moved — re-anchor this').not.toBeNull()
    const listed = [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    // ⚠️ SQL CANNOT IMPORT THE SET, so this is a deliberate duplicate — and a
    // duplicate is only safe while something compares them. `rows_substance`
    // counting a different set from the one the selector reserves would make the
    // one column that says "can a script be BUILT from this" quietly wrong.
    expect([...listed].sort()).toEqual([...SUBSTANCE_KINDS].sort())
  })

  it('counts her own stored speech, which is what a re-mine can read', () => {
    expect(MIG).toMatch(/t\.subject = 'own'/)
    expect(MIG).toMatch(/own_transcript_chars/)
  })

  it('never supplied is counted, because rows_total cannot say what is spent', () => {
    expect(MIG).toMatch(/count\(k\.id\) filter \(where coalesce\(k\.used_count, 0\) = 0\)\s+as rows_never_supplied/)
  })

  // ⚠️ A VIEW INHERITS NO RLS FROM THE TABLES UNDER IT. This one crosses
  // creators, so one creator reading another's row counts is a leak.
  it('is service role only, like metrics_overview', () => {
    expect(MIG).toMatch(/revoke all on public\.creator_knowledge_coverage from anon, authenticated/)
    expect(MIG).toMatch(/grant select on public\.creator_knowledge_coverage to service_role/)
    expect(MIG).not.toMatch(/grant select on public\.creator_knowledge_coverage to authenticated/)
  })
})

describe('the view has a reader, in the same change', () => {
  const code = ADMIN.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

  it('admin-metrics reads it', () => {
    expect(code).toMatch(/admin\.from\('creator_knowledge_coverage'\)/)
    expect(code).toMatch(/knowledge_coverage: coverage\.error \? null : \(coverage\.data \?\? \[\]\)/)
  })

  it('thinnest first, because the list is a worklist', () => {
    expect(code).toMatch(/\.order\('rows_substance', \{ ascending: true \}\)/)
    expect(code).toMatch(/\.limit\(100\)/)
  })

  // ⚖️ AN UNAPPLIED VIEW MUST COST ONE PANEL, NEVER EVERY METRIC — and "we could
  // not read it" must not render as "no creator has any knowledge", which is the
  // same number this view exists to find honestly.
  it('a failed read is null rather than an empty list, and never fails the call', () => {
    expect(code).toMatch(/if \(coverage\.error\) \{/)
    expect(ADMIN).toMatch(/event: 'knowledge_coverage_unavailable'/)
    const after = code.slice(code.indexOf('if (coverage.error) {'))
    expect(after.slice(0, after.indexOf('}'))).not.toMatch(/return json\(\{ error/)
  })
})

describe('the question bank the view counts is the one that exists', () => {
  it('there are ten ids to be answered, which bounds questions_answered', () => {
    expect(TARGETED_QUESTION_IDS).toHaveLength(10)
    expect(MIG).toMatch(/count\(distinct k\.question_id\)\s+as questions_answered/)
  })
})
