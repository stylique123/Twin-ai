// A SECOND SCRIPT FOR THE SAME REFERENCE IS A REFUSAL, AND WE HAVE NEVER
// RECORDED WHETHER THE CREATOR CHANGED ANYTHING FIRST.
//
// ⚠️ THE TWO CASES CALL FOR OPPOSITE RESPONSES, WHICH IS THE TEST FOR WHETHER A
// DISTINCTION DESERVES TO EXIST.
//
//   regenerate WITHOUT an edit  — they changed nothing and asked again. The
//     script itself was rejected. Nothing in the request tells us what was
//     wrong, and re-running the same inputs is the creator saying "not this,
//     and I do not know how to ask for better".
//
//   regenerate WITH an edit     — they turned a dial first. The edit IS the
//     diagnosis: a creator who moves fidelity from `balanced` to `loose` has
//     told us the script clung too closely to the reference, in the one
//     vocabulary the product gave them.
//
// Collapsing them loses the only free signal in the loop. A ranking model fed
// the merged count learns "creators regenerate a lot" and nothing else.
//
// ── ⚠️ WHY THIS IS NOT MEASURED AT THE DUPLICATE-LINK DIALOG ──────────────
//
// `V2Create` already detects the refusal — "You already remixed this link",
// with `Make a new version` as the button that spends a remix on a second
// script. That is the obvious capture point and it CANNOT ANSWER THIS
// QUESTION: at that moment the creator has chosen nothing. `V2Create` carries
// only the url, the note and a tone; fidelity and the three intent answers are
// chosen afterwards on the building screen. Classifying there would report
// `unknown` for every row, or — worse — report `without_edit` for every row
// because nothing had been edited YET.
//
// The comparison is only possible where both sides exist at once: the prior
// generation and the complete new request.

/** ⚠️ THREE OUTCOMES, AND `unknown` IS A RESULT RATHER THAN A FAILURE. Silence
 *  is not permission and not refusal: a row we cannot interpret must never be
 *  counted as one where nothing changed. */
export type RegenerateKind = 'with_edit' | 'without_edit' | 'unknown'

export interface RegenerateVerdict {
  kind: RegenerateKind
  /** Which fields the creator moved. Empty for `without_edit` and `unknown` —
   *  and the two are still different facts, which is why `kind` exists. */
  changed: readonly string[]
  /** The fields this verdict could actually be computed from. A verdict resting
   *  on one comparable field is weaker than one resting on five, and a reader
   *  that cannot see the difference will over-trust the first. */
  compared: readonly string[]
}

const present = (v: unknown): boolean =>
  v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')

/** Compare as the creator would see it: trimmed, case-folded, whitespace
 *  collapsed. "Balanced " and "balanced" are the same choice. */
const norm = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().toLowerCase() : JSON.stringify(v ?? null)

/**
 * Did the creator change anything before asking again?
 *
 * ⚠️ ONLY FIELDS THE PRIOR ROW ACTUALLY CARRIES ARE COMPARED. A generation
 * written before a column existed holds null there, and treating that null as
 * "unchanged" would manufacture a `without_edit` out of a row that cannot
 * testify. If the prior carries none of them, the verdict is `unknown` — not
 * `without_edit`, which is the whole discipline this module encodes.
 */
export function classifyRegenerate(
  prior: Readonly<Record<string, unknown>> | null | undefined,
  next: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): RegenerateVerdict {
  if (prior === null || prior === undefined) {
    return { kind: 'unknown', changed: [], compared: [] }
  }
  const compared = fields.filter((f) => present(prior[f]))
  if (compared.length === 0) return { kind: 'unknown', changed: [], compared: [] }

  const changed = compared.filter((f) => norm(prior[f]) !== norm(next[f]))
  return {
    kind: changed.length > 0 ? 'with_edit' : 'without_edit',
    changed,
    compared,
  }
}
