// Editor v2 — Phase 8 Batch 8.3: output + cover validation (OFFLINE).
//
// SOLE RESPONSIBILITY (Gate-0 §7): decide whether a produced local file is the
// video the plan described. No database, no storage, no network — the file is
// on disk and the plan is in memory, and that is everything the question needs.
//
// WHY THIS EXISTS AT ALL, GIVEN THE RENDERER ALREADY CHECKS ITS EXIT CODE
//
// `ffmpeg` exiting 0 means "I ran the graph I was given without erroring". It
// does not mean the graph was the right one, that the result is the length the
// plan promised, that the audio landed on its loudness target, or that the
// stream parameters survived the encoder. Every one of those has a way of going
// wrong that leaves a playable file and a zero exit status — which is the exact
// class of defect that reaches users, because nothing upstream is unhappy.
//
// So this module MEASURES. It reads the finished file with ffprobe and compares
// what is actually there against the frozen profile and the plan's own numbers.
//
// WHAT IT DOES NOT MEASURE, STATED SO NOBODY INFERS OTHERWISE.
//
// This list is kept honest deliberately. An earlier version of this header let
// the paragraph above imply loudness was audited when it was not; the audit that
// caught it noted the correction mattered more than the missing feature, because
// a reviewer trusting the sentence would not think to add the checks that were
// absent. The same rule applies to every line below — when one of these lands,
// it moves up rather than quietly staying here.
//
// Structural, from one ffprobe of the container metadata:
//   container, stream count, codecs, raster, pixel format, frame rate,
//   sample rate, channels, duration, byte ceiling, caption cue bounds,
//   cover file size.
//
// Decoded, from a real pass over the audio (Phase 9):
//   integrated loudness and true peak. Gate-0 §4 freezes -14 LUFS +/-1 and
//   -1.0 dBTP and the graph asks loudnorm for exactly those; this now confirms
//   what came back out. What is ENFORCED is narrower than what is MEASURED —
//   silence, clipping and gross level error fail, while the frozen ±1/-1.0
//   target is recorded rather than enforced, because single-pass loudnorm
//   provably cannot hold it. jobs/loudness.ts carries the measurements that
//   establish that and explains why enforcing it would reject good renders.
//
// NOT done — each a real gap, not a deliberate exclusion:
//   full VIDEO decode, A/V drift, decoded frame count, whether captions
//   actually RENDERED as pixels, caption safe-area, golden frames, and a real
//   decode of the cover (its size is checked; its contents are not).
//
// THE MEASUREMENT/CLAIM DISTINCTION IS LOAD-BEARING. `format.duration` is what
// the container header asserts; that header is written by the same encoder whose
// work is under audit. Where it matters, the stream's own decoded extent is
// preferred and the header is treated as a claim to be corroborated — a
// container that lies about its length is precisely a thing a broken faststart
// remux produces.
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { EditPlanError, type EditPlanV1 } from './editPlanContract.js'
import {
  loadRenderCatalog, runMediaProcess, type RenderCatalogV1, type OutputProfile, type SpawnDeps,
} from './editorRender.js'
import { milliToScalarLiteral } from './ffmpegGraph.js'
import { parseLoudnormJson, checkLoudness, type LoudnessVerdict } from './loudness.js'
import type { CancelWatch } from './editorCancel.js'

function bad(message: string, code: string): never {
  throw new EditPlanError(`output: ${message}`, code)
}

// ---- probe ------------------------------------------------------------------

export interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  pix_fmt?: string
  r_frame_rate?: string
  avg_frame_rate?: string
  sample_rate?: string
  channels?: number
  duration?: string
  nb_frames?: string
  bit_rate?: string
}
export interface ProbeFormat {
  format_name?: string
  duration?: string
  size?: string
  bit_rate?: string
}
export interface ProbeResult {
  streams?: ProbeStream[]
  format?: ProbeFormat
}

