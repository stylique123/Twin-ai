// Phase 6 — the AUDIO portion of the real `analyzing` stage.
//
// Correction-1 discipline: ONE deterministic PCM decode (ffmpeg -> s16le,
// 48 kHz, EXPLICIT mono downmix `-ac 1`), then every frozen statistic is
// computed IN THIS CODE over exact 4800-sample windows — no ffmpeg filter
// statistic ever stands in for a frozen threshold. ebur128 loudness (LUFS /
// LRA / true peak) is a SEPARATE ffmpeg pass whose summary is parsed, because
// LUFS is a standardized measurement, not one of our thresholds.
//
// Frozen definitions (worker/analysis_rules_v1.json is the numeric authority):
//  * sample normalization x = s / 32768 (s = little-endian int16)
//  * windows are consecutive EXACT 4800-sample blocks; the trailing partial
//    block is EXCLUDED from window statistics but its samples still count for
//    clippedSampleCount (which counts every decoded sample with |x| >= 0.9995)
//  * window RMS -> dBFS: 20*log10(rms), rms == 0 -> silenceDbFloor (-120);
//    all window-level comparisons run on dB values ROUNDED to 2 decimals (the
//    persisted precision), so evidence and logic can never disagree
//  * noise floor = the 5th-percentile window dB: ascending sort, index
//    floor(0.05 * (N-1)) (nearest-lower rank, no interpolation)
//  * speech-word windows = windows overlapping any speech-component word
//    interval by >= 1 ms; median = mean of the two middle values for even N
//  * SNR = medianSpeechRmsDb - noiseFloorDb
//  * room tone = maximal runs of >= roomToneMinMs (800 ms == 8 windows) of
//    word-free windows with dB <= floor + 3; top 120 by duration desc, then
//    startMs asc
//  * early window = samples in [0, 3000 ms); earlyEnergyRatio =
//    clamp(10^((earlyDb - wholeDb)/20), 0, 4), 4 decimals
//  * no audio track -> loudness/floor/median/SNR/early all null,
//    clippedSampleCount 0, roomTone []
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { env } from '../env.js'
import { PermanentJobError } from '../errors.js'
import { AnalyzeCancelledError, type CancelWatch } from './editorCancel.js'
import { runGroupProcess } from './editorSpeech.js'
import {
  AUDIO_ANALYSIS_SCHEMA_VERSION, AUDIO_ANALYSIS_VERSION, AUDIO_COMPONENT_MAX_BYTES,
  type AnalysisRules,
} from './editorManifest.js'

const round2 = (x: number) => Math.round(x * 100) / 100
const round4 = (x: number) => Math.round(x * 10000) / 10000

export function rmsToDb(rms: number, silenceDbFloor: number): number {
  return rms > 0 ? round2(20 * Math.log10(rms)) : silenceDbFloor
}

// ---- decode: one deterministic PCM pass -------------------------------------
export async function decodePcm(srcPath: string, pcmPath: string, watch: CancelWatch, rules: AnalysisRules): Promise<void> {
  const A = rules.audio
  await runGroupProcess(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', srcPath,
      '-vn', '-ac', String(A.channels), '-ar', String(A.sampleRateHz), '-f', A.pcmFormat, pcmPath],
    env.audioDecodeTimeoutMs, watch, 'during_audio',
    (code, stderr) => code === 0 ? null
      : new PermanentJobError(`audio: PCM decode failed (exit ${code}): ${stderr.slice(0, 200)}`, 'audio_decode_failed'),
    { cancelledError: (p) => new AnalyzeCancelledError(p) },
  )
}

// ---- windowed statistics over the PCM stream (pure over the byte stream) ----
export interface PcmWindowStats {
  totalSamples: number
  fullWindows: number
  trailingSamples: number
  clippedSampleCount: number
  windowDb: number[]        // per FULL window, rounded to 2 decimals
  earlyDb: number | null    // RMS over samples in [0, earlyWindowMs), dB
  wholeDb: number | null    // RMS over all samples, dB
}

