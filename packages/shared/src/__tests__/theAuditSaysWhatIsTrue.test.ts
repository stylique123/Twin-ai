import { describe, it, expect } from 'vitest'
import { AUDITED_QUESTIONS } from '../questionAudit'
import { refinedEntityType, mintFromWorkKind } from '../productEntity'

/**
 * ⚠️ A COST NOTE IS WHAT SOMEBODY READS BEFORE DELETING A QUESTION.
 *
 * Two of them were false. `ownServiceKind` was recorded as having "zero
 * consumers of any kind"; `ownProductKind` as gating a capability question "and
 * nothing else". Both are consumed by `refinedEntityType` at mint time, and the
 * SERVICE + community mapping is what produces a COMMUNITY entity at all.
 *
 * ⚖️ THE VERDICTS WERE RIGHT AND ARE NOT TOUCHED. `ORPHANED_NO_READER` means
 * persisted-and-not-read-by-generation, which is exactly true of both. The
 * defect was in the prose describing the cost, not in the classification — and
 * prose is the part no rule was checking.
 */
const byField = Object.fromEntries(AUDITED_QUESTIONS.map((q) => [q.field, q]))

describe('the consumer the notes now name actually exists', () => {
  // ⚠️ THIS IS THE FACT THE NOTES ASSERT, PINNED AT THE UNIT LEVEL. If the
  // consumer is ever removed, this fails — and the note becomes true again in a
  // way somebody has to look at, rather than silently drifting back.
  it('a service kind still produces a COMMUNITY entity', () => {
    expect(refinedEntityType('SERVICE', { ownServiceKind: 'community' })).toBe('COMMUNITY')
  })

  it.each([
    ['course', 'COURSE'],
    ['digital', 'DIGITAL_PRODUCT'],
  ] as const)('a product kind of %s still refines the type to %s', (kind, expected) => {
    expect(refinedEntityType('SAAS', { ownProductKind: kind })).toBe(expected)
  })

  // ⚖️ AND THE REFINEMENT REACHES THE MINT, not just the pure function. A
  // consumer that exists but is never called would make the notes wrong again.
  it('the mint applies the refinement, so the answer reaches a stored entity', () => {
    expect(mintFromWorkKind('saas', { ownProductKind: 'course' })?.type).toBe('COURSE')
    expect(mintFromWorkKind('professional', { ownServiceKind: 'community' })?.type).toBe('COMMUNITY')
  })
})

describe('the notes no longer claim what was disproven', () => {
  // ⚠️ THE EXACT FALSIFIED PHRASES. Asserting their ABSENCE is narrow on
  // purpose: a broad "mentions refinedEntityType" check would pass on a note
  // that also still said "nothing else", which is the claim that misleads.
  it('ownServiceKind no longer claims zero consumers', () => {
    expect(byField.ownServiceKind.cost.toLowerCase()).not.toContain('zero consumers')
  })

  it('ownProductKind no longer claims the gate is all it does', () => {
    expect(byField.ownProductKind.cost.toLowerCase()).not.toContain('and nothing else')
  })

  it.each(['ownServiceKind', 'ownProductKind'])('%s names the consumer it actually has', (f) => {
    expect(byField[f].cost).toContain('refinedEntityType')
  })

  // ⚖️ AND BOTH STILL SAY WHAT IS TRUE OF THE VERDICT, so correcting the cost
  // has not quietly turned an orphan into a claim of liveness. They reach the
  // script only THROUGH the entity type, which is the whole point.
  it.each(['ownServiceKind', 'ownProductKind'])('%s still says generation does not read it', (f) => {
    expect(byField[f].cost.toLowerCase()).toContain('not read by generation')
    expect(byField[f].verdict).toBe('ORPHANED_NO_READER')
  })
})
