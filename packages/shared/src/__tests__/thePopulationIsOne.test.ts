import { describe, it, expect } from 'vitest'
import { CLAIM_STOP_MIN_POPULATION, mayGenerateClaims, entityStatus } from '../productEntity'
import { limitationById } from '../pilot/knownLimitations'
import type { DraftEntity } from '../productEntity'

// ⚠️ WHAT THIS FILE EXISTS TO CATCH. The claim stop's own limitation record used
// to say "most entities in production carry evidence null" and that wiring it
// "would silence product claims for MOST existing products". Nobody had counted.
// Measured against production on 2026-08-24, read-only: the entire
// product_entities table held ONE ROW, one owner, none archived. The sentence
// described a population that does not exist -- an assumption wearing the
// clothes of a measurement, which is the exact failure this repo keeps finding.
//
// ⚖️ AND THE FIX IS NOT TO FLIP IT TO "100% WOULD BE BLOCKED". That row would
// return missing_information, and quoting one row as a rate is the same error
// pointing the other way. The honest state is that the question is not yet
// askable, and these cases pin that.
describe('the population is one, and that is the finding', () => {
  it('the claim stop is still recorded as open', () => {
    expect(limitationById('THE_CLAIM_STOP_IS_DECLARED_BUT_NOT_ENFORCED')?.status).toBe('OPEN')
  })

  // The old trigger was "someone has counted". It WAS counted, and the count
  // taught nothing -- so a trigger a single query can satisfy is no trigger.
  it('the revisit trigger names a population, not a single count', () => {
    const revisit = limitationById('THE_CLAIM_STOP_IS_DECLARED_BUT_NOT_ENFORCED')?.revisitWhen ?? ''
    expect(revisit).toContain('CLAIM_STOP_MIN_POPULATION')
    expect(revisit).toMatch(/more than one owner/i)
  })

  // ⚠️ THE RETRACTED SENTENCE MUST NOT COME BACK UN-RETRACTED, and the first
  // version of THIS CASE got that wrong. It asserted the phrase was simply
  // absent -- and then failed against a CORRECT record, because the decision
  // QUOTES the false claim in order to retract it. A record that retracts
  // something has to be allowed to name what it retracts.
  //
  // ⚖️ SECOND TIME TODAY A GUARD MATCHED PROSE ABOUT A DEFECT RATHER THAN THE
  // DEFECT -- check_brief_consumers had just been taught to strip comments for
  // the same reason. So this asserts the PROPERTY: if the claim appears at all,
  // the retraction marker appears BEFORE it. That is what "no longer asserted"
  // actually means, and it survives rewording of either sentence.
  it('the retracted claim never appears un-retracted', () => {
    const decision = limitationById('THE_CLAIM_STOP_IS_DECLARED_BUT_NOT_ENFORCED')?.decision ?? ''
    expect(decision).toMatch(/ONE ROW IN TOTAL/)
    const marker = decision.search(/ASSUMPTION STATED AS FACT/i)
    const claim = decision.search(/silence product claims for MOST existing products/i)
    expect(marker).toBeGreaterThan(-1)
    if (claim > -1) expect(marker).toBeLessThan(claim)
  })

  it('the threshold is big enough that a rate would mean something', () => {
    expect(CLAIM_STOP_MIN_POPULATION).toBeGreaterThan(1)
    expect(CLAIM_STOP_MIN_POPULATION).toBeGreaterThanOrEqual(10)
  })

  // ⚖️ THE RULE ITSELF IS UNCHANGED AND STILL CORRECT. Refusing to WIRE it is not
  // the same as changing it, and these keep the logic pinned so the refusal
  // cannot quietly become a rewrite.
  const base: DraftEntity = {
    name: 'Thing', type: 'SAAS', relationship: 'OWN', personalUse: 'USES',
    showability: 'ALWAYS', evidence: null, restrictions: [], source: 'user',
    userConfirmed: true,
  } as unknown as DraftEntity

  it('an entity with no evidence is still missing_information', () => {
    expect(entityStatus(base)).toBe('missing_information')
    expect(mayGenerateClaims(base)).toBe(false)
  })

  it('a declined evidence answer is a real answer, not a gap', () => {
    const declined = { ...base, evidence: 'declined' } as unknown as DraftEntity
    expect(entityStatus(declined)).not.toBe('missing_information')
    expect(mayGenerateClaims(declined)).toBe(true)
  })

  it('NONE is the absence of an entity, not an underfilled one', () => {
    const none = { ...base, relationship: 'NONE' } as unknown as DraftEntity
    expect(entityStatus(none)).toBe('ready')
    expect(mayGenerateClaims(none)).toBe(false)
  })
})
