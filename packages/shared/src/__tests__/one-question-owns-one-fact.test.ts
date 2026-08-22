// The ten scenarios the rebuild has to survive. Each is a thing the current
// flow gets wrong, written as a case that fails if it comes back.
import { describe, it, expect } from 'vitest'
import {
  QUESTIONS, questionsToAsk, isAsked, questionsWithoutConsumer, fieldsAskedTwice,
  questionsOwnedByAnObserver, skipped, AUTHORITY,
} from '../questionRegistry'

describe('the registry itself', () => {
  // ⚠️ THE HARSHEST RULE, AND THE ONE THAT DELETES SCREENS.
  it('has no question without a downstream reader', () => {
    expect(questionsWithoutConsumer()).toEqual([])
  })
  it('never asks one fact twice', () => {
    expect(fieldsAskedTwice()).toEqual([])
  })
  // Creator DNA may OBSERVE "often talks about offers". It may never OWN
  // "their product is X" -- which is what the guessed-offer input did.
  it('lets no observed layer own an asked fact', () => {
    expect(questionsOwnedByAnObserver()).toEqual([])
  })
  it('says what each answer changes, in behaviour not adjectives', () => {
    for (const q of QUESTIONS) expect(q.decisionChanged.length).toBeGreaterThan(20)
  })
})

describe('A — a creator with nothing commercial', () => {
  it('reaches the studio without one product question', () => {
    expect(questionsToAsk({ commercialContentRelevant: false }, 'PRODUCT_DNA')).toEqual([])
  })
})

describe('B — a consultant who sells a physical book', () => {
  const ctx = { addingProduct: true, productType: 'physical_product' as const, relationship: 'owned' as const }
  it('is not a contradiction: identity and product type have different owners', () => {
    expect(AUTHORITY.identity).toBe('CREATOR_PROFILE')
    expect(AUTHORITY.product_type).toBe('PRODUCT_DNA')
  })
  it('is asked whether the book can be on the desk', () => {
    expect(isAsked('product_physical_availability', ctx)).toBe(true)
  })
  // THE QUESTION THAT MADE THE WHOLE FLOW LOOK CARELESS.
  it('is never asked to screen-record a book', () => {
    expect(isAsked('product_screen_show', ctx)).toBe(false)
  })
  it('is not asked whether they have personally used their own book', () => {
    expect(isAsked('product_personal_use', ctx)).toBe(false)
  })
})

describe('C — owns a SaaS and affiliates another', () => {
  const owned = { addingProduct: true, productType: 'software' as const, relationship: 'owned' as const }
  const aff = { addingProduct: true, productType: 'software' as const, relationship: 'affiliate' as const }
  it('keeps the two relationships apart', () => {
    expect(isAsked('product_personal_use', owned)).toBe(false)
    expect(isAsked('product_personal_use', aff)).toBe(true)
  })
  it('asks both about showing the screen', () => {
    expect(isAsked('product_screen_show', owned)).toBe(true)
    expect(isAsked('product_screen_show', aff)).toBe(true)
  })
})

describe('D and E and F — capability gates the director must obey', () => {
  it('asks an affiliate whether they have used it, so a claim can be refused', () => {
    const q = QUESTIONS.find((x) => x.id === 'product_personal_use')!
    expect(q.consumers).toContain('ClaimEntitlement')
  })
  it('routes both capability answers to the director, not to the writer', () => {
    for (const id of ['product_physical_availability', 'product_screen_show']) {
      expect(QUESTIONS.find((x) => x.id === id)!.consumers).toEqual(['DirectorPlan'])
    }
  })
})

describe('H — the product URL read failed', () => {
  it('asks for the name only when there is no url, or extraction actually failed', () => {
    expect(isAsked('product_name', { addingProduct: true, hasSourceUrl: true, extractionSucceeded: true })).toBe(false)
    expect(isAsked('product_name', { addingProduct: true, hasSourceUrl: true, extractionSucceeded: false })).toBe(true)
    expect(isAsked('product_name', { addingProduct: true, hasSourceUrl: false })).toBe(true)
  })
  it('never asks a human to retype what the page already gave', () => {
    expect(isAsked('product_description', { addingProduct: true, hasSourceUrl: true, extractionSucceeded: true })).toBe(false)
  })
})

describe('I — a skipped question', () => {
  // Storing `beginner` for a skipped audience level invents an answer and then
  // lets the plan act on it. Unknown stays unknown.
  it('stays unknown, never false and never a default', () => {
    expect(skipped()).toBeNull()
  })
})

describe('J — a per-video goal', () => {
  it('overrides the profile default without editing the profile', () => {
    expect(AUTHORITY.video_goal).toBe('VIDEO_INTENT')
    expect(AUTHORITY.goals).toBe('CREATOR_PROFILE')
  })
})
