// THE FIRST EVIDENCE TWIN BLOCKS A CLAIM THE CREATOR MAY MAKE.
//
// ⚠️⚠️ EVERY EARLIER TEST OF THIS SYSTEM ASKED WHETHER TWIN REFUSES A CLAIM IT
// SHOULD. This is the other direction. An affiliate creator supplied "I have
// used it myself after both babies" in the offer field, with personal use
// CONFIRMED on the product, and the sentence did not survive into the script. A
// blanket strip is as wrong as no strip: it removes the most persuasive TRUE
// thing an affiliate creator can say, and it is the one claim a disclosure
// cannot substitute for.
//
// ⚠️ THE MECHANISM, AND IT IS A DEFECT CLASS THIS FILE ALREADY RECORDS TWENTY
// LINES UP. `creatorExperience` gated a PROHIBITION and nothing else: confirmed
// use merely SKIPPED the refusal, so the writer was never told the claim was
// available. `ownershipLanguage` had exactly this shape and was fixed the same
// way — a canonical rule whose permission reached no prompt while its refusal
// reached every one of them.
//
// ⚖️ EXECUTED, NOT READ. The claim-rule region is transpiled out of the edge
// file and run across the relationship and personal-use matrix, because a regex
// over source cannot tell which branch fires.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

// The two pushes that decide this: the new permission, and the refusal it
// replaces. Lifted together so each fixture proves exactly one of them fires.
function loadExperienceRules(): (rel: string, confirmed: boolean) => string[] {
  const start = EDGE.indexOf('    if (creatorExperience && rel !== \'NONE\') {')
  expect(start, 'the confirmed-use permission must exist').toBeGreaterThan(-1)
  const refusalStart = EDGE.indexOf('    if (!creatorExperience && rel !== \'NONE\') {', start)
  expect(refusalStart, 'the refusal must still exist').toBeGreaterThan(start)
  const end = EDGE.indexOf('\n      // ⚠️⚠️ THE SENTENCE THAT USED TO END THE LINE ABOVE', refusalStart)
  expect(end).toBeGreaterThan(refusalStart)
  const body = EDGE.slice(start, end) + '\n      }\n'
  const js = transformSync(
    'function rules(rel, creatorExperience, ownershipLanguage, disclosureRequired) {\n'
    + '  const claimLines = []\n' + body + '\n  return claimLines }',
    { loader: 'ts', format: 'cjs' },
  ).code
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${js}; return rules`)() as
    (r: string, c: boolean, o: boolean, d: boolean) => string[]
  return (rel, confirmed) => fn(
    rel, confirmed,
    rel === 'OWN_PRODUCT' || rel === 'OWN_SERVICE',
    rel === 'AFFILIATE' || rel === 'SPONSOR',
  )
}

const rules = loadExperienceRules()
const joined = (rel: string, confirmed: boolean) => rules(rel, confirmed).join('')

describe('confirmed personal use is stated as a PERMISSION, not merely not-refused', () => {
  for (const rel of ['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR', 'REVIEW_ONLY']) {
    it(`${rel}: the writer is told the first-person claim is available`, () => {
      const out = joined(rel, true)
      expect(out).toMatch(/MAY SAY SO IN THE FIRST PERSON/i)
      expect(out).toMatch(/used this myself/i)
    })
  }

  it('and is told not to strip or soften it, which is what was observed', () => {
    const out = joined('AFFILIATE', true)
    expect(out).toMatch(/Do NOT strip it/i)
    expect(out).toMatch(/do NOT soften it into the third person/i)
  })

  it('the refusal does not also fire — one fact, one rule', () => {
    // ⚠️ BOTH AT ONCE WOULD BE WORSE THAN EITHER. "You may say you use it" next
    // to "write no first-person usage claim" is a contradiction in one prompt,
    // and the model resolves contradictions by picking one at random.
    const out = joined('AFFILIATE', true)
    expect(out).not.toMatch(/Write NO first-person usage claim/i)
    expect(out).not.toMatch(/HAVE NOT CONFIRMED/i)
  })
})

describe('what confirmed use does NOT license', () => {
  it('an outcome claim is still refused', () => {
    // ⚖️ USING IT AND WHAT IT ACHIEVED ARE DIFFERENT CLAIMS. The same confusion,
    // in the opposite direction, produced "aggressive physical pads will make
    // redness worse" about a sponsored product nobody had touched: the writer
    // was told to talk about what the product DOES.
    const out = joined('AFFILIATE', true)
    expect(out).toMatch(/NOT A RESULT FROM IT/i)
    expect(out).toMatch(/unless the creator themselves said that/i)
  })

  it('a paid tie still discloses, and the permission says so itself', () => {
    // ⚠️ THE PERMISSION IS THE PLACE THIS CAN GO WRONG. "I have used it myself"
    // is precisely the sentence that makes an ad not look like an ad, so the
    // disclosure reminder is attached to the permission that enables it.
    expect(joined('AFFILIATE', true)).toMatch(/DOES NOT REPLACE THE DISCLOSURE/i)
    expect(joined('SPONSOR', true)).toMatch(/DOES NOT REPLACE THE DISCLOSURE/i)
  })

  it('and an unpaid tie is not told to disclose something that does not exist', () => {
    expect(joined('OWN_PRODUCT', true)).not.toMatch(/DOES NOT REPLACE THE DISCLOSURE/i)
  })
})

describe('the refusal is untouched where use is NOT confirmed', () => {
  it('an affiliate who has not used it still may not claim they have', () => {
    const out = joined('AFFILIATE', false)
    expect(out).toMatch(/HAS NOT CONFIRMED THEY PERSONALLY USE THIS/i)
    expect(out).not.toMatch(/MAY SAY SO IN THE FIRST PERSON/i)
  })

  it('an owner loses the CUSTOMER claim and keeps the MAKER one', () => {
    // ⚖️ MAKING A THING IS NOT BEING ITS CUSTOMER — a founder who has never
    // opened their own dashboard saying "it changed my workflow" is a fabricated
    // testimonial. Unchanged by this commit, asserted so it stays that way.
    const out = joined('OWN_PRODUCT', false)
    expect(out).toMatch(/HAVE NOT CONFIRMED THEY USE IT AS A CUSTOMER DOES/i)
  })

  it('no relationship, no rule either way', () => {
    expect(rules('NONE', true)).toEqual([])
    expect(rules('NONE', false)).toEqual([])
  })
})
