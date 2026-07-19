// The REAL `transcribing` stage (Phase 5) + the speech portion of `analyzing`.
//
// Governing rules:
//  * The transcript comes from the ACTUAL recording — Faster-Whisper over the
//    validated bytes; never a teleprompter script, and never filtered against
//    one (off-script words stay).
//  * INTEGRITY BEFORE WORK, independently of Phase 4: current etag + byte-size
//    reconciliation → bounded download → SHA-256 verification → only then is
//    audio extracted and processed. A Phase-4 cache hit (or any earlier green
//    check) does NOT authorize processing bytes that changed since.
//  * ANALYZE ONCE AND REUSE: one immutable `speech` component per
//    (source_asset_id, 'speech', speechVersion) — same per-asset cache
//    identity as inspection (no cross-tenant dedup, owner derived from the
//    asset by the fenced RPC). Version bump recomputes; concurrent misses and
//    crash-retries converge on the single row via ON CONFLICT DO NOTHING.
//  * CANDIDATES ONLY: silence / filler / false-start / repetition entries are
//    evidence-bearing suggestions; nothing here decides a cut, and low ASR
//    confidence alone never produces a candidate.
//
// Cancellation is cooperative and prompt: the shared watcher trips an
// AbortController; the download stream, the ffmpeg audio extraction and the
// faster-whisper bridge PROCESS GROUPS are torn down immediately.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { PermanentJobError } from '../errors.js'
import { downloadObject } from '../storage.js'
import { makeSlowPoint, watchCancellation, type CancelWatch } from './editorCancel.js'
import { fileSha256, loadEligibleSource, reconcileStorageIntegrity, type AssetRow } from './editorInspect.js'

export const SPEECH_ANALYSIS_SCHEMA_VERSION = 1

export class SpeechCancelledError extends Error {
  constructor(point: string) {
    super(`speech analysis cancelled at ${point}`)
    this.name = 'SpeechCancelledError'
  }
}

const slowPoint = (point: string, watch: CancelWatch) =>
  makeSlowPoint(env.speechSlowPoint, env.speechSlowMs, (p) => new SpeechCancelledError(p))(point, watch)

// ---- bridge output (worker/editor_speech.py) --------------------------------
export interface SpeechBridgeOutput {
  language: string
  language_probability: number
  duration_sec: number
  text: string
  words: Array<{ w: string; start: number; end: number; p: number }>
  segments: Array<{ start: number; end: number; text: string }>
  vad_segments: Array<{ start: number; end: number }>
  energy: { window_ms: number; rms: number[] }
}

// ---- pure contract construction (unit-tested) ------------------------------
const FILLER_WORDS = new Set(['um', 'uh', 'uhm', 'umm', 'uhh', 'erm', 'er', 'ah', 'hmm', 'mm', 'mmm'])
const SENTENCE_END_RE = /[.!?]["')\]]?$/

// 30 min source cap at 100ms windows = 18000; anything past this is a bug,
// not data — refuse rather than silently truncate.
const MAX_ENERGY_WINDOWS = 18000

function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
}

const toMs = (sec: number) => Math.round(sec * 1000)

interface BuiltWord {
  id: string; text: string; startMs: number; endMs: number
  confidence: number; sentenceEnd: boolean
}

// Overlap of [s,e) with the union of VAD speech segments, in ms.
function speechOverlapMs(sMs: number, eMs: number, vad: Array<{ startMs: number; endMs: number }>): number {
  let covered = 0
  for (const v of vad) covered += Math.max(0, Math.min(eMs, v.endMs) - Math.max(sMs, v.startMs))
  return covered
}

