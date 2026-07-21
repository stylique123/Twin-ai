// Phase 6 — canonical JSON, component digests, the pinned boot-artifact
// manifest and the recording-script snapshot.
//
// Governing rules:
//  * canonicalJson is the ONE serialization used for every digest in the
//    Phase-6 identity scheme: recursively sorted object keys, no insignificant
//    whitespace, arrays in order, JSON number formatting. It never mutates
//    values — string normalization (NFC, whitespace collapse) happens when a
//    snapshot is BUILT, not when it is serialized.
//  * componentDigest = sha256(canonicalJson({version, effectiveConfig,
//    modelHashes, boundsSha256})). The digest is the component's CACHE
//    IDENTITY (together with source_asset_id + component); the manifest sha is
//    provenance only and is never part of the key.
//  * The frozen rules document (worker/analysis_rules_v1.json) is the single
//    numeric authority; boundsSha256 hashes its canonical form (the
//    `_comment` key excluded) so any rule change changes every digest.
//  * The RecordingScriptSnapshot NEVER drops scenes: a canonical snapshot
//    larger than SCRIPT_SNAPSHOT_MAX_BYTES fails closed with the stable code
//    `script_snapshot_too_large`.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PermanentJobError } from '../errors.js'

// Analyzer bundle versions — frozen constants, never env-driven. Bumping one
// is a code change that also changes the component digest via `version`.
export const PIPELINE_EPOCH = 1
export const VISUAL_ANALYSIS_VERSION = 'visual-1'
export const AUDIO_ANALYSIS_VERSION = 'audio-1'
export const HOOK_EVIDENCE_VERSION = 'hook-1'
export const VISUAL_ANALYSIS_SCHEMA_VERSION = 1
export const AUDIO_ANALYSIS_SCHEMA_VERSION = 1
export const HOOK_EVIDENCE_SCHEMA_VERSION = 1

// Hard per-component payload caps (bytes of the JSON document). The DB
// enforces the same numbers inside editor_record_analysis.
export const VISUAL_COMPONENT_MAX_BYTES = 262144
export const AUDIO_COMPONENT_MAX_BYTES = 65536
export const HOOK_COMPONENT_MAX_BYTES = 16384
export const SCRIPT_SNAPSHOT_MAX_BYTES = 65536

// The worker root (dist/jobs/editorManifest.js -> ../../ == /app), both in the
// Docker image and when CI runs the built worker in-tree.
const WORKER_ROOT = join(import.meta.dirname, '..', '..')

// ---- canonical JSON + hashing (pure, unit-tested) ---------------------------
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    const parts = keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    return `{${parts.join(',')}}`
  }
  throw new Error(`canonicalJson: unsupported value type ${typeof value}`)
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

// ---- frozen rules -----------------------------------------------------------
export interface AnalysisRules {
  rulesVersion: string
  visual: {
    coarseIntervalMinMs: number
    coarseIntervalRoundMs: number
    coarseMaxSamples: number
    fineMaxSamples: number
    fineSubdivide: number
    shotCandidateCap: number
    sceneCutThreshold: number
    sceneMergeWindowMs: number
    motionDownscaleWidth: number
    motionDownscaleHeight: number
    faceMaxSamples: number
    face: { inputSize: number; scoreThreshold: number; nmsThreshold: number; topK: number }
  }
  audio: {
    pcmFormat: string
    sampleRateHz: number
    channels: number
    windowSamples: number
    clippingThreshold: number
    noiseFloorPercentile: number
    silenceDbFloor: number
    roomToneMinMs: number
    roomToneMaxAboveFloorDb: number
    roomToneCap: number
    earlyWindowMs: number
    earlyEnergyRatioMax: number
  }
  hook: { windowMs: number }
}

let cachedRules: { rules: AnalysisRules; boundsSha256: string } | null = null

export function loadAnalysisRules(path = join(WORKER_ROOT, 'analysis_rules_v1.json')): {
  rules: AnalysisRules
  boundsSha256: string
} {
  if (cachedRules) return cachedRules
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  delete raw._comment
  const rules = raw as unknown as AnalysisRules
  cachedRules = { rules, boundsSha256: sha256Hex(canonicalJson(raw)) }
  return cachedRules
}

