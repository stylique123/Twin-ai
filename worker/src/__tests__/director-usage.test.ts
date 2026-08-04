// WHAT DID THAT MODEL CALL COST — the parser, and why it never throws.
//
// §9a.3: "Gemini usageMetadata token counts are parsed and dropped too, so LLM
// spend per project is unknown." `directorProvider` read the response body,
// took the text and discarded the rest. This is the half that reads the cost.
//
// TWO RULES DO ALL THE WORK HERE, and both are asymmetries worth stating.
//
// 1. NULL IS NOT ZERO. Null means the provider did not report a count; zero
//    would mean it reported none were used. Share a representation between them
//    and `sum(total_tokens)` reads every missing count as zero — understating
//    spend, silently, and by more as more calls fail to report. Wrong in the
//    cheap direction is the worst direction: nobody investigates good news.
//
// 2. IT MUST NOT THROW, unlike every other part of response parsing. An
//    unparseable `responseText` correctly fails the call, because without it
//    there is no decision. Token counts are TELEMETRY. Failing a render the
//    model actually answered, because a cost metric was malformed, trades the
//    product for the accounting.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
process.env.GEMINI_API_KEY ||= 'stub-gemini-key'

const { parseUsage, NO_USAGE } = await import('../jobs/directorProvider.js')

const body = (usageMetadata: unknown) => ({ candidates: [], usageMetadata })

describe('parseUsage — the provider\'s own accounting, treated as untrusted', () => {
  it('reads a well-formed usage block', () => {
    expect(parseUsage(body({ promptTokenCount: 12345, candidatesTokenCount: 678, totalTokenCount: 13023 })))
      .toEqual({ promptTokens: 12345, responseTokens: 678, totalTokens: 13023 })
  })

  it('ZERO SURVIVES AS ZERO — it is a real answer, not a missing one', () => {
    const u = parseUsage(body({ promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 }))
    expect(u).toEqual({ promptTokens: 0, responseTokens: 0, totalTokens: 0 })
    // The distinction the whole design rests on, asserted rather than implied.
    expect(u.totalTokens).not.toBeNull()
  })

  it('a MISSING count is null, and null is distinguishable from zero', () => {
    const u = parseUsage(body({ promptTokenCount: 10 }))
    expect(u.promptTokens).toBe(10)
    expect(u.responseTokens).toBeNull()
    expect(u.totalTokens).toBeNull()
  })

  it('no usage block at all yields all-null, not zeros', () => {
    expect(parseUsage({ candidates: [] })).toEqual(NO_USAGE)
    expect(NO_USAGE).toEqual({ promptTokens: null, responseTokens: null, totalTokens: null })
  })

  it('total is NOT recomputed from the other two', () => {
    // The provider may count cached or reasoning tokens neither of the other
    // fields includes. Deriving the total would overwrite what was actually
    // billed with what we assumed — and would hide exactly the discrepancy
    // worth seeing.
    const u = parseUsage(body({ promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 900 }))
    expect(u.totalTokens).toBe(900)
  })

  it('rejects values that are not non-negative safe integers', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2, '100', null, {}, [], true]) {
      expect(parseUsage(body({ promptTokenCount: bad })).promptTokens).toBeNull()
    }
    // And the boundary is inclusive at both ends of what IS acceptable.
    expect(parseUsage(body({ promptTokenCount: 0 })).promptTokens).toBe(0)
    expect(parseUsage(body({ promptTokenCount: Number.MAX_SAFE_INTEGER })).promptTokens)
      .toBe(Number.MAX_SAFE_INTEGER)
  })

  it('NEVER THROWS — a malformed body must not fail a call the model answered', () => {
    for (const bad of [null, undefined, 'nope', 7, [], { usageMetadata: null }, { usageMetadata: 'x' },
      { usageMetadata: [] }, { usageMetadata: 7 }]) {
      expect(() => parseUsage(bad)).not.toThrow()
      expect(parseUsage(bad)).toEqual(NO_USAGE)
    }
  })

  it('one bad field does not discard the good ones', () => {
    // Partial credit is the point: a provider that starts reporting a float for
    // one field should not cost us the other two.
    expect(parseUsage(body({ promptTokenCount: 10, candidatesTokenCount: -5, totalTokenCount: 15 })))
      .toEqual({ promptTokens: 10, responseTokens: null, totalTokens: 15 })
  })

  it('a usageMetadata carrying unknown extra keys is still read', () => {
    // Providers add fields. Reading the three we know must not depend on the
    // block containing only those three.
    expect(parseUsage(body({
      promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3,
      thoughtsTokenCount: 99, cachedContentTokenCount: 7,
    }))).toEqual({ promptTokens: 1, responseTokens: 2, totalTokens: 3 })
  })
})

describe('the migration and the parser agree', () => {
  it('0101 stores exactly the three counts the parser produces, and no more', () => {
    // A column the parser never fills, or a field the parser reads with nowhere
    // to put it, is the two-copies-of-one-rule defect this repo spent the day
    // removing. Read from the migration text rather than restated.
    const sql = readFileSync(
      new URL('../../../supabase/migrations/0101_director_call_token_usage.sql', import.meta.url), 'utf8')
    for (const col of ['prompt_tokens', 'response_tokens', 'total_tokens']) {
      expect(sql).toContain(`add column if not exists ${col}`.replace('  ', ' '))
    }
    expect(Object.keys(NO_USAGE).sort()).toEqual(['promptTokens', 'responseTokens', 'totalTokens'])
  })

  it('the columns are NULLABLE — the null/zero distinction needs them to be', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/0101_director_call_token_usage.sql', import.meta.url), 'utf8')
    expect(sql).not.toMatch(/(prompt|response|total)_tokens\s+integer\s+not\s+null/i)
  })

  it('the OLD receive signature is DROPPED, not left as an overload', () => {
    // The lesson from staging's orphaned editor_create_output_asset: Postgres
    // keys functions by (name, argument types), so adding parameters with
    // `create or replace` leaves the old function callable beside the new one.
    const sql = readFileSync(
      new URL('../../../supabase/migrations/0101_director_call_token_usage.sql', import.meta.url), 'utf8')
    expect(sql).toContain('drop function if exists public.editor_director_receive(uuid, uuid, text, integer, text)')
  })

  it('0101 does NOT widen the single-call state guard', () => {
    // The receive predicate is 0088's spine: `state = 'started'` is what makes
    // the call happen exactly once. A telemetry migration must not relax it.
    const sql = readFileSync(
      new URL('../../../supabase/migrations/0101_director_call_token_usage.sql', import.meta.url), 'utf8')
    expect(sql).toContain("where edit_project_id = p_project and state = 'started'")
    expect(sql).not.toMatch(/state\s+in\s*\(\s*'started'\s*,\s*'received'/)
  })
})
