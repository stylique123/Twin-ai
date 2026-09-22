// "ASK US TO CHANGE IT" POINTED AT NOBODY.
//
// ⚠️ REPORTED 2026-09-22: the relationship field "doesn't appear to save."
// ⚠️⚠️ AND IT SAVES. Measured on production the same day: 23 OWN_PRODUCT, 2
// AFFILIATE, 2 SPONSOR, 1 OWN_SERVICE — all written by the add form, none
// dropped. The tie also reaches the writer, through `brief.promotes`, which
// generate-blueprint reads fifteen times and which drives disclosure. The
// reported sentence is false and this file says so before fixing anything.
//
// ⚠️ WHAT WAS TRUE IS THAT IT COULD NEVER CHANGE. The opened product rendered
// the relationship as TEXT, with "it is not editable here. Ask us to change it"
// — and there is no us on that screen. A creator whose review became an
// affiliate deal, or whose sponsorship ended, had no route at all, and what she
// experienced is exactly "a field that will not take my answer".
//
// ⚖️ THE LOCK'S ARGUMENT IS NOT BEING OVERTURNED, WHICH IS THE POINT OF A
// SEPARATE FUNCTION. `EntityPresentationEdit` still forbids `relationship` and
// `updateEntityPresentation` still drops it at runtime — `entityPresentationEdit`
// pins both, and neither is touched. An entitlement change now has a writer of
// its own, so it must be made deliberately rather than smuggled through a
// presentation edit. The two facts are tested in two files for that reason.
//
// ⚠️⚠️ THE MUTANT THIS FILE EXISTS FOR is "keep `affiliate_url` when the
// relationship leaves AFFILIATE." It is the natural, tidy-looking omission — a
// writer that only sets the field it was asked about — and it has a victim.
// Disclosure follows the RELATIONSHIP; the link does not. A stale commission
// address would point a viewer through a paid link on a video that correctly
// carried no disclosure, because by then the row says there is nothing to
// disclose. Clearing it is not housekeeping.

import { describe, expect, it, beforeEach } from 'vitest'
import { initApi, changeEntityRelationship, updateEntityPresentation } from '../api'
import type { SupabaseClient } from '@supabase/supabase-js'

const captured: { table?: string; row?: Record<string, unknown>; id?: string } = {}

const chain: Record<string, unknown> = {
  update(row: Record<string, unknown>) { captured.row = row; return chain },
  eq(_col: string, v: string) { captured.id = v; return chain },
  select() { return chain },
  async single() {
    return {
      data: {
        id: 'e1', name: 'Medicube pads', type: 'PHYSICAL_PRODUCT',
        relationship: 'AFFILIATE', personal_use: 'NOT_CONFIRMED',
        showability: 'ALWAYS', product_url: null, affiliate_url: null,
        evidence: null, restrictions: null, source: 'user_answer',
        user_confirmed: true, updated_at: '2026-09-22T00:00:00Z',
      },
      error: null,
    }
  },
}
initApi({
  client: { from(t: string) { captured.table = t; return chain } } as unknown as SupabaseClient,
})

beforeEach(() => { captured.row = undefined; captured.id = undefined })

describe('a tie that could never change', () => {
  it('records the new relationship against the product', async () => {
    await changeEntityRelationship('e1', 'AFFILIATE', 'https://shop.test/ref/7')
    expect(captured.table).toBe('product_entities')
    expect(captured.id).toBe('e1')
    expect(captured.row?.relationship).toBe('AFFILIATE')
    expect(captured.row?.affiliate_url).toBe('https://shop.test/ref/7')
  })

  it('records it as the creator speaking, which is what "when it changed" rests on', async () => {
    // ⚠️ THE PAIR IS THE RECORD. `updated_at` carries the moment; `source` and
    // `user_confirmed` carry that a person asserted it rather than a scan
    // guessing. Neither may be set anywhere a creator has not answered.
    await changeEntityRelationship('e1', 'SPONSOR')
    expect(captured.row?.source).toBe('user_answer')
    expect(captured.row?.user_confirmed).toBe(true)
  })

  it('clears the commission address on every destination but AFFILIATE', async () => {
    for (const next of ['OWN_PRODUCT', 'OWN_SERVICE', 'SPONSOR', 'REVIEW_ONLY'] as const) {
      await changeEntityRelationship('e1', next, 'https://shop.test/ref/7')
      expect(captured.row?.affiliate_url, `${next} must not keep a commission link`).toBeNull()
    }
  })

  it('does not invent a commission address AFFILIATE was not given', async () => {
    // ⚖️ ABSENT IS NOT A DENIAL AND IS NOT A URL. `attestedEntity` writes null
    // for the same reason: a commission exists, and where it points is a
    // separate thing nobody has told us.
    await changeEntityRelationship('e1', 'AFFILIATE')
    expect(captured.row?.relationship).toBe('AFFILIATE')
    expect('affiliate_url' in (captured.row ?? {})).toBe(false)
    await changeEntityRelationship('e1', 'AFFILIATE', '   ')
    expect('affiliate_url' in (captured.row ?? {})).toBe(false)
  })

  it('refuses NONE, which is an onboarding answer and not a relationship', async () => {
    // ⚠️ "I sell nothing" is a fact about the CREATOR that
    // `rowAnswersProductQuestion` reads as having answered. A product edit that
    // could write it would silently re-answer onboarding from a screen that is
    // not asking, and one that could overwrite it would delete the answer.
    const out = await changeEntityRelationship('e1', 'NONE' as never)
    expect(out).toBeNull()
    expect(captured.row).toBeUndefined()
  })

  it('refuses a value outside the enum handed in past the compiler', async () => {
    const out = await changeEntityRelationship('e1', 'OWNER' as never)
    expect(out).toBeNull()
    expect(captured.row).toBeUndefined()
  })

  it('never touches personal use, because a commission is not evidence of using a thing', async () => {
    await changeEntityRelationship('e1', 'AFFILIATE', 'https://shop.test/ref/7')
    expect('personal_use' in (captured.row ?? {})).toBe(false)
  })

  it('leaves the presentation writer unable to do any of this', async () => {
    // ⚖️ THE GUARANTEE THIS CHANGE MUST NOT COST. A second writer for
    // entitlements is only safe while the first one still refuses them.
    await updateEntityPresentation('e1', {
      name: 'Medicube pads',
      relationship: 'OWN_PRODUCT', personalUse: 'CONFIRMED',
    } as never)
    expect('relationship' in (captured.row ?? {})).toBe(false)
    expect('personal_use' in (captured.row ?? {})).toBe(false)
  })
})
