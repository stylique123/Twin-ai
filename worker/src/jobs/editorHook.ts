// Phase 6 — the HOOK-EVIDENCE portion of the real `analyzing` stage.
//
// A PURE function of (speech component, audio component, pinned script
// snapshot, frozen rules). It touches no bytes, runs no model and makes no
// decision — it reports what the recording's opening window contains and how
// it relates to the PINNED script snapshot (never a live generation read).
// Consuming zero bytes is what keeps the download truth table's "hook-only
// recompute => 0 downloads" row true.
import { PermanentJobError } from '../errors.js'
import {
  HOOK_COMPONENT_MAX_BYTES, HOOK_EVIDENCE_SCHEMA_VERSION, HOOK_EVIDENCE_VERSION,
  normalizeSnapshotString, type AnalysisRules,
} from './editorManifest.js'

const round4 = (x: number) => Math.round(x * 10000) / 10000

// Tokenization used ONLY for alignment evidence: NFC + whitespace collapse
// (the snapshot normalization), lowercased, punctuation stripped per token.
export function alignmentTokens(text: string): string[] {
  return normalizeSnapshotString(text)
    .toLowerCase()
    .split(' ')
    .map((t) => t.replace(/[^\p{L}\p{N}']/gu, ''))
    .filter(Boolean)
}

export interface HookSpeechWord { text: string; startMs: number }

export function buildHookEvidence(
  asset: { id: string; content_sha256: string },
  input: {
    words: HookSpeechWord[]                     // from the speech component, spoken order
    speechVersion: string
    audioVersion: string
    earlyRmsDb: number | null                   // from the audio component
    earlyEnergyRatio: number | null             // from the audio component
    snapshotHook: string | null                 // pinned snapshot's hook line
    scriptSnapshotSha256: string                // pinned snapshot sha (binding)
  },
  rules: AnalysisRules,
  boundsSha256: string,
): Record<string, unknown> {
  const windowMs = rules.hook.windowMs
  const opening = input.words.filter((w) => w.startMs < windowMs)
  const openingText = opening.map((w) => w.text).join(' ')

  let scriptAlignment: Record<string, unknown> | null = null
  if (input.snapshotHook !== null) {
    const hookTokens = alignmentTokens(input.snapshotHook)
    let matchedTokenRatio: number | null = null
    if (hookTokens.length > 0) {
      // Multiset intersection between the hook tokens and the spoken opening.
      const counts = new Map<string, number>()
      for (const t of alignmentTokens(openingText)) counts.set(t, (counts.get(t) ?? 0) + 1)
      let matched = 0
      for (const t of hookTokens) {
        const c = counts.get(t) ?? 0
        if (c > 0) { matched++; counts.set(t, c - 1) }
      }
      matchedTokenRatio = round4(matched / hookTokens.length)
    }
    scriptAlignment = { scriptHookTokenCount: hookTokens.length, matchedTokenRatio }
  }

  const result: Record<string, unknown> = {
    schemaVersion: HOOK_EVIDENCE_SCHEMA_VERSION,
    hookVersion: HOOK_EVIDENCE_VERSION,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    windowMs,
    spokenOpening: {
      text: openingText,
      wordCount: opening.length,
      firstWordStartMs: input.words.length > 0 ? input.words[0].startMs : null,
    },
    scriptAlignment,
    earlyRmsDb: input.earlyRmsDb,
    earlyEnergyRatio: input.earlyEnergyRatio,
    scriptSnapshotSha256: input.scriptSnapshotSha256,
    provenance: {
      speechVersion: input.speechVersion,
      audioVersion: input.audioVersion,
      rulesVersion: rules.rulesVersion,
      rulesSha256: boundsSha256,
    },
  }
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
  if (bytes > HOOK_COMPONENT_MAX_BYTES) {
    throw new PermanentJobError(`hook: component ${bytes} bytes exceeds payload cap`, 'hook_component_too_large')
  }
  return result
}
