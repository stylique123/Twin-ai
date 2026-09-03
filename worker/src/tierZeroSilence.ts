/**
 * A ROW THAT SAYS NOTHING IS NOT A MEASUREMENT, AND RIGHT NOW WE CANNOT TELL
 * ONE FROM "NOBODY LOOKED".
 *
 * ⚠️ MEASURED IN PRODUCTION, 2026-09-03. Of five `assess_reference` jobs whose
 * visual pass ran with four frames sampled, THREE wrote Tier 0 numbers and TWO
 * wrote neither `tier_zero_profile` nor `tier_zero_failure_code`
 * (@harrisonnott, @biteswithlily against @ecom.oleg, @earlyedunion,
 * @jisceyfinds). All five wrote `visual_profile`, so the row was written and the
 * Tier 0 keys simply were not in it.
 *
 * ⚠️ AND THE DATABASE CANNOT SAY WHY, BECAUSE TWO PATHS LEAVE IDENTICAL ROWS.
 * `tierZeroColumns` returns `{}` when the result is absent, and returns
 * `tier_zero_failure_code: null` when a result arrives with `ran: false` and no
 * code. On a fresh row both leave every Tier 0 column null. That collapse is
 * precisely what 0180's own column comment forbids — "CAPABILITIES_UNAVAILABLE
 * and PROBE_FAILED are facts about our box; NO_SIGNAL is a fact about the
 * video. Never collapse them."
 *
 * ⚖️ SO THIS ADDS A WITNESS, NOT A GUESS. Naming a mechanism before the rate is
 * known is how a rule gets built from a reconstruction of a symptom. This
 * reports WHICH of the two silent shapes occurred, on the row it occurred for,
 * into `ops_events` where it can be read back — and then the same eight-job
 * probe answers the question in one query instead of none.
 *
 * ⚖️ IT DOES NOT INVENT A FAILURE CODE. The vocabulary is closed and checked by
 * a constraint; widening it would need a migration and would bury the real
 * finding under a sixth bucket nobody has evidence for yet.
 */

/** The shapes a Tier 0 result can take that leave the row silent. */
export type TierZeroSilence =
  /** The visual pass ran but carried no Tier 0 result at all. */
  | 'NO_RESULT_ON_A_PASS_THAT_RAN'
  /** A result arrived, produced no profile, and named no reason. */
  | 'RESULT_WITHOUT_PROFILE_OR_CODE'

export interface VisualLike {
  ran?: unknown
  tier_zero?: { ran?: unknown; profile?: unknown; failureCode?: unknown } | null
}

/**
 * Would this run leave the Tier 0 columns saying nothing, despite the visual
 * pass having run? Returns the shape when it would, `null` when the row will
 * carry either numbers or a reason.
 *
 * ⚠️ ONLY WHEN THE PASS RAN. A download that failed never reaches Tier 0 and
 * its silence is honest — flagging it would drown the real signal in the 121
 * `UNKNOWN_DOWNLOAD_FAILURE` rows measured in the same three-hour window.
 */
export function tierZeroSilence(visual: VisualLike | null | undefined): TierZeroSilence | null {
  if (!visual || visual.ran !== true) return null
  const tz = visual.tier_zero
  if (tz === null || tz === undefined) return 'NO_RESULT_ON_A_PASS_THAT_RAN'
  const hasProfile = tz.profile !== null && tz.profile !== undefined
  if (hasProfile) return null
  const code = tz.failureCode
  const named = typeof code === 'string' && code.trim() !== ''
  return named ? null : 'RESULT_WITHOUT_PROFILE_OR_CODE'
}
