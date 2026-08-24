import { describe, it, expect } from 'vitest'
import { capabilityQuestion, screenAnswerIsUsed, CAPABILITY_PROMPT } from '../productQuestions'
import { inferShowability, ENTITY_TYPES } from '../productEntity'
import type { EntityType } from '../productEntity'

const ask = (type: EntityType) => capabilityQuestion({ type, relationship: 'OWN_PRODUCT' })

// ⚠️ WHAT THIS FILE EXISTS TO CATCH, AND IT WAS FOUND BY MEASURING RATHER THAN
// READING. `inferShowability` puts MARKETPLACE and OTHER on the SCREEN branch —
// canRecordScreen: true makes them ALWAYS. Onboarding collects that answer via
// the mint flags. The Product Library did not, because `KIND` maps both types to
// null and the capability question was derived from that taxonomy. So the SAME
// fact was askable on one surface and unaskable on the other, and which one a
// creator happened to arrive through decided whether Twin could ever show their
// product.
//
// ⚖️ TWO WRONG HYPOTHESES DIED BEFORE THIS ONE, both killed by measurement, and
// they are recorded because each looked obviously true:
//   1. "a course is asked the same question as a dashboard, so the type is
//      ignored" — true but NOT a defect: it is one capability, screen recording,
//      and the wording is right for both.
//   2. "MARKETPLACE gets screen scene direction while nothing asks whether it
//      can record" — FALSE. A forced showability of ALWAYS produced it. At the
//      real value, UNKNOWN, mayShow is false and there are zero moments. The
//      safety chain the KIND comment describes does hold.
describe('one authority decides whether a screen answer is used', () => {
  it.each(ENTITY_TYPES.filter((t) => screenAnswerIsUsed(t as EntityType)))(
    '%s is asked the screen question, because its answer is consumed', (t) => {
      expect(ask(t as EntityType)).toBe('screen')
    })

  // ⚖️ AND NOTHING IS ASKED OF A CREATOR WHOSE ANSWER WOULD BE THROWN AWAY. A
  // service and a community are NEVER showable whatever they answer, so asking
  // would spend their attention on a question with no consequence.
  it.each(['SERVICE', 'COMMUNITY'] as const)(
    '%s is asked nothing, because no answer could change the outcome', (t) => {
      expect(screenAnswerIsUsed(t)).toBe(false)
      expect(ask(t)).toBeNull()
    })

  // The regression proper: these two are the types that were unaskable.
  it.each(['MARKETPLACE', 'OTHER'] as const)(
    '%s can now be asked on the Library surface too', (t) => {
      expect(inferShowability(t, { canRecordScreen: true })).toBe('ALWAYS')
      expect(ask(t)).toBe('screen')
    })

  it('a physical product is still asked about the object, never the screen', () => {
    expect(ask('PHYSICAL_PRODUCT')).toBe('physical')
  })

  // ⚠️ THE AUTHORITY IS ASKED, NOT COPIED. A second hand-written list of screen
  // types is the drift this file documents elsewhere; if inferShowability ever
  // changes which types consume the answer, the question must follow it without
  // anybody remembering to edit a list.
  it('every type that infers ALWAYS from a screen answer is asked, with no list to maintain', () => {
    for (const t of ENTITY_TYPES) {
      const consumed = inferShowability(t as EntityType, { canRecordScreen: true }) === 'ALWAYS'
        && inferShowability(t as EntityType, { canRecordScreen: false }) === 'NEVER'
      expect(screenAnswerIsUsed(t as EntityType)).toBe(consumed)
      if (consumed && t !== 'PHYSICAL_PRODUCT') expect(ask(t as EntityType)).toBe('screen')
    }
  })

  // ⚖️ ONE CAPABILITY QUESTION AT MOST, unchanged. The original rule.
  it('never asks both', () => {
    for (const t of ENTITY_TYPES) {
      const q = ask(t as EntityType)
      expect(q === null || q === 'screen' || q === 'physical').toBe(true)
    }
  })

  // ⚠️ THE SCREEN WORDING DELIBERATELY CHANGED, and pinning the old sentence
  // here would now fail against correct code. Twin no longer asks anyone to
  // record a screen, so the question asks what actually gates the shot: can the
  // thing be open on a screen while they film.
  it('the wording a creator reads is plain English and asks for the right favour', () => {
    expect(CAPABILITY_PROMPT.screen).toBe('Can you have it open on a screen while you film?')
    expect(CAPABILITY_PROMPT.physical).toBe('Can you have it with you when you film?')
    expect(CAPABILITY_PROMPT.screen).not.toMatch(/record/i)
  })
})
