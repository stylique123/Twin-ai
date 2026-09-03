import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * THE FAILURE VOCABULARY LIVES TWICE, AND ONLY ONE COPY CAN REJECT A WRITE.
 *
 * ⚠️ 0180 was applied to production on 2026-09-03 and carries a CHECK
 * constraint, `reference_content_profiles_tier_zero_failure_known`, listing the
 * five codes the column accepts. `TierZeroFailureCode` in the worker is the
 * other copy. They agree today — verified against every `NOT_RUN` call site
 * before the migration was applied.
 *
 * ⚖️ THE FAILURE MODE IS THE WHOLE ROW, NOT THE FIELD. A sixth code added to
 * the TypeScript union compiles, ships, and then Postgres rejects the entire
 * `assess_reference` update — not just the offending column. The reference
 * loses its content profile, its visual profile and its transcript, and the
 * only symptom is a job that fails after doing all of its expensive work.
 * TypeScript cannot see that constraint, so this test is the only thing
 * standing between a one-word union edit and that outcome.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIGRATION = readFileSync(
  join(ROOT, 'supabase', 'migrations',
    '0180_the_numbers_that_cannot_be_rate_limited.sql'), 'utf8')
const PASS = readFileSync(
  join(ROOT, 'worker', 'src', 'referenceTierZeroPass.ts'), 'utf8')

/** The codes the DATABASE will accept, read out of the CHECK constraint. */
function codesInMigration(): string[] {
  const at = MIGRATION.indexOf('tier_zero_failure_code in (')
  expect(at).toBeGreaterThan(-1)
  const close = MIGRATION.indexOf(')', at)
  return [...MIGRATION.slice(at, close).matchAll(/'([A-Z_]+)'/g)]
    .map((m) => m[1]!).sort()
}

/** The codes the WORKER can produce, read out of the union. */
function codesInUnion(): string[] {
  const at = PASS.indexOf('export type TierZeroFailureCode')
  expect(at).toBeGreaterThan(-1)
  const end = PASS.indexOf('export interface', at)
  return [...PASS.slice(at, end).matchAll(/'([A-Z_]+)'/g)]
    .map((m) => m[1]!).sort()
}

describe('the tier-zero failure vocabulary', () => {
  it('is the same set in the migration and in the worker', () => {
    expect(codesInUnion()).toEqual(codesInMigration())
  })

  it('is not empty in either copy — a passing test on two empty lists proves nothing', () => {
    expect(codesInMigration().length).toBeGreaterThanOrEqual(5)
    expect(codesInUnion().length).toBeGreaterThanOrEqual(5)
  })

  // Every code the worker can actually emit, read from the call sites rather
  // than from the union — the union is a declaration, a NOT_RUN argument is
  // a thing that reaches the database.
  it('covers every code a NOT_RUN call site can emit', () => {
    const emitted = [...PASS.matchAll(/NOT_RUN\(\s*(?:timedOut\(\)\s*\?\s*)?'([A-Z_]+)'(?:\s*:\s*'([A-Z_]+)')?/g)]
      .flatMap((m) => [m[1], m[2]].filter((v): v is string => typeof v === 'string'))
    expect(emitted.length).toBeGreaterThan(0)
    const accepted = new Set(codesInMigration())
    for (const code of emitted) expect(accepted.has(code)).toBe(true)
  })
})
