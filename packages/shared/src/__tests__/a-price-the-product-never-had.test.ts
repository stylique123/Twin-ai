// THE PRODUCT LIBRARY EXISTS SO SCRIPTS STOP GUESSING, AND NOTHING CHECKED.
//
// ⚠️ A SCRIPT COULD SAY "twenty-nine dollars a month" ABOUT A PRODUCT WHOSE
// STORED PRICE IS THIRTY-NINE and every existing guard read clean: the beat
// cites the product, the product exists, the relationship permits commercial
// language. Nothing asked whether the FIGURE came from the product record.
//
// ⚠️ AND THE FIRST BUILD OF THIS CHECK COULD NOT SEE IT EITHER. Measured
// 2026-09-08 across the seven skincare generations: seven of seven name the
// product, four of seven state a price nothing on record carries, and NOT ONE
// BEAT in any of the seven is labelled `substance: 'product_dna'`. The counter
// read 0 on all 44 generations because the lens demanded that label and because
// an empty fact set suppressed the check entirely. Those readings are void.
//
// ⚖️ MEASURED VALUES ONLY, for the reason `claimEntailment` already argued: a
// benefit paraphrases and a price does not.
import { describe, expect, it } from 'vitest'
import {
  productClaimFindings, beatSourcesProduct, supportedValues,
  describeProductClaimGap, describeProductClaimContradiction, PRODUCT_SUBSTANCE,
} from '../productClaimCheck'

const FACTS = [
  { value: '$39 per month', trust: 'usable' },
  // ⚠️ "users", NOT "creators". The shared matcher recognises a bounded list of
  // units — currency, %, multiples, durations, and audience nouns like users and
  // followers. A bare count of an unlisted noun is NOT checked, and widening
  // that regex here would silently change what the creator-knowledge guard
  // catches too. The limit is real and stated rather than papered over.
  { value: 'Used by 12,000 users', trust: 'usable' },
]

const NAMES = ['Medicube']
const beat = (line: string, substance: string = PRODUCT_SUBSTANCE) => ({ line, substance })
const named = (line: string) => ({ line, substance: 'general' })

describe('a figure must come from the product record', () => {
  it('reports a price the record disagrees with as a CONTRADICTION', () => {
    const { contradicted, unsupported } = productClaimFindings([beat('It is $29 a month.')], FACTS, NAMES)
    expect(contradicted).toHaveLength(1)
    expect(contradicted[0].value).toContain('29')
    expect(unsupported).toEqual([])
  })

  it('reports a figure the record says nothing about as UNSUPPORTED', () => {
    // ⚖️ THE UNIT IS THE WHOLE DIFFERENCE. The facts carry money and a user
    // count; they say nothing in per-cent, so there is no row to point at.
    const { contradicted, unsupported } = productClaimFindings(
      [beat('It cuts breakouts by 40%.')], FACTS, NAMES)
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0].value).toContain('40')
    expect(contradicted).toEqual([])
  })

  it('accepts the figure the record does carry, however it is written', () => {
    for (const line of ['It is $39 a month.', 'Thirty-nine? No — $39/mo.', 'It costs 39 dollars monthly.']) {
      const f = productClaimFindings([beat(line)], FACTS, NAMES)
      expect([...f.contradicted, ...f.unsupported], line).toEqual([])
    }
  })

  it('treats 12k and 12,000 as the same number', () => {
    expect(productClaimFindings([beat('12k users use it.')], FACTS, NAMES).contradicted).toEqual([])
    expect(productClaimFindings([beat('20k users use it.')], FACTS, NAMES).contradicted).toHaveLength(1)
  })

  it('names the figure and the ways out, differently for each finding', () => {
    const { contradicted } = productClaimFindings([beat('It is $29 a month.')], FACTS, NAMES)
    expect(describeProductClaimContradiction(contradicted[0])).toMatch(/different figure in that unit/)
    const { unsupported } = productClaimFindings([beat('It cuts breakouts by 40%.')], FACTS, NAMES)
    expect(describeProductClaimGap(unsupported[0])).toMatch(/no stored product fact carries that figure/)
  })
})

