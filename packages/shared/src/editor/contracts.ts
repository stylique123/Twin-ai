// Editor v2 — shared wire/domain contracts (Phase 1: source assets).
//
// Rules that hold for every editor-v2 contract:
//  * All media time is INTEGER MILLISECONDS and every such field carries the
//    `Ms` suffix. Never a bare `start`/`end`/`duration` number.
//  * The browser never supplies storage paths or URLs to the backend — it deals
//    in asset IDs; the server resolves paths after verifying ownership.
//  * This module must not import recording-timeline or any legacy editor code.

export type MediaAssetKind = 'source' | 'music' | 'output' | 'thumbnail'

export type MediaAssetStatus = 'uploading' | 'validating' | 'ready' | 'rejected' | 'deleted'

// The client-visible shape of a media asset row (RLS-guarded SELECT).
export interface MediaAsset {
  id: string
  owner_id: string
  generation_id: string | null
  recording_attempt_id: string | null
  kind: MediaAssetKind
  bucket: string
  storage_path: string
  content_sha256: string | null
  mime_type: string | null
  size_bytes: number | null
  duration_ms: number | null
  width: number | null
  height: number | null
  rotation: number | null
  has_audio: boolean | null
  status: MediaAssetStatus
  created_at: string
  validated_at: string | null
}

// What the `source-asset` edge function returns when an upload intent is
// created. The path is server-chosen and STABLE for the asset — retries
// re-upload to the same object instead of minting timestamped duplicates.
// token/signedUrl authorize a PUT of exactly that object (short-lived,
// upsert-enabled); they are null when the asset is already `ready` and there
// is nothing left to upload.
export interface SourceUploadIntent {
  assetId: string
  bucket: string
  path: string
  status: MediaAssetStatus
  token: string | null
  signedUrl: string | null
}

// Stable object path for a source asset. The first segment MUST be the owner id —
// the takes-bucket INSERT policy only allows uploads under the caller's own
// auth.uid() folder, so this shape is both stable and policy-compatible.
export function sourceAssetPath(ownerId: string, generationId: string, assetId: string, contentType: string): string {
  const ext = contentType.includes('mp4') ? 'mp4' : 'webm'
  return `${ownerId}/${generationId}/${assetId}.${ext}`
}

// Bounds enforced server-side before an upload intent is issued (mirrored here
// so the client can fail fast with the same numbers).
export const SOURCE_MAX_BYTES = 600 * 1024 * 1024 // matches the takes bucket cap
export const SOURCE_MIN_BYTES = 2048 // a real few-second take is tens of KB minimum

// ---- Edit projects (Phase 2) -----------------------------------------------
// One row per one-click edit request. Created ONLY by start-editor-v2 (which
// atomically also enqueues exactly one editor_v2 job); every later state
// transition is worker-owned (Phase 3+). Clients read via RLS, never write.

export type EditProjectStatus =
  | 'queued'
  | 'inspecting'
  | 'transcribing'
  | 'analyzing'
  | 'directing'
  | 'compiling'
  | 'rendering'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const EDIT_PROJECT_ACTIVE_STATUSES: readonly EditProjectStatus[] = [
  'queued', 'inspecting', 'transcribing', 'analyzing', 'directing',
  'compiling', 'rendering', 'validating',
]

