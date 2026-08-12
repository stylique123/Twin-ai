// THE EDIT SURFACE MAY NOT REACH THE ENTITLEMENT FIELDS.
//
// ⚠️ THE DEFECT THIS PREVENTS is a settings page that is also a permission
// escalator. `relationship` and `personal_use` are what decides whether this
// creator may run a commercial CTA, whether disclosure is required, and whether
// a marketing claim may be attributed to them. A Product Library that let them
// pick `OWN_PRODUCT` and `CONFIRMED` from two dropdowns would hand over every
// one of those permissions for the price of a tap, with nothing on record that
// they ever claimed it. Ownership changes belong in an attestation flow that
// stores what was asserted and when.
//
// ⚖️ WHY A TEST AND NOT JUST A TYPE. The argument type already makes the fields
// inexpressible at compile time, which is the real guarantee. But `supabase` is
// reached through untyped rows, a caller holding `any` slips past the compiler
// entirely, and the natural "simplification" of this writer — spreading `edit`
// straight into the update — would forward those fields at runtime while the
// type still looked correct. So the runtime behaviour is pinned too.
import { describe, expect, it, beforeEach } from 'vitest'
import { initApi, updateEntityPresentation } from '../api'
import type { SupabaseClient } from '@supabase/supabase-js'

const captured: { table?: string; row?: Record<string, unknown>; id?: string } = {}

// ⚖️ INJECTED THROUGH `initApi`, NOT MOCKED AT THE MODULE BOUNDARY. `api.ts`
// already exposes the seam the real app uses at startup, so the test drives the
// same wiring production does instead of replacing it.
const chain: Record<string, unknown> = {
  update(row: Record<string, unknown>) { captured.row = row; return chain },
  eq(_col: string, v: string) { captured.id = v; return chain },
  select() { return chain },
  // Returns a READABLE row, because the writer re-reads what the database now
  // holds rather than echoing what it sent. A stub returning null would make
  // every assertion below pass through a path production never takes.
  async single() {
    return {
      data: {
        id: 'e1', name: 'Buildpad', type: 'SAAS', relationship: 'OWN_PRODUCT',
        personal_use: 'CONFIRMED', showability: 'ALWAYS', product_url: null,
        affiliate_url: null, evidence: null, restrictions: null,
        source: 'user_answer', user_confirmed: true, updated_at: '2026-08-12T00:00:00Z',
      },
      error: null,
    }
  },
}
initApi({
  client: { from(t: string) { captured.table = t; return chain } } as unknown as SupabaseClient,
})

beforeEach(() => { captured.row = undefined; captured.id = undefined })

describe('a creator may edit how a product is presented, never what it entitles', () => {
  it('forwards the presentation fields it is given', async () => {
    await updateEntityPresentation('e1', {
      name: 'Buildpad', productUrl: 'https://buildpad.io', showability: 'ALWAYS',
    })
    expect(captured.table).toBe('product_entities')
    expect(captured.id).toBe('e1')
    expect(captured.row).toEqual({
      name: 'Buildpad', product_url: 'https://buildpad.io', showability: 'ALWAYS',
    })
  })

  it('NEVER writes relationship or personal_use, even when handed them', async () => {
    // ⚠️ THE ESCALATION, ATTEMPTED. A caller holding `any` — a form built from
    // untyped state, a payload parsed from JSON — bypasses the argument type
    // completely. The writer must drop these on the floor rather than trust that
    // the compiler already stopped them.
    await updateEntityPresentation('e1', {
      name: 'Buildpad',
      relationship: 'OWN_PRODUCT',
      personalUse: 'CONFIRMED',
      personal_use: 'CONFIRMED',
      user_confirmed: true,
      restrictions: { approvedClaims: ['cures everything'] },
    } as never)
    expect(captured.row).toEqual({ name: 'Buildpad' })
    for (const forbidden of
      ['relationship', 'personalUse', 'personal_use', 'user_confirmed', 'restrictions']) {
      expect(captured.row).not.toHaveProperty(forbidden)
    }
  })

  it('an omitted field is left alone, and is not the same as clearing it', async () => {
    // ⚖️ `unset` IS NOT `null`. Sending `name: null` for a field the creator did
    // not touch would erase a name they never asked to remove.
    await updateEntityPresentation('e1', { showability: 'NEVER' })
    expect(captured.row).toEqual({ showability: 'NEVER' })
    expect(captured.row).not.toHaveProperty('name')
    expect(captured.row).not.toHaveProperty('product_url')
  })

  it('an EXPLICIT null does clear the field', async () => {
    await updateEntityPresentation('e1', { name: null })
    expect(captured.row).toEqual({ name: null })
  })

  it('blank text clears rather than storing whitespace', async () => {
    await updateEntityPresentation('e1', { name: '   ', productUrl: '  ' })
    expect(captured.row).toEqual({ name: null, product_url: null })
  })

  it('an EMPTY edit issues no write at all', async () => {
    // A no-op UPDATE still bumps `updated_at`, which afterwards reads as a
    // change the creator never made.
    const out = await updateEntityPresentation('e1', {})
    expect(out).toBeNull()
    expect(captured.row).toBeUndefined()
  })
})
