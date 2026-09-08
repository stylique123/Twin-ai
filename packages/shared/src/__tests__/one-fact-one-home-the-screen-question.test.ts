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

  it('the badge stops counting a question the screen does not ask', () => {
    // ⚠️ WITHOUT THIS THE BLOCK READS `Not answered` FOR EVER — the removed
    // question's value is now permanently null on this screen, so leaving it in
    // the badge would make the reported defect permanent instead of fixing it.
    expect(ONBOARDING).toMatch(/badge=\{q4 === null \|\| canFilmObjects === null \? 'Not answered' : null\}/)
    expect(ONBOARDING).not.toMatch(/badge=\{q4 === null \|\| canRecordScreen === null/)
  })

  it('the object question stays — it is about the creator, not a product', () => {
    // ⚖️ THE ONE OF THE THREE THAT BELONGS HERE. Whether they can put something
    // in front of a camera is a fact about how they film, true before any
    // product exists.
    expect(ONBOARDING).toMatch(/Can you put a product or object in front of the camera\?/)
  })

  it('the answer still travels, so no reader loses its input', () => {
    // ⚠️ A REMOVED QUESTION MUST NOT BECOME A REMOVED FIELD. A creator who
    // answered before this change keeps their answer, and the draft still
    // carries it to everything downstream.
    expect(ONBOARDING).toMatch(/const \[canRecordScreen\] = useState<boolean \| null>\(draft\.canRecordScreen\)/)
    expect(ONBOARDING).toMatch(/caps\.can_record_screen = canRecordScreen/)
  })
})