// The client-visible shape of an edit project row (RLS-guarded SELECT).
export interface EditProject {
  id: string
  owner_id: string
  generation_id: string
  source_asset_id: string
  status: EditProjectStatus
  output_asset_id: string | null
  failure_code: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

// Stable rejection codes start-editor-v2 returns BEFORE any project/job exists.
// `editor_not_available` (503) is the fail-closed launch gate: the server-side
// EDITOR_V2_START_ENABLED switch is off (missing = off). Production stays
// disabled while the pipeline is a scaffold (`completed` with output_asset_id
// NULL is never a product success); enabling requires rendering to be real
// plus a fresh production gate run at that time.
export type StartEditorRejection =
  | 'editor_not_available'
  | 'source_not_found'
  | 'not_a_source'
  | 'generation_mismatch'
  | 'source_rejected'
  | 'source_deleted'
  | 'source_not_ready'
  | 'source_not_editor_eligible'
  | 'too_many_active_projects'
  | 'idempotency_key_conflict'

// Stable message codes the Phase-3 orchestration writes into edit_events.
// The history is append-only and seq-ordered at the database; clients render
// progress from it (durable across refresh/devices — never from local state).
export type EditEventMessageCode =
  | 'stage_started'          // fenced advance into a pipeline stage
  | 'resumed'                // a reclaimed job resumed from the persisted stage
  | 'stage_retry_scheduled'  // retryable failure — the job will run again
  | 'cancel_requested'       // the owner asked to cancel
  | 'job_reenqueued'         // reconciler healed a queued project's lost job
  | 'inspection_recorded'    // Phase 4: the inspection component was recorded/reused
  | 'speech_recorded'        // Phase 5: the speech component was recorded/reused
  | 'speech_analysis_verified' // Phase 5: analyzing re-verified the speech component
  | 'manifest_pinned'          // Phase 6: boot manifest + script snapshot pinned (dedupe pin:<sha>)
  | 'analysis_component_recorded' // Phase 6: a visual/audio/hook component was computed + recorded
  | 'analysis_component_reused'   // Phase 6: an existing digest-matched component was reused
  | 'analysis_failed'          // Phase 6: a component build failed (stable code in details, e.g. source_bytes_changed)
  | 'teardown_failed'          // Phase 6: subprocess/scratch teardown failed (never masked)
  | 'manifest_mismatch'        // Phase 6: computed manifest differs from the pinned one
  | 'project_completed'
  | 'project_failed'
  | 'project_cancelled'

// Client-visible shape of an edit_events row (RLS-guarded SELECT).
export interface EditEvent {
  seq: number
  project_id: string
  stage: string
  pct: number | null
  message_code: EditEventMessageCode | string
  details: Record<string, unknown>
  created_at: string
}

// ---- Media inspection (Phase 4) --------------------------------------------
// The canonical, versioned output of the editor's real `inspecting` stage.
// Integer milliseconds and rational frame rates ONLY — no floating-point
// seconds in persisted contracts. Stored as an immutable `inspection`
// component in media_analyses, keyed (source_asset_id, component,
// inspectorVersion); later phases add sibling components (speech/visual/…)
// without ever mutating this one.
export const MEDIA_INSPECTION_SCHEMA_VERSION = 1

export interface MediaInspection {
  schemaVersion: number
  inspectorVersion: string

  sourceAssetId: string
  sourceChecksum: string
  sourceValidationVersion: number

  container: string
  durationMs: number

  video: {
    codec: string
    width: number
    height: number
    displayWidth: number   // rotation-applied presentation dimensions
    displayHeight: number
    frameRateNumerator: number
    frameRateDenominator: number
    averageFrameRateNumerator?: number
    averageFrameRateDenominator?: number
    variableFrameRate: boolean
    rotation: 0 | 90 | 180 | 270
    pixelFormat?: string
    colorSpace?: string
  }

  audio: {
    present: boolean
    codec?: string
    sampleRate?: number
    channels?: number
    channelLayout?: string
  }

  eligibility: {
    editorEligible: boolean
    rejectionCode?: string
  }

