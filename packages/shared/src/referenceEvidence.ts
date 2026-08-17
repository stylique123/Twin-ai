// Track C · Batch A.5 — normalized reference evidence + server-issued evidence IDs.
//
// AUTHORITY: docs/twinai-selective-transfer-reasoning-contract.md, sha256
// 3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07.
// §3 (what reference processing stores today, and what is missing), §6 (every
// transfer/adapt decision cites server-issued evidence IDs; the model cannot
// create them), §7 Step 2 (separate observed facts, measured values, model
// interpretations and unknowns).
//
// THE SHAPE THIS READS IS THE ONE THAT IS STORED
// ----------------------------------------------
// `ReferenceStructure` lives in worker/src/structure.ts and is persisted as the
// `structure` JSON on the transcript row; `generate-blueprint` then interpolates
// it into a prompt with `JSON.stringify(ref.structure).slice(0, 4000)`. That flat
// dump is §10.1's defect. This module is the replacement input: the same bytes,
// but split into typed, individually-cited evidence.
//
// A FINDING, FROM READING THE PRODUCER RATHER THAN THE TYPE
// ---------------------------------------------------------
// `words_per_min` LOOKS measured and is not. worker/src/structure.ts computes a
// real words-per-minute from Whisper word timings and passes it to the model as a
// "MEASURED words/min" hint — and then asks the MODEL to return words_per_min in
// its JSON. So the stored number is the model's echo of a measurement, which may
// agree with it, round it, or ignore it. Filing that as `measured` would let an
// unverified model output carry the authority of an instrument reading.
//
// It is therefore normalized as `interpreted`, AND — when the transcript's word
// timings are available — the real value is recomputed here and emitted as a
// separate `measured` item. If the two disagree materially the disagreement is
// recorded, exactly as the brand-palette two-homes case was. Same defect shape,
// same treatment.

/** §7 Step 2's four kinds. The distinction is the point of the whole taxonomy. */
export type EvidenceKind = 'observed' | 'measured' | 'interpreted' | 'unknown'

/**
 * The bounded evidence vocabulary. A normalizer may only emit these types, and
 * §6 forbids the model from inventing one — so the enum is closed here rather
 * than being whatever a provider happened to return.
 */
export const EVIDENCE_TYPES = [
  'reference_platform', 'reference_duration_sec', 'reference_language',
  'transcript_word_count', 'measured_words_per_minute',
  'stated_words_per_minute', 'format_label', 'hook_window_sec',
  'narrative_beat', 'stated_cta', 'why_it_works_claim',
  // §3's explicit gap list. These are emitted as `unknown` so a downstream
  // decision that needs one is refused rather than guessing.
  'shot_semantics', 'camera_distance_movement', 'subject_framing',
  'caption_layout_cadence', 'transition_types',
  'zoom_frequency_intensity', 'music_energy_beat_alignment',
  'silence_and_visual_waste',
] as const
export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

/** §3: extraction is extended only where a downstream decision needs evidence. */
export const MISSING_EVIDENCE_TYPES: readonly EvidenceType[] = [
  'shot_semantics', 'camera_distance_movement', 'subject_framing',
  'caption_layout_cadence', 'transition_types',
  'zoom_frequency_intensity', 'music_energy_beat_alignment',
  'silence_and_visual_waste',
]

export interface EvidenceItem {
  /** SERVER-ISSUED. Deterministic from (analysisId, type, ordinal). */
  evidenceId: string
  referenceId: string
  analysisId: string
  type: EvidenceType
  kind: EvidenceKind
  value: string | number | null
  /** Where in the stored analysis this came from, so a citation is checkable. */
  sourcePath: string
  /** Seconds into the reference, when the item is anchored to a time. */
  atSec: number | null
  /** Why an `unknown` has no value. Non-null exactly when kind === 'unknown'. */
  unknownReason: string | null
}

export interface EvidenceConflict {
  type: EvidenceType
  candidates: Array<{ evidenceId: string; kind: EvidenceKind; value: string | number | null }>
  note: string
}

export interface NormalizedReferenceEvidenceV1 {
  schemaVersion: 1
  referenceId: string
  analysisId: string
  items: EvidenceItem[]
  conflicts: EvidenceConflict[]
}

export class EvidenceError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'EvidenceError'
    this.code = code
  }
}

