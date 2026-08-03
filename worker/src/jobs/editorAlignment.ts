// The ALIGNMENT component — the analyze-stage record that carries a script's
// words, matched in order against what the creator actually said.
//
// This is the consumable shape around `scriptAlignment.ts`. That module is the
// algorithm; this is the evidence record the pipeline stores, and it mirrors
// `buildHookEvidence` deliberately: same pure-function contract, same
// provenance block, same rule that it touches no bytes, runs no model and
// decides nothing.
//
// WHY A SEPARATE COMPONENT rather than extending the hook component. The hook
// component answers "how did the OPENING relate to the script" and is capped to
// a window. This answers "where is every script word in the recording", which
// captions, cuts, emphasis and the hook all want. Folding it into `hook` would
// make every hook recompute pay for a whole-script alignment, and the download
// truth table's "hook-only recompute => 0 downloads" row exists precisely
// because those costs were kept apart.
//
// NOT WIRED YET, and that is deliberate rather than unfinished: registering a
// new immutable component means a schema version, a digest, a row in the
// download truth table and a change to the frozen identity system
// (componentVersions / componentDigests). This module is the part that can
// land complete and tested on its own; the registration is the next step and
// wants a full context budget rather than a rushed one.
import {
  alignScriptToSpoken, scriptToAlignTokens, toAlignTokens, scriptWordTimings,
  spokenScriptFromSnapshot,
  type SnapshotForAlignment,
} from './scriptAlignment.js'

export const ALIGNMENT_EVIDENCE_SCHEMA_VERSION = 1
export const ALIGNMENT_EVIDENCE_VERSION = 'alignment-1'

// ── SIZE, AND WHY IT IS BOUNDED IN BYTES RATHER THAN IN WORDS ──────────────
// This is the first component whose payload grows with the SCRIPT. `visual`,
// `audio` and `hook` are all effectively fixed-size; this one carries an entry
// per script word, so its size is a function of how much the creator wrote.
//
// `editor_record_analysis` caps each component's payload and raises
// `component_too_large` past it — permanent, no retry. Its cap is a CASE whose
// `else` branch is 16384 bytes, which is what a newly-registered component
// inherits by default. At roughly 145 bytes per timing entry that is about 230
// words: some 90 seconds of speech. Every longer take — the ordinary case —
// would have failed, and failed permanently.
//
// That is the same shape as the MAX_CUES defect this pipeline already shipped
// and fixed: two numbers each correct on its own, a WRONG RELATIONSHIP between
// them, and nothing looking at the relationship. So the relationship is now a
// checked property (see the bound test) rather than two constants that happen
// to agree today.
//
// THE BUDGET IS MEASURED, NOT ESTIMATED. An earlier draft bounded a word COUNT
// and multiplied by an assumed bytes-per-entry. That is a proxy, and a proxy
// can be defeated by a single unusual token — one 4KB "word" in a script blows
// a count-based budget while satisfying it. Serialising and measuring costs a
// few milliseconds on a pipeline that spends minutes in ffmpeg, and it cannot
// be wrong about the thing it is protecting.
export const ALIGNMENT_RESULT_MAX_BYTES = 524288      // the DB cap for this component
export const ALIGNMENT_TIMINGS_MAX_BYTES = 400000     // the share of it timings may use

/**
 * Drop trailing timings until the serialised array fits its byte budget.
 *
 * Trailing rather than sampled: the entries are in script order, so keeping a
 * prefix keeps a contiguous, interpretable region of the script. A sampled
 * subset would look complete while silently having holes in it, which is worse
 * than an honestly short one.
 *
 * Truncation is reported, never silent — a consumer must be able to tell "the
 * script ends here" from "the record ends here".
 */
export function fitTimingsToBudget<T>(
  timings: T[], maxBytes: number = ALIGNMENT_TIMINGS_MAX_BYTES,
): { kept: T[]; dropped: number } {
  if (Buffer.byteLength(JSON.stringify(timings), 'utf8') <= maxBytes) {
    return { kept: timings, dropped: 0 }
  }
  // Binary search the largest prefix that fits. Linear pop-and-remeasure is
  // O(n^2) bytes serialised, which on a 10k-word script is real time spent.
  let lo = 0, hi = timings.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (Buffer.byteLength(JSON.stringify(timings.slice(0, mid)), 'utf8') <= maxBytes) lo = mid
    else hi = mid - 1
  }
  return { kept: timings.slice(0, lo), dropped: timings.length - lo }
}

/** A spoken word as the speech component records it. */
export interface AlignSpeechWord { text: string; startMs: number; endMs: number }

export interface AlignmentEvidenceInput {
  words: AlignSpeechWord[]
  speechVersion: string
  /** The pinned snapshot — the script the creator was shown. */
  snapshot: SnapshotForAlignment | null
  scriptSnapshotSha256: string
}

/**
 * Build the alignment evidence record.
 *
 * `alignment: null` is a REAL and common state, never a placeholder for "not
 * computed". It means there was nothing to align against — an upload with no
 * captured script, a script whose scenes carry no dialogue, or a recording with
 * no speech at all. `reason` says which, because "no alignment" and "alignment
 * failed" must not look the same to a reader.
 */
export function buildAlignmentEvidence(
  asset: { id: string; content_sha256: string },
  input: AlignmentEvidenceInput,
): Record<string, unknown> {
  const script = spokenScriptFromSnapshot(input.snapshot)
  const scriptTokens = script === null ? [] : scriptToAlignTokens(script)
  const spokenTokens = toAlignTokens(input.words)

  const result = alignScriptToSpoken(scriptTokens, spokenTokens)

  let alignment: Record<string, unknown> | null = null
  let reason: string | null = null
  let timings: Array<Record<string, unknown>> = []

  if (result.ok) {
    const a = result.alignment
    alignment = {
      scriptTokenCount: a.scriptTokenCount,
      spokenTokenCount: a.spokenTokenCount,
      matchedCount: a.matchedCount,
      substitutionCount: a.substitutionCount,
      deletionCount: a.deletionCount,
      insertionCount: a.insertionCount,
      coverageMilli: a.coverageMilli,
      editDistance: a.editDistance,
    }
    // The payload downstream actually wants: the SCRIPT's spelling at the
    // RECORDING's time. Words never spoken keep a null time rather than an
    // interpolated guess — a caption for something the viewer never hears is
    // worse than no caption.
    timings = scriptWordTimings(a, scriptTokens, input.words).map((t) => ({
      scriptIdx: t.scriptIdx,
      text: t.text,
      startMs: t.startMs,
      endMs: t.endMs,
      via: t.via,
      ...(t.similarityMilli === undefined ? {} : { similarityMilli: t.similarityMilli }),
    }))
  } else {
    // `script_empty` covers both "this was an upload" and "the scenes had no
    // dialogue". Both are ordinary; neither is a failure.
    reason = result.reason
  }

  // Bound the payload before it reaches a database that would reject it
  // permanently. `droppedTimings` is part of the record rather than a log line:
  // a consumer reading the last entry must be able to tell "the script ends
  // here" from "the record was cut short here".
  const fitted = fitTimingsToBudget(timings)

  return {
    schemaVersion: ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
    alignmentVersion: ALIGNMENT_EVIDENCE_VERSION,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    hasCapturedScript: script !== null,
    alignment,
    unavailableReason: reason,
    scriptWordTimings: fitted.kept,
    droppedTimings: fitted.dropped,
    scriptSnapshotSha256: input.scriptSnapshotSha256,
    provenance: {
      speechVersion: input.speechVersion,
      alignmentVersion: ALIGNMENT_EVIDENCE_VERSION,
    },
  }
}
