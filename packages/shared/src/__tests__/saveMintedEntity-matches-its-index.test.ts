// THE READ AND THE CONSTRAINT MUST MEAN THE SAME THING BY "ALREADY MINTED".
//
// ⚠️ WHY THIS FILE EXISTS RATHER THAN A HELPER. `saveMintedEntity` applies four
// predicates twice — once to find the existing mint, once to update it — and
// 0186's partial index applies the same four. The obvious fix is one helper
// function; TypeScript refuses it, because supabase-js's builder types recurse
// past the instantiation-depth limit and the casts that silence that erase the
// types which make the queries safe. So the predicates are repeated on purpose
// and this asserts they still agree. A guard beats a cast.
//
// ⚠️ AND DISAGREEMENT HERE IS NOT COSMETIC. Before 0186 both queries said "the
// owned entity for this voice", which was safe only while a voice could hold
// one. Now a creator may own two, so that phrase matches rows the constraint
// does NOT guard — and the pre-read would find the creator's second,
// deliberately-added product and overwrite it with an onboarding guess.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** Relative to this file, never to the working directory. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0186_three_places_agreed_on_one_wrong_thing.sql'), 'utf8')

/** `saveMintedEntity`'s body, so a chain elsewhere in api.ts cannot satisfy this. */
function saveMintedEntityBody(): string {
  const start = API.indexOf('export async function saveMintedEntity(')
  expect(start).toBeGreaterThan(-1)
  const end = API.indexOf('\nexport ', start + 10)
  return API.slice(start, end === -1 ? undefined : end)
}

describe('the mint read, the mint update and the index agree', () => {
  const body = saveMintedEntityBody()

  it('scopes both queries to the unconfirmed mint, not to any owned entity', () => {
    // Two chains: the pre-read and the update. Both must carry all four.
    for (const predicate of [
      /\.eq\('voice_id', voiceId\)/g,
      /\.in\('relationship', \['OWN_PRODUCT', 'OWN_SERVICE'\]\)/g,
      /\.eq\('source', 'inferred'\)/g,
      /\.eq\('user_confirmed', false\)/g,
    ]) {
      expect(body.match(predicate) ?? [], String(predicate)).toHaveLength(2)
    }
  })

  it('the migration guards exactly those columns and values', () => {
    // ⚠️ THE INDEX IS THE AUTHORITY; THE QUERIES FOLLOW IT. If someone widens the
    // index without widening the read, the read silently starts matching rows the
    // database will happily let it duplicate.
    const idx = MIGRATION.slice(MIGRATION.indexOf('create unique index'))
    expect(idx).toMatch(/on public\.product_entities \(voice_id\)/)
    expect(idx).toMatch(/relationship in \('OWN_PRODUCT', 'OWN_SERVICE'\)/)
    expect(idx).toMatch(/source = 'inferred'/)
    expect(idx).toMatch(/user_confirmed = false/)
  })

  it('the old index is dropped and the old rule is gone from the code', () => {
    expect(MIGRATION).toMatch(/drop index if exists public\.product_entities_one_owned_per_voice/)
    // ⚠️ THE REFUSAL MUST NOT COME BACK BY ACCIDENT. `OwnedEntityExistsError`
    // enforced "one owned product per voice"; a re-added throw would refuse the
    // bakery her second product again with the schema now allowing it.
    expect(API).not.toMatch(/class OwnedEntityExistsError/)
    expect(API).not.toMatch(/throw new OwnedEntityExistsError/)
  })
})