// Test seam: reset the rules cache (never used in production paths).
export function resetRulesCacheForTests(): void {
  cachedRules = null
}

// ---- component digests ------------------------------------------------------
export function componentDigest(
  version: string,
  effectiveConfig: Record<string, unknown>,
  modelHashes: Record<string, string>,
  boundsSha256: string,
): string {
  return sha256Hex(canonicalJson({ version, effectiveConfig, modelHashes, boundsSha256 }))
}

// The exact effective configurations that form each component's identity.
// These are the FROZEN rule subsets — resolved values, not references.
export function visualEffectiveConfig(rules: AnalysisRules): Record<string, unknown> {
  return { ...rules.visual }
}
export function audioEffectiveConfig(rules: AnalysisRules): Record<string, unknown> {
  return { ...rules.audio }
}
export function hookEffectiveConfig(rules: AnalysisRules): Record<string, unknown> {
  return { ...rules.hook }
}

// ---- model manifests --------------------------------------------------------
interface PinManifest {
  repository: string
  revision?: string
  ref?: string
  files: Record<string, string>
}

function readManifest(path: string): { manifest: PinManifest; manifestSha256: string } {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  delete raw._comment
  return { manifest: raw as unknown as PinManifest, manifestSha256: sha256Hex(canonicalJson(raw)) }
}

export function speechModelIdentity(
  path = join(WORKER_ROOT, 'models', 'faster-whisper-small.manifest.json'),
): { repository: string; revision: string; artifactSha256: string; manifestSha256: string } {
  const { manifest, manifestSha256 } = readManifest(path)
  return {
    repository: manifest.repository,
    revision: manifest.revision ?? '',
    artifactSha256: manifest.files['model.bin'] ?? '',
    manifestSha256,
  }
}

export function faceDetectorIdentity(
  path = join(WORKER_ROOT, 'models', 'vision.manifest.json'),
): { repository: string; ref: string; artifactSha256: string; manifestSha256: string } {
  const { manifest, manifestSha256 } = readManifest(path)
  const artifact = Object.values(manifest.files)[0] ?? ''
  return {
    repository: manifest.repository,
    ref: manifest.ref ?? '',
    artifactSha256: artifact,
    manifestSha256,
  }
}

// ---- build inputs (reproducible; no local image digest) ---------------------
export function buildInputs(root = WORKER_ROOT): {
  workerCommit: string | null
  dockerfileSha256: string | null
  dependencyLockSha256: string | null
} {
  const workerCommit = (process.env.WORKER_GIT_SHA ?? process.env.GIT_SHA ?? '').trim() || null
  const fileSha = (p: string): string | null =>
    existsSync(p) ? sha256Hex(readFileSync(p)) : null
  const dockerfileSha256 = fileSha(join(root, 'Dockerfile'))
  const lock = fileSha(join(root, 'package-lock.json'))
  const reqs = fileSha(join(root, 'requirements.txt'))
  const dependencyLockSha256 = lock && reqs ? sha256Hex(`${lock}\n${reqs}\n`) : (lock ?? reqs)
  return { workerCommit, dockerfileSha256, dependencyLockSha256 }
}

let cachedFfmpegBannerSha: string | null | undefined
export function ffmpegBannerSha256(): Promise<string | null> {
  if (cachedFfmpegBannerSha !== undefined) return Promise.resolve(cachedFfmpegBannerSha)
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], { timeout: 10000 }, (err, stdout) => {
      const first = err ? null : (stdout.split('\n')[0]?.trim() || null)
      cachedFfmpegBannerSha = first ? sha256Hex(first) : null
      resolve(cachedFfmpegBannerSha)
    })
  })
}

// ---- the boot-artifact manifest --------------------------------------------
export interface BuiltManifest {
  manifest: Record<string, unknown>
  manifestSha: string
  componentDigests: { visual: string; audio: string; hook: string }
}

