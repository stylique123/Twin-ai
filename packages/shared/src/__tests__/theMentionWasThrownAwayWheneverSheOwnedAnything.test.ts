// THE WRITER ARGUED AGAINST THE PRODUCT SHE EARNS COMMISSION ON.
//
// ⚠️⚠️ AUDITED ON TEN LIVE RUNS, ONE CREATOR, TWO PRODUCTS: an owned coaching
// service and an affiliate postpartum band. On every NON-COMMERCIAL objective
// she picked the band and the script never named it — and did not stay silent
// either. It invented a stance:
//
//   "a postpartum belly band will not heal your deep core"
//   "wearing a belly band all day actually weakens your core"
//   "stop wrapping your belly"
//
// Five hooks attacking the product she takes a commission on, produced by asking
// Twin to explain why she recommends it. No disclosure, because the affiliate
// product was not in the script it was arguing against.
//
// ⚠️ THE CAUSE WAS ONE CONDITION: `if (mentionedId !== '' && !ownedEntity)`.
// A non-commercial objective with a chosen product yields `kind: 'mention'` from
// `selectProduct` — "name it and nothing else" — and the client duly sends
// `mentioned_product_id`. But the server's stopgap resolves the oldest
// OWN_PRODUCT/OWN_SERVICE whenever no `selected_product_id` arrives, so
// `ownedEntity` is truthy, so the mention branch never ran. ANY CREATOR WHO OWNS
// ANYTHING lost her mention. The edge file's own comment records that three of
// five real accounts own two things, so this was the common case.
//
// ⚖️ AND THE TWO WERE NEVER EXCLUSIVE. A mention says "this video is not about
// it"; `ownedEntity` is what the video IS about. Explaining her coaching while
// mentioning the band she uses is the ordinary case, not a collision.
//
// ⚖️ WHAT THE OLD GUARD DID COVER BY ACCIDENT IS KEPT DELIBERATELY: the mention
// may not name the subject itself, or the prompt would carry "you may name X and
// that is all you may do with it" about the product the video is about.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { selectProduct, NO_PRODUCT_CHOICE } from '../productSelection'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(
  join(REPO, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

const BAND = 'band-id'
const COACHING = 'coaching-id'

describe('a mention survives a creator who also owns something', () => {
  // ⚠️ THIS IS THE LINE THAT DISCARDED IT. Asserted absent, because the fix is a
  // deletion and a deletion is the easiest thing for a later edit to undo.
  it('the mention is no longer gated on owning nothing', () => {
    expect(EDGE).not.toContain("if (mentionedId !== '' && !ownedEntity) {")
    expect(EDGE).toContain("if (mentionedId !== '' && !mentionIsTheSubject) {")
  })

  // ⚖️ AND THE SUBJECT STILL WINS OVER A FORGED PAIR. The client sends these on
  // mutually exclusive branches; the server may not rely on that.
  it('a mention naming the video’s own subject is dropped', () => {
    expect(EDGE).toContain('const mentionIsTheSubject')
    expect(EDGE).toContain("mentionedId === String((ownedEntity as { id?: unknown } | null)?.id ?? '')")
  })

  // ⚠️ DISCLOSURE KEYS ON THE RELATIONSHIP, NOT ON WHETHER THE VIDEO SELLS, and
  // that is the half the audit found missing three times. An affiliate product
  // named in an educational video is exactly the ad a viewer cannot discount for
  // themselves.
  it('a paid relationship still discloses inside a mention', () => {
    const block = EDGE.slice(EDGE.indexOf('const mentionDiscloses'))
    expect(block, 'the mention block could not be located').not.toBe('')
    const head = block.slice(0, 1200)
    expect(head).toContain("mentionRel === 'AFFILIATE'")
    expect(head).toContain("mentionRel === 'SPONSOR'")
    expect(head).toContain('IT IS A PAID RELATIONSHIP')
  })

  // ⚖️ AND THE PERMISSION STAYS NARROW. The point of a mention is that it names
  // and does nothing else; widening it here would turn every educational video
  // into a soft sell.
  it('a mention may not claim, build on, or ask', () => {
    // ⚠️ LOCATED BY THE ASSIGNMENT, NOT BY THE PHRASE. My first version sliced
    // from `indexOf('YOU MAY NAME')` and matched THE COMMENT I had just written
    // two screens above the code, which quotes the same words to explain why a
    // mention may not name the subject. A source-text check that cannot tell a
    // mention from a call is the trap this repo has recorded twice already — and
    // `mentionLine =` is the code.
    const at = EDGE.indexOf('mentionLine = `')
    expect(at, 'the mention prompt line could not be located').toBeGreaterThan(-1)
    const head = EDGE.slice(at, at + 1200)
    expect(head).toContain('Do NOT make claims about what it does')
    expect(head).toContain('do NOT ask anyone to buy, try or click it')
  })
})

describe('the client half: a non-commercial objective yields a mention, not silence', () => {
  // ⚠️ THE PRECONDITION, ASSERTED SO THE SERVER FIX IS NOT PROTECTING A PATH
  // NOTHING REACHES. If `selectProduct` stopped returning `mention`, the branch
  // above would be dead code and this file would still pass on the server side
  // alone — which is how a fix ends up guarding nothing.
  it('an explicit choice on a non-commercial video is a mention', () => {
    const d = selectProduct({
      ownedProductIds: [BAND], chosenId: BAND, mayUseAProduct: false,
    })
    expect(d.kind).toBe('mention')
    expect(d.kind === 'mention' && d.productId).toBe(BAND)
  })

  it('and silence on a non-commercial video is still silence', () => {
    // ⚖️ `auto` IS DELIBERATELY UNREACHABLE HERE. Auto-selecting on a video with
    // no commercial intent would put a product in a script nobody asked to
    // mention — the rule the entitlement clamp exists for.
    expect(selectProduct({ ownedProductIds: [BAND], chosenId: '', mayUseAProduct: false }).kind)
      .toBe('none')
    expect(selectProduct({
      ownedProductIds: [BAND], chosenId: NO_PRODUCT_CHOICE, mayUseAProduct: false,
    }).kind).toBe('none')
  })

  it('a commercial objective still makes the choice the subject, not a mention', () => {
    const d = selectProduct({
      ownedProductIds: [BAND, COACHING], chosenId: BAND, mayUseAProduct: true,
    })
    expect(d.kind).toBe('chosen')
    expect(d.kind === 'chosen' && d.productId).toBe(BAND)
  })
})
