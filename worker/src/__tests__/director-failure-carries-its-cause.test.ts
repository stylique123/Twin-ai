// A CODE WITHOUT A CAUSE IS A CODE THAT SENDS YOU TO THE LOGS.
//
// ⚠️ C8 ITEM 2. `edit_director_calls` is the one state machine here that has ever
// answered "how often has that failed, ever" with a number — three times in its
// whole history, which is how that failure was correctly called transient rather
// than guessed at. What it never recorded is WHY: every provider failure stored
// `director_provider_http`, so a 429 (our quota), a 503 (Google's problem) and a
// 400 (our malformed request) were one row shape calling for three different
// responses.
//
// ⚖️ THE DISTINCTION EXISTS IN THE STATUS LINE AND WAS DROPPED ONE THROW LATER.
// Same shape as the script path before 0129, which is why C8 names them
// together — and why this test asserts the seam rather than the wording.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// ⚖️ THE MODULE READS ENV AT IMPORT TIME, like every other director test here.
// Stubs, not real values: this test never reaches a provider.
process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
process.env.GEMINI_API_KEY ||= 'stub-gemini-key'
const { DirectorProviderError, DIRECTOR_DETAIL_MAX } = await import('../jobs/directorProvider.js')

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROVIDER = readFileSync(join(SRC, 'jobs', 'directorProvider.ts'), 'utf8')
const DIRECTOR = readFileSync(join(SRC, 'jobs', 'editorDirector.ts'), 'utf8')
const SQL = readFileSync(
  join(SRC, '..', '..', 'supabase', 'migrations', '0132_director_failure_detail.sql'), 'utf8')

describe('the error can carry a cause at all', () => {
  it('keeps the detail beside the code', () => {
    const e = new DirectorProviderError('director provider HTTP 429', 'director_provider_http', 'HTTP 429: quota')
    expect(e.code).toBe('director_provider_http')
    expect(e.detail).toBe('HTTP 429: quota')
  })

  it('leaves detail ABSENT rather than empty when there is none', () => {
    // ⚖️ A cancel has no body worth keeping, and "" would read as "we looked and
    // found nothing" — which is a different claim from "not recorded".
    expect(new DirectorProviderError('cancelled', 'director_cancelled').detail).toBeUndefined()
  })
})

