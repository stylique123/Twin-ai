// Shared, fully explicit fixture for the Phase 8 Batch 8.1 suites.
//
// Every number here is chosen so the expected compile result can be worked out
// by hand and asserted exactly — see `EXPECTED` at the bottom. A fixture whose
// expected output nobody can derive is a fixture that cannot detect a wrong
// answer, only a crash.
import type {
  CompileInput, CompileWord, CompileCandidate, CompileVisualWaste, CompileFaceSample, EditPolicyV1,
} from '../../jobs/editorCompile.js'
import { loadEditPolicy } from '../../jobs/editorCompile.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

// The subject sits LOW AND LEFT — 380,1240 in a 1080x1920 display space, not
// the 540,960 geometric centre. A fixture whose face is already centred cannot
// tell a face-aware zoom from the blind centre crop it replaced.
export function buildFaces(): CompileFaceSample[] {
  const out: CompileFaceSample[] = []
  for (let t = 0; t <= SOURCE_DURATION_MS; t += 5000) out.push({ timeMs: t, centreXPx: 380, centreYPx: 1240 })
  return out
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
      displayWidthPx: 1080, displayHeightPx: 1920,
    },
    evidence: {
      words: buildWords(), candidates: buildCandidates(), visualWaste: buildVisualWaste(),
      audio: { snrDbMilli: 26000, earlyEnergyRatioMilli: 120 },
      faces: buildFaces(),
    },
    decision: {
      selections: [0, 2, 3, 4],
      visualWasteSelections: [0],
      emphasisWordIndices: [25],
      hookTreatment: 'keep',
      hookStartWordIndex: null,
      captionPresetId: 'caption-clean-keyword-v1',
      transitionPolicy: 'restrained',
      zoomRequests: [{ anchorWordIndex: 26, intensity: 'medium', reasonCode: 'emphasis_word' }],
    },
    ...overrides,
  }
  return input
}

/** The SHIPPED policy, exactly as production reads it. */
export function shippedPolicy(): EditPolicyV1 {
  return JSON.parse(JSON.stringify(loadEditPolicy())) as EditPolicyV1
}

/** The Batch 8.1 BASELINE: the shipped policy with the deterministic edge trim
 *  switched off.
 *
 *  Every `EXPECTED` number below was hand-derived against a domain that begins
 *  at the capture window, and a dozen suites assert exact protections, hook,
 *  zoom and cover boundaries against it. Turning edge trimming on in the shared
 *  fixture would shift all of those by 880 ms — they would still pass once
 *  updated, and they would each be proving something subtly different from what
 *  they were written to prove. Edge trimming gets its own suite with the rule
 *  explicitly ON, and `shippedPolicy()` is pinned so the production default
 *  cannot drift unnoticed. */
export function policy(): EditPolicyV1 {
  // A deep copy, so a test that mutates a threshold to build a mutation control
  // cannot leak that change into any other test through the module cache.
  const p = shippedPolicy()
  p.edges.trimLeading = false
  p.edges.trimTrailing = false
  return p
}

// Worked out by hand from the fixture above; see the suite for the derivation.
export const EXPECTED = {
  keptSegments: [
    { sourceStartMs: 0, sourceEndMs: 10460, outputStartMs: 0, outputEndMs: 10460 },
    { sourceStartMs: 10940, sourceEndMs: 13000, outputStartMs: 10460, outputEndMs: 12520 },
    { sourceStartMs: 14400, sourceEndMs: 20000, outputStartMs: 12520, outputEndMs: 18120 },
    { sourceStartMs: 25000, sourceEndMs: 30000, outputStartMs: 18000, outputEndMs: 23000 },
    { sourceStartMs: 33000, sourceEndMs: 50000, outputStartMs: 23000, outputEndMs: 40000 },
  ],
  removals: [
    { sourceStartMs: 10460, sourceEndMs: 10940 },
    { sourceStartMs: 13000, sourceEndMs: 14400 },
    { sourceStartMs: 30000, sourceEndMs: 33000 },
  ],
  outputDurationMs: 40000,
  transitionOverlapMs: 120,
  transitionAtSegmentIndex: 3,
} as const

/**
 * The SHIPPED encoder settings, read from render_catalog_v1.json rather than
 * transcribed into a literal.
 *
 * Read, not copied, deliberately. These settings were declared in the catalog
 * and never passed to ffmpeg for the whole life of the renderer, and a
 * hand-typed fixture is exactly what let four other joints in this pipeline
 * stay broken behind a green suite — in every case because the fixture was
 * written from what the reader expected instead of what the producer emits.
 * Reading the real file means a test can assert "the argv carries CRF 20" and
 * have that remain true of PRODUCTION, not just of this file.
 */
export function shippedEncoder(): {
  x264Preset: string; x264Crf: number; x264Profile: string; x264Level: string
  gopSizeFrames: number; audioBitrateKbps: number
} {
  const catalog = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', '..', 'render_catalog_v1.json'), 'utf8'),
  ) as { outputProfiles: Record<string, Record<string, unknown>> }
  const p = catalog.outputProfiles['vertical-social-1080x1920-h264-aac-v1']
  if (!p) throw new Error('editPlanFixture: the frozen output profile is missing from the catalog')
  return {
    x264Preset: String(p.x264Preset), x264Crf: Number(p.x264Crf),
    x264Profile: String(p.x264Profile), x264Level: String(p.x264Level),
    gopSizeFrames: Number(p.gopSizeFrames), audioBitrateKbps: Number(p.audioBitrateKbps),
  }
}
