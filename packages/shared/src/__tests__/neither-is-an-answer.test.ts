// A QUESTION WITH NO HONEST ANSWER IS WORSE THAN NO QUESTION.
//
// ⚠️ `mustAskWhichProduct` ASKS WHILE THE ANSWER IS EMPTY. A creator whose
// commercial video is about none of their three products had two ways out: pick
// one that is wrong, or abandon the build. The card could not be finished
// truthfully.
//
// ⚖️ AND "NEITHER" IS NOT "THIS IS NOT A SELLING VIDEO". That is a creative
// determination made upstream and already has a branch. This is the creator
// saying: it IS commercial, and it is about none of these. Collapsing the two
// would record a decision they did not make.
import { describe, expect, it } from 'vitest'
import {
  selectProduct, mustAskWhichProduct, NO_PRODUCT_CHOICE, NO_PRODUCT_EXPLANATION,
  productChoiceConstraint,
} from '../productSelection'

const TWO = { ownedProductIds: ['a', 'b'], mayUseAProduct: true }

describe('neither', () => {
  it('is an ANSWER — the card stops asking', () => {
    expect(mustAskWhichProduct(TWO)).toBe(true)
    expect(mustAskWhichProduct({ ...TWO, chosenId: NO_PRODUCT_CHOICE })).toBe(false)
  })

  it('reports that they chose none, not that their choice was invalid', () => {
    // ⚠️ ORDER OF THE BRANCHES. Falling through to the membership check would
    // answer "that product is not in your library" — blaming the creator for
    // answering the question.
    expect(selectProduct({ ...TWO, chosenId: NO_PRODUCT_CHOICE }))
      .toEqual({ kind: 'none', reason: 'creator_chose_none' })
    expect(selectProduct({ ...TWO, chosenId: 'not-mine' }))
      .toEqual({ kind: 'none', reason: 'choice_not_theirs' })
  })

  it('is still distinct from a non-commercial video', () => {
    expect(selectProduct({ ...TWO, chosenId: NO_PRODUCT_CHOICE, mayUseAProduct: false }))
      .toEqual({ kind: 'none', reason: 'not_a_commercial_video' })
  })

  it('has plain English for a creator, like every other reason', () => {
    for (const [reason, text] of Object.entries(NO_PRODUCT_EXPLANATION)) {
      expect(text, reason).toMatch(/[a-z]/)
      expect(text, reason).not.toMatch(/_/)
    }
    expect(NO_PRODUCT_EXPLANATION.creator_chose_none).toMatch(/not about any of your products/)
  })
})

describe('the constraint each option states', () => {
  it('reads the entitlement rule rather than restating it', () => {
    // ⚖️ A SECOND COPY OF "what may this product claim" is the two-derivations
    // defect the capability question just had. These sentences are a READER for
    // `claimRulesFor`, so they move when it moves.
    expect(productChoiceConstraint('OWN_PRODUCT', 'CONFIRMED'))
      .toMatch(/speak from experience/)
    expect(productChoiceConstraint('OWN_PRODUCT', 'NOT_CONFIRMED'))
      .toMatch(/have not told us you use it/)
    expect(productChoiceConstraint('SPONSOR', 'NOT_CONFIRMED'))
      .toMatch(/disclosed as paid/)
    expect(productChoiceConstraint('AFFILIATE', 'CONFIRMED'))
      .toMatch(/disclosed as paid|attributed/)
  })

  it('never returns an empty string or a reason code', () => {
    for (const r of ['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR', 'REVIEW_ONLY', 'NONE'] as const) {
      for (const u of ['CONFIRMED', 'NOT_CONFIRMED'] as const) {
        const text = productChoiceConstraint(r, u)
        expect(text.length, `${r}/${u}`).toBeGreaterThan(10)
        expect(text, `${r}/${u}`).not.toMatch(/_|CONFIRMED|OWN_/)
        // ⚖️ A SENTENCE, capitalised and stopped — this is read by a creator
        // beside a name, not by a developer in a log.
        expect(text[0], `${r}/${u}`).toBe(text[0].toUpperCase())
        expect(text.endsWith('.'), `${r}/${u}`).toBe(true)
      }
    }
  })
})

// ── AND BOTH ENDS READ IT ─────────────────────────────────────────────────
//
// ⚠️ THE DANGEROUS HALF IS THE SERVER'S. An unrecognised id finds no row,
// `chosenEntity` stays null, and the oldest-first stopgap then hands the writer
// a product — so "this video is about none of my products" would have produced
// a script about one of them. Declining must arrive as a DECISION, not as an
// absence, and an absence is exactly what a client-side filter would send.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const CARD = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

describe('the decline survives the wire', () => {
  it('the edge knows the sentinel by the same string', () => {
    expect(EDGE).toContain(`const NO_PRODUCT_CHOICE_INLINE = '${NO_PRODUCT_CHOICE}'`)
  })

  it('a decline beats the stopgap, not merely the chosen lookup', () => {
    // ⚠️ `chosenEntity ?? stopgapEntity` ALONE FALLS THROUGH. Skipping the
    // lookup is not enough; the fallback is the thing that had to be stopped.
    expect(EDGE).toMatch(/const ownedEntity = declinedAProduct \? null : \(chosenEntity \?\? stopgapEntity\)/)
  })

  it('the card offers it as a real option and sends it', () => {
    expect(CARD).toMatch(/value: NO_PRODUCT_CHOICE, label: 'None of these'/)
    // ⚖️ SENT, NOT FILTERED OUT. A client that dropped it would leave the
    // server with an absence, which is where the stopgap lives.
    expect(CARD).toMatch(/selected_product_id: chosenProductId/)
  })

  it('each option states its constraint, from the shared reader', () => {
    expect(CARD).toMatch(/productChoiceConstraint\(entity\.relationship, entity\.personalUse\)/)
    // ⚠️ THE DESCRIPTION THE CREATOR WROTE, not a paraphrase of it.
    expect(CARD).toMatch(/entity\?\.creatorSummary/)
  })

  it('the picker opens in place — it never navigates away mid-build', () => {
    // ⚖️ Sending a creator to /products in the middle of a build loses the
    // build. The picker is rendered inside the card they are already answering.
    const block = CARD.slice(CARD.indexOf('PART 2: THE PICKER SURFACE'), CARD.indexOf(') : isChip(q) ? ('))
    expect(block.length).toBeGreaterThan(200)
    expect(block).not.toMatch(/nav\(|navigate\(|href=/)
  })
})