/**
 * Evidence IDs are ISSUED, not chosen.
 *
 * §6: "The model cannot create reference IDs, evidence IDs, dimensions, or
 * actions." A random UUID would satisfy that but would make an id unverifiable
 * once it left this function. A DERIVED id is checkable: given the analysis, the
 * server can recompute every legal id and reject anything else, so a fabricated
 * citation fails on inspection rather than on trust.
 *
 * The scheme is deliberately readable — a human reading a plan can see which
 * analysis and which field a citation points at.
 */
export function issueEvidenceId(analysisId: string, type: EvidenceType, ordinal: number): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(analysisId)) {
    throw new EvidenceError('analysisId must be a plain identifier', 'evidence_analysis_id_invalid')
  }
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new EvidenceError('ordinal must be a non-negative integer', 'evidence_ordinal_invalid')
  }
  return `ev:${analysisId}:${type}:${ordinal}`
}

/** The stored analysis, exactly as worker/src/structure.ts produces it. */
export interface StoredReferenceStructure {
  format_label?: unknown
  hook_window_sec?: unknown
  why_it_works?: unknown
  beats?: unknown
  cta?: unknown
  words_per_min?: unknown
  /** What the reference DEPENDS ON, written by `deriveStructure` at ingest and
   *  read by `readReferenceObservations` in `compatibilityGate`. Absent on every
   *  structure derived before the field existed, and absent is NOT false — the
   *  gate leaves the dimensions it backs out of `observed` entirely rather than
   *  ruling that those videos show no product. */
  observations?: {
    shows_product?: unknown
    makes_product_claims?: unknown
    broll_heavy?: unknown
    energy?: unknown
  } | null
}

