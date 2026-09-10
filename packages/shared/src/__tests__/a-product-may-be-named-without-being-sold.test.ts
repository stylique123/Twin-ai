// SHE COULD NOT NAME HER OWN PRODUCT IN HER OWN VIDEO.
//
// ⚠️ THE CASE, EXACTLY. A creator teaching her skincare routine, using her own
// serum: goal `educate`, focus `advice`. `showsCommercialBlock` is
// `wantsSale || wantsProductSubstance` — false on both — so `mayUseAProduct` was
// false and `selectProduct` refused the product outright with
// `not_a_commercial_video`. Not because a claim rule forbade it. Because the
// video was not a sales video.
//
// ⚠️ AND THE REPOSITORY ALREADY CLAIMED THIS WORKED. `V2Create.doors.test.tsx`
// carries the sentence "A PRODUCT CAN STILL APPEAR IN ANY DOOR... Mentioning a
// product in an idea video is a different thing and stays available
// everywhere." It was available nowhere. A note describing behaviour nothing
// implements is the defect class this session keeps finding, written in prose
// instead of code.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  selectProduct, mustAskWhichProduct, MENTION_RULES, NO_PRODUCT_CHOICE,
} from '../productSelection'

const OWNED = ['p1', 'p2']

describe('a non-selling video may name a product she chose', () => {
  it('returns a mention rather than refusing outright', () => {
    expect(selectProduct({ ownedProductIds: OWNED, chosenId: 'p1', mayUseAProduct: false }))
      .toEqual({ kind: 'mention', productId: 'p1' })
  })

  it('it is NOT `chosen`, so every subject-reader stays blind to it', () => {
    // ⚠️⚠️ THE SAFETY PROPERTY. Claim entitlement, substance and the CTA all
    // key on a chosen or auto product. A mention that reported itself as
    // `chosen` would hand a non-selling video the full commercial permission
    // set — the exact override the commercial gate exists to prevent.
    const c = selectProduct({ ownedProductIds: OWNED, chosenId: 'p1', mayUseAProduct: false })
    expect(c.kind).not.toBe('chosen')
    expect(c.kind).not.toBe('auto')
  })

  it('carries strictly fewer permissions than a subject, and says which', () => {
    expect(MENTION_RULES.mayName).toBe(true)
    expect(MENTION_RULES.mayMakeMarketingClaims).toBe(false)
    expect(MENTION_RULES.mayBuildSubstanceOnIt).toBe(false)
    expect(MENTION_RULES.mayAskForTheSale).toBe(false)
  })
})

describe('silence still yields nothing at all', () => {
  it('never auto-selects onto a video with no commercial intent', () => {
    // ⚠️⚠️ AUTO IS DELIBERATELY UNREACHABLE HERE. With one product and no
    // choice, a commercial video auto-selects — arithmetic, not judgement. On a
    // NON-commercial video the same arithmetic would put a product into a
    // script she never asked to mention, and "the writer never picks which
    // product" is a rule with a mutation-tested clamp behind it.
    expect(selectProduct({ ownedProductIds: ['only'], chosenId: '', mayUseAProduct: false }))
      .toEqual({ kind: 'none', reason: 'not_a_commercial_video' })
    expect(selectProduct({ ownedProductIds: ['only'], chosenId: null, mayUseAProduct: false }))
      .toEqual({ kind: 'none', reason: 'not_a_commercial_video' })
  })

  it('a decline is still a decline', () => {
    expect(selectProduct({ ownedProductIds: OWNED, chosenId: NO_PRODUCT_CHOICE, mayUseAProduct: false }))
      .toEqual({ kind: 'none', reason: 'not_a_commercial_video' })
  })

  it('an id that is not hers is refused, not mentioned', () => {
    // ⚖️ MEMBERSHIP BEFORE ANY FALLBACK, unchanged from the subject path: a
    // forged id must not become somebody else's product name in her script.
    expect(selectProduct({ ownedProductIds: OWNED, chosenId: 'not-hers', mayUseAProduct: false }))
      .toEqual({ kind: 'none', reason: 'choice_not_theirs' })
  })

  it('the card does not start asking on non-commercial videos', () => {
    // ⚖️ A MENTION IS OPT-IN. `mustAskWhichProduct` fires only on
    // `creator_has_not_chosen`, which the non-commercial branch never returns —
    // so this change adds no question to a video that did not have one.
    expect(mustAskWhichProduct({ ownedProductIds: OWNED, chosenId: '', mayUseAProduct: false })).toBe(false)
  })
})

describe('the commercial path is untouched', () => {
  it('still chooses, auto-selects and refuses exactly as before', () => {
    expect(selectProduct({ ownedProductIds: OWNED, chosenId: 'p2', mayUseAProduct: true }))
      .toEqual({ kind: 'chosen', productId: 'p2' })
    expect(selectProduct({ ownedProductIds: ['only'], chosenId: '', mayUseAProduct: true }))
      .toEqual({ kind: 'auto', productId: 'only' })
    expect(selectProduct({ ownedProductIds: OWNED, chosenId: '', mayUseAProduct: true }))
      .toEqual({ kind: 'none', reason: 'creator_has_not_chosen' })
    expect(selectProduct({ ownedProductIds: [], chosenId: '', mayUseAProduct: true }))
      .toEqual({ kind: 'none', reason: 'no_products' })
  })

  it('a mention is never produced on a commercial video', () => {
    for (const chosenId of ['p1', '', null, NO_PRODUCT_CHOICE, 'not-hers']) {
      expect(selectProduct({ ownedProductIds: OWNED, chosenId, mayUseAProduct: true }).kind)
        .not.toBe('mention')
    }
  })
})

