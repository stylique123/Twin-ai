// Phase 6 — the REAL `analyzing` stage. Governing rules:
//
//  * INTEGRITY BEFORE CACHE: the session's cheap remote reconciliation runs
//    before ANY cached component is accepted — a cached analysis never
//    legitimizes changed bytes.
//  * STRICT VERSIONS: the inspection and speech components are loaded at
//    EXACTLY the versions the pinned boot manifest names. No fallback.
//  * DIGEST-KEYED CACHE: visual/audio/hook are keyed
//    (source_asset_id, component, componentDigest); a digest hit reuses, a
//    miss computes. Either way the fenced editor_record_analysis RPC is the
//    single writer and the single event accountant (recorded vs reused, with
//    dedupe keys) — concurrent misses converge on one row.
//  * DOWNLOAD TRUTH TABLE: bytes are touched ONLY via the attempt-scoped
//    VerifiedSourceSession. Full reuse => 0 downloads; hook-only recompute
//    => 0 downloads; any byte-consumer (visual or audio) missing => exactly 1.
//  * EVIDENCE ONLY: nothing in this stage decides a cut, crop, zoom, or edit.
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { classifyDbError, PermanentJobError } from '../errors.js'
import { AnalyzeCancelledError, makeSlowPoint, watchCancellation, type CancelWatch } from './editorCancel.js'
import { loadEligibleSource } from './editorInspect.js'
import { loadComponentStrict } from './editorSpeech.js'
import {
  AUDIO_ANALYSIS_SCHEMA_VERSION, AUDIO_ANALYSIS_VERSION,
  HOOK_EVIDENCE_SCHEMA_VERSION, HOOK_EVIDENCE_VERSION,
  VISUAL_ANALYSIS_SCHEMA_VERSION, VISUAL_ANALYSIS_VERSION,
  loadAnalysisRules, type BuiltManifest, type BuiltSnapshot,
} from './editorManifest.js'
import { buildVisualAnalysis, coarseIntervalMs, runVisualBridge, type VisualFacts } from './editorVisual.js'
import { computeAudioComponent, type SpeechWordInterval } from './editorAudio.js'
import { buildHookEvidence, type HookSpeechWord } from './editorHook.js'
import { stageDownloadOpts, type VerifiedSourceSession } from './sourceSession.js'

const slowPoint = (point: string, watch: CancelWatch) =>
  makeSlowPoint(env.analyzeSlowPoint, env.analyzeSlowMs, (p) => new AnalyzeCancelledError(p))(point, watch)

export interface AnalyzeComponentOutcome {
  digest: string
  recorded: boolean   // this run inserted the row (vs converged on existing)
  cacheHit: boolean   // this run reused a pre-existing row without computing
}

export interface AnalyzeOutcome {
  visual: AnalyzeComponentOutcome
  audio: AnalyzeComponentOutcome
  hook: AnalyzeComponentOutcome
  sourceDownloads: number
}

interface PinnedContext {
  manifest: BuiltManifest
  snapshot: BuiltSnapshot
}

// Fenced single-writer for a digest-keyed component. Also the event
// accountant: analysis_component_recorded/reused with dedupe keys.
async function recordAnalysis(
  job: Job, projectId: string,
  component: 'visual' | 'audio' | 'hook', schemaVersion: number, bundleVersion: string,
  digest: string, sourceHash: string, result: Record<string, unknown>,
): Promise<{ recorded: boolean }> {
  const { data, error } = await db.rpc('editor_record_analysis', {
    p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
    p_component: component, p_schema_version: schemaVersion, p_bundle_version: bundleVersion,
    p_component_digest: digest, p_source_hash: sourceHash, p_result: result,
  })
  if (error) throw classifyDbError(error.message)
  const out = (Array.isArray(data) ? data[0] : data) as { recorded?: boolean } | null
  return { recorded: out?.recorded === true }
}

// Digest-keyed cache lookup. A hit whose recorded hash differs from the
// current bytes is an integrity failure, never a reuse.
async function lookupCached(
  assetId: string, contentSha256: string, component: string, digest: string,
): Promise<Record<string, unknown> | null> {
  const { data: row, error } = await db
    .from('media_analyses').select('source_hash, result')
    .eq('source_asset_id', assetId).eq('component', component)
    .eq('component_digest', digest)
    .maybeSingle()
  if (error) throw new Error(`analyze: ${component} cache read failed: ${error.message}`)
  if (!row) return null
  if (row.source_hash !== contentSha256) {
    throw new PermanentJobError(
      `analyze: cached ${component} component was recorded for different source bytes`,
      'source_bytes_changed')
  }
  return row.result as Record<string, unknown>
}