export interface NormalizeInput {
  referenceId: string
  analysisId: string
  structure: StoredReferenceStructure | null
  /** Transcript-row facts. These are the only OBSERVED things available today. */
  transcript: {
    platform?: string | null
    language?: string | null
    durationSec?: number | null
    /** Word timings, when the analyzer produced them. The one real instrument. */
    words?: Array<{ start: number; end: number }> | null
  } | null
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const txt = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export function normalizeReferenceEvidence(input: NormalizeInput): NormalizedReferenceEvidenceV1 {
  if (txt(input.referenceId) === null) throw new EvidenceError('referenceId is required', 'evidence_reference_missing')
  if (txt(input.analysisId) === null) throw new EvidenceError('analysisId is required', 'evidence_analysis_missing')

  const items: EvidenceItem[] = []
  const conflicts: EvidenceConflict[] = []
  const counters = new Map<EvidenceType, number>()

  const add = (
    type: EvidenceType, kind: EvidenceKind, value: string | number | null,
    sourcePath: string, atSec: number | null = null, unknownReason: string | null = null,
  ): EvidenceItem => {
    const ordinal = counters.get(type) ?? 0
    counters.set(type, ordinal + 1)
    const item: EvidenceItem = {
      evidenceId: issueEvidenceId(input.analysisId, type, ordinal),
      referenceId: input.referenceId, analysisId: input.analysisId,
      type, kind, value, sourcePath, atSec, unknownReason,
    }
    items.push(item)
    return item
  }

  // ---- OBSERVED / MEASURED: the transcript row -----------------------------
  const t = input.transcript
  if (t) {
    const p = txt(t.platform)
    if (p !== null) add('reference_platform', 'observed', p, 'transcript.platform')
    const lang = txt(t.language)
    if (lang !== null) add('reference_language', 'observed', lang, 'transcript.language')
    const dur = num(t.durationSec)
    if (dur !== null) add('reference_duration_sec', 'measured', dur, 'transcript.duration_sec')
  }

  // The one genuine instrument reading available: words per minute recomputed
  // from real word timings, server-side, the same way structure.ts computes its
  // hint. Nothing model-authored contributes to this number.
  let measuredWpm: number | null = null
  const words = t?.words ?? null
  if (words && words.length > 5) {
    const span = words[words.length - 1].end - words[0].start
    if (span > 1) {
      measuredWpm = Math.round((words.length / span) * 60)
      add('transcript_word_count', 'measured', words.length, 'transcript.words.length')
      add('measured_words_per_minute', 'measured', measuredWpm, 'derived:transcript.words')
    }
  }

  // ---- INTERPRETED: everything the provider wrote --------------------------
  const s = input.structure
  if (s) {
    const fl = txt(s.format_label)
    if (fl !== null) add('format_label', 'interpreted', fl, 'structure.format_label')

    const hw = num(s.hook_window_sec)
    if (hw !== null) add('hook_window_sec', 'interpreted', hw, 'structure.hook_window_sec', hw)

    const cta = txt(s.cta)
    if (cta !== null) add('stated_cta', 'interpreted', cta, 'structure.cta')

    if (Array.isArray(s.why_it_works)) {
      s.why_it_works.forEach((w, i) => {
        const v = txt(w)
        if (v !== null) add('why_it_works_claim', 'interpreted', v, `structure.why_it_works[${i}]`)
      })
    }

    if (Array.isArray(s.beats)) {
      s.beats.forEach((b, i) => {
        const o = (b ?? {}) as Record<string, unknown>
        const beat = txt(o.beat)
        if (beat === null) return
        const at = num(o.at_sec)
        const goal = txt(o.goal)
        add(
          'narrative_beat', 'interpreted',
          goal === null ? beat : `${beat} — ${goal}`,
          `structure.beats[${i}]`, at,
        )
      })
    }

    // THE ECHO. Filed as interpreted, never as measured.
    const statedWpm = num(s.words_per_min)
    if (statedWpm !== null) {
      const stated = add('stated_words_per_minute', 'interpreted', statedWpm, 'structure.words_per_min')
      if (measuredWpm !== null) {
        const measured = items.find((x) => x.type === 'measured_words_per_minute')
        // 10% is the band inside which a rounded echo is indistinguishable from
        // the measurement. Outside it, the model did not use the number it was
        // given, and a downstream pacing decision must know that before citing it.
        if (measured && Math.abs(statedWpm - measuredWpm) > measuredWpm * 0.1) {
          conflicts.push({
            type: 'stated_words_per_minute',
            candidates: [
              { evidenceId: measured.evidenceId, kind: 'measured', value: measuredWpm },
              { evidenceId: stated.evidenceId, kind: 'interpreted', value: statedWpm },
            ],
            note: 'structure.words_per_min is the provider\'s echo of a hint, not an instrument '
              + 'reading. It disagrees with the value recomputed from word timings by more than '
              + '10%, so a pacing decision must cite the measured item and not this one.',
          })
        }
      }
    }
  }

  // ---- UNKNOWN: §3's gap list, recorded rather than absent ------------------
  // A dimension whose evidence does not exist must be refusable. Leaving these
  // out would make "no evidence" and "evidence not extracted" the same shape.
  for (const type of MISSING_EVIDENCE_TYPES) {
    add(type, 'unknown', null, 'not_extracted', null,
      'reference extraction does not produce this today (contract §3); a decision needing it '
      + 'must resolve to brand_default or reject rather than infer it')
  }

  return { schemaVersion: 1, referenceId: input.referenceId, analysisId: input.analysisId, items, conflicts }
}

/**
 * The membership gate. §6: a `transfer` or `adapt` decision cites evidence IDs,
 * and the model cannot create them — so every cited id must appear in the issued
 * set for that analysis. This is what makes a fabricated citation detectable.
 */
export function assertEvidenceIdsAreIssued(
  ev: NormalizedReferenceEvidenceV1, citedIds: readonly string[],
): void {
  const issued = new Set(ev.items.map((i) => i.evidenceId))
  for (const id of citedIds) {
    if (!issued.has(id)) {
      throw new EvidenceError(
        `evidence id ${JSON.stringify(id)} was not issued for analysis ${ev.analysisId}; `
        + 'a decision may only cite evidence the server produced',
        'evidence_id_not_issued',
      )
    }
  }
}

/**
 * Evidence a decision may actually rely on. `unknown` is never citable, and
 * `interpreted` is citable but must be visible as interpretation to the caller —
 * which is why the kind travels with the item rather than being flattened away.
 */
export function citableEvidence(ev: NormalizedReferenceEvidenceV1): EvidenceItem[] {
  return ev.items.filter((i) => i.kind !== 'unknown')
}

/**
 * Canonical JSON for a normalized evidence set, and its digest. This is what a
 * plan pins: without it, a plan could name an analysis whose evidence has since
 * been replaced, and the citation would still "resolve".
 */
export function canonicalEvidence(ev: NormalizedReferenceEvidenceV1): string {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon)
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(o).sort()) out[k] = canon(o[k])
      return out
    }
    return v
  }
  return JSON.stringify(canon(ev))
}

