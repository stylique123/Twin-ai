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
import { visualEvidenceItems, visualEvidenceRows, visualSourceSentence } from './visualEvidence.js'

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
  // ⚖️ THESE THREE CAN BE OBSERVED, AND ARE, WHEN THE PASS READS THEM.
  // `visualEvidence.ts` maps each to a real field: `camera_distance_movement`
  // to camera.shotType + positionChanges, `subject_framing` to
  // camera.framingChanges + shotType, `shot_semantics` to primaryMode +
  // performance. A null on one of these is a fact about ONE reference, and the
  // row saying so is the screen doing its job.
  shot_semantics: 'Shot choices',
  camera_distance_movement: 'Camera work',
  subject_framing: 'Framing',
  // ⚠️⚠️ `zoom_frequency_intensity`, `music_energy_beat_alignment` AND
  // `silence_and_visual_waste` ARE DELETED HERE, and this is the same decision
  // already taken for `caption_layout_cadence` and `transition_types` directly
  // above — now applied to the three the owner kept reporting.
  //
  // ⚠️ THEY COULD NEVER BE OBSERVED, AND `visualEvidence.ts` SAYS SO IN ITS OWN
  // WORDS: "zoom_frequency_intensity ... NO. There is no zoom field",
  // "music_energy_beat_alignment  NO. Frames carry no audio",
  // "silence_and_visual_waste ... NO. Never measured." Three rows with no
  // possible writer, printing "We did not analyse the video" on every reference
  // forever.
  //
  // ⚖️ AND A PERMANENT "NOT OBSERVED" IS WORSE THAN NO ROW, because it reads as
  // a gap that a better scan would close. It cannot be closed. The rule this
  // file already states: "a row that cannot change a scene field, a direction
  // note or an edit decision is furniture."
  //
  // ⚠️ THE TYPES THEMSELVES ARE LEFT IN THE TAXONOMY. If a pass ever measures
  // zooms or audio, restoring the row is one line here — and until then nothing
  // silently claims the field exists.
}

/**
 * The sentence a NOT-OBSERVED row carries.
 *
 * One sentence for all of them, because the reason is the same for all of them
 * and writing a variation each would imply that many separate investigations.
 *
 * ⚠️ IT WAS "ALL NINE" AND IS NOW SEVEN. `caption_layout_cadence` and
 * `transition_types` were deleted: both need real frame OCR, neither has ever
 * had a writer anywhere in this repo, and a row that cannot change a scene
 * field, a direction note or an edit decision is furniture. §1.1's own
 * wording: "we did not analyse the video" / "using your brand default".
 */
export const NOT_OBSERVED_SOURCE = 'We did not analyse the video — your brand default is used instead.'

/**
 * Build §1.1's rows from a persisted evidence set.
 *
 * The unlooked-at things are ALWAYS present, whether or not the evidence set
 * names them — and the list is the ones that CAN be looked at. (It said "nine"
 * when there were nine; two were deleted for having no writer, then three more
 * for the same reason, and a count in prose is a second source for a fact the
 * list already states.) That is the whole point of the screen: a shorter list on a
 * reference we happened to extract less from would let absence look like
 * completeness, which is the failure the screen exists to prevent.
 */
export function transferRows(
  evidence: NormalizedReferenceEvidenceV1 | null,
  // Whether a transcript actually reached the model. Defaults to TRUE so every
  // existing caller keeps its current sentence; the honest variant is opt-in by
  // the one surface that knows the answer. `readReferenceAnalysis().mode` is
  // that answer: 'real' means a transcript was read, 'pattern' and 'none' mean
  // it was not, and 'unknown' (pre-0110 rows) is not a claim either way — so it
  // keeps the default rather than inventing a fact about history.
  transcriptRead = true,
  /**
   * The stored `reference_content_profiles.visual_profile`, when there is one.
   *
   * ⚠️⚠️ THE NINE "THINGS WE NEVER LOOK AT" IN THIS FILE'S HEADER WERE TRUE WHEN
   * IT WAS WRITTEN AND THE VISUAL PASS SHIPPED AFTERWARDS. Measured 2026-09-15:
   * 940 of 2,140 reference profiles carry a visual profile, each field citing
   * the frames it was read from, while this screen told the creator "We did not
   * analyse the video". `visualEvidenceRows` fills the THREE gaps it can answer
   * and leaves zoom, music and visual waste alone, because nothing measures
   * those and a citation on a guess is worse than the gap.
   *
   * ⚖️ DEFAULTS TO null SO EVERY EXISTING CALLER IS UNCHANGED. A surface that
   * does not hold the profile keeps saying "not observed", which stays true for
   * it.
   */
  visualProfile: unknown = null,
): TransferRow[] {
  const rows: TransferRow[] = []
  const seen = new Set<EvidenceType>()

  // ⚖️ BEFORE THE GAP LOOP AND AFTER NOTHING, so a real evidence item for the
  // same type still wins: the loop below only fills what `seen` has not claimed,
  // and the evidence set is read first.
  const visualItems = visualEvidenceItems(visualProfile, { referenceId: '', analysisId: '' })
  const visualFrames = typeof (visualProfile as { framesSampled?: unknown } | null)?.framesSampled === 'number'
    ? (visualProfile as { framesSampled: number }).framesSampled
    : null

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
        : sourceSentence(item.kind, item.sourcePath, transcriptRead),
      value: item.kind === 'unknown' ? null : item.value,
    })
  }

  // What the frames could answer, cited to the frames.
  for (const item of visualItems) {
    if (seen.has(item.type)) continue
    const label = TYPE_LABEL[item.type]
    if (label === undefined) continue
    seen.add(item.type)
    rows.push({
      type: item.type,
      label,
      kind: item.kind,
      source: visualSourceSentence(
        // The frame list is rebuilt from the row rather than parsed out of the
        // sentence, because a sentence is not a data structure.
        visualEvidenceRows(visualProfile).find((r) => r.type === item.type)?.frames ?? [],
        visualFrames,
      ),
      value: item.value,
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
function sourceSentence(kind: EvidenceKind, sourcePath: string, transcriptRead: boolean): string {
  if (kind === 'measured') {
    return sourcePath.startsWith('derived:')
      ? 'Computed from the transcript\'s word timings.'
      : 'Measured from the reference itself.'
  }
  if (kind === 'observed') return 'Read directly from the reference.'
  // The one that matters most, and the one §1.1's example table gets wrong.
  //
  // IT ALSO USED TO CONTRADICT THE BANNER ABOVE IT. In pattern mode the page
  // says "We could not read this video, so the script follows the format
  // instead" — and then every interpreted row underneath claimed to be "a
  // model's reading of the TRANSCRIPT". There was no transcript. The rows were
  // asserting evidence the same screen had just said did not exist.
  //
  // That is worse than a wrong label. This screen's entire job is to separate
  // what we measured from what we guessed, so a row here that overstates its
  // own basis breaks the one thing the page is for — and it overstates it in
  // the exact case where the creator most needs to know the script was built
  // without their reference.
  if (!transcriptRead) {
    return 'Inferred from the format and your own style — no transcript was read.'
  }
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
