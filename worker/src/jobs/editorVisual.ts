// Phase 6 — the VISUAL portion of the real `analyzing` stage.
//
// The worker computes the sampling schedule (single producer of
// coarseIntervalMs), runs the pinned-YuNet OpenCV bridge (editor_visual.py) in
// a detached process group, and converts the bridge's raw evidence into the
// canonical VisualAnalysis contract. EVIDENCE ONLY: shot-boundary candidates,
// a bounded motion curve and display-space face detections — no cut, crop or
// zoom decision anywhere in this module.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from '../env.js'
import { PermanentJobError } from '../errors.js'
import { AnalyzeCancelledError, type CancelWatch } from './editorCancel.js'
import { runGroupProcess } from './editorSpeech.js'
import {
  VISUAL_ANALYSIS_SCHEMA_VERSION, VISUAL_ANALYSIS_VERSION, VISUAL_COMPONENT_MAX_BYTES,
  type AnalysisRules,
} from './editorManifest.js'

const WORKER_ROOT = join(import.meta.dirname, '..', '..')

export function roundUpTo(x: number, m: number): number {
  return Math.ceil(x / m) * m
}

// The frozen coarse-sampling schedule: max(2000, roundUpTo(ceil(durationMs/900), 500)).
export function coarseIntervalMs(durationMs: number, rules: AnalysisRules): number {
  return Math.max(
    rules.visual.coarseIntervalMinMs,
    roundUpTo(Math.ceil(durationMs / rules.visual.coarseMaxSamples), rules.visual.coarseIntervalRoundMs),
  )
}

export interface VisualBridgeOutput {
  fps: number
  coarseSamples: number
  fineSamples: number
  faceSamples: number
  motion: Array<{ timeMs: number; diff: number }>
  lumaCurve: Array<{ timeMs: number; luma: number }>
  shotBoundaries: Array<{ timeMs: number; score: number; evidenceCodes: string[] }>
  faces: Array<{ timeMs: number; detections: Array<{ x: number; y: number; width: number; height: number; score: number }> }>
  faceCoverage: { samplesWithFace: number; samplesTotal: number }
  model?: {
    repository: string | null
    ref: string | null
    artifactSha256: string | null
    manifestSha256: string | null
    verified: boolean
    opencvVersion: string | null
  }
}

export interface VisualFacts {
  durationMs: number
  displayWidth: number
  displayHeight: number
  rotation: 0 | 90 | 180 | 270
}