  source: {
    reusedValidationFacts: boolean   // built from Phase-1 facts, no download
    fallbackProbePerformed: boolean  // bounded one-time upgrade probe ran
  }
}

// ---- Speech analysis (Phase 5) ---------------------------------------------
// The canonical, versioned output of the editor's real `transcribing` stage:
// Faster-Whisper word-level transcription of the ACTUAL recording (never a
// teleprompter script), plus VAD and audio-energy EVIDENCE and edit CANDIDATES.
// Stored as an immutable `speech` component in media_analyses, keyed
// (source_asset_id, 'speech', speechVersion) — the same per-asset cache
// identity as inspection (no cross-tenant dedup; owner derived from the asset).
//
// Hard rules:
//  * Integer milliseconds everywhere; word/sentence ids are deterministic for
//    a given (source bytes, speechVersion) — re-running the same version on
//    the same bytes reproduces the same ids.
//  * CANDIDATES ONLY: nothing in this contract is a cut decision. Silence,
//    filler, false-start and repetition entries are evidence-bearing
//    suggestions for the (later-phase) director; low ASR confidence alone
//    NEVER produces a removal candidate, and no candidate implies a removal
//    is safe.
//  * The transcript is never filtered against any script: words the speaker
//    added off-script stay in the transcript and in the word list.
export const SPEECH_ANALYSIS_SCHEMA_VERSION = 1

export interface SpeechWord {
  id: string        // deterministic: 'w' + zero-based index in spoken order
  text: string            // original ASR text, verbatim (never script-derived)
  startMs: number
  endMs: number
  confidence: number      // ASR word probability, 0..1 (3 decimals)
  // Derivable fields, present on normal components and OMITTED when the
  // component is `compact` (see SpeechAnalysis.compact) — all reconstructable
  // from `boundaries`: endsUnit = this word is a boundary's endWordId; unitId =
  // the boundary whose span contains it; normalizedText = lowercased +
  // punctuation-stripped `text`.
  endsUnit?: boolean
  normalizedText?: string
  unitId?: string
}

// A SPEECH UNIT boundary. Deliberately NOT always a "sentence": an ASR segment
// can end mid-sentence, merge sentences, or shift with model parameters, so the
// `kind` records HOW the boundary was determined and only `punctuation_sentence`
// asserts a (punctuation-supported) grammatical sentence. Downstream (the AI
// Director, hook selection, cut safety) must consult `kind` before treating a
// boundary as a complete sentence.
export type SpeechBoundaryKind =
  | 'punctuation_sentence'  // closed by terminal punctuation (a real sentence)
  | 'asr_segment'           // closed at a Faster-Whisper segment edge (decoding unit)
  | 'pause_utterance'       // closed by a long inter-word pause (no segment/punctuation)

export interface SpeechBoundary {
  id: string        // deterministic: 'u' + zero-based index
  kind: SpeechBoundaryKind
  startWordId: string
  endWordId: string
  startMs: number
  endMs: number
  text?: string       // derivable from startWordId..endWordId; omitted when compact
  evidence: string[]  // stable codes: terminal_punctuation | asr_segment_end | pause_gap
}

export type SpeechCandidateKind = 'silence' | 'filler' | 'false_start' | 'repetition'

// The analyzer PROPOSES candidates; it never decides a removal. `safeToConsider`
// is deliberately not `safeToRemove` — the later Director/compiler applies
// policy to decide whether a candidate is acted on.
export interface SpeechCandidate {
  id: string        // deterministic: 'c' + zero-based index in start order
  kind: SpeechCandidateKind
  startMs: number
  endMs: number
  wordIds: string[]        // the words this candidate refers to ([] for pure silence)
  prevWordId: string | null // adjacent context (null at the recording edge)
  nextWordId: string | null
  confidence: 'high' | 'medium' | 'low'  // heuristic strength, NOT permission
  safeToConsider: true     // always a suggestion; never an instruction
  evidenceCodes: string[]  // stable machine codes (see docs) for why it fired
  evidence: Record<string, unknown>
  ruleVersion: string      // candidate rule/language version
}

export interface SpeechAnalysis {
  schemaVersion: number
  speechVersion: string       // analyzer bundle version (cache identity)

  sourceAssetId: string
  sourceChecksum: string      // sha256 the downloaded bytes verified against

  language: string
  languageConfidence: number  // 0..1
  durationMs: number          // duration of the ANALYZED audio track

  transcript: string          // full text of the actual recording
  words: SpeechWord[]
  // Speech-unit boundaries (see SpeechBoundary). Only punctuation_sentence
  // boundaries assert grammatical sentences; asr_segment / pause_utterance are
  // decoding/pause units, honestly labelled.
  boundaries: SpeechBoundary[]

  // True when derivable per-word fields (normalizedText/sentenceId) were
  // dropped to keep a very long, dense source within the DB payload limit.
  // No words, candidates or timings are ever dropped — see the docs.
  compact: boolean

  // Silero VAD speech regions over the source timeline (evidence, not cuts).
  vadSegments: Array<{ startMs: number; endMs: number }>

