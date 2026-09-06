// AN ENTITLEMENT COMES FROM AN ANSWER, OR IT DOES NOT COME.
//
// ⚠️ THE PRESSURE THIS RESISTS. 64 rows of `kind='product'` sit extracted in
// `creator_knowledge`, and `product_entities` was empty for its entire
// existence. Copying one table into the other closes the gap in an afternoon and
// is wrong: knowing a creator SAID "Peak Design Phone Tripod" is evidence they
// mentioned it, and no evidence at all that they own it, earn on it, or have
// ever held one. Those are the facts that decide whether a commercial CTA is
// permitted, whether disclosure is required, and whether a marketing claim may
// be put in their mouth.
//
// ⚖️ SO THE CLAIM PATH TAKES AN ATTESTATION, NOT A SUGGESTION. These tests pin
// the properties that make that more than a naming convention.
import { describe, expect, it, beforeEach } from 'vitest'
import { attestedEntity } from '../productEntity'
import { initApi, claimProductEntity } from '../api'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('attestedEntity records what was asserted, and nothing more', () => {
  const base = {
    relationship: 'AFFILIATE' as const,
    personalUse: 'NOT_CONFIRMED' as const,
    type: 'SAAS' as const,
    name: 'Buildpad',
    now: '2026-08-12T00:00:00Z',
  }

  it('marks the entity as a USER ANSWER, dated', () => {
    // ⚖️ The pair that later separates "we worked this out" from "they told us".
    // A Q3 mint writes `inferred` for exactly this reason.
    const e = attestedEntity(base)
    expect(e.source).toBe('user_answer')
    expect(e.userConfirmed).toBe(true)
    expect(e.updated).toBe('2026-08-12T00:00:00Z')
  })

  it('NEVER derives personal use from the relationship', () => {
    // ⚠️ THE TEMPTING SHORTCUT. "They own it, so obviously they use it" is how a
    // creator ends up saying "I use this every day" about a product they have
    // never opened. Owning licenses commercial language; using licenses
    // experience language. They are different permissions.
    for (const relationship of ['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR'] as const) {
      expect(attestedEntity({ ...base, relationship, personalUse: 'NOT_CONFIRMED' }).personalUse)
        .toBe('NOT_CONFIRMED')
    }
    // And it carries CONFIRMED only when that is what was answered.
    expect(attestedEntity({ ...base, personalUse: 'CONFIRMED' }).personalUse).toBe('CONFIRMED')
  })

  it('leaves showability UNKNOWN when the capability answers are absent', () => {
    // Unanswered is not a denial and not a permission.
    expect(attestedEntity(base).showability).toBe('UNKNOWN')
    expect(attestedEntity({ ...base, flags: { canRecordScreen: true } }).showability).toBe('ALWAYS')
    expect(attestedEntity({ ...base, flags: { canRecordScreen: false } }).showability).toBe('NEVER')
  })

  it('never invents an affiliate link from an affiliate relationship', () => {
    // ⚠️ A commission existing is not a URL. Inventing one puts a link on screen
    // that nobody gave us.
    expect(attestedEntity({ ...base, relationship: 'AFFILIATE' }).affiliateUrl).toBeNull()
  })

  it('starts with no approved claims rather than none-recorded', () => {
    // §5a.5: an outcome claim needs a permission that EXISTS. A fresh entity has
    // approved nothing, which is a state, not a gap.
    expect(attestedEntity(base).restrictions.approvedClaims).toEqual([])
    expect(attestedEntity(base).evidence).toBeNull()
  })

  it('carries the creator\'s own fallback sentence through, trimmed', () => {
    // ⚠️ THIS IS THE ONE-LINE ANSWER migration 0177 gives a column to. It is not
    // extracted knowledge, so it travels through the attestation the same way
    // `name` does — never inferred, never derived off a page.
    expect(attestedEntity({ ...base, creatorSummary: '  A tripod for phones.  ' }).creatorSummary)
      .toBe('A tripod for phones.')
  })

  it('leaves the fallback sentence null when it was never asked or answered', () => {
    expect(attestedEntity(base).creatorSummary).toBeNull()
    expect(attestedEntity({ ...base, creatorSummary: '   ' }).creatorSummary).toBeNull()
  })
})

