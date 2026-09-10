import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  selectProduct, mustAskWhichProduct, PRODUCT_CHOICE_FIELD, NO_PRODUCT_EXPLANATION,
} from '../productSelection'

/**
 * ⚠️ THREE OF FIVE REAL ACCOUNTS OWN TWO THINGS, and `generate-blueprint` read
 * the OLDEST one. Deterministic — the same creator got the same product every
 * time — and still not "the one this video is about".
 *
 * ⚖️ THE FIX IS NOT A SMARTER GUESS. Picking among three would have Twin infer
 * commercial intent from nothing the creator said, the entitlement
 * `entryDoor.ts` keeps a mutation-tested clamp against. Owning three things is
 * not a statement about this video. So the card asks.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const BUILD = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const P = ['prod-a', 'prod-b', 'prod-c']

describe('the writer never picks which product', () => {
  it('two or more and no answer means NO product, not the oldest', () => {
    const c = selectProduct({ ownedProductIds: P, mayUseAProduct: true })
    expect(c.kind === 'none' && c.reason).toBe('creator_has_not_chosen')
    expect(mustAskWhichProduct({ ownedProductIds: P, mayUseAProduct: true })).toBe(true)
  })

  it('one product auto-selects, because there is no tie to break', () => {
    expect(selectProduct({ ownedProductIds: ['solo'], mayUseAProduct: true }))
      .toEqual({ kind: 'auto', productId: 'solo' })
    expect(mustAskWhichProduct({ ownedProductIds: ['solo'], mayUseAProduct: true })).toBe(false)
  })

  it('the creator\'s answer is used verbatim', () => {
    expect(selectProduct({ ownedProductIds: P, chosenId: 'prod-b', mayUseAProduct: true }))
      .toEqual({ kind: 'chosen', productId: 'prod-b' })
  })

  it('an id that is not theirs is REFUSED, never substituted', () => {
    const c = selectProduct({ ownedProductIds: P, chosenId: 'someone-elses', mayUseAProduct: true })
    expect(c.kind === 'none' && c.reason).toBe('choice_not_theirs')
  })

  it('a non-commercial video never gets a product as its SUBJECT', () => {
    // ⚠️ THIS ASSERTION CHANGED, AND THE RULE IT NAMES DID NOT. It used to read
    // `.toBe('not_a_commercial_video')` on an explicit choice, and it was a
    // correct pin of the behaviour at the time: a product was refused outright
    // on any video that was not selling. That refusal is what left a creator
    // teaching her routine unable to NAME her own serum.
    //
    // ⚖️ THE POLICY THIS TEST EXISTS FOR IS UNCHANGED AND IS WHAT IS ASSERTED
    // NOW. The worry recorded here was that "I picked my course" would override
    // the decision that this is not a selling video — the CTA bug in a
    // different costume. It cannot: `mention` is not `chosen`, carries no claim
    // entitlement, no substance and no CTA, and every reader keyed on a chosen
    // or auto product stays blind to it.
    const c = selectProduct({ ownedProductIds: P, chosenId: 'prod-b', mayUseAProduct: false })
    expect(c.kind).not.toBe('chosen')
    expect(c.kind).not.toBe('auto')
    expect(c).toEqual({ kind: 'mention', productId: 'prod-b' })
  })

  it('and it still gets NOTHING when she did not ask for one', () => {
    // ⚠️ THE HALF OF THE OLD ASSERTION THAT MUST SURVIVE VERBATIM. Silence on a
    // non-commercial video yields no product at all — a mention is opt-in, and
    // auto-selecting one here would be the writer picking.
    for (const chosenId of [null, undefined, '', '   ']) {
      const c = selectProduct({ ownedProductIds: P, chosenId, mayUseAProduct: false })
      expect(c.kind === 'none' && c.reason, String(chosenId)).toBe('not_a_commercial_video')
    }
    // Including with exactly one product, where the commercial path auto-selects.
    expect(selectProduct({ ownedProductIds: ['only'], chosenId: '', mayUseAProduct: false }))
      .toEqual({ kind: 'none', reason: 'not_a_commercial_video' })
  })

  it('an empty or missing choice is "not answered", never an id', () => {
    for (const chosenId of [null, undefined, '', '   ']) {
      const c = selectProduct({ ownedProductIds: P, chosenId, mayUseAProduct: true })
      expect(c.kind === 'none' && c.reason, String(chosenId)).toBe('creator_has_not_chosen')
    }
  })

  it('no products is a fact, not a failure', () => {
    const c = selectProduct({ ownedProductIds: [], mayUseAProduct: true })
    expect(c.kind === 'none' && c.reason).toBe('no_products')
  })

  it('every reason reads as English and none leaks a code', () => {
    for (const [code, text] of Object.entries(NO_PRODUCT_EXPLANATION)) {
      expect(text, code).not.toMatch(/_/)
      expect(text.length, code).toBeGreaterThan(20)
    }
  })
})

describe('the card asks, and the answer reaches the writer', () => {
  it('the screen calls the rule rather than re-deciding it', () => {
    expect(BUILD).toMatch(/mustAskWhichProduct\(\{/)
    // ⚖️ THE SAME COMMERCIAL EXPRESSION the commercial block uses. A second
    // notion of "is this a selling video" would be two answers to one question.
    expect(BUILD).toMatch(/mayUseAProduct: showsCommercialBlock\(answeredIntent\)/)
  })

  it('only OWNED, LIVE products are offered', () => {
    // A sponsored product the creator has never used is not something this
    // video can be "about" in the sense the writer needs.
    expect(BUILD).toMatch(/p\.relationship === 'OWN_PRODUCT' \|\| p\.relationship === 'OWN_SERVICE'/)
    expect(BUILD).toMatch(/p\.archivedAt === null/)
  })

  it('the question reaches the asked list, not just a variable', () => {
    // ⚠️ A string built and interpolated nowhere is how `readMechanism`
    // reached production. The chips must be IN `ask`.
    expect(BUILD).toMatch(/\.\.\.productQuestion,/)
  })

  it('the answer is sent, and only when they answered', () => {
    expect(BUILD).toMatch(/\.\.\.\(chosenProductId \? \{ selected_product_id: chosenProductId \} : \{\}\)/)
    // It must not leak into the two buckets that persist or drive intent.
    expect(BUILD).toMatch(/if \(k === PRODUCT_CHOICE_FIELD\) continue/)
  })

  it('one field name, shared by the screen and the send', () => {
    expect(PRODUCT_CHOICE_FIELD).toBe('selected_product')
    expect(BUILD).not.toMatch(/'selected_product'/) // never retyped as a literal
  })
})

describe('the edge honours the choice, and this pins it there', () => {
  // `selectProduct` STATES the policy; the edge SHIPS it, because an edge
  // function cannot import this package.

  it('the edge accepts the choice as INPUT, not only as an audit field', () => {
    expect(EDGE).toMatch(/selected_product_id\?: string/)
    expect(EDGE).toMatch(/body\.selected_product_id/)
  })

  it('it validates the id against the creator\'s own library', () => {
    const at = EDGE.indexOf('requestedProductId')
    expect(at).toBeGreaterThan(-1)
    const block = EDGE.slice(at, at + 1800)
    // ⚠️⚠️ THIS ASSERTED `['OWN_PRODUCT', 'OWN_SERVICE']` AND THE LIST HAS
    // DELIBERATELY WIDENED. The owner's decision: sponsored and affiliate
    // products become SELECTABLE, with disclosure enforced. So the old
    // assertion pinned behaviour that was decided against, and the test was the
    // thing that had to change — not the rule.
    //
    // ⚖️ WHAT IS PINNED INSTEAD IS THE ASYMMETRY, WHICH IS THE ACTUAL POLICY.
    // The CHOSEN lookup accepts a paid tie because the creator asked for that
    // product by name. The STOPGAP below must not, because auto-selecting a
    // sponsored product nobody mentioned would infer a paid promotion from
    // nothing. Asserting the two lists separately is what stops the widening
    // from leaking into the branch it must never reach.
    expect(block).toMatch(/\.eq\('owner_id', ownerId\)/)
    expect(block).toMatch(/\.in\('relationship', \['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR'\]\)/)
    expect(block).toMatch(/\.is\('archived_at', null\)/)
    // ⚠️⚠️ THE FILTER THAT MAKES IT A CHOICE, AND IT WAS NOT ASSERTED ANYWHERE. A
    // MUTANT FOUND THIS: deleting `.eq('id', requestedProductId)` left every
    // other assertion in this file — whose title is "the writer never picks which
    // product" — passing, while the query returned an arbitrary owned row. That
    // is the writer picking, which is the one thing this file exists to forbid,
    // and it mattered more once the oldest-first fallback was deleted, because
    // this is now the ONLY query that resolves the subject.
    expect(block).toMatch(/\.eq\('id', requestedProductId\)/)
  })

  // ⚠️⚠️ THREE ASSERTIONS HERE USED TO PIN THE STOPGAP AS A PROPERTY, AND ONE OF
  // THEM WAS TITLED "the stopgap survives". It does not survive, and keeping the
  // assertions would have made the three compliance failures below unfixable
  // without deleting a green test — which is exactly how a defect acquires
  // tenure. Asking which was wrong: the CODE was wrong and the tests faithfully
  // described it. What they described was never a property; it was a placeholder
  // their own comments called a stopgap, named as such, and then froze.
  //
  // The assertions they carried that ARE properties are kept above and below:
  // the chosen lookup's relationship list, the refusal to auto-select among
  // several, and the decline. Only the fallback itself is gone.
  it('NOTHING is the subject unless it was selected', () => {
    // ⚠️⚠️ THE SHARED CAUSE OF THREE AUDITED COMPLIANCE FAILURES, all on one
    // creator with an owned coaching service and an affiliate band:
    //
    //   run 8      the band was selected and the script PITCHED THE COACHING,
    //              with an invented launch date and a "link in bio" she has not.
    //   runs 7, 10 the band was selected, the stopgap made `ownedEntity` truthy,
    //              so the mention branch never ran, the writer never heard the
    //              band existed, and it invented a stance AGAINST the product she
    //              earns commission on — with no disclosure, because the
    //              affiliate product was not in the script arguing against it.
    //
    // All three are the writer improvising on receiving nothing. When no product
    // was selected the correct output is a script with NO PRODUCT IN IT.
    expect(EDGE).toMatch(/const ownedEntity = declinedAProduct \? null : chosenEntity/)
  })

  it('and the fallback is GONE, not merely unreferenced', () => {
    // ⚖️ THE QUERY GOES WITH THE EXPRESSION. A dead lookup left in place is the
    // next person's "this already reads the library, I just need to use it".
    expect(EDGE).not.toMatch(/stopgapEntity/)
    expect(EDGE).not.toMatch(/\.order\('created_at', \{ ascending: true \}\)[\s\S]{0,200}maybeSingle/)
  })

  it('an auto-select is untouched, because it was never the server\'s to make', () => {
    // ⚠️ THE COST I REPORTED FOR THIS CHANGE WAS WRONG, AND THIS IS THE
    // ASSERTION THAT SAYS SO. I told the owner removing the stopgap would cost
    // single-product creators the `auto` convenience. It does not:
    // `selectProduct` auto-selects on the CLIENT, and V2Building sends that id as
    // `selected_product_id` for BOTH `chosen` and `auto`, so an auto-select
    // arrives as an explicit selection and flows through `chosenEntity`. What was
    // deleted is only the server picking with no id at all.
    expect(BUILD).toMatch(
      /decided\.kind === 'chosen' \|\| decided\.kind === 'auto'\s*\n?\s*\? decided\.productId/)
  })
})
