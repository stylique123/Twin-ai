// AN ARCHIVED PRODUCT MUST NOT KEEP GRANTING WITHDRAWN PERMISSIONS.
//
// ⚠️ THIS IS THE READER THAT MAKES ARCHIVE SAFE TO HAVE AT ALL. #354 shipped a
// hard delete and argued against a `retired` flag on exactly this ground: a
// flagged row the generator failed to filter would keep granting the commercial
// CTA, the disclosure exemption and the demonstration permission the creator had
// just withdrawn. The danger was real and the conclusion was wrong — the answer
// is to write the filter, not to make withdrawal destructive and lose the
// provenance of scripts already published.
//
// ⚖️ SO THE FILTER IS THE CONTRACT, AND IT IS PINNED IN THE SHIPPED EDGE SOURCE
// rather than restated here. `generate-blueprint` cannot import from this
// package (Deno deploy), so a paraphrase in a test would pass while production
// did something else — the failure `blueprintSubstanceParity` exists to prevent.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0124_product_entity_archive.sql'), 'utf8')

describe('generation never sees a withdrawn entity', () => {
  it('the OWNED-entity read filters archived rows', () => {
    const read = EDGE.slice(EDGE.indexOf('const { data: ownedEntity'))
    expect(read.slice(0, read.indexOf('.maybeSingle()'))).toMatch(/\.is\('archived_at', null\)/)
  })

  it('the LIBRARY read filters archived rows too', () => {
    // ⚠️ Grounding must not resolve a claim against a product the creator
    // retired — a citation to a withdrawn entity reads as verified.
    const read = EDGE.slice(EDGE.indexOf(".select('id, name, type, relationship, knowledge')"))
    expect(read.slice(0, read.indexOf('.limit(200)'))).toMatch(/\.is\('archived_at', null\)/)
  })

  it('uses `is null` rather than a date comparison', () => {
    // ⚖️ Live is the ABSENCE of a withdrawal, not a date range. A comparison
    // would need a clock this function has no reason to trust, and would behave
    // differently for a future-dated archive.
    expect(EDGE).not.toMatch(/archived_at['"]?\s*,\s*['"]?(gt|lt|gte|lte)/)
  })
})

describe('the library reader hides the archive by default', () => {
  it('excludes archived rows unless asked', () => {
    const fn = API.slice(API.indexOf('export async function loadProductEntities'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/if \(!opts\.includeArchived\) q = q\.is\('archived_at', null\)/)
  })

  it('a malformed archived_at reads as LIVE, never as archived', () => {
    // ⚠️ THE EXPENSIVE DIRECTION. Reading junk as "archived" would silently
    // remove a product from a creator's videos; reading it as live leaves them
    // where they were.
    expect(API).toMatch(/typeof row\.archived_at === 'string' \? row\.archived_at : null/)
  })
})

describe('archiving is not a quota release', () => {
  it('the one-owned-per-voice index is NOT made partial on archived_at', () => {
    // ⚠️ THE TEMPTING CHANGE THAT WOULD REOPEN 0120's DEFECT. Making the index
    // ignore archived rows would let a creator archive mid-onboarding and then
    // accumulate duplicates on every remount — the replay this guard exists for.
    // Swapping the owned product deserves an explicit flow, not a side effect.
    expect(MIGRATION).not.toMatch(/create unique index[\s\S]*archived_at/i)
    expect(MIGRATION).toMatch(/does NOT free the/i)
  })

  it('archived_at is a nullable timestamp, not a boolean', () => {
    // "When did this stop" dates the end of a sponsorship; a flag cannot say it.
    expect(MIGRATION).toMatch(/add column if not exists archived_at timestamptz/)
  })
})
