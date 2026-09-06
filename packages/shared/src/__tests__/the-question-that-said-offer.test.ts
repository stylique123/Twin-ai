import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assessReadiness, claimsQuestionFor } from '../generationReadiness'

/**
 * ⚠️ A FUNCTION WRITTEN AND NEVER CALLED IS THE SAME DEFECT AS A FIELD WRITTEN
 * AND NEVER READ.
 *
 * `claimsQuestionFor` exists to put the offer's real name into the claims
 * question — "What does Acme Coaching actually do?" rather than "What does the
 * OFFER do?", because the second's subject is a pronoun with nothing on screen
 * to bind to. It was exported, unit-tested, and called by nothing: `put()`
 * served `ASK[field]` for every field, so every creator saw the version with
 * the literal word OFFER in it.
 *
 * Meanwhile `generate-blueprint` carries `readyClaimsQuestion`
 * (index.ts:4577) implementing exactly this rule, under a comment saying it
 * MIRRORS `claimsQuestionFor`. Nothing mirrored back. Two authorities for one
 * question, and the half a creator actually reads was the worse one.
 */

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const edge = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** A promoting video with no product facts on record — the state that escalates
 *  `claims` to MISSING_REQUIRED. */
const promotingWithNoFacts = (offer: string | null) => ({
  goal: 'sell',
  audience: 'founders',
  angle: 'why retainers beat projects',
  offer,
  relationship: 'OWN_SERVICE',
  cta: 'book a call',
  productFacts: [] as readonly string[],
  referenceRead: true,
  hasCreatorKnowledge: true,
})

const claimsQuestion = (offer: string | null) =>
  assessReadiness(promotingWithNoFacts(offer)).fields
    .find((f) => f.field === 'claims')?.question ?? null

describe('the escalated claims question names the offer', () => {
  // ⚠️ THE FIXTURE MUST ACTUALLY ESCALATE, or every assertion below reads null
  // and passes vacuously — the way a guard becomes decoration.
  it('the fixture really does escalate claims', () => {
    const claims = assessReadiness(promotingWithNoFacts('Acme Coaching')).fields
      .find((f) => f.field === 'claims')
    expect(claims, 'no claims verdict was produced').toBeTruthy()
    expect(claims!.state).toBe('MISSING_REQUIRED')
  })

  it('uses the offer name when we have one', () => {
    expect(claimsQuestion('Acme Coaching')).toBe(
      'What does Acme Coaching actually do? Specific features, numbers or outcomes this video is allowed to state.')
  })

  // ⚖️ NAMING THE WRONG PRODUCT IS WORSE THAN NAMING NONE, so the generic
  // wording is a deliberate fallback rather than a failure.
  it('falls back to the generic wording when the offer is unknown', () => {
    expect(claimsQuestion(null)).toMatch(/the OFFER/)
    expect(claimsQuestion('unspecified')).toMatch(/the OFFER/)
    expect(claimsQuestion('x'.repeat(80))).toMatch(/the OFFER/)
  })

  it('is exactly what claimsQuestionFor returns — one authority, not two', () => {
    for (const offer of ['Acme Coaching', null, 'unspecified', 'x'.repeat(80)]) {
      expect(claimsQuestion(offer)).toBe(claimsQuestionFor(offer))
    }
  })

  // ⚠️ AND ONLY `claims` IS PERSONALISED. A blanket change would have rewritten
  // every question through a function built for one of them.
  it('leaves the other fields on their generic wording', () => {
    const v = assessReadiness({ goal: 'sell', productFacts: [] })
    const offerQ = v.fields.find((f) => f.field === 'offer')?.question
    if (offerQ) expect(offerQ).not.toMatch(/actually do\?/)
  })
})

describe('the client and the server ask the same question', () => {
  // ⚖️ THE EDGE CANNOT IMPORT THIS — Deno, no @twinai/shared — so the copy
  // stays. What must not stay is the copies disagreeing.
  it('the edge still carries its inlined twin', () => {
    expect(edge).toContain('const readyClaimsQuestion =')
  })

  it('both wordings are identical, generic branch', () => {
    expect(edge).toContain(claimsQuestionFor(null))
  })

  it('both wordings are identical, named branch', () => {
    // The edge builds the named form by template, so the two literal halves
    // around the interpolation are what can be compared.
    expect(edge).toContain('`What does ${n} actually do? Specific features, numbers or outcomes this video is allowed to state.`')
    expect(claimsQuestionFor('N')).toBe(
      'What does N actually do? Specific features, numbers or outcomes this video is allowed to state.')
  })

  it('both reject the same offers as unusable names', () => {
    expect(edge).toMatch(/toLowerCase\(\) === 'unspecified' \|\| n\.length > 60/)
  })
})
