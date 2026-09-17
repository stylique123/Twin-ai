// EVERY IMPROVEMENT TO THE PROMPT ONLY EVER HELPED THE NEXT CREATOR.
//
// ⚠️ THE DEFECT. `creator_knowledge` has been written by at least four
// materially different extractors and nothing on a row said which. So a creator
// scanned in July carries what July's prompt could ask for, permanently, and no
// query in this database could tell that from a row written this morning. The
// stamp (0214) makes the cohort findable; these tests hold the three rules a
// careless reader of it gets wrong.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  KNOWLEDGE_EXTRACTOR_VERSION, remineCohort,
} from '../knowledgeExtractorVersion'
import type { ExtractorStampedRow } from '../knowledgeExtractorVersion'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const WORKER = readFileSync(join(REPO, 'worker/src/voice.ts'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/owner-console/index.ts'), 'utf8')
const JOB = readFileSync(join(REPO, 'worker/src/jobs/voice.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0214_nothing_recorded_which_extractor_wrote_it.sql'), 'utf8')

const row = (voiceId: string | null, extractorVersion: number | null): ExtractorStampedRow =>
  ({ voiceId, extractorVersion })

describe('the constant is one number in three files', () => {
  // ⚠️ THE WORKER HAS NO RUNTIME DEPENDENCY ON @twinai/shared AND THE EDGE IS
  // DENO, so the number is necessarily duplicated. A duplicated constant is only
  // allowed to exist where a test fails the moment the copies disagree — which
  // is this test, and the reason bumping the version is one edit in three files
  // and a red build until all three agree.
  const declared = (src: string) =>
    Number(/KNOWLEDGE_EXTRACTOR_VERSION\s*=\s*(\d+)/.exec(src)?.[1])

  it('the worker mirror matches the canonical value', () => {
    expect(declared(WORKER)).toBe(KNOWLEDGE_EXTRACTOR_VERSION)
  })

  it('the edge mirror matches the canonical value', () => {
    expect(declared(EDGE)).toBe(KNOWLEDGE_EXTRACTOR_VERSION)
  })

  it('the changelog documents the version that is running', () => {
    // A bare integer is unauditable: the cohort query is only as meaningful as
    // the list saying what each version could ask for.
    const doc = readFileSync(join(REPO, 'packages/shared/src/knowledgeExtractorVersion.ts'), 'utf8')
    expect(doc).toMatch(new RegExp(`^\\s*\\*\\s*${KNOWLEDGE_EXTRACTOR_VERSION}\\s`, 'm'))
  })
})

describe('the stamp actually reaches a row', () => {
  // ⚠️ THE FAILURE THIS CATCHES IS THE ONE 0178 ALREADY PAID FOR: a column added
  // to the table, written by the worker, and dropped on the floor by a merge
  // function that enumerates its columns by hand.
  it('the worker writes extractor_version on every extracted row', () => {
    expect(JOB).toMatch(/extractor_version:\s*KNOWLEDGE_EXTRACTOR_VERSION/)
  })

  it('the merge function carries the column through, in both halves', () => {
    expect(MIGRATION).toMatch(/nullif\(r->>'extractor_version', ''\)::smallint/)
    expect(MIGRATION).toMatch(/insert into public\.creator_knowledge[\s\S]{0,400}extractor_version\)/)
    expect(MIGRATION).toMatch(/extractor_version = greatest\(excluded\.extractor_version/)
  })

  it('the version only ever advances on merge, in either deploy order', () => {
    // `greatest` is NULL-tolerant in Postgres in both directions, which is what
    // makes worker-before-migration and migration-before-worker both safe.
    expect(MIGRATION).toMatch(/greatest\(excluded\.extractor_version, public\.creator_knowledge\.extractor_version\)/)
  })

  it('a worker deployed ahead of the migration loses the stamp, never the batch', () => {
    const INSERT = readFileSync(join(REPO, 'worker/src/knowledgeInsert.ts'), 'utf8')
    // PostgREST rejects the WHOLE batch on ONE unknown column. Dropping the
    // stamp costs a re-scan; dropping the batch costs the scan.
    //
    // ⚠️ THE ASSERTION IS `contains`, NOT AN EXACT SET, AND 0215 IS THE REASON.
    // Written as a literal four-name list, this test failed the moment a FIFTH
    // column — `evidence` — joined the strip list for doing exactly the right
    // thing. A test that has to be edited whenever the correct behaviour is
    // extended is a test that will eventually be deleted instead.
    expect(INSERT).toMatch(/\{ source, cost, consensus, extractor_version,[^}]*\.\.\.rest \}/)
    expect(INSERT).toMatch(/source\|cost\|consensus\|extractor_version/)
  })
})

describe('remineCohort — the three rules a careless reader gets wrong', () => {
  it('at or ABOVE current is current, not equal to it', () => {
    // A row written by a worker deployed ahead of this constant is not stale,
    // and re-mining it would spend a model call to make material worse.
    const c = remineCohort([row('v', 1), row('v', 2), row('v', 9)], 2)
    expect(c.currentRows).toBe(2)
    expect(c.staleRows).toBe(1)
  })

  it('a voice is stale if ANY row is, even when its newest rows are current', () => {
    // Mixed voices are the normal case — a creator scanned twice across a bump —
    // and calling such a voice current is how the old half stays old forever.
    const c = remineCohort([row('v', 1), row('v', 2), row('v', 2)], 2)
    expect(c.voices).toHaveLength(1)
    expect(c.voices[0]).toMatchObject({ voiceId: 'v', oldestVersion: 1, rows: 1 })
  })

  it('never stamped sorts oldest and is reported as null, not as zero', () => {
    const c = remineCohort([row('old', 1), row('never', null)], 2)
    expect(c.voices.map((v) => v.voiceId)).toEqual(['never', 'old'])
    expect(c.voices[0].oldestVersion).toBeNull()
  })

  it('a voice with any unstamped row reports null even when it also has stamped ones', () => {
    const c = remineCohort([row('v', 1), row('v', null)], 2)
    expect(c.voices[0].oldestVersion).toBeNull()
  })

  it('a row with no voice counts as stale but names no work', () => {
    // The scan is keyed on the voice, so such a row cannot be re-mined. Counting
    // it toward the voice list would ask the owner to pay for something the
    // pipeline cannot do.
    const c = remineCohort([row(null, null)], 2)
    expect(c.staleRows).toBe(1)
    expect(c.voices).toHaveLength(0)
  })

  it('an empty store is not a stale store', () => {
    expect(remineCohort([], 2)).toEqual({ voices: [], staleRows: 0, currentRows: 0 })
  })

  it('a non-numeric version reads as never stamped rather than as current', () => {
    const junk = { voiceId: 'v', extractorVersion: 'two' } as unknown as ExtractorStampedRow
    expect(remineCohort([junk], 2).staleRows).toBe(1)
  })
})