export function validateNormalizedEvidence(ev: NormalizedReferenceEvidenceV1): NormalizedReferenceEvidenceV1 {
  const fail = (m: string, code: string): never => { throw new EvidenceError(m, code) }
  if (ev.schemaVersion !== 1) fail('schemaVersion must be 1', 'evidence_schema_version')

  // EVERY ID IS RECOMPUTED, NOT MERELY CHECKED FOR UNIQUENESS.
  //
  // Deriving ids was pointless while the validator accepted whatever ids the set
  // happened to carry: a fabricated normalized set with arbitrary ids passed, and
  // a plan citing those ids then passed the membership gate, because the gate
  // compares against the set rather than against the derivation. The ids are
  // recomputed here from (analysisId, type, per-type ordinal in emission order),
  // so an id that was not issued by this exact function for this exact analysis
  // is rejected.
  const ordinals = new Map<EvidenceType, number>()
  for (const i of ev.items) {
    if (!EVIDENCE_TYPES.includes(i.type)) fail(`unknown evidence type ${i.type}`, 'evidence_type_unknown')
    const n = ordinals.get(i.type) ?? 0
    ordinals.set(i.type, n + 1)
    let expected: string
    try { expected = issueEvidenceId(ev.analysisId, i.type, n) } catch {
      return fail(`evidence set carries an unusable analysisId ${JSON.stringify(ev.analysisId)}`, 'evidence_analysis_id_invalid')
    }
    if (i.evidenceId !== expected) {
      fail(
        `evidence id ${JSON.stringify(i.evidenceId)} was not issued by the server for this analysis; `
        + `the ${n}th ${i.type} item must be ${JSON.stringify(expected)}`,
        'evidence_id_not_derived',
      )
    }
  }

  const seen = new Set<string>()
  for (const i of ev.items) {
    if (seen.has(i.evidenceId)) fail(`duplicate evidence id ${i.evidenceId}`, 'evidence_id_duplicate')
    seen.add(i.evidenceId)
    if (i.analysisId !== ev.analysisId) fail(`evidence ${i.evidenceId} names a different analysis`, 'evidence_analysis_mismatch')
    if (i.referenceId !== ev.referenceId) fail(`evidence ${i.evidenceId} names a different reference`, 'evidence_reference_mismatch')
    // An unknown must say why, and must not carry a value; a known must not
    // carry an unknown reason. Otherwise "we did not look" and "there is nothing
    // there" become indistinguishable.
    if (i.kind === 'unknown') {
      if (i.value !== null) fail(`evidence ${i.evidenceId} is unknown but carries a value`, 'evidence_unknown_with_value')
      if (i.unknownReason === null) fail(`evidence ${i.evidenceId} is unknown with no reason`, 'evidence_unknown_unexplained')
    } else if (i.unknownReason !== null) {
      fail(`evidence ${i.evidenceId} has a value and an unknown reason`, 'evidence_known_with_unknown_reason')
    }
    // Provenance cannot be laundered: a value taken from the provider's JSON may
    // not be filed as measured, whatever it looks like.
    if (i.kind === 'measured' && i.sourcePath.startsWith('structure.')) {
      fail(
        `evidence ${i.evidenceId} is filed as measured but was read from ${i.sourcePath}, `
        + 'which is provider output. Model output is interpretation, not measurement.',
        'evidence_measurement_laundered',
      )
    }
    if (i.kind === 'observed' && i.sourcePath.startsWith('structure.')) {
      fail(
        `evidence ${i.evidenceId} is filed as observed but was read from ${i.sourcePath}`,
        'evidence_observation_laundered',
      )
    }
  }

  for (const c of ev.conflicts) {
    if (c.candidates.length < 2) fail(`conflict on ${c.type} has fewer than two candidates`, 'evidence_conflict_vacuous')
    for (const cand of c.candidates) {
      if (!seen.has(cand.evidenceId)) {
        fail(`conflict on ${c.type} cites unissued evidence ${cand.evidenceId}`, 'evidence_conflict_unsourced')
      }
    }
  }
  return ev
}