export function buildSpeechAnalysis(
  asset: { id: string; content_sha256: string },
  bridge: SpeechBridgeOutput,
  opts: { speechVersion: string; asrModel: string; beamSize: number; silenceMinMs: number },
): Record<string, unknown> {
  if (!Array.isArray(bridge.words)) throw new PermanentJobError('speech: bridge produced no word list', 'asr_failed')
  if (bridge.energy.rms.length > MAX_ENERGY_WINDOWS || bridge.energy.window_ms < 100) {
    throw new PermanentJobError('speech: energy curve out of bounds', 'speech_energy_overflow')
  }

  const words: BuiltWord[] = bridge.words.map((w, i) => ({
    id: `w${i}`,
    text: w.w,
    startMs: toMs(w.start),
    endMs: Math.max(toMs(w.end), toMs(w.start)),
    confidence: Math.max(0, Math.min(1, Number(w.p) || 0)),
    sentenceEnd: SENTENCE_END_RE.test(w.w),
  }))

  // Sentences: group words up to (and including) each terminal-punctuation
  // word; a trailing run without terminal punctuation still closes a sentence.
  const sentences: Array<Record<string, unknown>> = []
  let sStart = 0
  for (let i = 0; i < words.length; i++) {
    if (words[i].sentenceEnd || i === words.length - 1) {
      const group = words.slice(sStart, i + 1)
      sentences.push({
        id: `s${sentences.length}`,
        startMs: group[0].startMs,
        endMs: group[group.length - 1].endMs,
        firstWordId: group[0].id,
        lastWordId: group[group.length - 1].id,
        text: group.map((w) => w.text).join(' '),
      })
      sStart = i + 1
    }
  }

  const vadSegments = bridge.vad_segments.map((v) => ({ startMs: toMs(v.start), endMs: toMs(v.end) }))
  const durationMs = toMs(bridge.duration_sec)

  // ---- candidates (evidence only — never cut decisions) --------------------
  type Cand = {
    kind: 'silence' | 'filler' | 'false_start' | 'repetition'
    startMs: number; endMs: number; wordIds: string[]
    confidence: 'high' | 'medium' | 'low'; evidence: Record<string, unknown>
  }
  const cands: Cand[] = []

  const silenceAt = (sMs: number, eMs: number, position: 'leading' | 'internal' | 'trailing') => {
    const gapMs = eMs - sMs
    if (gapMs < opts.silenceMinMs) return
    // VAD support: the majority of the gap lies outside detected speech.
    const nonSpeechRatio = 1 - speechOverlapMs(sMs, eMs, vadSegments) / gapMs
    cands.push({
      kind: 'silence', startMs: sMs, endMs: eMs, wordIds: [],
      confidence: nonSpeechRatio >= 0.5 ? 'high' : 'medium',
      evidence: { gapMs, position, vadSupported: nonSpeechRatio >= 0.5 },
    })
  }
  if (words.length > 0) {
    silenceAt(0, words[0].startMs, 'leading')
    for (let i = 1; i < words.length; i++) silenceAt(words[i - 1].endMs, words[i].startMs, 'internal')
    silenceAt(words[words.length - 1].endMs, durationMs, 'trailing')
  }

  // Fillers: runs of consecutive filler tokens.
  for (let i = 0; i < words.length;) {
    if (!FILLER_WORDS.has(normalizeToken(words[i].text))) { i++; continue }
    let j = i
    while (j + 1 < words.length && FILLER_WORDS.has(normalizeToken(words[j + 1].text))) j++
    const run = words.slice(i, j + 1)
    const minConf = Math.min(...run.map((w) => w.confidence))
    cands.push({
      kind: 'filler', startMs: run[0].startMs, endMs: run[run.length - 1].endMs,
      wordIds: run.map((w) => w.id),
      // A LOW-confidence "um" may be a mis-heard real word — the candidate is
      // kept but marked low so no downstream phase treats it as safe.
      confidence: minConf >= 0.5 ? 'high' : 'low',
      evidence: { words: run.map((w) => w.text), minAsrConfidence: minConf },
    })
    i = j + 1
  }

  // Repeated bigram — "I want, I want to…" — classified false_start when a
  // pause or comma separates the runs, else repetition. Immediate identical
  // unigrams are repetition candidates.
  const norm = words.map((w) => normalizeToken(w.text))
  const claimed = new Set<number>()
  for (let i = 0; i + 3 < words.length; i++) {
    if (!norm[i] || !norm[i + 1]) continue
    if (norm[i] === norm[i + 2] && norm[i + 1] === norm[i + 3]) {
      const pauseMs = words[i + 2].startMs - words[i + 1].endMs
      const comma = /,$/.test(words[i + 1].text)
      cands.push({
        kind: pauseMs >= 150 || comma ? 'false_start' : 'repetition',
        startMs: words[i].startMs, endMs: words[i + 1].endMs,
        wordIds: [words[i].id, words[i + 1].id],
        confidence: 'medium',
        evidence: { repeated: `${words[i].text} ${words[i + 1].text}`, pauseMs, secondStartWordId: words[i + 2].id },
      })
      for (const k of [i, i + 1, i + 2, i + 3]) claimed.add(k)
      i += 3
    }
  }
  for (let i = 0; i + 1 < words.length; i++) {
    if (claimed.has(i) || claimed.has(i + 1)) continue
    if (norm[i] && norm[i].length >= 2 && norm[i] === norm[i + 1] && !FILLER_WORDS.has(norm[i])) {
      cands.push({
        kind: 'repetition', startMs: words[i].startMs, endMs: words[i].endMs,
        wordIds: [words[i].id], confidence: 'medium',
        evidence: { token: words[i].text, repeatWordId: words[i + 1].id },
      })
    }
  }

  cands.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  const candidates = cands.map((c, i) => ({ id: `c${i}`, ...c }))

  return {
    schemaVersion: SPEECH_ANALYSIS_SCHEMA_VERSION,
    speechVersion: opts.speechVersion,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    language: bridge.language,
    languageConfidence: Math.max(0, Math.min(1, Number(bridge.language_probability) || 0)),
    durationMs,
    transcript: bridge.text,
    words: words.map(({ id, text, startMs, endMs, confidence, sentenceEnd }) => ({ id, text, startMs, endMs, confidence, sentenceEnd })),
    sentences,
    vadSegments,
    energy: { windowMs: bridge.energy.window_ms, rms: bridge.energy.rms },
    candidates,
    provenance: {
      asrEngine: 'faster-whisper',
      asrModel: opts.asrModel,
      beamSize: opts.beamSize,
      vad: 'silero',
      silenceMinMs: opts.silenceMinMs,
    },
  }
}