// visual-2: merge per-sample near-black / frozen coarse samples into blank
// intervals — EVIDENCE of visual waste (dead air, held/black frames), never a
// cut. A coarse sample is "blank" when its mean luma is at/below nearBlackLuma
// (near-black) OR its motion diff to the previous sample is at/below
// frozenMotionMax (frozen). Consecutive blank samples merge; a run is kept only
// when it spans at least minBlankDurationMs. Deterministic and bounded by
// blankCandidateCap (excess is dropped — logged, never truncated silently by
// the byte cap). Interval duration = last blank sample − first (no padding), so
// a lone blank sample never qualifies.
export function computeBlankIntervals(
  lumaCurve: Array<{ timeMs: number; luma: number }>,
  motion: Array<{ timeMs: number; diff: number }>,
  rules: AnalysisRules,
): { intervals: Array<{ startMs: number; endMs: number; evidenceCodes: string[]; classification: string; selectableWaste: boolean }>; dropped: number } {
  const R = rules.visual
  const diffAt = new Map<number, number>()
  for (const m of motion) diffAt.set(m.timeMs, m.diff)
  const samples = [...lumaCurve].sort((a, b) => a.timeMs - b.timeMs)

  // `both` = a sample that is near-black AND frozen AT THE SAME MOMENT — the corroborated
  // dead-air signal. nearBlack/frozen alone are kept as separate EVIDENCE but never make
  // an interval selectable on their own (a still talking head is frozen but not dark; a
  // dark scene can still have motion).
  // A blank run is any maximal chain of samples that are near-black OR frozen. We keep
  // the PER-SAMPLE `both` flag (near-black AND frozen at the same instant — the only
  // corroborated dead-air signal) so the run can be split before it is judged.
  type BlankSample = { timeMs: number; nearBlack: boolean; frozen: boolean; both: boolean }
  let run: BlankSample[] = []
  const runs: BlankSample[][] = []
  const closeRun = () => { if (run.length) runs.push(run); run = [] }
  for (const s of samples) {
    const nearBlack = s.luma <= R.nearBlackLuma
    const d = diffAt.get(s.timeMs)
    const frozen = d !== undefined && d <= R.frozenMotionMax
    if (nearBlack || frozen) run.push({ timeMs: s.timeMs, nearBlack, frozen, both: nearBlack && frozen })
    else closeRun()
  }
  closeRun()

  // Split every run at the boundary between corroborated (`both`) and non-corroborated
  // samples. Without this, a static talking head (frozen only) adjacent to genuine dead
  // air (both) would merge into one run whose OR-accumulated `both` tainted the WHOLE
  // span as selectable waste — flagging legitimate normal-brightness footage. After the
  // split each segment is homogeneous in `both`, so only the truly corroborated dead-air
  // span can ever be selectable. Each segment is then gated independently (≥2 samples AND
  // ≥ minBlankDurationMs); a lone corroborated sample never qualifies.
  const segments: BlankSample[][] = []
  for (const r of runs) {
    let seg: BlankSample[] = []
    for (const s of r) {
      if (seg.length && seg[seg.length - 1].both !== s.both) { segments.push(seg); seg = [] }
      seg.push(s)
    }
    if (seg.length) segments.push(seg)
  }

  // Honest classification. Only corroborated dead air (dark AND static together) is
  // SELECTABLE as visual waste; a static talking head (frozen only) or a dark-but-moving
  // scene is recorded as evidence but NEVER auto-called waste.
  const classify = (nearBlack: boolean, frozen: boolean, both: boolean): string =>
    both ? 'dead_air'
      : frozen && !nearBlack ? 'static_hold'
      : nearBlack && !frozen ? 'dark_motion'
      : 'ambiguous'
  const all = segments
    .filter((seg) => seg.length >= 2 && seg[seg.length - 1].timeMs - seg[0].timeMs >= R.minBlankDurationMs)
    .map((seg) => {
      const nearBlack = seg.some((s) => s.nearBlack)
      const frozen = seg.some((s) => s.frozen)
      const both = seg[0].both // homogeneous after the split: every sample shares one `both`
      return {
        startMs: seg[0].timeMs, endMs: seg[seg.length - 1].timeMs,
        evidenceCodes: [...(nearBlack ? ['near_black'] : []), ...(frozen ? ['frozen'] : [])],
        classification: classify(nearBlack, frozen, both),
        selectableWaste: both,
      }
    })
  const intervals = all.slice(0, R.blankCandidateCap)
  return { intervals, dropped: all.length - intervals.length }
}

