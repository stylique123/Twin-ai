import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { claimRulesFor } from '../productEntity'

/**
 * ⚠️ THE REFUSAL LICENSED THE FAILURE, IN ITS OWN LAST SENTENCE.
 *
 * The unused-product rule ended: "Talk about what it does, never about what it
 * did for them." It forbade first-person history and, in the same breath,
 * invited the model to assert what the product does.
 *
 * MEASURED 2026-09-08: a creator with a sponsored pad she has NEVER USED got
 * "aggressive physical pads will make redness worse" — an outcome asserted
 * about a product nobody in the chain has touched. The model was not
 * disobeying. It was doing what the line told it.
 *
 * ⚖️ "WHAT IT IS" AND "WHAT IT DOES TO A PERSON" ARE DIFFERENT CLAIMS, and
 * only the first survives with no experience. Composition, format, price and
 * intended audience are FACTS, already governed by `productFacts` and
 * `marketingClaims`. An outcome on a body or a life needs evidence, and an
 * unused product has none from either source.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('an unused product supports no outcome claim', () => {
  it('the sentence that licensed it is GONE', () => {
    // ⚠️ THE WHOLE FIX, IN ONE ASSERTION. Adding a prohibition while leaving
    // the invitation in place would give the model two instructions and let it
    // pick — which is how it behaved in the first place.
    expect(EDGE).not.toMatch(/Talk about what it does, never about what it did for them/)
  })

  it('an outcome refusal is written, and it names the shapes', () => {
    const at = EDGE.indexOf('AND WRITE NO OUTCOME CLAIM ABOUT IT AT ALL')
    expect(at).toBeGreaterThan(-1)
    const line = EDGE.slice(at, at + 700)
    // Naming the shapes matters: "no outcome claims" alone is a category a
    // model can talk itself out of. "it will", "it makes", "it fixes" cannot.
    for (const shape of ['it will', 'it makes', 'it fixes', 'it causes', 'better-or-worse']) {
      expect(line, shape).toContain(shape)
    }
  })

  it('it still permits what the product IS', () => {
    // ⚖️ NOT A BLANKET SILENCE. A creator may say what a thing contains, costs
    // and is for — refusing that would make a sponsored product unmentionable,
    // which is a different bug and one the disclosure rule already handles.
    const at = EDGE.indexOf('AND WRITE NO OUTCOME CLAIM ABOUT IT AT ALL')
    const line = EDGE.slice(at, at + 700)
    expect(line).toContain('State what it IS')
    expect(line).toMatch(/what it contains, what it costs, who it is for/)
  })

  it('the refusal fires exactly when experience is unconfirmed', () => {
    // It hangs off the same `!creatorExperience` branch as the usage rule, so
    // the two cannot disagree about when they apply.
    const branch = EDGE.indexOf("if (!creatorExperience && rel !== 'NONE') {")
    const outcome = EDGE.indexOf('AND WRITE NO OUTCOME CLAIM ABOUT IT AT ALL')
    expect(branch).toBeGreaterThan(-1)
    expect(outcome).toBeGreaterThan(branch)
    // …and inside it, before the disclosure rule that follows the block.
    expect(outcome).toBeLessThan(EDGE.indexOf('A DISCLOSURE IS REQUIRED AND IS NOT OPTIONAL'))
  })

  it('the rule it hangs off is still the creator-only one', () => {
    // `creatorExperience` is established by the creator alone — a sponsorship
    // neither grants nor removes it. Pinned so a future edit cannot make the
    // outcome refusal depend on the commercial tie instead.
    expect(claimRulesFor('SPONSOR', 'NOT_CONFIRMED').creatorExperience).toBe(false)
    expect(claimRulesFor('SPONSOR', 'CONFIRMED').creatorExperience).toBe(true)
    expect(claimRulesFor('OWN_PRODUCT', 'NOT_CONFIRMED').creatorExperience).toBe(false)
  })

  it('an owner who has not used it keeps the MAKER claim', () => {
    // A baker may say "I bake these every morning" about bread she does not
    // eat. Losing that would be the 2026-08 regression again.
    expect(claimRulesFor('OWN_PRODUCT', 'NOT_CONFIRMED').ownershipLanguage).toBe(true)
    // The source escapes the apostrophe inside a single-quoted string, so the
    // file holds CREATOR\'S. Matching the rendered text would fail on the
    // escape and say the line is missing when it is present.
    expect(EDGE).toMatch(/THIS IS THE CREATOR..?S OWN PRODUCT AND THEY MAY SAY SO IN THE FIRST PERSON/)
  })
})
