// A COST CEILING PER ACCOUNT, NOT JUST A RATE LIMIT PER HOUR.
//
// ⚠️ MEASURED, NOT ASSUMED. `start-dna` limits voice scans to 8 per hour and
// nothing else. That is ~5,760 scans a month for one account, each one able to
// spend real money (Apify for YouTube and Instagram, Gemini for extraction).
// `rate_events`, the table the hourly limit counts, holds ZERO rows in
// production because `check_rate_limit` deletes anything older than its window
// on every call -- so the evidence a ceiling would need does not survive the
// hour. The whole production estate holds 40 brand voices; the abuse capacity is
// two orders of magnitude above legitimate use.
//
// ⚖️ THIS IS A CEILING, NEVER A THROTTLE. The hourly limit stays exactly as it
// is and this is added beside it. They answer different questions: "are you
// hammering us right now" and "have you spent a month's worth of our budget".

/**
 * How many billable scans a plan allows per calendar month.
 *
 * ⚠️ AN UNKNOWN PLAN GETS A GENEROUS DEFAULT, NOT `Infinity`, AND THAT IS A
 * DELIBERATE DEPARTURE FROM `productLibraryLimit`. That function returns
 * Infinity for an unrecognised plan on the reasoning that "failing open costs a
 * few rows, failing closed locks paying customers out of a feature over a
 * rename" -- correct there, because the cost of failing open is storage.
 *
 * Here the cost of failing open is the entire vulnerability: an unbounded spend
 * ceiling is the thing this module exists to remove, so `Infinity` would make it
 * decorative. Zero is equally wrong -- a plan rename would lock every paying
 * creator out of the product's first step.
 *
 * ⚖️ SO THE DEFAULT IS SET FAR ABOVE LEGITIMATE USE AND FAR BELOW ABUSE. Forty
 * voices exist in the entire production estate. A creator scanning a new account
 * every day all month reaches 30. The default is `DEFAULT_MONTHLY_SCANS`, which
 * no real creator will meet and which caps a runaway at a knowable number.
 */
export const DEFAULT_MONTHLY_SCANS = 100

export function monthlyScanCeiling(
  entitlements: Record<string, unknown> | null | undefined,
): number {
  const raw = entitlements?.monthly_scan_ceiling
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION. `Number(null)` is 0 and
  // `Number.isFinite(0)` is true, so coercing first would turn "this plan does
  // not name a ceiling" into "this plan allows zero scans" -- locking out every
  // creator on a plan that simply predates the key.
  if (typeof raw !== 'number') return DEFAULT_MONTHLY_SCANS
  if (!Number.isFinite(raw)) return DEFAULT_MONTHLY_SCANS
  if (raw < 0) return DEFAULT_MONTHLY_SCANS
  return raw
}

/** The verdict, with the numbers the creator is entitled to see. */
export interface ScanAllowance {
  allowed: boolean
  used: number
  ceiling: number
  /** Empty when allowed. Plain English, and it names both numbers. */
  message: string
}

/**
 * May this account start another billable scan this month?
 *
 * ⚖️ THE REFUSAL SAYS THE NUMBERS OUT LOUD. "You've reached your limit" with no
 * figures is a wall a creator cannot argue with or plan around; naming used and
 * ceiling makes it a fact they can check against their own memory, and the
 * ledger behind it is readable by them under RLS if they want to.
 *
 * ⚠️ AND IT NEVER GUESSES. A count that could not be read is not zero -- see
 * `scanAllowance`'s null handling in the caller. Silence is not permission.
 */
export function scanAllowance(used: number, ceiling: number): ScanAllowance {
  const ok = used < ceiling
  return {
    allowed: ok,
    used,
    ceiling,
    message: ok
      ? ''
      : `You've used all ${ceiling} voice scans on your plan this month (${used} so far). `
        + 'Your scans reset at the start of next month, and the voices you have already built keep working.',
  }
}
