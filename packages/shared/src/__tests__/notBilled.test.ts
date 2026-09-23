import { describe, expect, it } from 'vitest'
import { notBilledNotice, wasNotBilled, needsUserCount, askingBeatCount, billingDecisionFor } from '../notBilled'

const beats = (n: number, asks: number) =>
  Array.from({ length: n }, (_, i) => ({ substance: i < asks ? 'needs_user' : 'creator_knowledge' }))

describe('wasNotBilled', () => {
  it('is true only for an explicit zero', () => {
    expect(wasNotBilled({ credits_spent: 0 })).toBe(true)
    expect(wasNotBilled({ credits_spent: 10 })).toBe(false)
  })

  // ⚠️ THE NULL CHECK MUST PRECEDE THE COERCION. A row predating the column says
  // "not recorded", never "not billed" — `0 == null` is the bug this forbids.
  it('treats an absent or null charge as unknown, not as free', () => {
    expect(wasNotBilled({ credits_spent: null })).toBe(false)
    expect(wasNotBilled({})).toBe(false)
    expect(wasNotBilled(null)).toBe(false)
    expect(wasNotBilled(undefined)).toBe(false)
    expect(wasNotBilled({ credits_spent: Number.NaN })).toBe(false)
  })
})

describe('needsUserCount', () => {
  it('counts only the beats the writer marked', () => {
    expect(needsUserCount(beats(6, 4))).toBe(4)
    expect(needsUserCount([])).toBe(0)
    expect(needsUserCount(null)).toBe(0)
    expect(needsUserCount(undefined)).toBe(0)
  })
})

describe('notBilledNotice', () => {
  it('says nothing about a generation that was charged for', () => {
    expect(notBilledNotice({ credits_spent: 10, script: beats(6, 4) })).toBeNull()
  })

  // ⚠️ THE FIVE REAL RATIOS from the fresh signup on 2026-09-01: 3/5, 4/6, 3/6,
  // 5/7, 4/6. Every one refunded; none of them said so.
  it.each([[5, 3], [6, 4], [6, 3], [7, 5]])(
    'names the numbers for a %i-beat script with %i asks', (total, asks) => {
      const notice = notBilledNotice({ credits_spent: 0, script: beats(total, asks) })
      expect(notice).toContain(`${asks} of the ${total} beats`)
      expect(notice).toContain('free')
    })

  it('still says something true when the beats cannot be counted', () => {
    const notice = notBilledNotice({ credits_spent: 0, script: [] })
    expect(notice).toContain('free')
    expect(notice).not.toContain('of the 0 beats')
  })

  it('does not claim a refund on a script with no asks at all', () => {
    // Not billed for some other reason: say only what is certain.
    expect(notBilledNotice({ credits_spent: 0, script: beats(6, 0) }))
      .not.toContain('beats need a detail')
  })
})

// ⚠️ THE 2026-09-22 SESSION: 8 remixes started, 8 scripts, counter ended 2 lower.
// Ledger: -80 blueprint, +60 blueprint_refund_quality — reconciled. These are the
// eight real (beats, asks, charged) triples. The rule must reproduce every charge,
// and the notice must appear exactly when the charge was reversed.
describe('the charge and the notice come from one decision', () => {
  const ESC = 'Only you can supply this. What would you actually say here?'
  const script = (n: number, asks: number) =>
    Array.from({ length: n }, (_, i) => i < asks
      ? { substance: 'needs_user', line: '', ask: ESC }
      : { substance: 'creator_knowledge', line: 'A grounded line.' })
  const rows: Array<[number, number, number]> = [
    [9, 3, 0], [4, 1, 0], [8, 1, 0], [4, 1, 0], [4, 0, 10], [8, 1, 0], [8, 0, 10], [6, 2, 0],
  ]
  it.each(rows)('%i beats, %i asks → charged %i', (n, asks, spent) => {
    const s = script(n, asks)
    const d = billingDecisionFor(s)
    expect(d.billable ? 10 : 0).toBe(spent)
    const notice = notBilledNotice({ credits_spent: d.billable ? 10 : 0, script: s })
    expect(Boolean(notice)).toBe(!d.billable)
    if (notice) expect(notice).toContain(`${asks} of the ${n} beats`)
  })

  it('counts an escalation beat the writer did not mark needs_user', () => {
    const s = [{ substance: 'general', line: '', ask: ESC }, { substance: 'general', line: 'x' }]
    expect(askingBeatCount(s)).toBe(1)
    expect(billingDecisionFor(s).billable).toBe(false)
  })

  it('reconciles the session: 8 started, 2 charged, 6 returned', () => {
    const charged = rows.filter(([n, a]) => billingDecisionFor(script(n, a)).billable).length
    expect(charged).toBe(2)
  })
})
