// A CORRECTNESS GUARD AND A COMMERCIAL LIMIT ARE DIFFERENT SITUATIONS.
//
// ⚠️ THE FAILURE THIS PREVENTS IS A MISLEADING MESSAGE, WHICH IS A REAL DEFECT
// AND NOT A COSMETIC ONE.
//
//     "This product has already been added"  shown to someone at their plan cap
//     sends them hunting for a duplicate that does not exist.
//
//     "You've reached your limit"  shown to a replayed onboarding mint invites
//     them to BUY THEIR WAY OUT OF OUR BUG.
//
// ⚖️ AND THE ORDER MATTERS AS MUCH AS THE WORDING. A duplicate arriving from an
// onboarding remount must be refused as a duplicate whether or not the creator
// has room, or a customer at their limit is told to upgrade in order to fix our
// replay.
import { describe, expect, it, beforeEach } from 'vitest'
import {
  initApi, claimProductEntity, productLibraryLimit,
  ProductLibraryFullError,
} from '../api'
import type { SupabaseClient } from '@supabase/supabase-js'

const state: {
  count: number; countErr: unknown; insertErr: { code?: string; message?: string } | null
  countFilters: string[]; inserted: boolean
} = { count: 0, countErr: null, insertErr: null, countFilters: [], inserted: false }

const chain: Record<string, unknown> = {
  select(_cols: string, opts?: { head?: boolean }) {
    if (opts?.head) {
      // the counting branch resolves as a thenable
      return {
        eq: () => chain.countable,
        is: () => chain.countable,
      }
    }
    return chain
  },
  insert() { state.inserted = true; return chain },
  is(col: string) { state.countFilters.push(col); return chain },
  eq() { return chain },
  async single() {
    if (state.insertErr) return { data: null, error: state.insertErr }
    return {
      data: {
        id: 'e1', name: 'Twin', type: 'SAAS', relationship: 'OWN_PRODUCT',
        personal_use: 'CONFIRMED', showability: 'UNKNOWN', product_url: null,
        affiliate_url: null, evidence: null, restrictions: null, source: 'user_answer',
        user_confirmed: true, updated_at: '2026-08-12T00:00:00Z', archived_at: null,
      },
      error: null,
    }
  },
}
// The head-count query: `.select(_, {head:true}).eq(...).is(...)` awaited directly.
;(chain as Record<string, unknown>).countable = {
  eq() { return (chain as Record<string, unknown>).countable },
  is(col: string) { state.countFilters.push(col); return (chain as Record<string, unknown>).countable },
  then(resolve: (v: unknown) => void) {
    resolve({ count: state.count, error: state.countErr })
  },
}

initApi({ client: { from: () => chain } as unknown as SupabaseClient })

const ATTEST = {
  relationship: 'AFFILIATE' as const, personalUse: 'NOT_CONFIRMED' as const,
  type: 'SAAS' as const, name: 'Twin',
}

beforeEach(() => {
  state.count = 0; state.countErr = null; state.insertErr = null
  state.countFilters = []; state.inserted = false
})

describe('the limit is configuration, never a hard-coded assumption', () => {
  it('reads the allowance from entitlements', () => {
    expect(productLibraryLimit({ product_library_limit: 10 })).toBe(10)
    expect(productLibraryLimit({ product_library_limit: 0 })).toBe(0)
  })

  it('an ABSENT or unusable entitlement means unlimited, never zero', () => {
    // ⚠️ FAILING OPEN IS THE CHEAPER MISTAKE. Failing closed on an unknown plan
    // name locks paying customers out of a feature over a rename.
    for (const e of [null, undefined, {}, { product_library_limit: 'ten' },
      { product_library_limit: -1 }, { product_library_limit: NaN }]) {
      expect(productLibraryLimit(e as Record<string, unknown>)).toBe(Infinity)
    }
  })
})

describe('the two failures never wear each other\'s clothes', () => {
  it('a full library refuses with the COMMERCIAL error and names the allowance', async () => {
    state.count = 3
    await expect(claimProductEntity('u1', 'v1', ATTEST, { product_library_limit: 3 }))
      .rejects.toThrow(ProductLibraryFullError)
    expect(state.inserted).toBe(false)
    await expect(claimProductEntity('u1', 'v1', ATTEST, { product_library_limit: 3 }))
      .rejects.toThrow(/Product Library limit of 3/)
  })

  it('surfaces an unexpected 23505 as itself, not as a plan limit', async () => {
    // ⚠️ THIS TEST ASSERTED THE DEFECT AND IS REWRITTEN, NOT RELAXED. It read
    // "a duplicate mint refuses with the CORRECTNESS error even when there is
    // room" and pinned `OwnedEntityExistsError` — the "only one owned product
    // per voice" rule. 0186 established that rule was WRONG: three of five real
    // accounts own two things, and a creator adding a second product now simply
    // gets it. There is no correctness refusal left to assert.
    //
    // ⚠️ IT ALSO PASSED VACUOUSLY THE MOMENT THE CLASS WAS DELETED. The import
    // resolved to `undefined` and `.rejects.toThrow(undefined)` accepts ANY
    // error — demonstrated directly, an unrelated TypeError satisfies it — so
    // the suite stayed green while the assertion meant nothing. This tsconfig
    // excludes `src/**/__tests__/**`, so tsc never saw the missing import either.
    //
    // ⚖️ THE ORDERING CLAIM IT WAS REALLY MAKING SURVIVES, AND IS WHAT THIS NOW
    // TESTS: a database error must never be reported as a commercial limit. A
    // creator with plenty of allowance who hits an unexpected constraint must
    // see that constraint, not an invitation to upgrade.
    state.count = 0
    state.insertErr = { code: '23505', message: 'duplicate key' }
    await expect(claimProductEntity('u1', 'v1', ATTEST, { product_library_limit: 99 }))
      .rejects.toThrow(/duplicate key/)
    await expect(claimProductEntity('u1', 'v1', ATTEST, { product_library_limit: 99 }))
      .rejects.not.toThrow(ProductLibraryFullError)
  })

  it('counts LIVE entities only, so archiving really does make room', async () => {
    // ⚖️ If archived rows counted, "archive a product or upgrade" would offer a
    // remedy that does nothing.
    state.count = 1
    await claimProductEntity('u1', 'v1', ATTEST, { product_library_limit: 5 })
    expect(state.countFilters).toContain('archived_at')
  })

  it('does not count at all when the plan is unlimited', async () => {
    await claimProductEntity('u1', 'v1', ATTEST, null)
    expect(state.countFilters).not.toContain('archived_at')
    expect(state.inserted).toBe(true)
  })

  it('an unreadable count ALLOWS the write rather than refusing it', async () => {
    // ⚠️ Reading the allowance is not the same as being over it. Treating a
    // transient error as "full" blocks paying customers for no reason.
    state.count = 0
    state.countErr = { message: 'timeout' }
    await expect(claimProductEntity('u1', 'v1', ATTEST, { product_library_limit: 1 }))
      .resolves.not.toThrow()
    expect(state.inserted).toBe(true)
  })
})
