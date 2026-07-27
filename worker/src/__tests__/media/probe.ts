// Decoding helpers. Everything the harness asserts comes from here: ffprobe JSON,
// decoded RGB frames, and decoded PCM. Nothing in the harness may assert from argv
// or from a container header.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Run ffmpeg and return its DIAGNOSTIC OUTPUT, or throw.
 *
 * THREE RULES, ENFORCED IN ONE PLACE. Each exists because breaking it produced a
 * measurement that looked real:
 *
 *  1. READ STDERR. ffmpeg writes `-stats`, `ebur128` and every other
 *     progress/measurement line to stderr, never stdout, and `execFileSync`
 *     returns stdout. Conflating them made `fullDecodeFrameCount` always return 0
 *     and `measureLufs` always return NaN.
 *
 *  2. THE PROCESS MUST HAVE SUCCEEDED. Checking only that the output PARSES is
 *     not enough: a TRUNCATED file decodes some frames, prints `frame=` lines and
 *     an `I: … LUFS` summary, and THEN exits non-zero. Parsing that output would
 *     report a partial decode as a complete one — a corrupt render passing as
 *     valid evidence, which is the exact failure this harness exists to prevent.
 *     So a non-zero status, a terminating signal, or a spawn error is fatal
 *     BEFORE anything is parsed.
 *
 *  3. FAIL, DON'T DEGRADE. A probe that returns 0 frames or NaN LUFS when it
 *     could not measure is indistinguishable from a real measurement of zero.
 *     Callers throw rather than return a sentinel.
 */
function ffmpegStderr(args: string[]): string {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const tail = (r.stderr ?? '').slice(-2000)
  if (r.error) throw new Error(`ffmpeg could not be executed: ${r.error.message}`)
  if (r.signal !== null && r.signal !== undefined) {
    throw new Error(`ffmpeg was killed by ${String(r.signal)}; its output is not a measurement:\n${tail}`)
  }
  if (r.status !== 0) {
    throw new Error(
      `ffmpeg exited ${String(r.status)} for: ffmpeg ${args.join(' ')}\n`
      + `A non-zero exit means the decode did not complete. Any frame count or loudness `
      + `figure in its output describes a PARTIAL decode and must not be read as evidence.\n${tail}`,
    )
  }
  const err = r.stderr ?? ''
  if (err.trim() === '') {
    throw new Error(`ffmpeg produced no diagnostic output for: ffmpeg ${args.join(' ')}`)
  }
  return err
}

export function ffprobeJson(path: string): Record<string, unknown> {
  const out = execFileSync('ffprobe', [
    '-hide_banner', '-loglevel', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', path,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(out) as Record<string, unknown>
}

/**
 * FULL DECODE. Returns the number of frames actually decoded. `-f null -` forces
 * every frame through the decoder, so a truncated or corrupt output fails here
 * rather than passing a header-only check.
 */
export function fullDecodeFrameCount(path: string): number {
  const err = ffmpegStderr([
    '-hide_banner', '-nostdin', '-v', 'error', '-stats',
    '-i', path, '-f', 'null', '-',
  ])
  const m = [...err.matchAll(/frame=\s*(\d+)/g)].pop()
  // No `frame=` line means the decode did not report progress, which is NOT the
  // same as decoding zero frames. Returning 0 here would report a probe failure
  // as a render failure.
  if (!m) throw new Error(`could not read a frame count from ffmpeg's stats output:\n${err.slice(-2000)}`)
  return Number(m[1])
}

/** One decoded frame at an exact output time, as raw RGB24 bytes. */
export function frameRgb(path: string, atMs: number, w = 108, h = 192): Buffer {
  const tmp = join(process.env.MEDIA_TMP ?? '/tmp', `f_${atMs}_${process.pid}.rawvideo`)
  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-loglevel', 'error',
    '-ss', (atMs / 1000).toFixed(3), '-i', path,
    '-frames:v', '1', '-vf', `scale=${w}:${h}`,
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', tmp, '-y',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const buf = readFileSync(tmp)
  // Same rule as ffmpegStderr(2): a SHORT frame is not a frame. execFileSync
  // already throws on a non-zero exit, but a partial write with a zero exit would
  // otherwise flow into frameDiff (which returns Infinity on a size mismatch) or
  // readClockMs (which returns null) and read as a picture-content finding.
  if (buf.length !== w * h * 3) {
    throw new Error(
      `decoded frame at ${atMs}ms is ${buf.length} bytes, expected ${w * h * 3} `
      + `(${w}x${h} rgb24) — a partial decode is not a frame`,
    )
  }
  return buf
}

export const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

/** Mean absolute per-byte difference between two same-size frames, 0..255. */
export function frameDiff(a: Buffer, b: Buffer): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY
  let acc = 0
  for (let i = 0; i < a.length; i++) acc += Math.abs(a[i] - b[i])
  return acc / a.length
}

/** Mean absolute difference over a rectangular region of an RGB24 frame. */
export function regionDiff(
  a: Buffer, b: Buffer, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number,
): number {
  let acc = 0
  let n = 0
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const i = (y * w + x) * 3
      acc += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      n += 3
    }
  }
  return n === 0 ? 0 : acc / n
}