export async function buildBootManifest(opts: {
  inspectorVersion: string
  speechVersion: string
}): Promise<BuiltManifest> {
  const { rules, boundsSha256 } = loadAnalysisRules()
  const speech = speechModelIdentity()
  const face = faceDetectorIdentity()
  const digests = {
    visual: componentDigest(VISUAL_ANALYSIS_VERSION, visualEffectiveConfig(rules),
      { faceDetector: face.artifactSha256 }, boundsSha256),
    audio: componentDigest(AUDIO_ANALYSIS_VERSION, audioEffectiveConfig(rules), {}, boundsSha256),
    hook: componentDigest(HOOK_EVIDENCE_VERSION, hookEffectiveConfig(rules), {}, boundsSha256),
  }
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    manifestEpoch: PIPELINE_EPOCH,
    componentVersions: {
      inspection: opts.inspectorVersion,
      speech: opts.speechVersion,
      visual: VISUAL_ANALYSIS_VERSION,
      audio: AUDIO_ANALYSIS_VERSION,
      hook: HOOK_EVIDENCE_VERSION,
    },
    componentDigests: digests,
    modelArtifacts: { speech, faceDetector: face },
    build: buildInputs(),
    ffmpeg: { versionBannerSha256: await ffmpegBannerSha256() },
    rules: { rulesVersion: rules.rulesVersion, boundsSha256 },
  }
  return { manifest, manifestSha: sha256Hex(canonicalJson(manifest)), componentDigests: digests }
}

// ---- recording-script snapshot ----------------------------------------------
// String normalization used when BUILDING the snapshot: NFC + collapse all
// whitespace runs to one space + trim. Applied to every string field.
export function normalizeSnapshotString(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim()
}

interface SceneTimelineShape {
  hook?: unknown
  scenes?: Array<{
    scene_number?: unknown
    scene_type?: unknown
    dialogue?: unknown
    show_in_teleprompter?: unknown
  }>
}

interface GenerationScriptRow {
  id: string
  // Read defensively: the column may be absent on an older deployment (the
  // worker selects `*`), so the value can be undefined/null/any shape.
  selected_hook?: string | null
  scene_timeline?: unknown
}

export interface BuiltSnapshot {
  snapshot: Record<string, unknown>
  snapshotSha: string
  canonicalBytes: number
}

// Deterministic snapshot of what the creator was prompted to speak:
//  * scene_timeline present -> its hook + every scene's (number, type,
//    dialogue, teleprompter flag). Scenes are NEVER dropped or truncated.
//  * scene_timeline absent  -> hook = selected_hook (or null), scenes = [].
// Fails closed (`script_snapshot_too_large`) when the canonical form exceeds
// SCRIPT_SNAPSHOT_MAX_BYTES.
export function buildScriptSnapshot(gen: GenerationScriptRow): BuiltSnapshot {
  const tl = (gen.scene_timeline && typeof gen.scene_timeline === 'object'
    ? gen.scene_timeline as SceneTimelineShape
    : null)
  const rawHook = tl && typeof tl.hook === 'string' ? tl.hook : gen.selected_hook ?? null
  const hook = typeof rawHook === 'string' && normalizeSnapshotString(rawHook) !== ''
    ? normalizeSnapshotString(rawHook)
    : null
  const scenes = (tl?.scenes ?? []).map((s, i) => ({
    sceneNumber: Number.isInteger(s.scene_number) ? (s.scene_number as number) : i + 1,
    sceneType: typeof s.scene_type === 'string' ? normalizeSnapshotString(s.scene_type) : 'talking_head',
    dialogue: typeof s.dialogue === 'string' ? normalizeSnapshotString(s.dialogue) : null,
    showInTeleprompter: s.show_in_teleprompter !== false,
  }))
  const snapshot: Record<string, unknown> = {
    schemaVersion: 1,
    generationId: gen.id,
    hook,
    scenes,
  }
  const canonical = canonicalJson(snapshot)
  const canonicalBytes = Buffer.byteLength(canonical, 'utf8')
  if (canonicalBytes > SCRIPT_SNAPSHOT_MAX_BYTES) {
    throw new PermanentJobError(
      `script snapshot canonical form is ${canonicalBytes} bytes (cap ${SCRIPT_SNAPSHOT_MAX_BYTES})`,
      'script_snapshot_too_large',
    )
  }
  return { snapshot, snapshotSha: sha256Hex(canonical), canonicalBytes }
}