// Streaming int16 scan. Deterministic: single-threaded sequential float64
// accumulation in file order.
export async function scanPcmFile(pcmPath: string, rules: AnalysisRules): Promise<PcmWindowStats> {
  const A = rules.audio
  const earlySampleCap = Math.floor(A.earlyWindowMs * A.sampleRateHz / 1000)
  let totalSamples = 0
  let clipped = 0
  let winCount = 0
  let winSumSq = 0
  const windowDb: number[] = []
  let earlySumSq = 0
  let earlyN = 0
  let wholeSumSq = 0
  let carry: Buffer | null = null

  const stream = createReadStream(pcmPath)
  for await (const chunk of stream) {
    const buf: Buffer = carry ? Buffer.concat([carry, chunk as Buffer]) : (chunk as Buffer)
    const usable: number = buf.length - (buf.length % 2)
    carry = usable < buf.length ? buf.subarray(usable) : null
    for (let off = 0; off < usable; off += 2) {
      const s = buf.readInt16LE(off)
      const x = s / 32768
      const ax = Math.abs(x)
      if (ax >= A.clippingThreshold) clipped++
      const sq = x * x
      wholeSumSq += sq
      if (totalSamples < earlySampleCap) { earlySumSq += sq; earlyN++ }
      winSumSq += sq
      winCount++
      totalSamples++
      if (winCount === A.windowSamples) {
        windowDb.push(rmsToDb(Math.sqrt(winSumSq / A.windowSamples), A.silenceDbFloor))
        winCount = 0
        winSumSq = 0
      }
    }
  }
  return {
    totalSamples,
    fullWindows: windowDb.length,
    trailingSamples: winCount,
    clippedSampleCount: clipped,
    windowDb,
    earlyDb: earlyN > 0 ? rmsToDb(Math.sqrt(earlySumSq / earlyN), A.silenceDbFloor) : null,
    wholeDb: totalSamples > 0 ? rmsToDb(Math.sqrt(wholeSumSq / totalSamples), A.silenceDbFloor) : null,
  }
}

// ---- frozen derived statistics (pure, unit-tested) --------------------------
export function percentileNearestLower(sortedAsc: number[], pct: number): number {
  return sortedAsc[Math.floor((pct / 100) * (sortedAsc.length - 1))]
}

export function medianEvenMean(sortedAsc: number[]): number {
  const n = sortedAsc.length
  if (n % 2 === 1) return sortedAsc[(n - 1) / 2]
  return round2((sortedAsc[n / 2 - 1] + sortedAsc[n / 2]) / 2)
}

export interface SpeechWordInterval { startMs: number; endMs: number }

export interface DerivedAudioStats {
  noiseFloorDb: number | null
  medianSpeechRmsDb: number | null
  snrDb: number | null
  roomTone: Array<{ startMs: number; endMs: number; meanRmsDb: number }>
  earlyEnergyRatio: number | null
}

