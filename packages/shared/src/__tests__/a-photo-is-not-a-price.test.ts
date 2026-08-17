// A PHOTOGRAPH PROVES WHAT A THING LOOKS LIKE. IT PROVES NOTHING ABOUT WHAT IT
// COSTS.
//
// ⚖️ IMAGES ARE A THIRD KIND OF EVIDENCE, not a stronger web page. They establish
// that a product EXISTS and WHAT IT LOOKS LIKE — exactly what the Director Plan
// needs to decide whether a scene may show it — and nothing about price, benefit
// or result.
//
// ⚠️ AND A VISION MODEL WILL READ "$29/mo" OFF A SCREENSHOT WITHOUT HESITATING.
// That figure is a reading of a picture, not a stated price. Letting it through
// would put a number in a script that no page and no person ever asserted — the
// same defect as an auto-extracted greyscale palette becoming "your brand", and
// as a generated CTA becoming "your words", in a third place.
import { describe, expect, it } from 'vitest'
import {
  imageFactAllowed, extractionTrust, EXTRACTION_SOURCES, EXTRACTED_FIELDS,
} from '../productExtraction'

describe('what a picture may establish', () => {
  it('allows identity and appearance', () => {
    for (const f of ['name', 'category', 'description'] as const) {
      expect(imageFactAllowed(f), f).toBe(true)
    }
  })

  it('refuses every field that carries a commercial claim', () => {
    // ⚠️ THESE ARE THE ONES A SCREENSHOT MAKES TEMPTING. A pricing page in a
    // photo looks exactly like a pricing page, and it is still a photo.
    for (const f of ['price', 'plan', 'guarantee', 'benefit', 'claim', 'cta'] as const) {
      expect(imageFactAllowed(f), f).toBe(false)
    }
  })

  it('refuses rather than downgrades', () => {
    // ⚖️ `needs_confirmation` WOULD PUT THE FIGURE IN FRONT OF THE CREATOR WITH A
    // TICK BOX, and a plausible number beside a photo of their own product is the
    // easiest thing in the world to approve without checking. A refused field
    // never becomes a fact at all.
    const refused = EXTRACTED_FIELDS.filter((f) => !imageFactAllowed(f))
    expect(refused.length).toBeGreaterThan(0)
    // Nothing in the allowed set is a measured or promissory field.
    for (const f of EXTRACTED_FIELDS.filter(imageFactAllowed)) {
      expect(['price', 'plan', 'guarantee', 'benefit', 'claim', 'cta']).not.toContain(f)
    }
  })
})

describe('even what it may establish is never taken on trust', () => {
  it('marks an image-sourced name for confirmation', () => {
    // ⚠️ A VISION MODEL NAMING A PRODUCT FROM A BOX IS USUALLY RIGHT AND
    // SOMETIMES CONFIDENTLY WRONG, and the cost of a wrong name is every later
    // script calling the thing something it is not. One tap fixes it; nothing
    // catches it afterwards.
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'creator_image' }))
      .toBe('needs_confirmation')
  })

  it('fails closed for a field that should never have reached it', () => {
    // ⚖️ The extractor drops refused fields, so this is the second line of
    // defence. A second line that returned `usable` would not be one.
    expect(extractionTrust({ field: 'price', value: '$29/mo', source: 'creator_image' }))
      .toBe('needs_confirmation')
  })

  it('does not disturb the sources that already existed', () => {
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'user_confirmed' })).toBe('usable')
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'marketing_copy' })).toBe('needs_confirmation')
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'official_product_page' })).toBe('usable')
  })
})

describe('the vocabulary', () => {
  it('carries the new source without displacing the old ones', () => {
    expect(EXTRACTION_SOURCES).toContain('creator_image')
    // ⚠️ `user_confirmed` MUST STILL OUTRANK EVERYTHING. A creator typing a price
    // is an assertion; a photo of it is not, and the two must not converge.
    expect(EXTRACTION_SOURCES).toContain('user_confirmed')
    expect(EXTRACTION_SOURCES.indexOf('creator_image'))
      .not.toBe(EXTRACTION_SOURCES.indexOf('user_confirmed'))
  })
})
