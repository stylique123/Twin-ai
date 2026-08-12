// WHERE DID THIS KNOWLEDGE COME FROM?
//
// ⚠️ THE QUESTION THE TABLE COULD NOT ANSWER, AND THE ONE DEPLOYMENT NEEDS.
// `creator_knowledge` recorded WHAT we know (`kind`) and HOW STRONGLY it is
// attested (`basis`) but not WHICH PIPELINE produced it. So "do
// transcript-derived profiles ground creator-state claims at a higher rate than
// caption-only ones?" was unanswerable after the fact — and that is the number
// that decides whether creator-state enforcement can move past safe_rewrite.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { insertKnowledge } from '../knowledgeInsert.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCAN = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')
const VOICE = readFileSync(join(REPO, 'worker/src/jobs/voice.ts'), 'utf8')
const MIG = readFileSync(join(REPO, 'supabase/migrations/0122_creator_knowledge_source.sql'), 'utf8')

const fakeDb = (behaviour: 'ok' | 'missing_column' | 'other_error') => {
  const seen: unknown[][] = []
  let call = 0
  return {
    seen,
    from: () => ({
      insert: async (rows: unknown[]) => {
        seen.push(rows); call++
        if (behaviour === 'ok') return { error: null }
        if (behaviour === 'other_error') return { error: { code: '23505', message: 'duplicate key' } }
        return call === 1 ? { error: { code: 'PGRST204', message: "column 'source' does not exist" } } : { error: null }
      },
    }),
  }
}

describe('each pipeline tags its own rows', () => {
  it('the scan records caption provenance explicitly, not by inference', () => {
    // ⚖️ `basis` correlates today only because captions are clamped to
    // `demonstrated`. That is a coincidence of the clamp, not a recorded fact,
    // and it breaks silently the moment another source is added.
    expect(SCAN).toMatch(/source: 'caption'/)
  })

  it('the audio job distinguishes transcript items from caption items', () => {
    // They are merged one line later and become indistinguishable.
    expect(VOICE).toMatch(/__source: 'transcript' as const/)
    expect(VOICE).toMatch(/__source: 'caption' as const/)
    expect(VOICE).toMatch(/source: r\.__source/)
  })
})

describe('the write survives a database without migration 0122', () => {
  it('stores rows WITH source when the column exists', async () => {
    const db = fakeDb('ok')
    const r = await insertKnowledge(db as never, [{ text: 'a', source: 'caption' }])
    expect(r.error).toBeNull()
    expect(r.sourceStored).toBe(true)
    expect((db.seen[0][0] as Record<string, unknown>).source).toBe('caption')
  })

  it('RETRIES WITHOUT source rather than losing the rows', async () => {
    // ⚠️ THE FAILURE THIS PREVENTS. PostgREST rejects the whole insert with
    // PGRST204 for an unknown column, so shipping `source` naively would
    // silently stop storing ALL creator knowledge between this deploy and the
    // migration being applied — recreating the empty-knowledge-table defect
    // that was just fixed. Losing provenance is recoverable; losing the rows
    // is not.
    const db = fakeDb('missing_column')
    const r = await insertKnowledge(db as never, [{ text: 'a', source: 'caption' }])
    expect(r.error).toBeNull()
    expect(r.sourceStored).toBe(false)
    expect(db.seen).toHaveLength(2)
    expect((db.seen[1][0] as Record<string, unknown>).source).toBeUndefined()
    expect((db.seen[1][0] as Record<string, unknown>).text).toBe('a')
  })

  it('does NOT swallow a real error as a missing column', async () => {
    // A duplicate-key failure must surface, not be retried into silence.
    const db = fakeDb('other_error')
    const r = await insertKnowledge(db as never, [{ text: 'a', source: 'caption' }])
    expect(r.error).not.toBeNull()
    expect(db.seen).toHaveLength(1)
  })
})

describe('the migration refuses to invent provenance', () => {
  it('adds the column NULLABLE with no default', () => {
    // ⚠️ Backfilling to 'caption' would invent provenance for existing rows and
    // pollute the exact metric the column exists to produce. NULL means "not
    // recorded", which is a different and honest answer.
    expect(MIG).toMatch(/add column if not exists source text;/)
    expect(MIG).not.toMatch(/default 'caption'/)
    expect(MIG).not.toMatch(/update public\.creator_knowledge set source/i)
  })

  it('closes the set in the schema, not just the application', () => {
    expect(MIG).toMatch(/check \(source is null or source in \('caption', 'transcript', 'user', 'previous_video'\)\)/)
  })

  it('indexes what the deployment question actually queries', () => {
    expect(MIG).toMatch(/on public\.creator_knowledge \(owner_id, source\)/)
  })
})
