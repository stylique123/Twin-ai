// A STRANGER SHOULD BE ABLE TO TELL WHICH CREATOR IS WHICH, FROM THE QUESTIONS.
//
// ⚠️⚠️ THE OPENING THREE HAD NO WORDING TABLE AT ALL. `OVERRIDES` covers
// number_that_matters / own_method / first_thing_asked; `OPENING_THREE` is
// expensive_lesson / best_result / contrarian — a DISJOINT SET. So every creator
// met the same three sentences, including "what does almost everyone in your
// NICHE believe", asked on a screen that rendered before her niche was read.
//
// ⚠️ AND THE KEY IS `sells`, NOT NICHE. A coach has clients who arrive stuck; a
// chef has clients who are tired at 6pm; a template seller has buyers who click a
// link. Inside one niche those are different jobs, and a question assuming the
// wrong one cannot be answered honestly — which is how a digital-product seller
// came to be asked what she says when a founder comes to her stuck.
import { describe, expect, it } from 'vitest'
import {
  CREATOR_QUESTIONS, OPENING_THREE, openingQuestionsFor, sellsFacetOf, SELLS_KINDS,
} from '../index'

const askOf = (id: string, sells: Parameters<typeof openingQuestionsFor>[1], band: string | null = null) =>
  openingQuestionsFor(CREATOR_QUESTIONS, sells, band).find((q) => q.id === id)!.ask

describe('the three are worded for what she sells', () => {
  for (const id of OPENING_THREE) {
    it(`${id} differs between a service and a digital product`, () => {
      expect(askOf(id, 'service')).not.toBe(askOf(id, 'digital'))
    })
    it(`${id} differs from the generic bank for every known kind`, () => {
      const plain = CREATOR_QUESTIONS.find((q) => q.id === id)!.ask
      for (const k of [...SELLS_KINDS, 'none'] as const) {
        expect(askOf(id, k), `${id} unchanged for ${k}`).not.toBe(plain)
      }
    })
  }

  it('⚠️ "comes to you stuck" appears for NOBODY in the opening three', () => {
    // The sentence that misfired on a templates seller. It is correct only for a
    // remote service, and nothing in the data says local from remote — so it is
    // absent here rather than guessed.
    for (const k of [...SELLS_KINDS, 'none'] as const) {
      for (const id of OPENING_THREE) {
        expect(askOf(id, k).toLowerCase()).not.toContain('comes to you stuck')
      }
    }
  })

  it('a chef and a templates seller can be told apart', () => {
    // Part 8's test, as an assertion rather than a screenshot.
    const chef = OPENING_THREE.map((id) => askOf(id, 'service'))
    const seller = OPENING_THREE.map((id) => askOf(id, 'digital'))
    expect(chef.some((q, i) => q !== seller[i])).toBe(true)
    expect(new Set([...chef, ...seller]).size).toBe(chef.length + seller.length)
  })
})

describe('the id never changes, only the words', () => {
  it('every variant returns the same ids in the same order', () => {
    const base = CREATOR_QUESTIONS.map((q) => q.id)
    for (const k of [...SELLS_KINDS, 'none', null] as const) {
      expect(openingQuestionsFor(CREATOR_QUESTIONS, k).map((q) => q.id)).toEqual(base)
    }
  })

  it('and it never touches a question outside the opening three', () => {
    for (const q of CREATOR_QUESTIONS) {
      if ((OPENING_THREE as readonly string[]).includes(q.id)) continue
      expect(askOf(q.id, 'service')).toBe(q.ask)
    }
  })
})

