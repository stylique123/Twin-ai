/**
 * DID THIS SCRIPT COME FROM SOMEBODY ELSE'S VIDEO?
 *
 * ⚠️ MEASURED IN PRODUCTION 2026-09-07. FOUR generations have no reference at
 * all — Idea Mode — and all four carry a `reference_read` block, a
 * `format_label`, AND `fidelity = 'close'`. Fidelity is not absent on a
 * referenceless run; it is DEFAULTED to `close`. That is where the creator
 * reads "Close to the reference" on a video that has no reference, next to a
 * platform chip sourced from a reference nobody supplied, above a panel headed
 * "What we took from the reference".
 *
 * ⚖️ SO THE QUESTION IS ASKED OF THE URL, WHICH IS THE ONLY GROUND TRUTH.
 * `reference_read` is present on 78 of 78 generations and proves nothing;
 * `fidelity` is present on 78 of 78 and proves nothing. A non-empty
 * `reference_url` is what actually distinguishes the 74 from the 4.
 *
 * ⚖️ ONE DEFINITION, EVERY SURFACE. Three separate places rendered a claim
 * about a reference, each deciding for itself; a fourth would have drifted from
 * the other three. They now ask this.
 *
 * ⚠️ THIS IS NOT A MODE FLAG AND MUST NOT BECOME ONE. It answers exactly one
 * question — is there a reference — and Product Mode may legitimately attach
 * one. "Which mode is this" is a different question with a different answer.
 */
export function cameFromAReference(referenceUrl: unknown): boolean {
  return typeof referenceUrl === 'string' && referenceUrl.trim() !== ''
}