// ---- subprocesses with process-group termination ----------------------------
function runGroupProcess(
  cmd: string, args: string[], timeoutMs: number, watch: CancelWatch,
  cancelPoint: string, onExit: (code: number | null, stderr: string) => Error | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    let settled = false
    const killGroup = () => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* already gone */ } }
    const timer = setTimeout(() => {
      killGroup()
      finish(new Error(`stage_timeout: ${cmd} exceeded ${timeoutMs}ms`))
    }, timeoutMs)
    const onAbort = () => { killGroup(); finish(new SpeechCancelledError(cancelPoint)) }
    watch.signal.addEventListener('abort', onAbort, { once: true })
    function finish(e: Error | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      watch.signal.removeEventListener('abort', onAbort)
      if (e) reject(e); else resolve()
    }
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000) })
    child.on('error', (e) => finish(e))
    child.on('close', (code) => {
      if (watch.cancelled()) return finish(new SpeechCancelledError(cancelPoint))
      finish(onExit(code, err))
    })
  })
}

function extractAudio(srcPath: string, wavPath: string, watch: CancelWatch): Promise<void> {
  return runGroupProcess(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', srcPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', wavPath],
    env.speechExtractTimeoutMs, watch, 'during_extract',
    (code, stderr) => code === 0 ? null
      : new PermanentJobError(`speech: audio extraction failed (exit ${code}): ${stderr.slice(0, 200)}`, 'audio_extract_failed'),
  )
}

function runAsrBridge(wavPath: string, outPath: string, watch: CancelWatch): Promise<void> {
  return runGroupProcess(
    'python3',
    // dist/jobs/editorSpeech.js → ../../editor_speech.py (the worker root,
    // both in the Docker image and when CI runs the built worker in-tree).
    [join(import.meta.dirname, '..', '..', 'editor_speech.py'),
      '--audio', wavPath, '--out', outPath,
      '--model', env.speechModel, '--device', env.whisperDevice,
      '--language', env.whisperLanguage, '--beam-size', '1',
      '--max-seconds', String(Math.ceil(env.sourceMaxDurationMs / 1000))],
    env.speechAsrTimeoutMs, watch, 'during_asr',
    (code, stderr) => {
      if (code === 0) return null
      if (code === 2) return new PermanentJobError('speech: media too long for transcription', 'speech_too_long')
      // Provider failures (model fetch, runtime) are RETRYABLE — the retry
      // budget dead-letters a persistent one. The stderr tail rides along for
      // the container log; everything durable passes the sanitizer first.
      return new Error(`asr_failed (exit ${code}): ${stderr.slice(0, 400)}`)
    },
  )
}

// ---- the transcribing stage -------------------------------------------------
export interface SpeechOutcome {
  cacheHit: boolean
  asrPerformed: boolean
  wordCount: number
  language: string | null
  candidateCounts: Record<string, number>
}

function countCandidates(analysis: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = { silence: 0, filler: 0, false_start: 0, repetition: 0 }
  for (const c of (analysis.candidates as Array<{ kind: string }> | undefined) ?? []) {
    out[c.kind] = (out[c.kind] ?? 0) + 1
  }
  return out
}

