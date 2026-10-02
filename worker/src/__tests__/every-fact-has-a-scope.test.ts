import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const SQL = readFileSync(join(ROOT, 'supabase/migrations/0265_every_fact_has_a_scope.sql'), 'utf8')
const EDGE = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('every fact carries its scope (owner 2026-10-01)', () => {
  it('is product, brand or account — never blank — for old rows and every new one', () => {
    expect(SQL).toMatch(/fact_scope in \('product', 'brand', 'account'\)/)
    expect(SQL).toMatch(/create trigger creator_knowledge_scope before insert/)
    expect(SQL).toMatch(/where k\.fact_scope is null/)
  })
  it('one shared word is not enough to tie a fact to a product', () => {
    expect(SQL).toMatch(/if n >= 2 then hits := hits \|\| p\.id; end if;/)
    expect(SQL).toMatch(/cardinality\(hits\) = 1/)
  })
  it('the writer decides scoped rows by scope and keeps name-matching only for unscoped ones', () => {
    expect(EDGE).toMatch(/if \(scope === 'account'\) return true/)
    expect(EDGE).toMatch(/scopedRows\.has\(k\) \|\| !namedIn/)
    expect(EDGE).toMatch(/if \(scopedRows\.has\(k\)\) return true/)
    expect(EDGE).toMatch(/product_entity_id, fact_scope, brand_id(, serves)?`/)
  })
})