export function deriveAudioStats(
  stats: PcmWindowStats,
  words: SpeechWordInterval[],
  rules: AnalysisRules,
): DerivedAudioStats {
  const A = rules.audio
  const windowMs = (A.windowSamples * 1000) / A.sampleRateHz // 100ms exactly
  const N = stats.windowDb.length
  if (N === 0) {
    return { noiseFloorDb: null, medianSpeechRmsDb: null, snrDb: null, roomTone: [], earlyEnergyRatio: null }
  }

  const noiseFloorDb = percentileNearestLower([...stats.windowDb].sort((a, b) => a - b), A.noiseFloorPercentile)

  // Word overlap per window (>= 1ms of any word interval).
  const hasWord = new Array<boolean>(N).fill(false)
  for (const w of words) {
    if (w.endMs <= w.startMs) continue
    const first = Math.max(0, Math.floor(w.startMs / windowMs))
    const last = Math.min(N - 1, Math.ceil(w.endMs / windowMs) - 1)
    for (let i = first; i <= last; i++) {
      const ws = i * windowMs; const we = ws + windowMs
      if (Math.min(we, w.endMs) - Math.max(ws, w.startMs) >= 1) hasWord[i] = true
    }
  }

  const speechDb = stats.windowDb.filter((_, i) => hasWord[i]).sort((a, b) => a - b)
  const medianSpeechRmsDb = speechDb.length > 0 ? medianEvenMean(speechDb) : null
  const snrDb = medianSpeechRmsDb !== null ? round2(medianSpeechRmsDb - noiseFloorDb) : null

  // Room tone: maximal runs of word-free windows within +3 dB of the floor.
  const minWindows = Math.ceil(A.roomToneMinMs / windowMs)
  const tone: Array<{ startMs: number; endMs: number; meanRmsDb: number; lenWindows: number }> = []
  let runStart = -1
  const closeRun = (endExclusive: number) => {
    if (runStart < 0) return
    const len = endExclusive - runStart
    if (len >= minWindows) {
      const dbs = stats.windowDb.slice(runStart, endExclusive)
      tone.push({
        startMs: Math.round(runStart * windowMs),
        endMs: Math.round(endExclusive * windowMs),
        meanRmsDb: round2(dbs.reduce((a, b) => a + b, 0) / dbs.length),
        lenWindows: len,
      })
    }
    runStart = -1
  }
  for (let i = 0; i < N; i++) {
    const quiet = !hasWord[i] && stats.windowDb[i] <= noiseFloorDb + A.roomToneMaxAboveFloorDb
    if (quiet) { if (runStart < 0) runStart = i }
    else closeRun(i)
  }
  closeRun(N)
  tone.sort((a, b) => (b.lenWindows - a.lenWindows) || (a.startMs - b.startMs))
  const roomTone = tone.slice(0, A.roomToneCap)
    .map(({ startMs, endMs, meanRmsDb }) => ({ startMs, endMs, meanRmsDb }))

  let earlyEnergyRatio: number | null = null
  if (stats.earlyDb !== null && stats.wholeDb !== null) {
    const ratio = Math.pow(10, (stats.earlyDb - stats.wholeDb) / 20)
    earlyEnergyRatio = round4(Math.min(Math.max(ratio, 0), A.earlyEnergyRatioMax))
  }

  return { noiseFloorDb, medianSpeechRmsDb, snrDb, roomTone, earlyEnergyRatio }
}

// ---- ebur128 (separate pass) ------------------------------------------------
export interface LoudnessSummary {
  integratedLufs: number | null
  loudnessRangeLu: number | null
  truePeakDbtp: number | null
}

export function parseEbur128Summary(stderr: string): LoudnessSummary {
  // The filter logs per-frame progress lines that ALSO contain "I: ... LUFS";
  // only the final Summary block is authoritative — parse strictly after it.
  const at = stderr.lastIndexOf('Summary:')
  const summary = at >= 0 ? stderr.slice(at) : ''
  const num = (re: RegExp): number | null => {
    const m = re.exec(summary)
    if (!m) return null
    const v = Number(m[1])
    return Number.isFinite(v) ? round2(v) : null
  }
  return {
    integratedLufs: num(/I:\s+(-?[\d.]+)\s*LUFS/),
    loudnessRangeLu: num(/LRA:\s+(-?[\d.]+)\s*LU/),
    truePeakDbtp: num(/Peak:\s+(-?[\d.]+)\s*dBFS/),
  }
}

export async function measureLoudness(srcPath: string, watch: CancelWatch): Promise<LoudnessSummary> {
  const { stderr } = await runGroupProcess(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', srcPath, '-map', 'a:0',
      '-filter:a', 'ebur128=peak=true', '-f', 'null', '-'],
    env.loudnessTimeoutMs, watch, 'during_audio',
    (code, tail) => code === 0 ? null
      : new PermanentJobError(`audio: ebur128 pass failed (exit ${code}): ${tail.slice(0, 200)}`, 'loudness_failed'),
    { stderrCap: 65536, cancelledError: (p) => new AnalyzeCancelledError(p) },
  )
  return parseEbur128Summary(stderr)
}