// Pure contract construction (unit-tested with synthetic bridge output).
export function buildVisualAnalysis(
  asset: { id: string; content_sha256: string },
  bridge: VisualBridgeOutput,
  facts: VisualFacts,
  opts: { intervalMs: number; rules: AnalysisRules; boundsSha256: string; requirePinnedModel: boolean },
): Record<string, unknown> {
  const m = bridge.model
  if (opts.requirePinnedModel) {
    if (!m || !m.verified || !m.repository || !m.ref || !m.artifactSha256 || !m.manifestSha256) {
      throw new PermanentJobError('visual: pinned model identity missing or unverified', 'model_pin_failed')
    }
  }
  const R = opts.rules.visual
  if (bridge.coarseSamples > R.coarseMaxSamples || bridge.fineSamples > R.fineMaxSamples
      || bridge.faceSamples > R.faceMaxSamples
      || bridge.shotBoundaries.length > R.shotCandidateCap) {
    throw new PermanentJobError('visual: bridge exceeded the frozen sampling bounds', 'visual_bounds_exceeded')
  }
  const result: Record<string, unknown> = {
    schemaVersion: VISUAL_ANALYSIS_SCHEMA_VERSION,
    visualVersion: VISUAL_ANALYSIS_VERSION,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    durationMs: facts.durationMs,
    displayWidth: facts.displayWidth,
    displayHeight: facts.displayHeight,
    rotation: facts.rotation,
    sampling: {
      coarseIntervalMs: opts.intervalMs,
      coarseSamples: bridge.coarseSamples,
      fineSamples: bridge.fineSamples,
      faceSamples: bridge.faceSamples,
    },
    shotBoundaries: bridge.shotBoundaries,
    motion: bridge.motion,
    lumaCurve: bridge.lumaCurve,
    blankIntervals: computeBlankIntervals(bridge.lumaCurve ?? [], bridge.motion, opts.rules).intervals,
    faces: bridge.faces,
    faceCoverage: bridge.faceCoverage,
    provenance: {
      detector: 'yunet',
      detectorInputSize: R.face.inputSize,
      detectorScoreThreshold: R.face.scoreThreshold,
      detectorNmsThreshold: R.face.nmsThreshold,
      detectorTopK: R.face.topK,
      modelRepository: m?.repository ?? null,
      modelRef: m?.ref ?? null,
      modelArtifactSha256: m?.artifactSha256 ?? null,
      modelManifestSha256: m?.manifestSha256 ?? null,
      modelVerified: m?.verified ?? false,
      opencvVersion: m?.opencvVersion ?? null,
      rulesVersion: opts.rules.rulesVersion,
      rulesSha256: opts.boundsSha256,
    },
  }
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
  if (bytes > VISUAL_COMPONENT_MAX_BYTES) {
    // Bounded by construction (sample caps) — exceeding the cap is a bug, and
    // evidence is never truncated to fit: fail LOUD.
    throw new PermanentJobError(`visual: component ${bytes} bytes exceeds payload cap`, 'visual_component_too_large')
  }
  return result
}

// Run the OpenCV bridge over the session's verified local bytes.
export async function runVisualBridge(
  videoPath: string, outPath: string, facts: VisualFacts, intervalMs: number, watch: CancelWatch,
): Promise<VisualBridgeOutput> {
  const modelPath = env.visionModelPath || join(WORKER_ROOT, 'models', 'face_detection_yunet_2023mar.onnx')
  const manifestPath = env.visionModelManifest || join(WORKER_ROOT, 'models', 'vision.manifest.json')
  const hold = env.analyzeSlowPoint === 'during_visual'
    ? ['--hold-at', 'after_coarse', '--hold-ms', String(env.analyzeSlowMs)] : []
  await runGroupProcess(
    'python3',
    [join(WORKER_ROOT, 'editor_visual.py'),
      '--video', videoPath, '--out', outPath,
      '--rules', join(WORKER_ROOT, 'analysis_rules_v1.json'),
      '--model', modelPath, '--model-manifest', manifestPath, '--require-pinned-model',
      '--duration-ms', String(facts.durationMs),
      '--interval-ms', String(intervalMs),
      '--display-width', String(facts.displayWidth),
      '--display-height', String(facts.displayHeight),
      '--rotation', String(facts.rotation),
      ...hold],
    env.visualTimeoutMs, watch, 'during_visual',
    (code, stderr) => {
      if (code === 0) return null
      if (code === 3) return new PermanentJobError('visual: pinned model verification failed', 'model_pin_failed')
      if (code === 4) return new PermanentJobError('visual: display-dimension mismatch', 'visual_dimension_mismatch')
      return new Error(`visual_failed (exit ${code}): ${stderr.slice(0, 400)}`)
    },
    { cancelledError: (p) => new AnalyzeCancelledError(p) },
  )
  try {
    return JSON.parse(await readFile(outPath, 'utf8')) as VisualBridgeOutput
  } catch {
    throw new Error('visual_failed: bridge produced unparseable output')
  }
}