export interface ProbeDeps extends SpawnDeps {
  /** Injected so the validator's own logic can be tested without a media file.
   *  Production leaves it undefined and the real ffprobe runs. */
  probe?: (path: string) => Promise<ProbeResult>
  /** Same, for the loudness meter. Returns ffmpeg's raw measurement text; the
   *  parsing is `jobs/loudness.ts`'s job and is tested directly there. */
  measureLoudnessText?: (path: string) => Promise<string>
}

export async function probeFile(
  path: string, catalog: RenderCatalogV1,
  opts: { watch?: CancelWatch; ffprobeBin?: string } = {}, deps?: ProbeDeps,
): Promise<ProbeResult> {
  if (deps?.probe) return deps.probe(path)
  if (!existsSync(path)) bad('the output file is missing', 'output_decode_failed')

  // Collected via a pipe rather than runMediaProcess's stderr tail, because this
  // is the one place the child's STDOUT is the answer rather than a side effect.
  return new Promise<ProbeResult>((resolve, reject) => {
    const child = (deps?.spawn ?? spawn)(
      opts.ffprobeBin ?? 'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let settled = false
    const killGroup = () => { try { if (child.pid) process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ } }
    const timer = setTimeout(() => { killGroup(); finish(new EditPlanError('output: ffprobe timed out', 'output_decode_failed')) },
      catalog.limits.probeTimeoutMs)
    const onAbort = () => { killGroup(); finish(new EditPlanError('output: probe cancelled', 'output_decode_failed')) }
    opts.watch?.signal.addEventListener('abort', onAbort, { once: true })
    function finish(err: Error | null, value?: ProbeResult) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.watch?.signal.removeEventListener('abort', onAbort)
      if (err) reject(err); else resolve(value!)
    }
    child.stdout?.on('data', (d: Buffer) => { out += d.toString('utf8') })
    child.on('error', (e) => finish(e))
    child.on('close', (code) => {
      if (code !== 0) return finish(new EditPlanError(`output: ffprobe failed (exit ${String(code)})`, 'output_decode_failed'))
      try { finish(null, JSON.parse(out) as ProbeResult) }
      catch { finish(new EditPlanError('output: ffprobe produced unparseable output', 'output_decode_failed')) }
    })
  })
}

/**
 * Run ffmpeg as a METER over the finished file and return its raw report.
 *
 * Piped directly rather than routed through `runMediaProcess`, for the reason
 * `probeFile` gives just above: this is a call whose OUTPUT is the answer, not
 * a side effect. `runMediaProcess` keeps an 8 KiB stderr tail expressly marked
 * "for DIAGNOSIS ONLY", and reading a measurement out of a truncating diagnostic
 * buffer would silently start returning nothing the day ffmpeg gets chattier.
 *
 * The raw text NEVER LEAVES THIS FUNCTION'S CALLER as text. Gate-0 §5 forbids
 * persisting raw stderr, and what escapes is the parsed integers — the report
 * is a channel for numbers, not something to store.
 *
 * `-vn` skips video decoding entirely: the question is about audio, and
 * decoding 1080p frames to answer it would multiply the cost of a check that
 * runs on every render.
 */
