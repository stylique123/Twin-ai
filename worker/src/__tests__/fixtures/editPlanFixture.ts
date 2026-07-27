// Shared, fully explicit fixture for the Phase 8 Batch 8.1 suites.
//
// Every number here is chosen so the expected compile result can be worked out
// by hand and asserted exactly — see `EXPECTED` at the bottom. A fixture whose
// expected output nobody can derive is a fixture that cannot detect a wrong
// answer, only a crash.
import type {
  CompileInput, CompileWord, CompileCandidate, CompileVisualWaste, EditPolicyV1,
} from '../../jobs/editorCompile.js'
import { loadEditPolicy } from '../../jobs/editorCompile.js'

export const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
export const GENERATION_ID = '22222222-2222-4222-8222-222222222222'
export const SOURCE_ASSET_ID = '33333333-3333-4333-8333-333333333333'
export const SHA_A = 'a'.repeat(64)
export const SHA_B = 'b'.repeat(64)
export const SHA_C = 'c'.repeat(64)
export const SHA_D = 'd'.repeat(64)

// Window A = [0, 20000). Window B = [25000, 50000). The bytes in [20000,25000)
// and [50000,60000) are REJECTED takes and must never appear anywhere.
export const WINDOW_A = { startMs: 0, endMs: 20000 }
export const WINDOW_B = { startMs: 25000, endMs: 50000 }
export const SOURCE_DURATION_MS = 60000

const WORD_LEN_MS = 400

// 39 words. Window A carries indices 0..18 at 1000 ms spacing starting at 1000;
// window B carries 19..22 (26000..29000) and 23..38 (34000..49000). The
// deliberate 30000..34000 word-free stretch is where the visual dead-air
// candidate lives, so that candidate is not blocked by word protections.
export function buildWords(): CompileWord[] {
  const words: CompileWord[] = []
  const push = (startMs: number): void => {
    words.push({ text: `w${words.length}`, startMs, endMs: startMs + WORD_LEN_MS, confidence: 0.9 })
  }
  for (let k = 0; k < 19; k++) push(1000 * (k + 1))
  for (let j = 0; j < 4; j++) push(26000 + 1000 * j)
  for (let j = 0; j < 16; j++) push(34000 + 1000 * j)
  return words
}

export function buildCandidates(): CompileCandidate[] {
  return [
    // 0 — a real silence in the gap between word 9 and word 10. Word protections
    //     shave 60 ms of phoneme handle off each end, so this one must SNAP.
    { kind: 'silence', startMs: 10400, endMs: 11000, confidence: 'high', selectionEnabled: 1, safeToConsider: true, wordIndices: [] },
    // 1 — filler. Never selectable, and selecting it must be a hard failure.
    { kind: 'filler', startMs: 5000, endMs: 5400, confidence: 'high', selectionEnabled: 0, safeToConsider: true, wordIndices: [4] },
    // 2 — a false start covering words 12 and 13 exactly. Removable in full.
    { kind: 'false_start', startMs: 13000, endMs: 14400, confidence: 'high', selectionEnabled: 1, safeToConsider: true, wordIndices: [12, 13] },
    // 3 — low confidence. The compiler must KEEP this content and warn.
    { kind: 'repetition', startMs: 17000, endMs: 18400, confidence: 'low', selectionEnabled: 1, safeToConsider: true, wordIndices: [16, 17] },
    // 4 — the analyzer declined to vouch for it. Kept, with a warning.
    { kind: 'silence', startMs: 30500, endMs: 32500, confidence: 'high', selectionEnabled: 1, safeToConsider: false, wordIndices: [] },
  ]
}

export function buildVisualWaste(): CompileVisualWaste[] {
  return [
    { startMs: 30000, endMs: 33000, classCode: 0, selectionEnabled: 1 }, // dead_air
    { startMs: 45000, endMs: 46000, classCode: 1, selectionEnabled: 0 }, // static_hold
  ]
}

export function baseInput(overrides: Partial<CompileInput> = {}): CompileInput {
  const input: CompileInput = {
    identity: {
      projectId: PROJECT_ID, generationId: GENERATION_ID, sourceAssetId: SOURCE_ASSET_ID,
      sourceChecksum: SHA_A, bootManifestSha: SHA_B, scriptSnapshotSha: SHA_C, decisionSha256: SHA_D,
    },
    source: {
      origin: 'teleprompter', durationMs: SOURCE_DURATION_MS,
      acceptedWindows: [{ ...WINDOW_A }, { ...WINDOW_B }],
    },
    evidence: {
      words: buildWords(), candidates: buildCandidates(), visualWaste: buildVisualWaste(),
      audio: { snrDbMilli: 26000, earlyEnergyRatioMilli: 120 },
    },
    decision: {
      selections: [0, 2, 3, 4],
      visualWasteSelections: [0],
      emphasisWordIndices: [25],
      hookTreatment: 'keep',
      hookStartWordIndex: null,
      captionPresetId: 'caption-clean-keyword-v1',
      transitionPolicy: 'hard_cuts_only',
      zoomRequests: [{ anchorWordIndex: 26, intensity: 'medium', reasonCode: 'emphasis_word' }],
    },
    ...overrides,
  }
  return input
}

export function policy(): EditPolicyV1 {
  // A deep copy, so a test that mutates a threshold to build a mutation control
  // cannot leak that change into any other test through the module cache.
  return JSON.parse(JSON.stringify(loadEditPolicy())) as EditPolicyV1
}

// Worked out by hand from the fixture above; see the suite for the derivation.
export const EXPECTED = {
  keptSegments: [
    { sourceStartMs: 0, sourceEndMs: 10460, outputStartMs: 0, outputEndMs: 10460 },
    { sourceStartMs: 10940, sourceEndMs: 13000, outputStartMs: 10460, outputEndMs: 12520 },
    { sourceStartMs: 14400, sourceEndMs: 20000, outputStartMs: 12520, outputEndMs: 18120 },
    // GATE-0 A1: with no transitions, segment 3 no longer starts 120 ms early.
    // The cursor recurrence is unchanged — outputStart[i] = outputEnd[i-1] -
    // overlap[i] — it is just that every overlap[i] is now 0, so the timeline is
    // exactly the sum of the kept durations. The old table encoded the single
    // 120 ms restrained overlap here and in the total below.
    { sourceStartMs: 25000, sourceEndMs: 30000, outputStartMs: 18120, outputEndMs: 23120 },
    { sourceStartMs: 33000, sourceEndMs: 50000, outputStartMs: 23120, outputEndMs: 40120 },
  ],
  removals: [
    { sourceStartMs: 10460, sourceEndMs: 10940 },
    { sourceStartMs: 13000, sourceEndMs: 14400 },
    { sourceStartMs: 30000, sourceEndMs: 33000 },
  ],
  // 10460 + 2060 + 5600 + 5000 + 17000 = 40120, with no overlap subtracted.
  outputDurationMs: 40120,
} as const