  // Coarse RMS energy curve. windowMs is ADAPTIVE so the array length is
  // bounded regardless of source length (a 30-minute source cannot blow the
  // component past the DB payload limit): windowMs grows so rms.length stays
  // within a fixed cap. Values are 4 decimals.
  energy: { windowMs: number; rms: number[] }

  candidates: SpeechCandidate[]

  provenance: {
    asrEngine: 'faster-whisper'
    asrModel: string          // LABEL only, e.g. 'small' (weights come from the pin below)
    asrComputeType: string    // e.g. 'int8' (part of the reproducibility identity)
    device: string            // 'cpu' | 'cuda'
    beamSize: number
    languagePolicy: string    // pinned ISO code, or 'auto'
    // PINNED model identity (speech-6+): the EXACT weights that produced this
    // immutable analysis. Null only for legacy/dev analyses that loaded the moving
    // alias; the worker path REQUIRES them (a rebuilt image is provably the same
    // model, or the analyzer bundle version must bump).
    modelRepository: string | null   // e.g. 'Systran/faster-whisper-small'
    modelRevision: string | null     // exact 40-char commit sha
    modelArtifactSha256: string | null   // sha256 of model.bin (the loaded artifact)
    modelManifestSha256: string | null   // stable digest of the pin manifest's semantic core
    modelAnalyzerBundle: string | null   // analyzer bundle the manifest is pinned to (== speechVersion)
    modelLoadedFromPath: boolean     // true == loaded the pinned snapshot offline
    modelVerified: boolean           // true == loaded bytes re-hashed against the manifest before use
    vad: 'silero'
    vadMinSilenceMs: number
    vadSpeechPadMs: number
    silenceMinMs: number      // gap threshold used for silence candidates
    ruleVersion: string       // candidate rule/language version
  }
}

// ---- Analysis pipeline epoch + component identity (Phase 6) ----------------
// PIPELINE_EPOCH is the single authority for the boot-manifest epoch. It bumps
// only when the MEANING of the pinned-manifest scheme itself changes (not when
// an individual component version bumps).
export const PIPELINE_EPOCH = 1

// Component analyzer-bundle versions (cache identity inputs). The worker's
// runtime constants must match these exactly — a cross-package test pins them.
export const VISUAL_ANALYSIS_VERSION = 'visual-1'
export const AUDIO_ANALYSIS_VERSION = 'audio-1'
export const HOOK_EVIDENCE_VERSION = 'hook-1'

// Hard per-component payload caps (bytes of the JSON document), enforced in the
// worker at build time AND at the database inside editor_record_analysis.
export const VISUAL_COMPONENT_MAX_BYTES = 262144
export const AUDIO_COMPONENT_MAX_BYTES = 65536
export const HOOK_COMPONENT_MAX_BYTES = 16384

// Canonical script-snapshot cap. A canonical snapshot larger than this FAILS
// CLOSED with the stable code `script_snapshot_too_large` — scenes are never
// silently dropped or truncated to fit.
export const SCRIPT_SNAPSHOT_MAX_BYTES = 65536

// ---- Visual analysis (Phase 6) ---------------------------------------------
// EVIDENCE ONLY: shot-boundary candidates, motion samples and face detections
// in DISPLAY-SPACE coordinates (rotation applied). Nothing here is a cut,
// crop, or zoom decision. Stored as an immutable `visual` component keyed
// (source_asset_id, 'visual', componentDigest).
export const VISUAL_ANALYSIS_SCHEMA_VERSION = 1

export interface VisualShotBoundary {
  timeMs: number
  score: number            // meanAbsLumaDiff/255 at the boundary sample, 4 decimals
  evidenceCodes: string[]  // stable codes: luma_diff_threshold | fine_refined | fine_budget_exhausted
}

export interface VisualFaceDetection {
  // Display-space (rotation-applied) pixel box, integer-rounded.
  x: number
  y: number
  width: number
  height: number
  score: number // detector confidence, 4 decimals
}

export interface VisualAnalysis {
  schemaVersion: number
  visualVersion: string    // analyzer bundle version ('visual-1')
  sourceAssetId: string
  sourceChecksum: string
  durationMs: number
  displayWidth: number
  displayHeight: number
  rotation: 0 | 90 | 180 | 270
  sampling: {
    coarseIntervalMs: number  // max(2000, roundUpTo(durationMs/900, 500))
    coarseSamples: number     // <= 900
    fineSamples: number       // <= 360
    faceSamples: number       // <= 120
  }
  // Shot-boundary CANDIDATES (<= 240), merged within 500ms, threshold 0.30.
  shotBoundaries: VisualShotBoundary[]
  // Coarse motion curve: meanAbsLumaDiff/255 between consecutive coarse
  // samples at 160x90 grayscale, 4 decimals. samples.length <= 900.
  motion: Array<{ timeMs: number; diff: number }>
  // Face evidence on evenly-spaced coarse samples (<= 120 sample points).
  faces: Array<{ timeMs: number; detections: VisualFaceDetection[] }>
  faceCoverage: {
    samplesWithFace: number
    samplesTotal: number
  }
  provenance: {
    detector: 'yunet'
    detectorInputSize: number      // 320 (letterboxed)
    detectorScoreThreshold: number // 0.60
    detectorNmsThreshold: number   // 0.30
    detectorTopK: number           // 20
    modelRepository: string | null
    modelRef: string | null            // exact upstream commit
    modelArtifactSha256: string | null // sha256 of the .onnx actually loaded
    modelManifestSha256: string | null
    modelVerified: boolean
    opencvVersion: string | null
    rulesVersion: string
    rulesSha256: string  // boundsSha256 of the frozen rules document
  }
}

// ---- Audio analysis (Phase 6) ----------------------------------------------
// EVIDENCE ONLY, computed IN CODE over one deterministic PCM decode
// (s16le, 48 kHz, mono downmix), exact 4800-sample windows; ebur128 loudness
// is a separate ffmpeg pass. No filter-graph statistics stand in for the
// frozen thresholds. Stored as an immutable `audio` component keyed
// (source_asset_id, 'audio', componentDigest).
export const AUDIO_ANALYSIS_SCHEMA_VERSION = 1

export interface AudioRoomToneWindow {
  startMs: number
  endMs: number
  meanRmsDb: number // 2 decimals
}

export interface AudioAnalysis {
  schemaVersion: number
  audioVersion: string  // analyzer bundle version ('audio-1')
  sourceAssetId: string
  sourceChecksum: string
  audioPresent: boolean
  decode: {
    format: 's16le'
    sampleRateHz: 48000
    channels: 1          // explicit mono downmix (ffmpeg -ac 1)
    totalSamples: number
    fullWindows: number     // floor(totalSamples / 4800)
    trailingSamples: number // totalSamples % 4800 — excluded from window stats,
                            // still counted for clippedSampleCount
  }
  // ebur128 (separate pass). Null when audioPresent is false.
  loudness: {
    integratedLufs: number | null  // 2 decimals
    loudnessRangeLu: number | null // 2 decimals
    truePeakDbtp: number | null    // 2 decimals
  }
  // Exact count of samples with |s/32768| >= 0.9995 over ALL samples.
  clippedSampleCount: number
  noiseFloorDb: number | null       // 5th percentile window RMS, dBFS, 2 decimals
  medianSpeechRmsDb: number | null  // median RMS of speech-word windows, 2 decimals
  snrDb: number | null              // medianSpeechRmsDb - noiseFloorDb, 2 decimals
  // Runs >= 800ms of word-free windows within +3 dB of the noise floor,
  // top 120 by duration (desc), then startMs (asc).
  roomTone: AudioRoomToneWindow[]
  earlyRmsDb: number | null   // RMS over samples in [0, 3000ms), 2 decimals
  wholeRmsDb: number | null   // RMS over all samples, 2 decimals
  earlyEnergyRatio: number | null // clamp(10^((early-whole)/20), 0, 4), 4 decimals
  provenance: {
    decoder: 'ffmpeg'
    ffmpegVersionBannerSha256: string | null
    windowSamples: 4800
    clippingThreshold: 0.9995
    noiseFloorPercentile: 5
    speechWordSource: 'speech-component-words' // VAD/word source: the pinned speech component
    rulesVersion: string
    rulesSha256: string
  }
}

// ---- Hook evidence (Phase 6) -----------------------------------------------
// A PURE function of (speech component, audio component, pinned script
// snapshot, frozen rules). No byte access, no model, no decision — evidence
// about the recording's opening window only. Stored as an immutable `hook`
// component keyed (source_asset_id, 'hook', componentDigest).
export const HOOK_EVIDENCE_SCHEMA_VERSION = 1

export interface HookEvidence {
  schemaVersion: number
  hookVersion: string  // analyzer bundle version ('hook-1')
  sourceAssetId: string
  sourceChecksum: string
  windowMs: number // 3000 (frozen)
  spokenOpening: {
    text: string          // words with startMs < windowMs, joined verbatim
    wordCount: number
    firstWordStartMs: number | null // null when no words at all
  }
  // Token-overlap evidence vs the PINNED script snapshot's hook line (never
  // fetched live). Null hook line => null alignment.
  scriptAlignment: {
    scriptHookTokenCount: number
    matchedTokenRatio: number | null // 4 decimals, |overlap| / scriptHookTokenCount
  } | null
  earlyRmsDb: number | null       // copied from the audio component
  earlyEnergyRatio: number | null // copied from the audio component
  scriptSnapshotSha256: string    // binds this evidence to the pinned snapshot
  provenance: {
    speechVersion: string // speech component version consumed
    audioVersion: string  // audio component version consumed
    rulesVersion: string
    rulesSha256: string
  }
}

// ---- Boot-artifact manifest + script snapshot (Phase 6) --------------------
// Pinned ON THE PROJECT (edit_projects.boot_manifest / script_snapshot, with
// sha columns) by the fenced editor_pin_manifest RPC BEFORE the first
// queued->inspecting transition. Set-once: a different manifest for the same
// project fails closed (`manifest_mismatch`), it never silently repins.
export interface BootArtifactManifest {
  schemaVersion: number
  manifestEpoch: number // == PIPELINE_EPOCH
  componentVersions: {
    inspection: string
    speech: string
    visual: string
    audio: string
    hook: string
  }
  // componentDigest per Phase-6 component:
  // sha256(canonicalJson({version, effectiveConfig, modelHashes, boundsSha256}))
  componentDigests: {
    visual: string
    audio: string
    hook: string
  }
  modelArtifacts: {
    speech: {
      repository: string
      revision: string
      artifactSha256: string
      manifestSha256: string
    }
    faceDetector: {
      repository: string
      ref: string
      artifactSha256: string
      manifestSha256: string
    }
  }
  build: {
    workerCommit: string | null
    dockerfileSha256: string | null
    dependencyLockSha256: string | null
  }
  ffmpeg: {
    versionBannerSha256: string | null
  }
  rules: {
    rulesVersion: string
    boundsSha256: string
  }
}

// The recording script the creator was prompted to speak, snapshotted at pin
// time from the generation row (scene_timeline / selected_hook). Canonical
// form: NFC-normalized strings, collapsed whitespace, recursively sorted keys,
// no insignificant whitespace. Canonical bytes > SCRIPT_SNAPSHOT_MAX_BYTES
// fail closed with `script_snapshot_too_large` — never truncated.
export interface RecordingScriptSnapshot {
  schemaVersion: number
  generationId: string
  hook: string | null
  scenes: Array<{
    sceneNumber: number
    sceneType: string
    dialogue: string | null
    showInTeleprompter: boolean
  }>
}

// Idempotency-key semantics (exact, so callers never over-assume):
//  * The key that CREATES a project is permanently bound to that project's
//    (generation, source) and stored on the row. Reusing it with different
//    inputs is a 409 conflict, forever.
//  * A DIFFERENT key sent while a project for the same source is still ACTIVE
//    gets that active project back via active-source reconciliation. That
//    alternate key is NOT stored and NOT consumed — it acquired no binding.
//    If the project later settles (completed/failed/cancelled) and the same
//    alternate key is sent again with valid inputs, it will CREATE a new
//    project and only then become bound.