export async function measureLoudnessText(
  path: string, plan: EditPlanV1, catalog: RenderCatalogV1,
  opts: { watch?: CancelWatch; ffmpegBin?: string } = {}, deps?: ProbeDeps,
): Promise<string> {
  if (deps?.measureLoudnessText) return deps.measureLoudnessText(path)
  if (!existsSync(path)) bad('the output file is missing', 'output_decode_failed')

  // Built from the plan's own integers through the same milli-unit literal
  // helper the graph builder uses, so the meter is asked about exactly the
  // target the graph requested — not a second copy of the numbers that could
  // drift from it.
  const filter = `loudnorm=I=${milliToScalarLiteral(plan.audio.targetLufsMilli)}`
    + `:TP=${milliToScalarLiteral(plan.audio.truePeakCeilingDbtpMilli)}`
    + ':LRA=11:print_format=json'

  return new Promise<string>((resolve, reject) => {
    const child = (deps?.spawn ?? spawn)(
      opts.ffmpegBin ?? 'ffmpeg',
      ['-hide_banner', '-nostdin', '-i', path, '-vn', '-af', filter, '-f', 'null', '-'],
      { detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let err = ''
    let settled = false
    const killGroup = () => { try { if (child.pid) process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ } }
    const timer = setTimeout(
      () => { killGroup(); finish(new EditPlanError('output: the loudness meter timed out', 'output_audio_invalid')) },
      catalog.loudness.measureTimeoutMs,
    )
    const onAbort = () => { killGroup(); finish(new EditPlanError('output: loudness measurement cancelled', 'output_audio_invalid')) }
    opts.watch?.signal.addEventListener('abort', onAbort, { once: true })
    function finish(e: Error | null, value?: string) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.watch?.signal.removeEventListener('abort', onAbort)
      if (e) reject(e); else resolve(value!)
    }
    // loudnorm writes its report to stderr, mixed in with progress lines. The
    // whole stream is kept rather than a tail, because the report is emitted at
    // the END and a tail sized for diagnosis is not a contract about capacity.
    child.stderr?.on('data', (d: Buffer) => { err += d.toString('utf8') })
    child.on('error', (e) => finish(e))
    child.on('close', (code) => {
      if (code !== 0) return finish(new EditPlanError(`output: the loudness meter failed (exit ${String(code)})`, 'output_audio_invalid'))
      finish(null, err)
    })
  })
}

// ---- helpers ----------------------------------------------------------------

/**
 * Parse an ffprobe seconds string into integer milliseconds.
 *
 * Rounds rather than truncates: `"12.9995"` is 13 000 ms of video, and
 * truncating would charge a millisecond of rounding error against a ±250 ms
 * tolerance in one consistent direction, which is how a tolerance quietly
 * becomes asymmetric.
 */
export function secondsStringToMs(s: string | undefined): number | null {
  if (typeof s !== 'string' || s.trim() === '') return null
  if (!/^-?\d+(\.\d+)?$/.test(s.trim())) return null
  const v = Number(s)
  if (!Number.isFinite(v)) return null
  return Math.round(v * 1000)
}

/** `"30/1"` -> {num:30, den:1}. Returns null for `"0/0"`, which ffprobe emits
 *  for a stream whose rate it could not determine — that is unknown, not 0. */
export function parseRational(r: string | undefined): { num: number; den: number } | null {
  if (typeof r !== 'string') return null
  const m = /^(\d+)\/(\d+)$/.exec(r.trim())
  if (!m) return null
  const num = Number(m[1]); const den = Number(m[2])
  if (den === 0 || num === 0) return null
  return { num, den }
}

// ---- validation -------------------------------------------------------------

export interface OutputMeasurements {
  durationMs: number
  durationSourceField: 'video_stream' | 'format'
  width: number
  height: number
  pixelFormat: string
  videoCodec: string
  audioCodec: string
  audioSampleRateHz: number
  audioChannels: number
  fpsNum: number
  fpsDen: number
  bytes: number
}
export interface OutputValidation {
  measurements: OutputMeasurements
  durationDeltaMs: number
  toleranceMs: number
}

export function validateProbedOutput(
  probe: ProbeResult, plan: EditPlanV1, profile: OutputProfile, bytes: number,
): OutputValidation {
  const streams = Array.isArray(probe.streams) ? probe.streams : []
  const video = streams.find((s) => s.codec_type === 'video')
  const audio = streams.find((s) => s.codec_type === 'audio')

  if (!video) bad('the output has no video stream', 'output_stream_mismatch')
  if (!audio) bad('the output has no audio stream', 'output_stream_mismatch')

  // More than one of either is not "extra data we can ignore": players pick a
  // stream by rules this code does not model, so the one measured here might
  // not be the one anybody watches.
  if (streams.filter((s) => s.codec_type === 'video').length !== 1) {
    bad('the output has more than one video stream', 'output_stream_mismatch')
  }
  if (streams.filter((s) => s.codec_type === 'audio').length !== 1) {
    bad('the output has more than one audio stream', 'output_stream_mismatch')
  }

  const formatNames = (probe.format?.format_name ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (formatNames.length === 0) bad('the output declares no container format', 'output_decode_failed')
  if (!formatNames.some((n) => profile.containerFormatNames.includes(n))) {
    bad('the output container is not one the frozen profile permits', 'output_stream_mismatch')
  }

  if (!profile.probeVideoCodecNames.includes(video.codec_name ?? '')) {
    bad(`the output video codec ${JSON.stringify(video.codec_name ?? '')} is not permitted`, 'output_stream_mismatch')
  }
  if (!profile.probeAudioCodecNames.includes(audio.codec_name ?? '')) {
    bad(`the output audio codec ${JSON.stringify(audio.codec_name ?? '')} is not permitted`, 'output_audio_invalid')
  }
  if (video.width !== profile.width || video.height !== profile.height) {
    bad(`the output raster is ${String(video.width)}x${String(video.height)}, not the profile's ${profile.width}x${profile.height}`, 'output_stream_mismatch')
  }
  if ((video.pix_fmt ?? '') !== profile.pixelFormat) {
    bad(`the output pixel format is ${JSON.stringify(video.pix_fmt ?? '')}, not the profile's`, 'output_stream_mismatch')
  }

  const rate = parseRational(video.avg_frame_rate) ?? parseRational(video.r_frame_rate)
  if (!rate) bad('the output declares no usable frame rate', 'output_stream_mismatch')
  // Compared as a RATIO, not as two field equalities: 30000/1000 and 30/1 are
  // the same frame rate, and an encoder is free to express it either way.
  if (rate.num * profile.fpsDen !== profile.fpsNum * rate.den) {
    bad(`the output frame rate ${rate.num}/${rate.den} is not the profile's ${profile.fpsNum}/${profile.fpsDen}`, 'output_stream_mismatch')
  }

  const sampleRate = Number(audio.sample_rate ?? '')
  if (!Number.isFinite(sampleRate) || sampleRate !== profile.audioSampleRateHz) {
    bad(`the output sample rate is ${String(audio.sample_rate)}, not the profile's ${profile.audioSampleRateHz}`, 'output_audio_invalid')
  }
  if (audio.channels !== profile.audioChannels) {
    bad(`the output has ${String(audio.channels)} audio channels, not the profile's ${profile.audioChannels}`, 'output_audio_invalid')
  }

  // The VIDEO STREAM's own duration is preferred over the container header.
  // The header is written by the encoder under audit; the stream extent is what
  // a decoder will actually play. They normally agree, and when they do not the
  // header is the one that is wrong.
  const streamMs = secondsStringToMs(video.duration)
  const formatMs = secondsStringToMs(probe.format?.duration)
  const durationMs = streamMs ?? formatMs
  if (durationMs === null) bad('the output declares no readable duration', 'output_decode_failed')
  const durationSourceField = streamMs !== null ? 'video_stream' : 'format'

  const toleranceMs = profile.durationToleranceMs
  const durationDeltaMs = durationMs - plan.output.durationMs
  if (Math.abs(durationDeltaMs) > toleranceMs) {
    bad(
      `the output runs ${durationMs}ms but the plan promised ${plan.output.durationMs}ms ` +
      `(delta ${durationDeltaMs}ms, tolerance ±${toleranceMs}ms)`,
      'output_duration_mismatch',
    )
  }

  if (bytes <= 0) bad('the output file is empty', 'output_decode_failed')
  // An upper bound on bytes-per-millisecond catches a runaway encode; there is
  // deliberately no lower bound in bytes, because a static frame legitimately
  // compresses to almost nothing and a floor there would fail valid renders.
  if (plan.output.durationMs > 0 && bytes > plan.output.durationMs * profile.maxOutputBytesPerOutputMs) {
    bad('the output is implausibly large for its duration', 'output_stream_mismatch')
  }

  return {
    measurements: {
      durationMs, durationSourceField,
      width: video.width!, height: video.height!,
      pixelFormat: video.pix_fmt!,
      videoCodec: video.codec_name!, audioCodec: audio.codec_name!,
      audioSampleRateHz: sampleRate, audioChannels: audio.channels!,
      fpsNum: rate.num, fpsDen: rate.den,
      bytes,
    },
    durationDeltaMs,
    toleranceMs,
  }
}

/**
 * Every caption cue must lie inside the video that was produced.
 *
 * A cue past the end is not a cosmetic problem: it means the caption timeline
 * and the video timeline were computed from different maps, and the ones that
 * ARE inside the video are therefore also suspect. The check is on the measured
 * output rather than on `plan.output.durationMs`, so it can catch the case
 * where the plan is self-consistent and the render is not.
 */
export function validateCaptionsAgainstOutput(plan: EditPlanV1, measuredDurationMs: number): void {
  const toleranceMs = 0
  for (const cue of plan.captions.cues) {
    if (cue.outputStartMs < 0) bad(`caption cue ${cue.index} starts before the output does`, 'output_caption_invalid')
    if (cue.outputEndMs <= cue.outputStartMs) bad(`caption cue ${cue.index} does not advance`, 'output_caption_invalid')
    if (cue.outputEndMs > measuredDurationMs + toleranceMs) {
      bad(`caption cue ${cue.index} ends after the video does`, 'output_caption_invalid')
    }
  }
}

export interface CoverValidation { bytes: number }

export function validateCoverFile(coverPath: string, catalog: RenderCatalogV1): CoverValidation {
  if (!existsSync(coverPath)) bad('the cover file is missing', 'output_cover_invalid')
  const bytes = statSync(coverPath).size
  if (bytes < catalog.cover.minBytes) bad('the cover is implausibly small', 'output_cover_invalid')
  if (bytes > catalog.cover.maxBytes) bad('the cover is larger than the frozen maximum', 'output_cover_invalid')
  return { bytes }
}

export interface ValidateOutputRequest {
  outputPath: string
  coverPath: string | null
  plan: EditPlanV1
  watch?: CancelWatch
  ffprobeBin?: string
  ffmpegBin?: string
}

export async function validateRenderedOutput(
  req: ValidateOutputRequest, deps?: ProbeDeps,
): Promise<OutputValidation & { cover: CoverValidation | null; loudness: LoudnessVerdict }> {
  const catalog = loadRenderCatalog()
  const profile = catalog.outputProfiles[req.plan.output.profileId]
  if (!profile) bad('the plan names an output profile that is not in the frozen catalog', 'render_output_profile_invalid')

  if (!existsSync(req.outputPath)) bad('the output file is missing', 'output_decode_failed')
  const bytes = statSync(req.outputPath).size
  const probe = await probeFile(req.outputPath, catalog, { watch: req.watch, ffprobeBin: req.ffprobeBin }, deps)
  const result = validateProbedOutput(probe, req.plan, profile, bytes)
  validateCaptionsAgainstOutput(req.plan, result.measurements.durationMs)

  // The structural checks above pass on a file whose audio is silence, or is
  // clipping, or is 20 LU from where it was asked to be — every one of those
  // has correct codecs, raster and duration. This is the check that decodes.
  const text = await measureLoudnessText(
    req.outputPath, req.plan, catalog, { watch: req.watch, ffmpegBin: req.ffmpegBin }, deps,
  )
  const measurement = parseLoudnormJson(text)
  if (!measurement) bad('the loudness meter produced no readable measurement', 'output_audio_invalid')
  const loudness = checkLoudness(measurement, req.plan.audio, catalog.loudness)

  const cover = req.coverPath ? validateCoverFile(req.coverPath, catalog) : null
  return { ...result, cover, loudness }
}

// Re-exported so a caller validating an output does not have to know that the
// process runner lives in the render module.
export { runMediaProcess }
