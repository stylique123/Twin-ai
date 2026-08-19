// THE ENDPOINT EXISTS; THE QUESTION IS WHETHER ANYTHING CALLS IT.
//
// ⚠️ THIS REPO'S RECURRING FAILURE IS THE UNWIRED CAPABILITY, and a reporting
// endpoint is its easiest form: complete, tested in isolation, never reached, so
// `uploadForensics` goes on returning `stalled` forever and the whole change was
// decorative. So the wiring is asserted, not assumed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { attemptBody, failureCode } from '../uploadAttemptReport'

const HERE = dirname(fileURLToPath(import.meta.url))
const API = readFileSync(join(HERE, '..', 'api.ts'), 'utf8')
const REPORTER = readFileSync(join(HERE, '..', 'uploadAttemptReport.ts'), 'utf8')

describe('the upload path actually reports', () => {
  it('reports a failed attempt from the upload catch, and still rethrows', () => {
    const region = API.slice(API.indexOf('const startedAt = Date.now()'), API.indexOf('await finalizeSourceUpload'))
    expect(region).toMatch(/reportUploadAttempt\(intent\.assetId, \{/)
    expect(region).toMatch(/outcome: 'failed'/)
    // ⚠️ THE THROW IS THE PRODUCT BEHAVIOUR. Telemetry may add to a failure; it
    // may never absorb one.
    expect(region).toMatch(/throw e/)
  })

  it('carries the fields that separate "sent nothing" from "sent most of it"', () => {
    const region = API.slice(API.indexOf('const startedAt = Date.now()'), API.indexOf('await finalizeSourceUpload'))
    for (const f of ['startedAt', 'lastProgressAt', 'bytesSent', 'failureCode']) {
      expect(region, f).toContain(f)
    }
  })

  it('never awaits the report', () => {
    // ⚖️ The creator is already being told the upload failed. Making them wait
    // on our analytics round-trip first is backwards.
    expect(API).not.toMatch(/await reportUploadAttempt/)
    expect(REPORTER).toMatch(/\.catch\(\(\) => \{\}\)/)
  })

  it('names the emitter it does NOT have rather than implying coverage', () => {
    // ⚠️ `creator_abandoned` has no caller yet. Saying so is the difference
    // between a known gap and a silent one.
    expect(REPORTER).toMatch(/creator_abandoned` currently has no emitter/)
    expect(REPORTER).toMatch(/keepalive: true/)
  })
})

describe('the body it builds', () => {
  it('contains ONLY the allowed keys — never a media_assets field', () => {
    const body = attemptBody('a', { outcome: 'failed' })
    expect(Object.keys(body).sort()).toEqual([
      'action', 'asset_id', 'attempt_number', 'bytes_sent',
      'failure_code', 'last_progress_at', 'outcome', 'started_at',
    ])
    for (const forbidden of ['status', 'duration', 'mime_type', 'storage_path', 'processing_state']) {
      expect(body, forbidden).not.toHaveProperty(forbidden)
    }
  })

  it('sends null rather than a guess when it does not know', () => {
    const body = attemptBody('a', { outcome: 'failed' })
    expect(body.started_at).toBeNull()
    expect(body.bytes_sent).toBeNull()
    expect(body.attempt_number).toBeNull()
    expect(body.failure_code).toBeNull()
  })

  it('normalizes what it does know into what 0149 will accept', () => {
    const body = attemptBody('a', {
      outcome: 'progressing', startedAt: 1_700_000_000_000, lastProgressAt: 1_700_000_060_000,
      bytesSent: 1024.6, attemptNumber: 99999, failureCode: '  boom  ',
    })
    expect(body.started_at).toBe('2023-11-14T22:13:20.000Z')
    expect(body.bytes_sent).toBe(1025)
    expect(body.attempt_number).toBe(1000)
    expect(body.failure_code).toBe('boom')
  })

  it('bounds a failure code instead of letting it become a free-text channel', () => {
    expect(failureCode('x'.repeat(500))).toHaveLength(200)
    expect(failureCode(new Error('upload timed out after 1000ms'))).toBe('upload timed out after 1000ms')
    expect(failureCode('   ')).toBeNull()
    expect(failureCode(undefined)).toBeNull()
  })
})

// APPEND-ONLY IS A GRANT, NOT A POLICY.
//
// ⚠️ THIS SHIPPED WRONG AND CI CAUGHT IT. 0149 enabled RLS and gave the table a
// SELECT-only policy, which reads like enough and is not: row security is NEVER
// consulted for TRUNCATE, so the default grant a new table inherits is the whole
// permission. "Evidence a client can empty in one statement" is not evidence.
//
// ⚖️ AND 0140 EXPECTED TO COVER THIS. It revoked TRUNCATE from every public
// table and said "the next table created will inherit the same default grant and
// this should already cover it" — but a migration runs once, so it covered the
// tables that existed then and nothing since. This test exists so the line
// cannot be deleted and rediscovered by a fifty-minute staging run.
describe('0149 closes the TRUNCATE hole RLS cannot', () => {
  const SQL = readFileSync(
    join(HERE, '..', '..', '..', '..', '..', 'supabase', 'migrations', '0149_what_the_client_saw.sql'),
    'utf8',
  )

  it('revokes TRUNCATE from both client roles', () => {
    expect(SQL).toMatch(/revoke truncate on table public\.media_upload_attempts from anon, authenticated;/)
  })

  it('still grants no write policy of any kind', () => {
    // ⚠️ The SELECT policy is the only one. An INSERT policy here would let a
    // client write a report about an attempt that never happened.
    const policies = SQL.match(/create policy/g) ?? []
    expect(policies).toHaveLength(1)
    expect(SQL).toMatch(/for select using \(auth\.uid\(\) = owner_id\)/)
  })

  it('says WHY, so the next table does not repeat it', () => {
    expect(SQL).toMatch(/RLS DOES NOT GATE/)
    expect(SQL).toMatch(/0140 DID NOT COVER IT/)
  })
})
