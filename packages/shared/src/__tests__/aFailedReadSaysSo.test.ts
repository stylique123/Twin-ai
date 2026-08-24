import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ⚠️ THE COLUMN IS THE EASY HALF. A migration that adds two columns nothing
// writes and nothing reads is the exact pattern this rebuild keeps finding —
// questionRegistry, entityStatus, scanFailure. So this guard checks the WHOLE
// chain: the migration adds them, the worker writes them AND clears them, the
// select asks for them, and the derivation reads them.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(repo, ...p), 'utf8')

const migration = read('supabase', 'migrations', '0169_a_failed_read_leaves_a_trace.sql')
const worker = read('worker', 'src', 'jobs', 'extractProduct.ts')
const api = read('packages', 'shared', 'src', 'api.ts')

describe('the migration is re-runnable and complete', () => {
  // ⚖️ APPLIED TWICE MUST CHANGE NOTHING THE SECOND TIME — the ratchet rule.
  it('adds both columns idempotently', () => {
    expect(migration).toMatch(/add column if not exists knowledge_failed_at/)
    expect(migration).toMatch(/add column if not exists knowledge_error/)
  })

  it('drops the constraint by name before recreating it', () => {
    const drop = migration.indexOf('drop constraint if exists product_entities_knowledge_failure_is_complete')
    const add = migration.indexOf('add constraint product_entities_knowledge_failure_is_complete')
    expect(drop).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(drop)
  })

  // ⚠️ A REASON WITH NO TIME AND A TIME WITH NO REASON ARE BOTH HALF-WRITTEN
  // FAILURES, and a card cannot render either into something a creator can act on.
  it('the database enforces that the pair agree', () => {
    expect(migration).toMatch(/\(knowledge_failed_at is null\) = \(knowledge_error is null\)/)
  })
})

describe('the worker actually writes it', () => {
  it('records the failure when the handler throws', () => {
    expect(worker).toMatch(/knowledge_failed_at: new Date\(\)\.toISOString\(\)/)
    expect(worker).toMatch(/knowledge_error: creatorSafeReason\(e\)/)
  })

  // ⚠️ AND RETHROWS. Swallowing would turn a failed job into a successful one,
  // which is the `status='done'` bug this repo already has on the download path.
  it('the wrapper rethrows rather than swallowing', () => {
    const at = worker.indexOf('creatorSafeReason(e)')
    expect(worker.slice(at, at + 400)).toMatch(/throw e/)
  })

  // ⚖️ CLEARED ON EVERY SUCCESS. Without this a product that failed once and
  // then read fine keeps reporting a failure it has recovered from.
  it('both success paths clear it', () => {
    const clears = worker.split('knowledge_failed_at: null').length - 1
    expect(clears, 'the unreadable path and the stored-facts path').toBe(2)
  })

  it('a failure to record the failure does not replace the real error', () => {
    expect(worker).toMatch(/could not record the failure/)
  })
})

describe('the words a creator reads are never the raw error', () => {
  // ⚠️ A RAW ERROR CARRIES STACK FRAMES, HOST NAMES AND SOMETIMES THE URL WITH
  // ITS QUERY STRING. None of it is theirs to read and none tells them what to do.
  it('maps causes to plain sentences', () => {
    expect(worker).toMatch(/function creatorSafeReason/)
    for (const phrase of ['start with https', 'took too long', 'could not be found']) {
      expect(worker).toContain(phrase)
    }
  })

  // ⚖️ THE DEFAULT IS OURS, NOT THEIRS. An unrecognised failure is not evidence
  // the creator did anything wrong.
  it('the unrecognised case blames us', () => {
    expect(worker).toMatch(/This is on our side/)
  })
})

describe('the read asks for the columns', () => {
  // ⚠️ THE #497 BUG WAS EXACTLY THIS: a column missing from a select, so the
  // field came back undefined and a feature silently did nothing.
  it('the select list names both', () => {
    const at = api.indexOf('knowledge_extracted_at, knowledge_source_url')
    expect(at).toBeGreaterThan(-1)
    expect(api.slice(at, at + 120)).toMatch(/knowledge_failed_at, knowledge_error/)
  })

  // ⚖️ A HALF-WRITTEN FAILURE IS TREATED AS NO FAILURE. The database forbids it,
  // but a row can predate a constraint or arrive through the service role.
  it('one without the other is read as no failure', () => {
    expect(api).toMatch(/typeof row\.knowledge_failed_at === 'string' && typeof row\.knowledge_error === 'string'/)
  })
})
