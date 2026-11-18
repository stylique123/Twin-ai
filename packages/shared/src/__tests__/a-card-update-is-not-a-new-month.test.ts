// Security audit #5: credits refill on a new billing period, the first grant, or
// an upgrade — never on a mid-period update such as a new card.
import { it, expect } from 'vitest'
import { shouldRefill, LS_ACTIVE_STATUSES } from '../billingRefill'

const MAY = '2026-05-01T00:00:00Z'
const JUN = '2026-06-01T00:00:00Z'

it('refills only when the period moves forward, on the first grant, or on an upgrade', () => {
  expect(shouldRefill(MAY, MAY, 180, 180)).toBe(false) // card update: same period
  expect(shouldRefill(MAY, null, 180, 180)).toBe(false) // invoice event with no period
  expect(shouldRefill(JUN, MAY, 180, 180)).toBe(false) // stale event
  expect(shouldRefill(MAY, JUN, 180, 180)).toBe(true) // renewal
  expect(shouldRefill(null, MAY, 0, 180)).toBe(true) // first purchase
  expect(shouldRefill(MAY, MAY, 180, 880)).toBe(true) // upgrade mid-period
  expect(shouldRefill(MAY, MAY, 880, 180)).toBe(false) // downgrade mid-period
})

it('counts unpaid as not active', () => {
  expect(LS_ACTIVE_STATUSES.includes('unpaid')).toBe(false)
  expect(LS_ACTIVE_STATUSES.includes('past_due')).toBe(false)
  expect(['active', 'on_trial', 'paid'].every((s) => LS_ACTIVE_STATUSES.includes(s))).toBe(true)
})
