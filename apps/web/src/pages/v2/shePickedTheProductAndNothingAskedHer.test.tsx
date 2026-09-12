// @vitest-environment jsdom
//
// SHE ANSWERS "WHICH ONE IS THIS VIDEO ABOUT?" AND NOTHING ASKED HER.
//
// ⚠️ THE PICKER HAS EXISTED FOR MONTHS. `mustAskWhichProduct`,
// `PRODUCT_CHOICE_FIELD`, her own product names as labels, and a real
// "None of these". Her answer was then resolved ~160 lines BELOW the readiness
// check that needed it — and used only to decide whether to show the picker
// AGAIN. `assessReadiness` went on looking the product up by
// `pre_script_brief.offer`, which 0 of 53 production voices carry.
//
// ⚖️ FOUR SYMPTOMS, ONE NULL:
//   · the claims question said "the OFFER" instead of her product's name
//   · the relationship resolved only for a creator with exactly ONE product,
//     and sent everyone else out of Create to a screen that already knew
//   · `libraryFacts` asked a creator with two products to retype facts Twin
//     had already extracted from her own page
//   · and the same lookup fed all three
//
// ⚠️ A PICK IS AN ANSWER, NOT A HEURISTIC. That is the distinction that makes
// this safe where `libraryOfferName` must be cautious: that one INFERS from a
// library of one and may never settle a field. This is the creator's explicit
// choice about this video, so it settles all of them.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dirname, 'V2Building.tsx'), 'utf8')

/** The readiness call, bounded — assertions that scanned the whole file would
 *  match the picker's own later use of the same expression and prove nothing. */
const readinessCall = (() => {
  const i = SRC.indexOf('const verdict = assessReadiness({')
  const j = SRC.indexOf('})', SRC.indexOf('productFacts:', i))
  return SRC.slice(i, j)
})()

describe('the pick reaches the check that needed it', () => {
  it('found the call — a rename would silently empty every check below', () => {
    expect(readinessCall.length).toBeGreaterThan(300)
    expect(readinessCall).toContain('productFacts:')
  })

  // ⚠️ ORDER IS THE ENTIRE DEFECT. Resolving the pick AFTER the verdict is what
  // was wrong; it was never missing, only late.
  it('resolves the chosen product BEFORE the verdict, not after', () => {
    const resolved = SRC.indexOf('const chosen = pickedProduct(')
    const verdict = SRC.indexOf('const verdict = assessReadiness({')
    expect(resolved).toBeGreaterThan(-1)
    expect(resolved, 'the pick is still resolved after the verdict').toBeLessThan(verdict)
  })

  it('her pick settles the offer, the relationship, the wording and the facts', () => {
    expect(readinessCall).toMatch(/offer:\s*\(chosenName \|\| undefined\)/)
    expect(readinessCall).toMatch(/relationship:\s*chosen\?\.relationship/)
    expect(readinessCall).toMatch(/offerNameForWording:\s*\(chosenName \|\| null\)/)
    expect(readinessCall).toMatch(/productFacts:\s*factsOfProduct\(chosen\)/)
  })

  // ⚖️ THE BRIEF IS STILL CONSULTED, just second. A creator who named an offer
  // in her own words and picked nothing must not lose that answer.
  it('keeps the brief as the fallback rather than replacing it', () => {
    expect(readinessCall).toContain('str(vBrief.offer)')
    expect(readinessCall).toContain('libraryOfferName(')
    expect(readinessCall).toContain('libraryFacts(')
  })
})

describe('"None of these" is an answer, not a miss', () => {
  // ⚠️ IF IT RESOLVED TO A PRODUCT the picker would reappear under her finger,
  // and a video she said was about none of her products would name one.
  it('the resolver refuses the none sentinel', () => {
    const fn = SRC.slice(SRC.indexOf('function pickedProduct('), SRC.indexOf('function factsOfProduct('))
    expect(fn).toContain('NO_PRODUCT_CHOICE')
    expect(fn).toMatch(/if \(!id \|\| id === NO_PRODUCT_CHOICE\) return null/)
  })

  it('an id that is not in her library resolves to nothing, never to a neighbour', () => {
    // ⚖️ A stale sessionStorage id from a deleted product must not silently
    // become "the first one" — the same three-state discipline as everywhere
    // else: unknown is not a default.
    const fn = SRC.slice(SRC.indexOf('function pickedProduct('), SRC.indexOf('function factsOfProduct('))
    expect(fn).toMatch(/products\?\.find\(\(p\) => p\.id === id\) \?\? null/)
    expect(fn).not.toMatch(/\[0\]/)
  })
})

describe('facts come from the product by id, not by a name we do not have', () => {
  it('reads evidence.sections and treats declined as no facts', () => {
    const fn = SRC.slice(SRC.indexOf('function factsOfProduct('), SRC.indexOf('/** The product’s NAME'))
    expect(fn).toContain("ev === 'declined'")
    expect(fn).toContain('Array.isArray(ev.sections)')
  })
})
