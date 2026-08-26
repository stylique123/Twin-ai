// WHETHER A RECORDING MAY ENTER THE #204 EVAL.
//
// ── THE TABLE IS NOT THE POINT; THIS IS ───────────────────────────────────
//
// `eval_consents` records that a signed document exists. On its own that is a
// filing cabinet nobody consults. This is the gate that consults it, and it
// ships in the same change for the reason the whole wave exists: a register
// with no reader is a decision nobody made.
//
// ⚠️ IT REFUSES BY DEFAULT. Every path that is not an affirmative, live,
// pre-dated consent returns a refusal. Silence is not permission — an absent
// row means nobody has looked, not that nobody objected, and this is the one
// place in the product where being wrong costs somebody their face and voice.
//
// ⚠️ IT DOES NOT AND CANNOT VERIFY A SIGNATURE. Nothing in software can: the
// artifact is a document in a filing system a human maintains. This checks the
// REGISTER's shape and dates. A row saying a signed consent exists is a human's
// claim, and this gate is not evidence that anyone read the document.

/** A row of `eval_consents`, as the database stores it. */
export interface EvalConsentRow {
  participant_ref?: unknown
  artifact_location?: unknown
  granted_at?: unknown
  withdrawn_at?: unknown
}

export type ConsentRefusal =
  | 'no_consent_on_record'
  | 'consent_withdrawn'
  | 'consent_after_recording'
  | 'consent_undated'
  | 'no_artifact_location'

export interface ConsentVerdict {
  admits: boolean
  refusal: ConsentRefusal | null
  /** Plain English, for an operator reading a refusal in a terminal. */
  message: string
}

const MESSAGES: Record<ConsentRefusal, string> = {
  no_consent_on_record:
    'No consent is on record for this participant. The recording cannot be used.',
  consent_withdrawn:
    'This participant withdrew their consent. The recording cannot be used, and #204 promised '
    + 'them it would be deleted.',
  consent_after_recording:
    'The consent is dated AFTER the recording was made. #204 requires consent in writing BEFORE '
    + 'recording — agreeing afterwards is bookkeeping, not consent.',
  consent_undated:
    'The consent has no usable date, so it cannot be shown to pre-date the recording.',
  no_artifact_location:
    'The register does not say where the signed document is filed, so nobody can produce it.',
}

function millis(v: unknown): number | null {
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION. Date.parse(null) is NaN but
  // Date.parse(0-ish junk) is not, and a silently-0 timestamp would date every
  // consent to 1970 — which pre-dates every recording and would admit them all.
  if (typeof v !== 'string' || v.trim() === '') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/**
 * May this recording enter the eval?
 *
 * `recordedAtIso` is the recording's own timestamp. When it is unknown the gate
 * still refuses anything withdrawn or unregistered, but CANNOT check ordering —
 * so an unknown recording date is treated as failing the before/after test
 * rather than passing it. Absent is not "fine".
 */
export function consentAdmits(
  row: EvalConsentRow | null | undefined,
  recordedAtIso: string | null | undefined,
): ConsentVerdict {
  const refuse = (refusal: ConsentRefusal): ConsentVerdict =>
    ({ admits: false, refusal, message: MESSAGES[refusal] })

  if (!row) return refuse('no_consent_on_record')
  if (typeof row.artifact_location !== 'string' || row.artifact_location.trim() === '') {
    return refuse('no_artifact_location')
  }
  // Withdrawal is checked before dates: a withdrawn consent is refused however
  // well-formed it is, and the operator should be told the real reason.
  if (row.withdrawn_at !== null && row.withdrawn_at !== undefined) return refuse('consent_withdrawn')

  const granted = millis(row.granted_at)
  if (granted === null) return refuse('consent_undated')

  const recorded = millis(recordedAtIso)
  if (recorded === null) return refuse('consent_after_recording')
  if (granted > recorded) return refuse('consent_after_recording')

  return { admits: true, refusal: null, message: '' }
}

/**
 * The #204 cohort's admission summary.
 *
 * ⚠️ BOTH NUMBERS, ALWAYS. "10 admitted" without the total hides two refusals,
 * and #204's pass bar is stated over all twelve — a denominator that drops the
 * refused recordings is not a pass.
 */
export function admissionSummary(
  verdicts: readonly ConsentVerdict[],
): { admitted: number; refused: number; total: number } {
  const admitted = verdicts.filter((v) => v.admits).length
  return { admitted, refused: verdicts.length - admitted, total: verdicts.length }
}
