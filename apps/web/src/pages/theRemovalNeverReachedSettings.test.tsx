// @vitest-environment jsdom
//
// THE SIX COMMERCIAL-TIE CHIPS WERE DELETED FROM ONBOARDING, AND SETTINGS KEPT
// ITS COPY.
//
// ⚠️ THE REMOVAL IS RECORDED IN THIS REPO ALREADY. `AddYourProductCard` says it:
// onboarding "now asks only whether a commercial thing exists — one yes/no where
// it used to ask six tie chips and a seven-chip service follow-up", on the
// stated grounds that "the kind of thing, the relationship and the offer facts
// belong to the Product Library, which asks all of it properly and behind an
// attestation".
//
// ⚠️ SETTINGS WAS NEVER UPDATED, AND IT WAS WORSE THAN REDUNDANT. Measured on a
// real account: a creator with TWO products, both reading Ready in the library,
// saw this question entirely UNSELECTED — her relationships live on
// `product_entities.relationship`, which this control cannot see and never
// wrote. The screen asked her to re-answer, in a weaker vocabulary, a thing she
// had already answered properly — then displayed her as having said nothing.
//
// ⚖️ THE FIELD STAYS AND KEEPS ITS WRITER. This deletes a duplicate QUESTION,
// never a fact.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const SETTINGS = readFileSync(join(here, 'Settings.tsx'), 'utf8')
const ONBOARDING = readFileSync(join(here, 'Onboarding.tsx'), 'utf8')
/** Code only — a comment explaining the removal must never satisfy a check that
 *  the removal happened. This repo has been bitten twice by exactly that. */
const CODE = SETTINGS.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Settings no longer asks what the Product Library owns', () => {
  it('the six relationship chips are gone', () => {
    // ⚠️ THESE ARE THE GRANULARITY THE LIBRARY OWNS — own_product vs affiliate
    // vs sponsor vs review is exactly what `product_entities.relationship`
    // stores, behind an attestation these chips never had.
    for (const v of ['I sell my own product', 'I sell my own service',
      'I earn a commission', 'I get paid to feature things', 'I just cover things']) {
      expect(CODE, v).not.toContain(v)
    }
  })

  it('writes only the two collapsed answers, through the shared map', () => {
    // ⚖️ NOT A SECOND SPELLING OF THE SAME COLLAPSE. Onboarding writes through
    // `SELLS_ANSWER_TO_TIES`; a hand-written ['unspecified'] here would be a
    // second authority for the mapping itself, which is the defect one level up
    // from the one this change fixes.
    expect(CODE).toContain('SELLS_ANSWER_TO_TIES[v]')
    expect(CODE).not.toMatch(/commercialTies:\s*\[\s*'own_product'/)
  })
})

describe('the fact stays editable, which is why this is a collapse not a deletion', () => {
  // ⚠️ `commercialTies` CARRIES "nothing commercial", THE VALUE THAT SUPPRESSES
  // PRODUCT SUGGESTIONS, and this panel is the only place it can be changed
  // after onboarding. Deleting the question outright would leave a creator who
  // said "not right now" and later started selling with no way to say so except
  // re-walking a flow she finished weeks ago — the exact defect the comment
  // above `edit_profile` records this page being rescued from.
  it('still offers both answers', () => {
    expect(CODE).toContain("['yes', 'Yes']")
    expect(CODE).toContain("['not_right_now', 'Not right now']")
  })

  it('reads an old thirteen-option answer back rather than showing it as unanswered', () => {
    // ⚖️ STOP WRITING, KEEP READING. An account still holding `own_service`
    // must read as "yes", not as somebody who never answered.
    expect(CODE).toContain('sellsAnswerOf(')
  })

  // ⚠️ SILENCE IS NOT "NOTHING TO SELL". Tapping the chosen answer again clears
  // it to unanswered; turning that into a commercial statement is the error the
  // question exists to avoid.
  it('clears to an empty list rather than to a stated absence', () => {
    expect(CODE).toMatch(/commercialTies:\s*on \? \[\] :/)
  })
})

describe('nothing is orphaned by the removal', () => {
  // ⚖️ THE FACT IS STILL ASKED, ONCE, WHERE IT BELONGS. Onboarding's yes/no is
  // the writer; deleting the Settings duplicate must not leave the field with
  // no way to be set.
  it('onboarding still asks the one yes/no that writes the field', () => {
    expect(ONBOARDING).toContain('Do you sell or promote anything in your videos?')
    expect(ONBOARDING).toContain('commercialTies:')
  })

  // ⚠️ AND THE AUTHORITY IS REACHABLE FROM THIS TAB. Removing a question whose
  // answer has nowhere else to be given would be a worse defect than the
  // duplicate — the creator would lose the ability to state it at all.
  it('Settings still routes to the Product Library, which owns the real answer', () => {
    expect(CODE).toContain("nav('/products')")
  })
})

describe('the audience question is untouched, because it belongs here', () => {
  // ⚖️ THE OTHER HALF OF THIS PANEL IS CORRECT AND STAYS. "How much does your
  // audience already know?" has exactly one home, and this is it — a removal
  // that took the whole panel would have destroyed a fact nothing else stores.
  it('still asks how much the audience already knows', () => {
    expect(CODE).toContain('audienceKnowledge')
    for (const v of ['They are new to this', 'They know the basics', 'They know it well']) {
      expect(CODE, v).toContain(v)
    }
  })
})
