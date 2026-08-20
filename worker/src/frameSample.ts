// THE FRAMES THE MODEL IS ALLOWED TO NUMBER.
//
// ⚠️ THE SAMPLE IS THE COORDINATE SYSTEM, NOT A CONVENIENCE. `visualExtraction`
// range-checks every citation against `framesSampled` and rejects anything
// outside 1..N, because "frame 9" of a four-frame sample is the model describing
// a video it was never shown. That check is only as good as the guarantee that
// the frames handed over really are 1..N in time order, with no gaps — so this
// file's job is less "get some stills" than "produce a numbering that means
// something".
//
// ⚠️ UNIFORM SPACING IS THE FALLBACK, NOT THE PLAN. `frameSampleTargets` in
// referenceProfileTypes.ts already answers "where should the visual pass look?"
// from the content pass's beats — the hook, the rehook, the payoff — and it is
// the reader that justifies storing `Beat.startSec` at all. Sampling five
// arbitrary percentages when those timestamps exist would strand that field and
// buy worse frames. So `sampleFrames` takes an explicit schedule when one is
// available and computes a uniform one only when it is not, which is exactly the
// case `frameSampleTargets` documents when it returns nothing.
//
// ⚖️ EVENLY SPACED ACROSS THE CLIP, INTERIOR ONLY. The first and last frames of a
// short-form video are disproportionately a title card and an end card, and a
// sample dominated by those answers questions about the packaging rather than
// the video. Sampling at (i + 0.5)/N of the duration puts every frame inside the
// content and keeps the spacing uniform, which is what a `temporal` claim
// citing [1, 4] is implicitly relying on.
//
// ⚠️ A SHORT COUNT IS REPORTED, NEVER PADDED. If ffmpeg yields three frames when
// four were asked for, the caller must be told three — passing 4 to
// `extractVisualProfile` would make citation [4] legal against a frame that does
// not exist, which is precisely the hallucination the range check exists to
// catch. Padding by repeating a frame would be worse: it would make a static
// pair look like a temporal one.

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InlineImage } from './gemini.js'

/** How many stills a reference is worth. Four is the smallest sample that can
 *  support a `temporal` claim at both ends of a clip while staying cheap enough
 *  to run over thousands of videos; the number is a knob, not a constant of
 *  nature, and the pilot (#58) is what should move it. */
export const DEFAULT_FRAME_COUNT = 4

/** Longest edge handed to the vision model. Bigger costs tokens and buys
 *  nothing: none of the VISUAL_FIELDS turn on fine detail — they turn on how
 *  many people, what setting, whether hands hold a product. */
export const FRAME_MAX_EDGE = 512

export interface FrameSample {
  /** Frames in time order. Index i is what the model must call frame i+1. */
  frames: readonly InlineImage[]
  /** ⚠️ THE NUMBER THE RANGE CHECK USES — `frames.length`, always. Carried
   *  explicitly so a caller cannot pass a requested count by accident. */
  framesSampled: number
  /** Where in the clip each frame came from, seconds. Kept for the pilot: a
   *  sample that clusters is a sample whose temporal claims are weaker than
   *  their citations suggest. */
  atSeconds: readonly number[]
  scheduleBasis: ScheduleBasis
}

/** ⚠️ WHERE THE TIMESTAMPS CAME FROM, recorded because the two are not equally
 *  good evidence. Frames taken at the hook/rehook/payoff support a claim about
 *  the video's shape better than four arbitrary points do, and the pilot (#58)
 *  cannot compare them if the row does not say which it got. */
export const SCHEDULE_BASES = ['content_beats', 'uniform'] as const
export type ScheduleBasis = (typeof SCHEDULE_BASES)[number]

const EMPTY: FrameSample = { frames: [], framesSampled: 0, atSeconds: [], scheduleBasis: 'uniform' }

function runCmd(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${cmd} timed out after ${timeoutMs}ms`)) }, timeoutMs)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`))
    })
  })
}

/** Clip duration in seconds, or 0 when ffprobe cannot say.
 *
 *  ⚖️ 0 IS "UNKNOWN", AND THE CALLER TREATS IT AS A REFUSAL. Guessing a duration
 *  would produce seek targets past the end of the file, and ffmpeg answers those
 *  with silence rather than an error — a sample that is short for a reason
 *  nobody records. */
