// §1.1's CREATIVE TRANSFER ROWS — "every row carries its evidence."
//
// *"A Creative Transfer row saying 'Reference used physical comedy → Twin
// adapted ✓' would be FABRICATED. A trust screen that fabricates is worse than
// no trust screen: it is the single thing that destroys the product the first
// time a user checks."*
//
// ── WHAT CHECKING FIRST FOUND ────────────────────────────────────────────
//
// The machinery for this already exists and is careful. `referenceEvidence.ts`
// defines a four-kind taxonomy and lists the nine things we never look at
// (`MISSING_EVIDENCE_TYPES` — shot semantics, camera movement, framing, caption
// layout, transitions, b-roll function, zoom, music, visual waste), emitting
// each as `unknown` with a reason. `creativeTransferPlan.ts` refuses to let an
// `unknown` support a transfer. What did not exist is anything that SHOWS it.
//
// It also found that nothing produces a `creative_transfer_plans` row — the
// table, the contract and the validator all ship with no writer. So these rows
// are built from what every generation already carries, and will read a plan
// when one exists rather than requiring one.
//
// ── §1.1'S OWN EXAMPLE OVER-CLAIMS, BY THIS CODEBASE'S STANDARD ──────────
//
// §1.1 shows two states and writes:
//
//     Story structure   OBSERVED   from transcript beats
//     Hook type         OBSERVED   from first 3s of speech
//
// But `referenceEvidence.ts` files `narrative_beat`, `hook_window_sec`,
// `format_label`, `stated_cta` and `why_it_works_claim` as **interpreted** —
// the model's reading of a transcript, not a measurement of one. Only the
// platform and language are `observed`; the duration, word count and
// words-per-minute are `measured`.
//
// That finer distinction is the more honest one, and it was reached by the same
// reasoning §1.1 is making. Collapsing it back to two states here would UPGRADE
// "a model read the transcript this way" to "we observed this" — the same
// over-claim §1.1 exists to prevent, committed while implementing §1.1. So the
// rows carry all four kinds, and the labels keep them apart.
import {
  MISSING_EVIDENCE_TYPES, type EvidenceKind, type EvidenceType,
  type NormalizedReferenceEvidenceV1,
} from './referenceEvidence.js'

export interface TransferRow {
  /** The evidence type this row is about. Stable, so two videos are comparable. */
  type: EvidenceType
  /** Creator-facing name for it. */
  label: string
  kind: EvidenceKind
  /** Where it came from, or why it is absent. §1.1: every row carries its
   *  evidence. A row with no source sentence is the fabricated row. */
  source: string
  /** The value, when there is one. Always null for `unknown`. */
  value: string | number | null
}

/** How each kind reads on screen. Deliberately four, not two — see the header. */
export const KIND_LABEL: Record<EvidenceKind, string> = {
  observed: 'OBSERVED',
  measured: 'MEASURED',
  // "We read this off the transcript" is not "we watched it happen".
  interpreted: 'INTERPRETED',
  // `unknown` is the taxonomy's word; NOT OBSERVED is §1.1's, and it is the one
  // a creator can act on.
  unknown: 'NOT OBSERVED',
}

/** Creator-facing names. A type with no entry is not shown rather than shown
 *  under its snake_case identifier. */
export const TYPE_LABEL: Partial<Record<EvidenceType, string>> = {
  reference_platform: 'Platform',
  reference_language: 'Language',
  reference_duration_sec: 'Length',
  transcript_word_count: 'Words spoken',
  measured_words_per_minute: 'Speaking pace',
  stated_words_per_minute: 'Speaking pace (as described)',
  format_label: 'Format',
  hook_window_sec: 'Hook length',
  narrative_beat: 'Story structure',
  stated_cta: 'Call to action',
  why_it_works_claim: 'Why it works',
  shot_semantics: 'Shot choices',
  camera_distance_movement: 'Camera work',
  subject_framing: 'Framing',
  caption_layout_cadence: 'Caption design',
  transition_types: 'Transitions',
  b_roll_function: 'B-roll purpose',
  zoom_frequency_intensity: 'Zooms',
  music_energy_beat_alignment: 'Music',
  silence_and_visual_waste: 'Pacing of dead space',
}

/**
 * The sentence a NOT-OBSERVED row carries.
 *
 * One sentence for all nine, because the reason is the same for all nine and
 * writing nine variations would imply nine different investigations. §1.1's own
 * wording: "we did not analyse the video" / "using your brand default".
 */
export const NOT_OBSERVED_SOURCE = 'We did not analyse the video — your brand default is used instead.'

/**
 * Build §1.1's rows from a persisted evidence set.
 *
 * The nine unlooked-at things are ALWAYS present, whether or not the evidence
 * set names them. That is the whole point of the screen: a shorter list on a
 * reference we happened to extract less from would let absence look like
 * completeness, which is the failure the screen exists to prevent.
 */
export function transferRows(evidence: NormalizedReferenceEvidenceV1 | null): TransferRow[] {
  const rows: TransferRow[] = []
  const seen = new Set<EvidenceType>()

  for (const item of evidence?.items ?? []) {
    const label = TYPE_LABEL[item.type]
    if (label === undefined) continue
    // A `narrative_beat` is emitted per beat. One row per TYPE keeps the screen
    // a list of what we know rather than a transcript dump.
    if (seen.has(item.type)) continue
    seen.add(item.type)
    rows.push({
      type: item.type,
      label,
      kind: item.kind,
      source: item.kind === 'unknown'
        ? NOT_OBSERVED_SOURCE
        : sourceSentence(item.kind, item.sourcePath),
      value: item.kind === 'unknown' ? null : item.value,
    })
  }

  // Every gap, always, even when nothing extracted it.
  for (const type of MISSING_EVIDENCE_TYPES) {
    if (seen.has(type)) continue
    const label = TYPE_LABEL[type]
    if (label === undefined) continue
    seen.add(type)
    rows.push({ type, label, kind: 'unknown', source: NOT_OBSERVED_SOURCE, value: null })
  }

  return rows
}

/**
 * Where a known value came from, in a sentence.
 *
 * Derived from the KIND, never from the value: a number read out of a model's
 * JSON and a number computed from word timings look identical on screen unless
 * something says which is which, and that difference is the entire subject of
 * this page.
 */
function sourceSentence(kind: EvidenceKind, sourcePath: string): string {
  if (kind === 'measured') {
    return sourcePath.startsWith('derived:')
      ? 'Computed from the transcript\'s word timings.'
      : 'Measured from the reference itself.'
  }
  if (kind === 'observed') return 'Read directly from the reference.'
  // The one that matters most, and the one §1.1's example table gets wrong.
  return 'A model\'s reading of the transcript — not something we measured.'
}

/**
 * "N of M things looked at" — a count, never a score.
 *
 * The same distinction `summarizeCraftChecks` and `signalsAnswered` make. A
 * percentage here would be a confidence figure about a trust screen, which is
 * the joke that writes itself.
 */
export function transferSummary(rows: readonly TransferRow[]): string {
  const known = rows.filter((r) => r.kind !== 'unknown').length
  const gaps = rows.length - known
  if (known === 0) return `We have not read anything from this reference. ${gaps} things we never look at.`
  return `${known} thing${known === 1 ? '' : 's'} read from this reference, `
    + `${gaps} we did not look at.`
}

/** The rows a creator would be misled by if they were hidden. Exposed so a
 *  compact surface can show the gaps first rather than truncating them away. */
export function notObservedRows(rows: readonly TransferRow[]): TransferRow[] {
  return rows.filter((r) => r.kind === 'unknown')
}
