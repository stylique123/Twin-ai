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

  return {
    schemaVersion: ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
    alignmentVersion: ALIGNMENT_EVIDENCE_VERSION,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    hasCapturedScript: script !== null,
    alignment,
    unavailableReason: reason,
    scriptWordTimings: timings,
    scriptSnapshotSha256: input.scriptSnapshotSha256,
    provenance: {
      speechVersion: input.speechVersion,
      alignmentVersion: ALIGNMENT_EVIDENCE_VERSION,
    },
  }
}