// ── THE FIXED LENS ────────────────────────────────────────────────────────
describe('the beat filter reads what the beat is about, not how it was labelled', () => {
  it('THE MEASURED SHAPE: an unlabelled beat naming the product is checked', () => {
    // ⚠️ THIS IS THE PRODUCTION DEFECT, PINNED. Under the old filter this
    // returned nothing — which is exactly what all 44 generations recorded.
    const { contradicted } = productClaimFindings(
      [named('The Medicube booster is twenty-nine dollars a month.')], FACTS, NAMES)
    expect(contradicted).toHaveLength(1)
  })

  it('still checks a beat LABELLED product_dna that never says the name', () => {
    // ⚖️ EITHER DOOR. The label is kept as a second route, not replaced.
    expect(productClaimFindings([beat('It is $29 a month.')], FACTS, []).contradicted).toHaveLength(1)
  })

  it('leaves beats that neither name the product nor claim it alone', () => {
    // ⚠️ THREE COUNTERS, ONE QUESTION EACH. A creator-knowledge beat belongs to
    // claimEntailment and a beat citing nothing belongs to the leak check.
    const f = productClaimFindings(
      [{ line: 'I made $80,000 last year.', substance: 'creator_knowledge' }], FACTS, NAMES)
    expect([...f.contradicted, ...f.unsupported]).toEqual([])
  })

  it('ignores a product name shorter than three characters', () => {
    // ⚖️ A two-letter brand matches inside ordinary words, and a filter that
    // fires on every beat is as useless as one that fires on none.
    expect(beatSourcesProduct(named('It is $29 and it works.'), ['It'])).toBe(false)
    expect(beatSourcesProduct(named('Try Ono today for $29.'), ['Ono'])).toBe(true)
  })

  it('matches the name case-insensitively', () => {
    expect(beatSourcesProduct(named('medicube changed my week.'), NAMES)).toBe(true)
  })
})

// ── THE SUPPRESSION IS GONE, AND THE SPLIT IS WHY THAT IS SAFE ────────────
describe('a product with no stored facts', () => {
  it('NO LONGER GOES SILENT — the riskiest population, previously unmeasured', () => {
    // ⚠️ THE OLD COPY RETURNED [] HERE so the counter would not "fire loudest
    // where it knows least". What it actually did was say nothing about the
    // case where an invented price is likeliest: nothing to contradict.
    const { contradicted, unsupported } = productClaimFindings(
      [named('Medicube is $29 a month.')], [], NAMES)
    expect(unsupported).toHaveLength(1)
    // ⚖️ AND IT LANDS IN THE OTHER BUCKET, so it can never inflate the
    // contradiction rate. That separation is what makes removing the
    // suppression safe rather than noisy.
    expect(contradicted).toEqual([])
  })

  it('same when the record holds only prose', () => {
    expect(productClaimFindings(
      [named('Medicube is $29 a month.')], [{ value: 'A tool for creators' }], NAMES,
    ).unsupported).toHaveLength(1)
  })
})

describe('what it must not fire on', () => {
  it('ignores prose with no figures in it', () => {
    const f = productClaimFindings([beat('It saves you a whole afternoon.')], FACTS, NAMES)
    expect([...f.contradicted, ...f.unsupported]).toEqual([])
  })

  it('a bare count carries no recognised unit, so nothing is reported either way', () => {
    // ⚠️ THE TEST WAS WRONG FIRST, NOT THE CODE. This case was written expecting
    // "5 times" to surface as an unsupported figure; it does not, because the
    // shared matcher only extracts figures carrying a unit from its bounded list
    // — currency, %, multiples, durations, audience nouns. "times" is not on it.
    //
    // ⚖️ WHICH IS ALSO WHY THE CONTRADICTION RULE REQUIRES A NAMED UNIT. "3
    // steps" and "5 steps" are not the same claim, so an unlabelled figure could
    // only ever be reported as unsupported — a deliberately narrow reading of
    // "contradicts", kept as a guard even though the matcher rarely produces one.
    const f = productClaimFindings([beat('Do it 5 times.')], [{ value: 'Do it 3 times' }], NAMES)
    expect([...f.contradicted, ...f.unsupported]).toEqual([])
  })

  it('never throws on the shapes a blueprint really produces', () => {
    for (const bad of [{}, { line: null }, { line: 42, substance: 'product' }, { substance: 'product' }]) {
      expect(() => productClaimFindings([bad as never], FACTS, NAMES)).not.toThrow()
    }
    expect(productClaimFindings([], FACTS, NAMES).unsupported).toEqual([])
    expect(() => productClaimFindings([named('x')], FACTS, [null as never, ''])).not.toThrow()
  })
})