export async function probeDurationSec(videoPath: string): Promise<number> {
  try {
    const out = await runCmd('ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath], 30_000)
    const n = Number(String(out).trim())
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch { return 0 }
}

/**
 * The sampling schedule, separated from the I/O so it can be argued with in a
 * test rather than inferred from ffmpeg output.
 *
 * ⚠️ INTERIOR MIDPOINTS: (i + 0.5)/n of the duration. For n=4 over a 20s clip
 * that is 2.5s, 7.5s, 12.5s, 17.5s — never 0s (title card) and never the final
 * frame (end card), and uniformly spaced so "frames 1 and 4" genuinely spans the
 * clip.
 */
export function frameSchedule(durationSec: number, count: number): number[] {
  const n = Math.max(0, Math.trunc(count))
  if (!(durationSec > 0) || n === 0) return []
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) / n) * durationSec * 1000) / 1000)
}

/**
 * Sample `count` stills from a local video file.
 *
 * ⚠️ NEVER THROWS FOR A THIN SAMPLE. A reference that yields two frames is a
 * reference the visual pass can still say something modest about; a reference
 * that yields none returns the empty sample, and `extractVisualProfile` refuses
 * to read the response at all rather than accepting caption-derived guesses.
 * Both are outcomes, not errors — which is why the count travels with the
 * frames instead of being assumed by the caller.
 */
export async function sampleFrames(
  videoPath: string,
  opts: { count?: number; maxEdge?: number; at?: readonly number[] } = {},
): Promise<FrameSample> {
  const count = Math.max(1, Math.trunc(opts.count ?? DEFAULT_FRAME_COUNT))
  const maxEdge = Math.max(64, Math.trunc(opts.maxEdge ?? FRAME_MAX_EDGE))
  const duration = await probeDurationSec(videoPath)
  // ⚠️ THE CONTENT PASS'S BEATS WIN WHEN IT HAS THEM. `frameSampleTargets`
  // returns [] rather than a fabricated schedule when the beats are
  // `not_checked`/`indeterminate` or the source had no clock, and this is the
  // caller it describes as "doing its own uniform sampling KNOWING that is what
  // it is doing" — the knowing part being `scheduleBasis` on the result.
  const requested = (opts.at ?? []).filter((t) => Number.isFinite(t) && t >= 0)
  // ⚖️ CLAMPED INSIDE THE CLIP, AND STILL IN ORDER. A beat timestamp past the end
  // makes ffmpeg emit nothing and say nothing, which would silently thin the
  // sample; a beat list out of order would break the "frame 1 is earliest"
  // guarantee the whole citation scheme rests on.
  const beats = [...new Set(requested.filter((t) => t < duration))].sort((a, b) => a - b)
  const scheduleBasis: ScheduleBasis = beats.length > 0 ? 'content_beats' : 'uniform'
  const schedule = beats.length > 0 ? beats.slice(0, count) : frameSchedule(duration, count)
  if (schedule.length === 0) return EMPTY

  const dir = await mkdtemp(join(tmpdir(), 'twinai-frames-'))
  try {
    const frames: InlineImage[] = []
    const atSeconds: number[] = []
    for (const [i, at] of schedule.entries()) {
      const out = join(dir, `f${i}.jpg`)
      try {
        // ⚖️ `-ss` BEFORE `-i` — an input seek, which jumps by keyframe instead
        // of decoding from zero. Over thousands of references the difference is
        // the whole cost of the pass; the accuracy it trades away is a fraction
        // of a second, and nothing here is asking a question that fine.
        await runCmd('ffmpeg',
          ['-y', '-ss', String(at), '-i', videoPath, '-frames:v', '1',
           '-vf', `scale='min(${maxEdge},iw)':-2`, '-q:v', '4', out], 60_000)
      } catch { continue }
      let bytes: Buffer
      try {
        if ((await stat(out)).size === 0) continue
        bytes = await readFile(out)
      } catch { continue }
      frames.push({ mimeType: 'image/jpeg', data: bytes.toString('base64') })
      atSeconds.push(at)
    }
    // ⚠️ `framesSampled` IS WHAT LANDED. See the header: reporting the request
    // instead of the result would legalise a citation to a frame nobody sent.
    return { frames, framesSampled: frames.length, atSeconds, scheduleBasis }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Present in the build? Used by the capability probe, so a container that
 *  cannot sample frames says so on startup instead of on the first reference. */
export async function ffmpegPresent(): Promise<boolean> {
  try { await runCmd('ffmpeg', ['-version'], 10_000); return true } catch { return false }
}
