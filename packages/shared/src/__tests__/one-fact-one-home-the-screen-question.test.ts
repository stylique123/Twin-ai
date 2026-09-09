// "CAN YOU POINT YOUR CAMERA AT A SCREEN SHOWING **IT**" — WHAT IS "IT"?
//
// ⚠️ REPORTED ON FIVE CONSECUTIVE ACCOUNTS: the onboarding block "What can
// appear in your videos?" reads `Not answered`. It is three questions stacked
// into one, and two of them can only be answered by a PRODUCT — which does not
// exist yet on that screen. There is no "it" to point a camera at.
//
// ⚠️ AND THE PRODUCT LIBRARY ALREADY ASKS IT, PER PRODUCT, with the referent in
// hand: "Can you have it open on a screen while you film?" for a screen
// product, "Can you have it with you when you film?" for a physical one —
// chosen by `capabilityQuestion`, the one authority for which applies.
//
// ⚖️ SO ONE FACT KEEPS ONE HOME. `can_record_screen` is still written, by the
// Library, per product: no reader loses its input. What is removed is a second
// place to answer it, from a screen that cannot know which product is meant.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { capabilityQuestion, CAPABILITY_PROMPT } from '../index'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const ONBOARDING = readFileSync(join(REPO, 'apps/web/src/pages/Onboarding.tsx'), 'utf8')
const LIBRARY = readFileSync(join(REPO, 'apps/web/src/pages/ProductLibrary.tsx'), 'utf8')

describe('the screen question has one home, and it is the one with a referent', () => {
  it('onboarding no longer asks it', () => {
    expect(ONBOARDING).not.toMatch(/Can you point your camera at a screen showing it/)
  })

  it('the Product Library still does, per product', () => {
    // ⚖️ ASSERTED THROUGH THE AUTHORITY, not by matching a sentence: the words
    // live in `CAPABILITY_PROMPT` and the branch is `capabilityQuestion`, so
    // this cannot pass on a card that renders a hard-coded copy of them.
    expect(LIBRARY).toMatch(/capabilityQuestion\(/)
    expect(LIBRARY).toMatch(/CAPABILITY_PROMPT\[/)
    expect(CAPABILITY_PROMPT[capabilityQuestion({ type: 'SAAS', relationship: 'OWN_PRODUCT' })!])
      .toMatch(/screen/i)
  })

  it('the badge is gone, because the block it reported on is gone', () => {
    // ⚠️⚠️ THIS USED TO REQUIRE THE BADGE, NARROWED TO THE TWO REMAINING
    // QUESTIONS. Narrowing was the right fix for the badge and the wrong fix
    // for the report: the block itself was what read `Not answered` on every
    // account, and it was reported six times. It is deleted.
    expect(ONBOARDING).not.toMatch(/badge=\{q4 === null/)
    expect(ONBOARDING).not.toMatch(/badge=\{[^}]*canRecordScreen/)
  })

  it('the object question left too, and its replacement is NOT built yet', () => {
    // ⚠️ SAID PLAINLY RATHER THAN QUIETLY DROPPED. The owner's instruction was
    // that this one becomes an inference confirmed once — "you film to camera
    // in a bedroom setting and often hold products, right?" — and the scan
    // supplies no setting to build that sentence from. So the question is gone
    // and the confirmation is owed; `canFilmObjects` is null for new accounts
    // until it exists, which is the honest unanswered state rather than a
    // guessed `false`.
    expect(ONBOARDING).not.toMatch(/Can you put a product or object in front of the camera\?/)
  })

  it('the answer still travels, so no reader loses its input', () => {
    // ⚠️ A REMOVED QUESTION MUST NOT BECOME A REMOVED FIELD. A creator who
    // answered before this change keeps their answer, and the draft still
    // carries it to everything downstream.
    expect(ONBOARDING).toMatch(/const \[canRecordScreen\] = useState<boolean \| null>\(draft\.canRecordScreen\)/)
    expect(ONBOARDING).toMatch(/caps\.can_record_screen = canRecordScreen/)
  })
})