export async function runAnalyzingStage(
  job: Job, projectId: string, dir: string,
  session: VerifiedSourceSession, pinned: PinnedContext,
): Promise<AnalyzeOutcome> {
  const { proj, asset } = await loadEligibleSource(projectId, 'analyze')
  const { rules, boundsSha256 } = loadAnalysisRules()
  const digests = pinned.manifest.componentDigests

  const watch = watchCancellation(projectId)
  try {
    if (proj.cancel_requested_at) throw new AnalyzeCancelledError('before_analysis')

    // Integrity FIRST — before any cache acceptance.
    await slowPoint('before_reconcile', watch)
    await session.reconcileRemote('analyze')

    // Strict earlier-component loads at the pinned manifest's versions.
    const versions = (pinned.manifest.manifest as { componentVersions: Record<string, string> }).componentVersions
    const inspection = await loadComponentStrict(asset.id, asset.content_sha256, 'inspection', versions.inspection)
    const speech = await loadComponentStrict(asset.id, asset.content_sha256, 'speech', versions.speech)

    const video = inspection.video as { displayWidth: number; displayHeight: number; rotation: 0 | 90 | 180 | 270 }
    const audioInfo = inspection.audio as { present: boolean }
    const facts: VisualFacts = {
      durationMs: Number(inspection.durationMs),
      displayWidth: video.displayWidth,
      displayHeight: video.displayHeight,
      rotation: video.rotation,
    }
    const speechWords = ((speech.words as Array<{ text: string; startMs: number; endMs: number }>) ?? [])
    const wordIntervals: SpeechWordInterval[] = speechWords.map((w) => ({ startMs: w.startMs, endMs: w.endMs }))

    const localBytes = async (): Promise<string> => {
      await slowPoint('before_download', watch)
      try {
        return await session.localPath(stageDownloadOpts(watch.signal, 'analyze'))
      } catch (e) {
        if (watch.cancelled()) throw new AnalyzeCancelledError('during_download')
        throw e
      }
    }

    // ---- visual ----
    await slowPoint('before_visual', watch)
    let visualResult = await lookupCached(asset.id, asset.content_sha256, 'visual', digests.visual)
    const visualCacheHit = visualResult !== null
    if (!visualResult) {
      const local = await localBytes()
      if (watch.cancelled()) throw new AnalyzeCancelledError('during_download')
      const interval = coarseIntervalMs(facts.durationMs, rules)
      const bridge = await runVisualBridge(local, `${dir}/analyze-visual.json`, facts, interval, watch)
      visualResult = buildVisualAnalysis(
        { id: asset.id, content_sha256: asset.content_sha256 }, bridge, facts,
        { intervalMs: interval, rules, boundsSha256, requirePinnedModel: true })
    }
    if (watch.cancelled()) throw new AnalyzeCancelledError('before_persist')
    const visualRec = await recordAnalysis(job, projectId, 'visual',
      VISUAL_ANALYSIS_SCHEMA_VERSION, VISUAL_ANALYSIS_VERSION, digests.visual,
      asset.content_sha256, visualResult)

    // ---- audio ----
    await slowPoint('before_audio', watch)
    let audioResult = await lookupCached(asset.id, asset.content_sha256, 'audio', digests.audio)
    const audioCacheHit = audioResult !== null
    if (!audioResult) {
      const local = await localBytes()
      const ffmpegSha = (pinned.manifest.manifest as { ffmpeg?: { versionBannerSha256: string | null } })
        .ffmpeg?.versionBannerSha256 ?? null
      audioResult = await computeAudioComponent(
        { id: asset.id, content_sha256: asset.content_sha256 },
        local, dir, watch, audioInfo.present === true, wordIntervals, rules, boundsSha256, ffmpegSha)
    }
    if (watch.cancelled()) throw new AnalyzeCancelledError('before_persist')
    const audioRec = await recordAnalysis(job, projectId, 'audio',
      AUDIO_ANALYSIS_SCHEMA_VERSION, AUDIO_ANALYSIS_VERSION, digests.audio,
      asset.content_sha256, audioResult)

    // ---- hook (pure — consumes components + the pinned snapshot, no bytes) --
    await slowPoint('before_hook', watch)
    let hookResult = await lookupCached(asset.id, asset.content_sha256, 'hook', digests.hook)
    const hookCacheHit = hookResult !== null
    if (!hookResult) {
      const snapshotHook = (pinned.snapshot.snapshot as { hook?: string | null }).hook ?? null
      const hookWords: HookSpeechWord[] = speechWords.map((w) => ({ text: w.text, startMs: w.startMs }))
      hookResult = buildHookEvidence(
        { id: asset.id, content_sha256: asset.content_sha256 },
        {
          words: hookWords,
          speechVersion: versions.speech,
          audioVersion: AUDIO_ANALYSIS_VERSION,
          earlyRmsDb: (audioResult.earlyRmsDb as number | null) ?? null,
          earlyEnergyRatio: (audioResult.earlyEnergyRatio as number | null) ?? null,
          snapshotHook,
          scriptSnapshotSha256: pinned.snapshot.snapshotSha,
        },
        rules, boundsSha256)
    }
    await slowPoint('before_persist', watch)
    if (watch.cancelled()) throw new AnalyzeCancelledError('before_persist')
    const hookRec = await recordAnalysis(job, projectId, 'hook',
      HOOK_EVIDENCE_SCHEMA_VERSION, HOOK_EVIDENCE_VERSION, digests.hook,
      asset.content_sha256, hookResult)

    await slowPoint('after_persist', watch)

    return {
      visual: { digest: digests.visual, recorded: visualRec.recorded, cacheHit: visualCacheHit },
      audio: { digest: digests.audio, recorded: audioRec.recorded, cacheHit: audioCacheHit },
      hook: { digest: digests.hook, recorded: hookRec.recorded, cacheHit: hookCacheHit },
      sourceDownloads: session.downloadsPerformed,
    }
  } finally {
    watch.stop()
  }
}