// ── THE EDGE, WHERE THE PERMISSION IS ACTUALLY SPENT ──────────────────────
const dir = dirname(fileURLToPath(import.meta.url))
const EDGE = readFileSync(join(dir, '..', '..', '..', '..',
  'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const BUILDING = readFileSync(join(dir, '..', '..', '..', '..',
  'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the mention reaches the writer, under its own name', () => {
  it('travels in a separate field, never as the selected product', () => {
    // ⚠️⚠️ IF IT SHARED `selected_product_id`, every existing reader of that
    // field would silently promote a mention to a subject on the day this
    // merged. Under its own name they cannot see it at all.
    expect(BUILDING).toMatch(/const mentionedProductId = decided\.kind === 'mention' \? decided\.productId : ''/)
    expect(BUILDING).toMatch(/mentioned_product_id: mentionedProductId \|\| undefined/)
    expect(EDGE).toMatch(/body\.mentioned_product_id/)
  })

  it('is never assigned to ownedEntity', () => {
    // ⚖️ `ownedEntity` IS THE SUBJECT. Claim rules, substance and the CTA all
    // read it; a mention written there would inherit the lot.
    const block = EDGE.slice(EDGE.indexOf('let mentionLine'), EDGE.indexOf('const showLine'))
    expect(block).not.toMatch(/ownedEntity\s*=/)
    // ⚠️⚠️ THE SECOND ASSERTION HERE WAS WRONG, AND IT PROTECTED A COMPLIANCE
    // FAILURE FOR AS LONG AS IT STOOD. It read:
    //
    //   // And it only runs when there is no subject, so the two can never
    //   // both fire.
    //   expect(block).toMatch(/mentionedId !== '' && !ownedEntity/)
    //
    // "The two can never both fire" was treated as a safety property. It is not:
    // a mention and a subject firing together is the ORDINARY case — explaining
    // her coaching while naming the band she uses. And because the server's
    // stopgap resolves the oldest owned product whenever no selection arrives,
    // `ownedEntity` was almost always truthy, so the mention was almost always
    // DISCARDED.
    //
    // ⚠️ MEASURED ON TEN LIVE RUNS: on every non-commercial objective the
    // creator picked her affiliate band, the mention was dropped here, the writer
    // was handed her COACHING SERVICE instead and never learned the band existed
    // — so it invented a stance, and the stance attacked the product she earns a
    // commission on, with no disclosure.
    //
    // ⚖️ THE REAL COLLISION IS NARROWER AND IS WHAT IS ASSERTED NOW: the mention
    // may not name the SUBJECT ITSELF, or the prompt would say "name it and
    // nothing else" about the very product the video is about. The client sends
    // these on mutually exclusive branches; the server may not rely on that.
    expect(block).toMatch(/mentionedId !== '' && !mentionIsTheSubject/)
    expect(block).toMatch(/const mentionIsTheSubject/)
    // ⚠️ AND THE OLD CONDITION MUST NOT RETURN. It is one token from the new one.
    expect(block).not.toMatch(/mentionedId !== '' && !ownedEntity/)
  })

  it('re-verifies ownership on the server', () => {
    // ⚠️ A REQUEST CAN SEND ANY ID. Filtering on `owner_id` means the worst a
    // forged id achieves is silence.
    const block = EDGE.slice(EDGE.indexOf('let mentionLine'), EDGE.indexOf('const showLine'))
    expect(block).toMatch(/\.eq\('owner_id', ownerId\)/)
    expect(block).toMatch(/\.is\('archived_at', null\)/)
  })

  it('permits the name and forbids the rest, in the prompt itself', () => {
    const block = EDGE.slice(EDGE.indexOf('let mentionLine'), EDGE.indexOf('const showLine'))
    expect(block).toMatch(/YOU MAY NAME/)
    expect(block).toMatch(/Do NOT make claims/)
    expect(block).toMatch(/do NOT build a point on its features/)
    expect(block).toMatch(/do NOT ask anyone to buy, try or click/)
  })

  it('a paid tie still discloses, and that case matters more', () => {
    // ⚠️⚠️ DISCLOSURE KEYS ON THE RELATIONSHIP, NOT ON WHETHER THE VIDEO
    // SELLS. An ad that does not look like an ad is the one a viewer cannot
    // discount for themselves, so a sponsored product named in an educational
    // video discloses exactly as it would in a sales video.
    const block = EDGE.slice(EDGE.indexOf('let mentionLine'), EDGE.indexOf('const showLine'))
    expect(block).toMatch(/mentionRel === 'AFFILIATE' \|\| mentionRel === 'SPONSOR'/)
    expect(block).toMatch(/PAID RELATIONSHIP/)
    expect(block).toMatch(/before the halfway point/)
  })

  it('the line actually reaches the prompt', () => {
    // ⚖️ A COMPUTED STRING THAT NEVER REACHES THE TEMPLATE is the shape
    // `creator_summary` had for a whole release.
    expect(EDGE).toMatch(/\$\{workKindLine\}\$\{mentionLine\}/)
  })
})
