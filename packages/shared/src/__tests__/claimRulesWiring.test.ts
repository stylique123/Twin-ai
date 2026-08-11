// THE RULES WERE TESTED AND READ BY NOTHING.
//
// `claimRulesFor` and `mayWriteCommercialCta` had full coverage in
// productEntity.test.ts, and the only mention outside those tests was a COMMENT
// in Onboarding.tsx. Coverage proved the rules were right; nothing proved they
// were consulted. This file tests the second thing.
//
// ⚖️ It reads the EDGE SOURCE, because that is where the decision is actually
// made — `generate-blueprint` cannot import @twinai/shared under Deno deploy.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** ⚖️ RELATIVE TO THIS FILE, NEVER TO THE WORKING DIRECTORY. These reads used
 *  `../../…`, which resolves against CWD — so the test passed from
 *  `packages/shared` and threw ENOENT from the repo root. A test whose result
 *  depends on where it was invoked from reports on the invocation. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

import { describe, expect, it } from 'vitest'
import { claimRulesFor, mayWriteCommercialCta } from '../productEntity'

const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the edge decides CTAs from the relationship, not just the goal', () => {
  it('reads the relationship and personal_use off the entity at all', () => {
    expect(EDGE).toMatch(/ownedEntity\?\.relationship \?\? 'NONE'/)
    expect(EDGE).toMatch(/ownedEntity\?\.personal_use \?\? 'NOT_CONFIRMED'/)
  })

  it('a commercial goal CANNOT manufacture a tie that does not exist', () => {
    // The defect: goal alone drove the CTA, so REVIEW_ONLY + goal:sell asked
    // viewers to buy someone else's product. `forbidden` must short-circuit
    // BEFORE the goal is consulted.
    // ⚖️ ASSERTS THE RULE, NOT THE SPELLING. This pinned the literal
    // `commercialCta === 'forbidden' ? false` and broke when a provably-dead
    // `=== 'allowed'` arm was removed — a simplification, not a regression.
    // What must hold is that `only_if_intended` is REQUIRED for any sell
    // intent, which is the same short-circuit stated positively.
    expect(EDGE).toMatch(/const sellIntent = commercialCta === 'only_if_intended' && goalWantsSale/)
    // And the shared rule agrees: no intent unlocks a forbidden CTA.
    const review = claimRulesFor('REVIEW_ONLY')
    expect(mayWriteCommercialCta(review, 'sell')).toBe(false)
  })

  it('owning something still does not imply pitching it', () => {
    const owned = claimRulesFor('OWN_PRODUCT')
    expect(owned.commercialCta).toBe('only_if_intended')
    expect(mayWriteCommercialCta(owned, null)).toBe(false)
    expect(mayWriteCommercialCta(owned, 'sell')).toBe(true)
    // The edge mirrors it: only_if_intended is gated on the goal, and NOTHING
    // else can grant intent — no relationship value bypasses `goalWantsSale`.
    expect(EDGE).toMatch(/const sellIntent = commercialCta === 'only_if_intended' && goalWantsSale/)
    expect(EDGE).not.toMatch(/commercialCta === 'allowed'/)
  })

  it('the same relationships require disclosure in both places', () => {
    for (const rel of ['AFFILIATE', 'SPONSOR'] as const) {
      expect(claimRulesFor(rel).disclosureRequired).toBe(true)
    }
    for (const rel of ['OWN_PRODUCT', 'OWN_SERVICE', 'REVIEW_ONLY', 'NONE'] as const) {
      expect(claimRulesFor(rel).disclosureRequired).toBe(false)
    }
    expect(EDGE).toMatch(/rel === 'AFFILIATE' \|\| rel === 'SPONSOR'/)
    expect(EDGE).toMatch(/DISCLOSURE IS REQUIRED AND IS NOT OPTIONAL/)
  })

  it('marketing claims are attributed for a commercial tie and refused for a review', () => {
    expect(claimRulesFor('AFFILIATE').marketingClaims).toBe('attributed')
    expect(claimRulesFor('REVIEW_ONLY').marketingClaims).toBe('forbidden')
    expect(EDGE).toMatch(/THE VENDOR..?S CLAIMS ARE THEIRS/)  // source escapes the apostrophe
    expect(EDGE).toMatch(/THIS IS A REVIEW, NOT AN ADVERTISEMENT/)
  })

  it('unconfirmed personal use forbids first-person usage claims', () => {
    // Same rule the per-beat substance check enforces, stated up front: nothing
    // licenses a personal history except the creator being on record for it.
    expect(claimRulesFor('OWN_PRODUCT', 'NOT_CONFIRMED').creatorExperience).toBe(false)
    expect(claimRulesFor('OWN_PRODUCT', 'CONFIRMED').creatorExperience).toBe(true)
    expect(EDGE).toMatch(/personalUse === 'CONFIRMED'/)
    expect(EDGE).toMatch(/HAS NOT CONFIRMED THEY PERSONALLY USE THIS/)
  })

  it('the block actually reaches the prompt', () => {
    // A block that is computed and never interpolated is the defect this whole
    // file exists for, one level down.
    expect(EDGE).toMatch(/\$\{ctaIntentLine\}\$\{claimRulesBlock\}/)
  })
})
