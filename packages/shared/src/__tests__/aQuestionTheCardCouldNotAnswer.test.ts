// "WHAT IS YOUR RELATIONSHIP TO IT?" — ASKED OF A PRODUCT THAT ALREADY SAID.
//
// ⚠️ REPORTED 2026-09-22 FROM THE SCREEN, AFTER IT WAS CALLED FIXED. A creator
// with two products, both OWN_PRODUCT, picked Sell something and got a card
// asking her relationship, with one action — "Open Product Library to set it →"
// — a page where it was already set. Back, Create, same card. And "What does
// the OFFER do?" on a product carrying six usable facts.
//
// Four causes, each pinned here:
//   1. the client resolved unanimous products and the server never learned to,
//      so the card passed and the server refused;
//   2. with no product picked the server asked relationship and claims, which
//      depend on WHICH product, instead of asking which product;
//   3. the claims gate read only photo-section labels (written empty), never the
//      product's extracted facts, offer or description;
//   4. the chosen lookup matched `voice_id` exactly, and every paid tie has a
//      null voice, so a picked affiliate product was never found.
// And the card's only action for the relationship could not answer it.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const WEB = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const gate = EDGE.slice(EDGE.indexOf('READINESS: CAN WE WRITE'), EDGE.indexOf("admin.rpc('spend_credits'"))

describe('a question the card could not answer', () => {
  it('the server resolves products that all agree, as the client does', () => {
    expect(gate).toMatch(/const readyUnanimousRel/)
    expect(gate).toMatch(/distinct\.size === 1/)
  })

  it('asks WHICH product before asking about one', () => {
    expect(gate).toMatch(/field: 'selected_product'/)
    expect(gate).toMatch(/label: 'None of these'/)
    // and relationship/claims wait for that answer
    expect(gate).toMatch(/!readyPresent\(readyRel\) && !declinedAProduct && !readyNeedsPick/)
    expect(gate).toMatch(/!readyEntityKnows && !readyNeedsPick/)
  })

  it('counts what the product already knows as answering the claims question', () => {
    const k = gate.slice(gate.indexOf('const readyEntityKnows'))
    const fn = k.slice(0, k.indexOf('})()'))
    expect(fn).toMatch(/trust === 'usable'/)
    expect(fn).toMatch(/readyPresent\(e\.offer\)/)
    expect(fn).toMatch(/readyPresent\(e\.creator_summary\)/)
  })

  it('finds a picked product whose voice is null', () => {
    expect(EDGE).not.toMatch(/\.eq\('voice_id', voice\?\.id \?\? null\)/)
    expect(EDGE).toMatch(/voice_id\.is\.null/)
  })

  it('the card answers the relationship itself instead of linking away', () => {
    const start = WEB.indexOf("q.field === 'relationship'")
    const branch = WEB.slice(start, WEB.indexOf(') : (', start))
    expect(branch).not.toMatch(/nav\('\/products'\)/)
    expect(branch).toContain("'OWN_PRODUCT'")
  })
})
