// GENERATED FROM packages/shared/src/billingRefill.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// When a billing event may reset credits to the plan's monthly allowance
// (security audit #5). Every "subscription updated" notice used to refill, so
// updating a card brought back all monthly credits. Now only a new billing
// period, the first grant, or a plan with a bigger allowance refills.
export function shouldRefill(
  prevPeriodEnd: string | null | undefined,
  newPeriodEnd: string | null | undefined,
  prevPlanCredits: number,
  newPlanCredits: number,
): boolean {
  if (newPlanCredits > prevPlanCredits) return true
  if (!prevPeriodEnd) return true
  const prev = Date.parse(prevPeriodEnd)
  const next = newPeriodEnd ? Date.parse(newPeriodEnd) : NaN
  return Number.isFinite(prev) && Number.isFinite(next) && next > prev
}

// LemonSqueezy statuses that mean paid and running, matched exactly: the old
// /active|paid|on_trial/ regex also matched 'unpaid'. 'paid' is the status on
// payment-success invoices and orders.
export const LS_ACTIVE_STATUSES: readonly string[] = ['active', 'on_trial', 'paid']
