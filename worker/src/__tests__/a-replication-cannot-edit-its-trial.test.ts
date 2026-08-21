// A REPLICATION IS EVIDENCE, AND EVIDENCE MUST NOT BE ABLE TO REWRITE ITSELF.
//
// ⚠️ THE FAILURE THIS GUARDS IS SILENT AND TOTAL. Re-running the parity job to
// investigate #66's three arm-A timeouts would have upserted straight over the
// rows recording them, on (url, model_a, model_b, arms_asymmetric). The
// investigation would have destroyed its own subject and left a table that
// looked perfectly well-formed.
//
// ⚖️ AND THE REFUSALS ARE THE FEATURE. Every one of these is a case where the
// job could have produced a plausible number instead of an error, and the
// number would have been wrong in a way nobody could see afterwards.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

describe('a timeout is not an error, and the difference is the whole question', () => {
  it('classifies the exact string #66 recorded as a TIMEOUT', async () => {
    const { classifyFailure } = await import('../jobs/extractionReplication.js')
    // This is verbatim what gemini.ts's AbortController produced on all three
    // of #66's arm-A refusals. If this ever stops classifying as a timeout, the
    // replication rate silently becomes a rate of something else.
    expect(classifyFailure('This operation was aborted')).toEqual({ outcome: 'timeout', errorClass: 'timeout' })
  })

  it('does NOT call a quota refusal a timeout', async () => {
    const { classifyFailure } = await import('../jobs/extractionReplication.js')
    // Both make the model fail to answer. Only one of them is about latency,
    // and folding quota into timeout would inflate the very number this job
    // exists to measure.
    expect(classifyFailure('Gemini 429: RESOURCE_EXHAUSTED quota').outcome).toBe('error')
    expect(classifyFailure('Gemini 429: RESOURCE_EXHAUSTED quota').errorClass).toBe('quota')
  })

  it('keeps 400 and 5xx apart, because one is our fault and one is theirs', async () => {
    const { classifyFailure } = await import('../jobs/extractionReplication.js')
    expect(classifyFailure('Gemini 400: INVALID_ARGUMENT').errorClass).toBe('invalid_argument')
    expect(classifyFailure('Gemini 503: unavailable').errorClass).toBe('upstream_5xx')
  })
})

describe('it replicates a timeout, and refuses to be a rerun button', () => {
  it('refuses a trial whose arm A answered fine', async () => {
    const { assertReplicable } = await import('../jobs/extractionReplication.js')
    expect(() => assertReplicable({ error_a: null }))
      .toThrow(/no arm-A timeout to replicate/)
  })

  it('refuses a trial whose arm A failed for a NON-timeout reason', async () => {
    const { assertReplicable } = await import('../jobs/extractionReplication.js')
    // A quota refusal is a real failure, but replaying it answers "is the quota
    // still exhausted", which is a question about the account rather than the
    // model. Filing that under a latency investigation would be a category error.
    expect(() => assertReplicable({ error_a: 'Gemini 429: RESOURCE_EXHAUSTED' }))
      .toThrow(/no arm-A timeout to replicate/)
  })

  it('accepts a trial that really did time out', async () => {
    const { assertReplicable } = await import('../jobs/extractionReplication.js')
    expect(() => assertReplicable({ error_a: 'This operation was aborted' })).not.toThrow()
  })
})

describe('the question must be the same question', () => {
  it('refuses a manifest that predates the digests', async () => {
    const { readManifest } = await import('../jobs/extractionReplication.js')
    // Rows written before 0157 have no manifest. There is no record of what
    // they were asked, so there is nothing to hold constant.
    expect(() => readManifest(null)).toThrow(/no thinking_resolved|no system_sha|no usable/)
  })

  it('refuses when the SYSTEM prompt has moved since the trial ran', async () => {
    const { assertQuestionUnchanged } = await import('../jobs/extractionReplication.js')
    expect(() => assertQuestionUnchanged({
      thinkingResolved: 2048, timeoutMs: 90_000,
      systemSha: 'deadbeefdeadbeef', vocabSha: 'x', schemaSha: 'y',
    })).toThrow(/system_sha.*changed since the source trial ran/s)
  })

  it('names EVERY digest that moved, not just the first', async () => {
    const { assertQuestionUnchanged } = await import('../jobs/extractionReplication.js')
    // A reader who fixes the one field named in the error and re-runs would
    // otherwise discover the second problem one expensive run later.
    let msg = ''
    try {
      assertQuestionUnchanged({
        thinkingResolved: 2048, timeoutMs: 90_000,
        systemSha: 'aaaaaaaaaaaaaaaa', vocabSha: 'bbbbbbbbbbbbbbbb', schemaSha: 'cccccccccccccccc',
      })
    } catch (e) { msg = (e as Error).message }
    expect(msg).toMatch(/system_sha/)
    expect(msg).toMatch(/vocabulary_sha/)
    expect(msg).toMatch(/schema_sha/)
  })

  it('reads the manifest rather than rebuilding it from the code of today', async () => {
    const { readManifest } = await import('../jobs/extractionReplication.js')
    const m = readManifest({
      thinking_resolved: 2048, timeout_ms: 90_000,
      system_sha: 'sss', vocabulary_sha: 'vvv', schema_sha: 'ccc',
    })
    // ⚖️ THE TIMEOUT COMES FROM THE TRIAL, NOT FROM A CONSTANT. If somebody
    // later raises TIMEOUT_MS in the parity job to make Pro pass, a replication
    // of an OLD trial must still use the old trial's 90s — otherwise the
    // comparison quietly changes underneath the question.
    expect(m.timeoutMs).toBe(90_000)
    expect(m.thinkingResolved).toBe(2048)
    expect(m.systemSha).toBe('sss')
  })
})

describe('the replication never edits the trial it replicates', () => {
  it('contains no write to extraction_parity_trials', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../jobs/extractionReplication.ts', import.meta.url), 'utf8')
    // ⚠️ ASSERTED ON THE SOURCE, because this is a property of the whole file
    // rather than of one code path a test could exercise. The only permitted
    // contact with that table is the .select() that loads the source trial.
    //
    // ⚖️ MATCHES THE QUOTED TABLE NAME, NOT THE WORD. Prose mentions the table
    // too, and a check that counted comments would fail every time somebody
    // explained the rule — which trains people to loosen the check.
    const trialContact = src.split('\n').filter((l) => l.includes("'extraction_parity_trials'"))
    expect(trialContact).toHaveLength(1)
    expect(trialContact[0]).toContain('.from(')
    for (const write of ['.upsert(', '.update(', '.delete(']) {
      expect(src.includes(`extraction_parity_trials'${write}`)).toBe(false)
    }
    // And the replication row is INSERTED, never upserted: a duplicate attempt
    // must fail loudly rather than replace the attempt it disagrees with.
    expect(src).toMatch(/from\('extraction_parity_replications'\)\s*\.insert\(/)
    expect(src).not.toMatch(/from\('extraction_parity_replications'\)\s*\.upsert\(/)
  })

  it('never acquires a transcript — cache or nothing', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../jobs/extractionReplication.ts', import.meta.url), 'utf8')
    // #66 proved a fresh download disagrees with what was stored (133 chars
    // became 5). Re-acquiring would hand the model different bytes and call the
    // result a replication.
    expect(src).toContain('readCachedTranscript')
    expect(src).not.toContain('transcribeFromUrl')
    expect(src).not.toContain('writeCachedTranscript')
  })
})