describe('unconfirmed facts still count as a source', () => {
  it('accepts a figure matching a needs_confirmation fact', () => {
    // ⚠️ THAT FLAG IS A DIFFERENT GATE. It decides whether a fact may be SPOKEN
    // without a person approving it. This asks whether the figure came from the
    // product at all, or from nowhere.
    const f = productClaimFindings(
      [beat('It cut support tickets by 40%.')],
      [{ value: 'Cuts support tickets by 40%', trust: 'needs_confirmation' }], NAMES)
    expect([...f.contradicted, ...f.unsupported]).toEqual([])
  })

  it('collects every value the facts carry', () => {
    expect(supportedValues(FACTS).size).toBe(2)
  })

  it('does not pretend to check units the matcher does not recognise', () => {
    // ⚖️ AN HONEST LIMIT, PINNED. "12,000 creators" carries a noun outside the
    // shared unit list, so no figure is extracted and nothing is claimed about it.
    expect(supportedValues([{ value: 'Used by 12,000 creators' }]).size).toBe(0)
    const f = productClaimFindings([beat('90,000 creators use it.')], FACTS, NAMES)
    expect([...f.contradicted, ...f.unsupported]).toEqual([])
  })
})

// ── AND THE EDGE COUNTS BOTH, ON EVERY GENERATION ─────────────────────────
//
// ⚠️ COUNTED BEFORE IT IS ENFORCED, IN THAT ORDER — but on the FIXED lens.
// The original discipline was sound; it just measured through a broken one, so
// the cycle of counting starts again from zero rather than resuming a total
// that was never real.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the writer counts both findings', () => {
  it('records TWO counts on the stored beat audit, not one', () => {
    expect(EDGE).toMatch(/product_claim_contradictions: productClaimFindings_\.contradicted\.length/)
    expect(EDGE).toMatch(/product_claim_unsupported: productClaimFindings_\.unsupported\.length/)
  })

  it('has retired the old single counter rather than renaming it', () => {
    // ⚠️ ITS 44 READINGS WERE VOID, not low. A field that keeps its name keeps
    // its history, and that history is the thing to discard.
    expect(EDGE).not.toMatch(/product_claim_gaps:/)
  })

  it('feeds it the values the product record actually holds', () => {
    expect(EDGE).toMatch(/const productFactValues: string\[\]/)
    expect(EDGE).toMatch(/ownedEntity as \{ knowledge\?: unknown \}/)
  })

  it('feeds it the product NAME, which is what the fixed filter reads', () => {
    // ⚖️ A COUNTER FED AN EMPTY NAME LIST FALLS BACK TO THE OLD BROKEN LENS.
    expect(EDGE).toMatch(/const productNames: string\[\]/)
    expect(EDGE).toMatch(/ownedEntity as \{ name\?: unknown \}/)
    // ⚠️ AND IT IS PASSED, NOT MERELY BUILT. A first version of this test
    // asserted only the declaration, and a mutation replacing the ARGUMENT with
    // `[]` — which restores the old broken lens exactly — passed it. Declaring a
    // value nobody reads is the defect class this whole change exists for.
    expect(EDGE).toMatch(/findProductClaimFindings\(\s*\(Array\.isArray\(declared\)[\s\S]{0,200}?productFactValues,\s*productNames,/)
  })

  it('opens both doors in BOTH copies', () => {
    expect(PRODUCT_SUBSTANCE).toBe('product_dna')
    expect(EDGE).toMatch(/beat\?\.substance !== 'product_dna'/)
    expect(EDGE).toMatch(/name\.length >= 3 && line\.includes\(name\)/)
  })

  it('does not suppress itself on an empty fact set, in BOTH copies', () => {
    // ⚠️ THE SECOND BLINDNESS. `if (supported.size === 0) return []` is the line
    // that hid the riskiest population; it must not come back.
    expect(EDGE).not.toMatch(/if \(supported\.size === 0\) return \[\]/)
  })

  it('reuses the normalisation rather than restating it, on both sides', () => {
    const fn = EDGE.slice(EDGE.indexOf('function findProductClaimFindings'))
    expect(fn.slice(0, 1200)).toMatch(/claimedValues\(/)
    expect(fn.slice(0, 1200)).not.toMatch(/parseFloat|replace\(\/\[\\s,\]/)
  })
})