describe('the body is read before the throw', () => {
  it('reads the response text on a non-2xx', () => {
    // ⚠️ THE ONLY PLACE THE REASON EXISTS. Google names the quota, or the field
    // it rejected, and the response is discarded the moment the call returns.
    const branch = PROVIDER.slice(PROVIDER.indexOf('if (!res.ok)'), PROVIDER.indexOf('const data ='))
    expect(branch).toMatch(/await res\.text\(\)/)
    expect(branch.indexOf('res.text()')).toBeLessThan(branch.indexOf('throw new DirectorProviderError'))
  })

  it('cannot let an unreadable body swallow the failure', () => {
    // Reading it must not fail the call any harder than it has already failed.
    const branch = PROVIDER.slice(PROVIDER.indexOf('if (!res.ok)'), PROVIDER.indexOf('const data ='))
    expect(branch).toMatch(/try \{ body = \(await res\.text\(\)\)/)
    expect(branch).toMatch(/catch \{/)
  })

  it('keeps the STATUS even when the body is empty', () => {
    // The status alone already separates quota from outage from our own bug.
    const branch = PROVIDER.slice(PROVIDER.indexOf('if (!res.ok)'), PROVIDER.indexOf('const data ='))
    expect(branch).toMatch(/HTTP \$\{res\.status\}/)
  })
})

describe('the cause reaches the ledger', () => {
  it('passes the detail to fail(), not just the code', () => {
    expect(DIRECTOR).toMatch(/await ctx\.ledger\.fail\(code, detail\)/)
    expect(DIRECTOR).toMatch(/p_failure_detail: detail \? detail\.slice\(0, DIRECTOR_DETAIL_MAX\) : null/)
  })

  it('carries an UNRECOGNISED throw\'s message rather than nothing', () => {
    // ⚖️ An unclassified cause is still a cause, and a failure we have never seen
    // before is exactly the one worth reading.
    expect(DIRECTOR).toMatch(/\(e instanceof Error \? e\.message : String\(e\)\)/)
  })

  it('records why a DECISION was rejected, not only that it was', () => {
    expect(DIRECTOR).toMatch(/fail\(code, e instanceof Error \? e\.message : String\(e\)\)/)
  })
})

describe('the column and the callers agree on the bound', () => {
  it('truncates in the worker AND in the function', () => {
    // ⚠️ THE CHECK WOULD REJECT AN OVER-LONG DETAIL AND TAKE THE WHOLE FAILURE
    // RECORD DOWN WITH IT. Losing the record of a failure because the failure was
    // verbose is the worst trade available, so both ends cut.
    expect(SQL).toMatch(/failure_detail = left\(p_failure_detail, 300\)/)
    expect(DIRECTOR).toMatch(/slice\(0, DIRECTOR_DETAIL_MAX\)/)
  })

  it('uses the same bound as the script path, so the two records compare', () => {
    expect(DIRECTOR_DETAIL_MAX).toBe(300)
    expect(SQL).toMatch(/length\(failure_detail\) <= 300/)
    const script = readFileSync(
      join(SRC, '..', '..', 'supabase', 'migrations', '0129_script_attempts.sql'), 'utf8')
    expect(script).toMatch(/length\(failure_detail\) <= 300/)
  })

  it('creates before dropping, and restates the grant', () => {
    // ⚠️ THIS ASSERTION USED TO FORBID ANY `drop function`, AND THAT IS WHAT
    // SHIPPED THE BUG. The intent was "do not drop-and-recreate first, because
    // that revokes service_role's execute and fails every director call until the
    // grant runs". What it actually encoded was "never drop the old signature" —
    // which is how both functions ended up live in production.
    //
    // ⚖️ THE REAL PROPERTY IS AN ORDERING, NOT AN ABSENCE. Create the new one,
    // drop the old one, restate the grant.
    expect(SQL).toMatch(/create or replace function public\.editor_director_fail/)
    expect(SQL).toMatch(/grant execute on function public\.editor_director_fail\(uuid, uuid, text, integer, text, text\) to service_role/)
    expect(SQL.indexOf('create or replace function public.editor_director_fail'))
      .toBeLessThan(SQL.indexOf('grant execute on function'))
    expect(SQL).toMatch(/p_failure_detail text default null/)
  })
})

describe('the old signature is removed, not merely shadowed', () => {
  // ⚠️ THIS IS THE DEFECT THE MIGRATION SHIPPED WITH, AND IT WAS APPLIED TO
  // PRODUCTION BEFORE ANYONE NOTICED. `create or replace function` with an added
  // parameter OVERLOADS in Postgres — it does not replace. Both the 5-arg and the
  // 6-arg function existed, and any caller sending five arguments would have gone
  // on writing no detail while appearing to succeed.
  //
  // ⚖️ THE MIGRATION'S OWN COMMENT WARNED ABOUT EXACTLY THIS. Prose did not stop
  // it; a verification query found it. So the assertion lives here.
  it('drops the 5-arg function explicitly', () => {
    expect(SQL).toMatch(/drop function if exists public\.editor_director_fail\(uuid, uuid, text, integer, text\);/)
  })

  it('drops it AFTER creating the new one, never before', () => {
    // A drop-first ordering leaves a window with no function at all, and the
    // render path calls this on every director failure.
    expect(SQL.indexOf('create or replace function public.editor_director_fail'))
      .toBeLessThan(SQL.indexOf('drop function if exists public.editor_director_fail'))
  })

  it('keeps the default, so a five-argument call still resolves', () => {
    expect(SQL).toMatch(/p_failure_detail text default null/)
  })
})