// ── THE WRITE PATH ─────────────────────────────────────────────────────────
const captured: { row?: Record<string, unknown> } = {}
let failWith: { code?: string; message?: string } | null = null

const chain: Record<string, unknown> = {
  insert(row: Record<string, unknown>) { captured.row = row; return chain },
  select() { return chain },
  async single() {
    if (failWith) return { data: null, error: failWith }
    return {
      data: {
        id: 'e1', name: 'Buildpad', type: 'SAAS', relationship: 'AFFILIATE',
        personal_use: 'NOT_CONFIRMED', showability: 'UNKNOWN', product_url: null,
        affiliate_url: null, evidence: null, restrictions: null,
        source: 'user_answer', user_confirmed: true, updated_at: '2026-08-12T00:00:00Z',
      },
      error: null,
    }
  },
}
initApi({ client: { from: () => chain } as unknown as SupabaseClient })

beforeEach(() => { captured.row = undefined; failWith = null })

describe('claiming writes an entitlement, and refuses to overwrite one', () => {
  const attest = {
    relationship: 'OWN_PRODUCT' as const, personalUse: 'CONFIRMED' as const,
    type: 'SAAS' as const, name: 'Buildpad',
  }

  it('scopes an OWNED entity to the voice', () => {
    // The partial unique index is on voice_id for owned relationships — this is
    // what makes "one product per voice" mean the same thing in both places.
    void claimProductEntity('u1', 'v1', attest)
    expect(captured.row).toMatchObject({
      owner_id: 'u1', voice_id: 'v1', relationship: 'OWN_PRODUCT',
      source: 'user_answer', user_confirmed: true,
    })
  })

  it('does NOT scope a non-owned entity to the voice', () => {
    // ⚠️ An affiliate row carrying voice_id would collide with the owned-product
    // index the moment the creator later claims something they actually own.
    void claimProductEntity('u1', 'v1', { ...attest, relationship: 'AFFILIATE' })
    expect(captured.row?.voice_id).toBeNull()
  })

  it('writes creator_summary onto the row it inserts', async () => {
    // ⚠️ THIS IS THE WRITE HALF OF BUG 3'S SIBLING FEATURE. Without this line,
    // the add form's new "in one line" field would collect an answer nobody
    // ever persisted -- recorded and ignored, exactly what the spec says not to
    // ship.
    await claimProductEntity('u1', 'v1', { ...attest, creatorSummary: 'A tripod for phones.' })
    expect(captured.row).toMatchObject({ creator_summary: 'A tripod for phones.' })
  })

  it('SAVES a second owned product instead of refusing it', async () => {
    // ⚠️ THIS TEST ASSERTED THE DEFECT AND IS REWRITTEN, NOT RELAXED. It read
    // "REFUSES a second owned product rather than overwriting the first" and
    // pinned `OwnedEntityExistsError`. Its stated worry — that reusing the
    // mint's update-in-place would silently replace one product with another —
    // was RIGHT, and is still honoured: `saveMintedEntity` now scopes its update
    // to `source='inferred' AND user_confirmed=false`, so it can only ever
    // overwrite the unconfirmed guess it wrote itself.
    //
    // ⚠️ WHAT WAS WRONG IS THE CONCLUSION IT DREW: that the only safe answer was
    // to refuse. Measured on real accounts, three of five own two things — bread
    // and bagels, a course and a membership, two product lines — and each was
    // told "Only one owned product is supported per voice." The refusal was the
    // data loss's cure and the creator's dead end.
    //
    // ⚖️ SO THE CLAIM FLIPS: no 23505, the insert lands, and the row carries the
    // creator's own answers.
    failWith = null
    const saved = await claimProductEntity('u1', 'v1', attest)
    expect(saved).not.toBeNull()
    expect(captured.row).toMatchObject({
      voice_id: 'v1',
      relationship: attest.relationship,
      // The deliberate act, never the guess — which is exactly what keeps it
      // outside the narrowed index's reach.
      source: 'user_answer',
      user_confirmed: true,
    })
  })

  it('does not disguise other database errors as the duplicate case', async () => {
    failWith = { code: '42501', message: 'permission denied' }
    await expect(claimProductEntity('u1', 'v1', attest)).rejects.toThrow(/permission denied/)
  })
})