export async function runTranscribingStage(job: Job, projectId: string, dir: string): Promise<SpeechOutcome> {
  const { proj, asset, meta } = await loadEligibleSource(projectId, 'speech')

  const watch = watchCancellation(projectId)
  try {
    if (proj.cancel_requested_at) throw new SpeechCancelledError('before_speech')

    // Integrity FIRST, before the cache lookup — Phase 4's earlier checks (or
    // its cache hit moments ago) do not authorize the CURRENT bytes.
    await slowPoint('before_reconcile', watch)
    await reconcileStorageIntegrity(asset, meta, 'speech')

    const { data: cached } = await db
      .from('media_analyses').select('id, result, source_hash')
      .eq('source_asset_id', asset.id).eq('component', 'speech')
      .eq('analyzer_bundle_version', env.speechVersion)
      .maybeSingle()
    if (cached) {
      if (cached.source_hash !== asset.content_sha256) {
        throw new PermanentJobError('speech: cached component checksum mismatch', 'source_bytes_changed')
      }
      const r = cached.result as Record<string, unknown>
      return {
        cacheHit: true,
        asrPerformed: false,
        wordCount: ((r.words as unknown[]) ?? []).length,
        language: (r.language as string) ?? null,
        candidateCounts: countCandidates(r),
      }
    }

    // Bounded download + SHA-256 — only verified bytes are ever transcribed.
    await slowPoint('before_download', watch)
    const local = join(dir, 'speech-source')
    try {
      await downloadObject(asset.bucket, asset.storage_path, local, {
        signal: watch.signal,
        chunkPauseMs: env.speechSlowPoint === 'during_download' ? Math.min(env.speechSlowMs, 500) : 0,
      })
    } catch (e) {
      if (watch.cancelled()) throw new SpeechCancelledError('during_download')
      throw e
    }
    if (watch.cancelled()) throw new SpeechCancelledError('during_download')
    const sha = await fileSha256(local)
    if (sha !== asset.content_sha256) {
      throw new PermanentJobError('speech: downloaded bytes do not match validation checksum', 'source_bytes_changed')
    }

    await slowPoint('before_extract', watch)
    const wav = join(dir, 'speech-audio.wav')
    await extractAudio(local, wav, watch)

    await slowPoint('before_asr', watch)
    const outJson = join(dir, 'speech-bridge.json')
    await runAsrBridge(wav, outJson, watch)

    let bridge: SpeechBridgeOutput
    try {
      bridge = JSON.parse(await readFile(outJson, 'utf8')) as SpeechBridgeOutput
    } catch {
      throw new Error('asr_failed: bridge produced unparseable output')
    }

    const analysis = buildSpeechAnalysis(
      { id: asset.id, content_sha256: asset.content_sha256 },
      bridge,
      { speechVersion: env.speechVersion, asrModel: env.speechModel, beamSize: 1, silenceMinMs: env.speechSilenceMinMs },
    )

    if (watch.cancelled()) throw new SpeechCancelledError('before_persist')

    // FENCED persistence — same writer as inspection: re-proves the lease and
    // that the hash still matches the project's CURRENT source; concurrent
    // misses converge on the single cached row.
    const { error: recErr } = await db.rpc('editor_record_inspection', {
      p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
      p_component: 'speech', p_schema_version: SPEECH_ANALYSIS_SCHEMA_VERSION,
      p_bundle_version: env.speechVersion, p_source_hash: asset.content_sha256,
      p_result: analysis,
      p_backfill_etag: null, p_backfill_bytes: null,
    })
    if (recErr) throw recErr

    await slowPoint('after_persist', watch)

    return {
      cacheHit: false,
      asrPerformed: true,
      wordCount: (analysis.words as unknown[]).length,
      language: analysis.language as string,
      candidateCounts: countCandidates(analysis),
    }
  } finally {
    watch.stop()
  }
}

// ---- the speech portion of `analyzing` --------------------------------------
// The analyzing stage does not recompute anything: it re-verifies that the
// durable speech component EXISTS and still matches the project's CURRENT
// source bytes (fail closed on either), and surfaces its summary. The visual/
// audio portions of analyzing remain simulated until their phases.
export interface SpeechVerification {
  speechVersion: string
  wordCount: number
  candidatesTotal: number
}

export async function verifySpeechComponent(projectId: string): Promise<SpeechVerification> {
  const { asset } = await loadEligibleSource(projectId, 'speech-verify')
  const { data: rows, error } = await db
    .from('media_analyses').select('analyzer_bundle_version, source_hash, result')
    .eq('source_asset_id', asset.id).eq('component', 'speech')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`speech-verify: component read failed: ${error.message}`)
  // Prefer the current bundle version; accept an earlier one recorded by this
  // project's transcribing run (a mid-project version rollout must not strand
  // the project) — but ONLY if its hash matches the current bytes.
  const match = (rows ?? []).find((r) => r.analyzer_bundle_version === env.speechVersion && r.source_hash === asset.content_sha256)
    ?? (rows ?? []).find((r) => r.source_hash === asset.content_sha256)
  if (!match) {
    if ((rows ?? []).length > 0) {
      throw new PermanentJobError('speech-verify: recorded component does not match current source bytes', 'source_bytes_changed')
    }
    throw new PermanentJobError('speech-verify: no speech component recorded', 'speech_component_missing')
  }
  const r = match.result as Record<string, unknown>
  return {
    speechVersion: match.analyzer_bundle_version,
    wordCount: ((r.words as unknown[]) ?? []).length,
    candidatesTotal: ((r.candidates as unknown[]) ?? []).length,
  }
}