describe('under 1,000 followers the number question is not asked', () => {
  // ⚠️ RE-ANCHORED 2026-09-17, AND IT IS NOW STRICTLY STRONGER. This asserted
  // one blanket outcome for every kind; it now asserts the two outcomes apart,
  // which is a distinction the old single rule could not have caught getting
  // wrong in either direction.
  //
  // ⚖️ THE SIBLING TEST BELOW ALREADY STATES THE PRINCIPLE: "the other two are
  // answerable at any size." That is exactly why `best_result` was singled out —
  // it was ASSUMED to be the unanswerable one. It is unanswerable only when it
  // asks about her own REACH. "What did a client tell you that you still
  // repeat?" does not, and a creator with 800 followers answers it fine.
  it('best_result is replaced at under_1k only where it asks about her own reach', () => {
    // She sells nothing, so the question is about a post. Replaced.
    const soft = askOf('best_result', 'none', 'under_1k')
    expect(soft).toBe('What is the best thing that has happened because of something you posted?')
    expect(soft).not.toBe(askOf('best_result', 'none', null))
  })

  it('and a buyer-side result question survives the band, for every selling kind', () => {
    for (const k of SELLS_KINDS) {
      const under = askOf('best_result', k, 'under_1k')
      expect(under, `${k} lost its buyer-side question`).toBe(askOf('best_result', k, null))
      expect(under).not.toBe('What is the best thing that has happened because of something you posted?')
    }
  })

  it('and ONLY best_result is replaced — the other two are answerable at any size', () => {
    for (const id of OPENING_THREE) {
      if (id === 'best_result') continue
      expect(askOf(id, 'service', 'under_1k')).toBe(askOf(id, 'service', null))
    }
  })

  it('a larger band keeps the number framing', () => {
    for (const band of ['1k_10k', '10k_100k', 'over_100k']) {
      expect(askOf('best_result', 'service', band)).toBe(askOf('best_result', 'service', null))
    }
  })
})

describe('an unknown kind falls back to the plain bank, never to "none"', () => {
  it('null returns the bank untouched', () => {
    expect(openingQuestionsFor(CREATOR_QUESTIONS, null)).toEqual(CREATOR_QUESTIONS)
  })

  it('⚠️ and null is NOT the same as "sells nothing"', () => {
    // A mixed library and a pure commentator are different people. Asking a chef
    // with two product lines "what did you get wrong publicly" is worse than the
    // generic, which is why the fallback is the bank and not `none`.
    for (const id of OPENING_THREE) {
      expect(askOf(id, null)).not.toBe(askOf(id, 'none'))
    }
  })
})

describe('sellsFacetOf tells an empty library from a mixed one', () => {
  // ⚠️ THIS ASSERTED `sellsFacetOf([]) === 'none'` AND THAT WAS THE DEFECT,
  // sitting under a describe block that claims to tell an empty library from a
  // mixed one. Onboarding asks the opening three at the `stories` step and mints
  // the product entity at `confirm`, AFTER it — so at the only moment those
  // questions are asked the library is ALWAYS empty, every creator was read as
  // selling nothing, and a leatherworker got the commentator's wording. The
  // affiliate half was always right and is unchanged.
  it('an EMPTY library is null — nobody has been asked yet', () => {
    expect(sellsFacetOf([])).toBeNull()
  })

  it('rows that exist and are all somebody else\'s is a real "none"', () => {
    expect(sellsFacetOf([{ type: 'SERVICE', relationship: 'AFFILIATE' }])).toBe('none')
  })

  it('one kind is that kind', () => {
    expect(sellsFacetOf([{ type: 'SERVICE', relationship: 'OWN_SERVICE' }])).toBe('service')
    expect(sellsFacetOf([{ type: 'DIGITAL_PRODUCT', relationship: 'OWN_PRODUCT' }])).toBe('digital')
  })

  it('⚠️ a MIXED library is null, never a coin-flip', () => {
    expect(sellsFacetOf([
      { type: 'SERVICE', relationship: 'OWN_SERVICE' },
      { type: 'PHYSICAL_PRODUCT', relationship: 'OWN_PRODUCT' },
    ])).toBeNull()
  })

  it('and an unreadable list is null, never "none"', () => {
    expect(sellsFacetOf(null)).toBeNull()
    expect(sellsFacetOf(undefined)).toBeNull()
  })
})