/** Mean luma of an RGB24 frame — used to prove a cover is not black. */
export function meanLuma(f: Buffer): number {
  let acc = 0
  for (let i = 0; i + 2 < f.length; i += 3) acc += 0.299 * f[i] + 0.587 * f[i + 1] + 0.114 * f[i + 2]
  return acc / (f.length / 3)
}

/**
 * Read the fixture's binary visual clock out of a DECODED frame, and return the
 * SOURCE time in milliseconds that the frame's pixels were drawn at.
 *
 * The frame must be decoded at 540x960 — half of the 1080x1920 output, which is
 * exactly the source raster, so clock coordinates need no conversion. Each bit is
 * a 40x80 solid block; a small patch at its centre is averaged so a single noisy
 * pixel cannot flip a bit.
 *
 * Returns null when the clock is unreadable (a bit that is neither clearly on nor
 * clearly off). That is a real answer, not a failure to try: a frame whose clock
 * cannot be read must not be attributed to a source time.
 */
export function readClockMs(
  frame: Buffer, w: number, h: number,
  bits: number, tickMs: number, centreY: number, centreX: (b: number) => number,
): number | null {
  if (frame.length < w * h * 3) return null
  let value = 0
  for (let b = 0; b < bits; b++) {
    const cx = Math.round(centreX(b))
    let acc = 0
    let n = 0
    for (let y = centreY - 8; y <= centreY + 8; y++) {
      for (let x = cx - 8; x <= cx + 8; x++) {
        if (x < 0 || x >= w || y < 0 || y >= h) continue
        const i = (y * w + x) * 3
        acc += (frame[i] + frame[i + 1] + frame[i + 2]) / 3
        n++
      }
    }
    if (n === 0) return null
    const mean = acc / n
    // The block is either white (~235+) or the #101018 background (~16). Anything
    // in between means the clock was scaled, overdrawn or blurred, and the read is
    // refused rather than guessed.
    if (mean > 170) value |= 1 << b
    else if (mean > 60) return null
  }
  return value * tickMs
}

/** Decoded PCM (s16le mono) for amplitude/duration checks. */
export function decodePcm(path: string): Int16Array {
  const tmp = join(process.env.MEDIA_TMP ?? '/tmp', `a_${process.pid}.pcm`)
  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-loglevel', 'error',
    '-i', path, '-vn', '-ac', '1', '-ar', '48000',
    '-f', 's16le', tmp, '-y',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const b = readFileSync(tmp)
  if (b.length < 2) throw new Error(`decoded PCM for ${path} is empty; that is not a measurement`)
  return new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2))
}

/** Integrated loudness (LUFS) measured by ffmpeg's own ebur128. */
export function measureLufs(path: string): number {
  const err = ffmpegStderr([
    '-hide_banner', '-nostdin', '-i', path,
    '-af', 'ebur128=framelog=verbose', '-f', 'null', '-',
  ])
  const hits = [...err.matchAll(/I:\s*(-?[\d.]+)\s*LUFS/g)]
  // NaN would propagate into `Math.abs(lufs - target)` and read as an
  // out-of-tolerance measurement rather than as "nothing was measured".
  if (hits.length === 0) {
    throw new Error(`ebur128 reported no integrated loudness for ${path}:\n${err.slice(-2000)}`)
  }
  const v = Number(hits[hits.length - 1][1])
  if (!Number.isFinite(v)) throw new Error(`ebur128 integrated loudness is not finite: ${hits[hits.length - 1][1]}`)
  return v
}
