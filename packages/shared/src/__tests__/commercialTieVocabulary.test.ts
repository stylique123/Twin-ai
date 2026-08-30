// THE MAPPING TABLE FOR THE THIRTEEN-OPTION COLLAPSE, MADE UNSKIPPABLE.
//
// ⚠️ A VOCABULARY THAT GROWS WITHOUT A TABLE IS A SILENT DEFAULT WAITING TO
// HAPPEN. Onboarding stopped asking six commercial-tie chips plus a seven-chip
// service follow-up and now asks one yes/no. The yes/no still writes
// `commercialTies`, through `SELLS_ANSWER_TO_TIES` and nothing else. These
// tests fail the build if any value in either vocabulary loses its target, or
// if `unspecified` ever acquires the authority it is specifically defined not
// to have.
import { describe, it, expect } from 'vitest'
import {
  COMMERCIAL_TIES, ONBOARDING_SELLS_ANSWERS, SELLS_ANSWER_TO_TIES, sellsAnswerOf,
  type CommercialTie,
} from '../creatorProfileQuestions'
import {
  RELATIONSHIP_OF, TIE_PRECEDENCE, assembleCreatorProfile,
} from '../profileAssembler'

const NOW = '2026-01-01T00:00:00.000Z'

describe('every commercial tie has a relationship decision', () => {
  it('RELATIONSHIP_OF covers the vocabulary exactly — no missing key, no stray one', () => {
    expect(Object.keys(RELATIONSHIP_OF).sort()).toEqual([...COMMERCIAL_TIES].sort())
  })

  // ⚖️ THE SIX ORIGINAL VALUES KEEP THEIR EXACT MEANING. Onboarding stopped
  // writing them; accounts still hold them, so a changed target here would
  // silently rewrite what a stored answer means.
  it('the six originals map to the relationships they always did', () => {
    expect(RELATIONSHIP_OF.own_product).toBe('OWN_PRODUCT')
    expect(RELATIONSHIP_OF.own_service).toBe('OWN_SERVICE')
    expect(RELATIONSHIP_OF.affiliate).toBe('AFFILIATE')
    expect(RELATIONSHIP_OF.sponsor).toBe('SPONSOR')
    expect(RELATIONSHIP_OF.review).toBe('REVIEW_ONLY')
    expect(RELATIONSHIP_OF.none).toBe('NONE')
  })

  it('`unspecified` licenses nothing — null relationship, and no rank', () => {
    expect(RELATIONSHIP_OF.unspecified).toBeNull()
    expect(TIE_PRECEDENCE).not.toContain('unspecified')
  })

  // MUTATION GUARD. If somebody adds `unspecified` to the precedence list, the
  // assembler starts asserting a relationship for it and this fails.
  it('a creator who only said "yes, I sell something" is granted NO relationship', () => {
    const p = assembleCreatorProfile({
      answers: { commercialTies: ['unspecified'] }, now: NOW,
    })
    expect(p.relationship).toBeNull()
  })

  it('every tie except `unspecified` still resolves to a relationship', () => {
    for (const t of COMMERCIAL_TIES) {
      const p = assembleCreatorProfile({ answers: { commercialTies: [t] }, now: NOW })
      if (t === 'unspecified') expect(p.relationship).toBeNull()
      else expect(p.relationship?.value).toBe(RELATIONSHIP_OF[t])
    }
  })
})

describe('the onboarding yes/no maps into the stored vocabulary', () => {
  it('SELLS_ANSWER_TO_TIES covers every answer the screen can produce', () => {
    expect(Object.keys(SELLS_ANSWER_TO_TIES).sort())
      .toEqual([...ONBOARDING_SELLS_ANSWERS].sort())
  })

  it('every mapped value is a real commercial tie — no invented strings', () => {
    for (const a of ONBOARDING_SELLS_ANSWERS) {
      for (const tie of SELLS_ANSWER_TO_TIES[a]) {
        expect(COMMERCIAL_TIES).toContain(tie)
      }
    }
  })

  it('yes writes `unspecified`; not-right-now writes the exclusive `none`', () => {
    expect(SELLS_ANSWER_TO_TIES.yes).toEqual(['unspecified'])
    expect(SELLS_ANSWER_TO_TIES.not_right_now).toEqual(['none'])
  })

  // ⚠️ THE ROUND TRIP IS THE POINT. A creator returning to the screen must see
  // the answer they gave, including one written by the question this replaced.
  it('reads back its own writes', () => {
    for (const a of ONBOARDING_SELLS_ANSWERS) {
      expect(sellsAnswerOf(SELLS_ANSWER_TO_TIES[a])).toBe(a)
    }
  })

  it('reads back the THIRTEEN-OPTION answers accounts already hold', () => {
    // The two rows in production at the time of the change were `['own_service']`.
    expect(sellsAnswerOf(['own_service'])).toBe('yes')
    expect(sellsAnswerOf(['own_product'])).toBe('yes')
    expect(sellsAnswerOf(['affiliate', 'sponsor'])).toBe('yes')
    expect(sellsAnswerOf(['review'])).toBe('yes')
    expect(sellsAnswerOf(['none'])).toBe('not_right_now')
  })

  // ⚠️ SILENCE IS NOT AN ANSWER, and this is the guard that keeps it that way.
  it('unanswered stays unanswered — never "not right now"', () => {
    expect(sellsAnswerOf(null)).toBeNull()
    expect(sellsAnswerOf(undefined)).toBeNull()
    expect(sellsAnswerOf([])).toBeNull()
  })

  // MUTATION GUARD on the exclusivity rule: `none` alongside a real tie is a
  // contradiction, and the surviving answer must be the commercial one.
  it('`none` mixed with a real tie reads as yes, not as nothing-to-sell', () => {
    expect(sellsAnswerOf(['none', 'affiliate'] as CommercialTie[])).toBe('yes')
  })
})
