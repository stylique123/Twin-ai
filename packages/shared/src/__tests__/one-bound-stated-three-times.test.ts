// ONE BOUND, STATED IN THREE PLACES, AND THEY DID NOT AGREE.
//
// ⚠️ THE SHAPE OF THE DEFECT IS WORSE THAN A MISMATCH. The client and the edge
// were raised from 200 to 1000 with a real measurement behind them; the CHECK
// was left at 200. A row over the old bound then fails to INSERT — so a repair
// meant to preserve the diagnosis deleted it instead. Before the change a
// failure recorded a truncated reason; after it, a long failure recorded
// nothing. Every tus error measured here is longer than 200 characters.
//
// ⚖️ EXECUTED AGAINST THE REAL FILES, not restated. A constant, a slice and a
// CHECK are three authorities for one rule, and the only thing that keeps them
// honest is a test that reads all three.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { FAILURE_CODE_MAX_CHARS, failureCode } from '../editor/uploadAttemptReport'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8')

describe('the client, the edge and the database state the same bound', () => {
  it('the edge truncates to exactly the shared constant', () => {
    const edge = read('supabase/functions/source-asset/index.ts')
    const slices = [...edge.matchAll(/failure_code[\s\S]{0,400}?\.slice\(0,\s*(\d+)\)/g)]
      .map((m) => Number(m[1]))
    expect(slices.length).toBeGreaterThan(0)
    for (const n of slices) expect(n).toBe(FAILURE_CODE_MAX_CHARS)
  })

  it('the newest CHECK on the column admits exactly what the client may send', () => {
    // ⚠️ THE NEWEST ONE WINS, because 0149 states 200 and 0202 replaces it. A
    // test that scanned every migration would find both numbers and could be
    // satisfied by the stale one — which is how a superseded rule keeps
    // passing for the rule that replaced it.
    const bounds = ['supabase/migrations/0149_what_the_client_saw.sql',
      'supabase/migrations/0202_the_bound_that_rejects_the_diagnosis.sql']
      .flatMap((f) => [...read(f).matchAll(
        /char_length\(failure_code\)\s*<=\s*(\d+)/g)].map((m) => Number(m[1])))
    expect(bounds.length).toBeGreaterThanOrEqual(2)
    // The last migration to speak is the one in force.
    expect(bounds[bounds.length - 1]).toBe(FAILURE_CODE_MAX_CHARS)
  })

  it('0202 drops the old constraint before adding its own', () => {
    // Adding a second CHECK of the same name fails; adding one of a different
    // name would leave 200 in force alongside 1000, and the stricter wins —
    // which would look exactly like the fix having been applied.
    const m = read('supabase/migrations/0202_the_bound_that_rejects_the_diagnosis.sql')
    const drop = m.indexOf('drop constraint if exists media_upload_attempts_failure_code_bounded')
    const add = m.indexOf('add constraint media_upload_attempts_failure_code_bounded')
    expect(drop).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(drop)
  })

  it('the migration is in the matrix APPLIED list, since staging has the table', () => {
    // 0149 creates `media_upload_attempts` and is itself applied, so this one
    // can and must run there rather than being excluded.
    const wf = read('.github/workflows/staging-integration.yml')
    expect(wf).toContain('0149_what_the_client_saw')
    expect(wf).toContain('0202_the_bound_that_rejects_the_diagnosis')
  })
})

describe('the client never sends more than the column now takes', () => {
  it('a long browser error is trimmed to the bound, not refused', () => {
    const long = 'tus: unexpected response while creating upload — '.repeat(200)
    const out = failureCode(long)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(FAILURE_CODE_MAX_CHARS)
  })

  it('the real tus error now survives past the word that mattered', () => {
    // The stored one stopped at "response t" — one word before the body.
    const real = 'tus: unexpected response while creating upload, originated from request'
      + ' (method: POST, url: https://example.storage.supabase.co/storage/v1/upload/resumable,'
      + ' response code: 400, response text: {"statusCode":"413","error":"Payload too large"})'
    expect(real.length).toBeGreaterThan(200)
    expect(real.length).toBeLessThanOrEqual(FAILURE_CODE_MAX_CHARS)
    expect(failureCode(real)).toBe(real)
    expect(failureCode(real)).toMatch(/response text/)
  })

  it('empty and whitespace stay null — absent is not a failure description', () => {
    for (const v of ['', '   ', null, undefined, 42]) expect(failureCode(v)).toBeNull()
  })
})