// ---- contract construction --------------------------------------------------
export function buildAudioAnalysis(
  asset: { id: string; content_sha256: string },
  input: {
    audioPresent: boolean
    stats: PcmWindowStats | null
    derived: DerivedAudioStats | null
    loudness: LoudnessSummary | null
    ffmpegVersionBannerSha256: string | null
  },
  rules: AnalysisRules,
  boundsSha256: string,
): Record<string, unknown> {
  const A = rules.audio
  const stats = input.stats
  const derived = input.derived
  const result: Record<string, unknown> = {
    schemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
    audioVersion: AUDIO_ANALYSIS_VERSION,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    audioPresent: input.audioPresent,
    decode: {
      format: A.pcmFormat,
      sampleRateHz: A.sampleRateHz,
      channels: A.channels,
      totalSamples: stats?.totalSamples ?? 0,
      fullWindows: stats?.fullWindows ?? 0,
      trailingSamples: stats?.trailingSamples ?? 0,
    },
    loudness: {
      integratedLufs: input.loudness?.integratedLufs ?? null,
      loudnessRangeLu: input.loudness?.loudnessRangeLu ?? null,
      truePeakDbtp: input.loudness?.truePeakDbtp ?? null,
    },
    clippedSampleCount: stats?.clippedSampleCount ?? 0,
    noiseFloorDb: derived?.noiseFloorDb ?? null,
    medianSpeechRmsDb: derived?.medianSpeechRmsDb ?? null,
    snrDb: derived?.snrDb ?? null,
    roomTone: derived?.roomTone ?? [],
    earlyRmsDb: stats?.earlyDb ?? null,
    wholeRmsDb: stats?.wholeDb ?? null,
    earlyEnergyRatio: derived?.earlyEnergyRatio ?? null,
    provenance: {
      decoder: 'ffmpeg',
      ffmpegVersionBannerSha256: input.ffmpegVersionBannerSha256,
      windowSamples: A.windowSamples,
      clippingThreshold: A.clippingThreshold,
      noiseFloorPercentile: A.noiseFloorPercentile,
      speechWordSource: 'speech-component-words',
      rulesVersion: rules.rulesVersion,
      rulesSha256: boundsSha256,
    },
  }
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
  if (bytes > AUDIO_COMPONENT_MAX_BYTES) {
    throw new PermanentJobError(`audio: component ${bytes} bytes exceeds payload cap`, 'audio_component_too_large')
  }
  return result
}

// ---- the full audio pipeline over verified local bytes ----------------------
export async function computeAudioComponent(
  asset: { id: string; content_sha256: string },
  localPath: string, dir: string, watch: CancelWatch,
  audioPresent: boolean,
  words: SpeechWordInterval[],
  rules: AnalysisRules, boundsSha256: string,
  ffmpegVersionBannerSha256: string | null,
): Promise<Record<string, unknown>> {
  if (!audioPresent) {
    return buildAudioAnalysis(asset, {
      audioPresent: false, stats: null, derived: null, loudness: null, ffmpegVersionBannerSha256,
    }, rules, boundsSha256)
  }
  const pcmPath = join(dir, 'analyze-audio.pcm')
  await decodePcm(localPath, pcmPath, watch, rules)
  if (watch.cancelled()) throw new AnalyzeCancelledError('during_audio')
  const stats = await scanPcmFile(pcmPath, rules)
  const derived = deriveAudioStats(stats, words, rules)
  const loudness = await measureLoudness(localPath, watch)
  return buildAudioAnalysis(asset, { audioPresent: true, stats, derived, loudness, ffmpegVersionBannerSha256 }, rules, boundsSha256)
}
