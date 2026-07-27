// REAL FFmpeg 5.1 media harness — Track A's final pre-review item.
//
// This suite is NOT part of `npm test`. It is invoked explicitly (`npm run
// test:media`), runs inside the EXACT production worker image, and FAILS CLOSED
// unless the runtime ffmpeg is the pinned 5.1 major. That refusal is itself
// verified: on a developer machine carrying 6.1 the identity test below fails on
// purpose, and CI runs the same suite off-pin and requires it to fail.
//
// TWO RULES GOVERN EVERY ASSERTION HERE:
//   1. Evidence is DECODED — ffprobe JSON, decoded RGB frames, decoded PCM. No
//      claim is made from argv, from a filter string, or from a container header.
//      Three defects justify the rule, and all three had perfectly correct argv:
//        * `crop` with `between(t,…)` — evaluated once at init, silent no-op;
//        * `zoompan` with `t` — no such variable, filter config FAILS, nothing
//          renders at all;
//        * `drawbox` with `x='8*t'` — evaluated once at init with t=NaN, the box
//          is never drawn.
//      Every one of them passed offline inspection and failed real execution.
//   2. The PRODUCTION graph and argv are executed. buildFfmpegGraph /
//      buildFfmpegArgs are imported from the same modules the worker uses. There
//      is no test renderer, and no filter string is written in this file.
import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileEditPlan } from '../../jobs/editorCompile.js'
import { buildFfmpegGraph, buildFfmpegArgs, ffmpegGraphSha256 } from '../../jobs/ffmpegGraph.js'
import { buildAssCaptions } from '../../jobs/assCaptions.js'
import { canonicalEditPlan, validateEditPlan, type EditPlanV1 } from '../../jobs/editPlanContract.js'
import {
  EDITOR_FFMPEG_MAJOR, EDITOR_FFMPEG_MINOR, isPinnedFfmpeg, parseFfmpegVersion,
} from '../../jobs/ffmpegIdentity.js'
import { baseInput, policy } from '../fixtures/editPlanFixture.js'
import {
  buildFixtures, type Fixture,
  SRC_W, SRC_H, CLOCK_BITS, CLOCK_TICK_MS, CLOCK_CENTRE_Y, clockBitCentreX,
} from './fixtures.js'
import {
  ffprobeJson, fullDecodeFrameCount, frameRgb, frameDiff, regionDiff, meanLuma,
  decodePcm, measureLufs, readClockMs, sha,
} from './probe.js'

/** Cheap raster for whole-frame comparisons. */
const W = 108
const H = 192
/** The caption font the image declares. libass resolves it by NAME via fontconfig. */
const CAPTION_FONT = 'DejaVu Sans'
const banner = (): string =>
  execFileSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' }).split('\n')[0]

let work = ''
let fixtures: Record<string, Fixture> = {}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'media-'))
  process.env.MEDIA_TMP = work
})

// ---------------------------------------------------------------- (9) identity
describe('runtime identity — fail closed off the pin', () => {
  it(`executes under the pinned ffmpeg ${EDITOR_FFMPEG_MAJOR}.${EDITOR_FFMPEG_MINOR}`, () => {
    const b = banner()
    const v = parseFfmpegVersion(b)
    // Reported, not just asserted: the run's own log must carry what it ran on.
    console.log(`[media] runtime ffmpeg: ${b}`)
    console.log(`[media] image source SHA: ${process.env.WORKER_IMAGE_SHA ?? '<not set — not an image run>'}`)
    console.log(`[media] image id: ${process.env.WORKER_IMAGE_ID ?? '<unset>'}`)
    expect(v, `unparseable ffmpeg banner: ${b}`).not.toBeNull()
    expect(
      isPinnedFfmpeg(b),
      `REFUSED: this harness produces GOLDEN evidence and may only run on ffmpeg `
      + `${EDITOR_FFMPEG_MAJOR}.${EDITOR_FFMPEG_MINOR}. Got: ${b}. Frames proven under a `
      + `different major are not evidence for production. Run it in the worker image.`,
    ).toBe(true)
  })

  it('the harness knows which image it is in', () => {
    // Set by the CI job from the built image. Absent locally, which is why local
    // runs can never be mistaken for acceptance evidence.
    expect(process.env.WORKER_IMAGE_SHA ?? '').toMatch(/^[0-9a-f]{40}$/)
  })

  it(`the caption font "${CAPTION_FONT}" resolves through fontconfig`, () => {
    // Without this the caption case below fails for the WRONG reason: libass with
    // no resolvable font draws nothing, so "no caption pixels" would look like a
    // caption-placement defect instead of a missing image dependency. The image
    // declares the font (worker/Dockerfile); this proves the declaration held.
    const m = execFileSync('fc-match', [CAPTION_FONT], { encoding: 'utf8' }).trim()
    console.log(`[media] fc-match ${CAPTION_FONT} -> ${m}`)
    expect(m.toLowerCase(), `fontconfig cannot resolve ${CAPTION_FONT}: ${m}`).toContain('dejavu')
  })
})

// ------------------------------------------------- probe execution, hostile
//
// DELIBERATELY NOT GATED ON THE PIN. Everything below this block requires 5.1
// because it reasons about rendered pixels; this block reasons about whether a
// PROBE CAN TELL IT FAILED, which is version-independent — so it runs on any
// ffmpeg, including a developer's, and is verified before a candidate is pushed.
//
// TWO DISTINCT FAILURE SHAPES, AND ONLY ONE OF THEM IS AN EXIT CODE. Both are
// reproduced here against the real helpers, because assuming either would be
// wrong:
//
//  A. THE PROCESS FAILS. Unreadable bytes, a missing file, or a truncation that
//     removes a trailing `moov` atom: ffmpeg cannot open the input, exits
//     non-zero, and may still print something parseable. The probes must refuse
//     BEFORE parsing — checking only "did the output parse?" is what lets a
//     partial run masquerade as a measurement.
//
//  B. THE PROCESS SUCCEEDS AND UNDER-REPORTS. This one is worse, and it is
//     specific to the profile this editor actually emits. The frozen output
//     profile sets `-movflags +faststart`, so the index sits at the FRONT of the
//     file. Truncate such a file and ffmpeg opens it happily, decodes as far as
//     the bytes go, treats the cut as end-of-stream, prints a plausible
//     `I: -21.8 LUFS`, and EXITS 0. Measured here: a 55%-truncated 180-frame
//     file decodes 91 frames with status 0.
//
//     No exit-status check can catch that, and this block does not pretend
//     otherwise. What catches it is the render case's own frame-count bound
//     (`frames > expected * 0.9`), so that bound is not a formality — it is the
//     only thing standing between a half-written render and a green suite. The
//     control below proves it rejects exactly this file.
describe('probe execution — a failed or partial ffmpeg run can never become a measurement', () => {
  let hostileDir = ''
  let good = ''
  let truncatedIndexed = ''   // +faststart: opens fine, decodes short, exits 0
  let truncatedTrailing = ''  // no faststart: index lost, cannot be opened
  let garbage = ''
  const GOOD_FRAMES = 180     // 6 s at 30 fps

  beforeAll(() => {
    hostileDir = mkdtempSync(join(tmpdir(), 'hostile-'))
    good = join(hostileDir, 'good.mp4')
    truncatedIndexed = join(hostileDir, 'truncated-faststart.mp4')
    truncatedTrailing = join(hostileDir, 'truncated-trailing-index.mp4')
    garbage = join(hostileDir, 'garbage.mp4')
    // Small, quick, and independent of the render fixtures: this block must be
    // able to run before anything else in the file has succeeded.
    const make = (out: string, faststart: boolean): void => {
      execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-f', 'lavfi', '-i', 'testsrc=s=320x240:r=30:d=6',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30',
        '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-t', '6',
        ...(faststart ? ['-movflags', '+faststart'] : []),
        out, '-y',
      ], { stdio: ['ignore', 'ignore', 'pipe'] })
    }
    // `good` carries +faststart because the production output profile does.
    make(good, true)
    const trailing = join(hostileDir, 'trailing.mp4')
    make(trailing, false)
    const cut = (src: string, dst: string): void => {
      const b = readFileSync(src)
      writeFileSync(dst, b.subarray(0, Math.floor(b.length * 0.55)))
    }
    cut(good, truncatedIndexed)
    cut(trailing, truncatedTrailing)
    writeFileSync(garbage, Buffer.alloc(4096, 0x41))
  })

  it('BASELINE: on a complete file the helpers return real measurements', () => {
    // Without this the hostile cases below could all be passing because the
    // helpers throw on everything.
    expect(fullDecodeFrameCount(good)).toBeGreaterThan(GOOD_FRAMES * 0.9)
    expect(Number.isFinite(measureLufs(good))).toBe(true)
    expect(decodePcm(good).length).toBeGreaterThan(48000)
    expect(frameRgb(good, 2000, 64, 48).length).toBe(64 * 48 * 3)
  })

  // ---- shape A: the process fails -----------------------------------------
  it('A: a truncation that destroys the index must THROW, citing the exit', () => {
    let threw: Error | null = null
    try { fullDecodeFrameCount(truncatedTrailing) } catch (e) { threw = e as Error }
    expect(threw, 'a failed decode was reported as a frame count').not.toBeNull()
    // The message must come from the STATUS check, not from "I could not find a
    // frame= line". Those are different failures and only one of them is honest
    // about what happened; before the status check existed, this threw the other.
    expect(threw!.message).toMatch(/exited|killed/i)
    expect(threw!.message).not.toMatch(/^could not read a frame count/)
    expect(() => measureLufs(truncatedTrailing)).toThrow(/exited|killed/i)
  })

  it('A: unreadable bytes must THROW from every helper', () => {
    expect(() => fullDecodeFrameCount(garbage)).toThrow()
    expect(() => measureLufs(garbage)).toThrow()
    expect(() => decodePcm(garbage)).toThrow()
    expect(() => frameRgb(garbage, 0, 64, 48)).toThrow()
    expect(() => ffprobeJson(garbage)).toThrow()
  })

  it('A: a missing file must THROW from every helper', () => {
    const gone = join(hostileDir, 'does-not-exist.mp4')
    expect(() => fullDecodeFrameCount(gone)).toThrow()
    expect(() => measureLufs(gone)).toThrow()
    expect(() => decodePcm(gone)).toThrow()
    expect(() => frameRgb(gone, 0, 64, 48)).toThrow()
    expect(() => ffprobeJson(gone)).toThrow()
  })

  // ---- shape B: the process succeeds and under-reports ----------------------
  it('B: a truncated +faststart file EXITS 0 — so the exit code proves nothing here', () => {
    // Stated as a property of ffmpeg, verified rather than assumed. If a future
    // version started failing on this input, this test turns red and the comment
    // above stops being a lie.
    const frames = fullDecodeFrameCount(truncatedIndexed)   // must NOT throw
    expect(Number.isFinite(measureLufs(truncatedIndexed))).toBe(true)
    expect(frames).toBeGreaterThan(0)
    expect(frames, 'the truncated file decoded in full; the fixture is not truncated')
      .toBeLessThan(GOOD_FRAMES * 0.9)
  })

  it('B: the frame-count bound is what rejects it, and it does', () => {
    // THE control on the threshold. `frames > expected * 0.9` is the render
    // case's bound; applying it to a genuinely half-written file must reject.
    const frames = fullDecodeFrameCount(truncatedIndexed)
    const passesTheRenderBound = frames > GOOD_FRAMES * 0.9
    expect(passesTheRenderBound, `a truncated render decoded ${frames}/${GOOD_FRAMES} frames `
      + 'and would have passed the render suite; the bound is too loose').toBe(false)
    // And the same bound must ACCEPT the complete file, or it rejects everything
    // and proves nothing.
    expect(fullDecodeFrameCount(good) > GOOD_FRAMES * 0.9).toBe(true)
  })

  it('a frame decoded at the wrong size is refused rather than compared', () => {
    // frameDiff returns Infinity on a size mismatch and readClockMs returns null,
    // so a short buffer would surface as a PICTURE finding instead of a decode
    // failure. The size is checked at the source instead.
    expect(frameRgb(good, 1000, 64, 48).length).toBe(64 * 48 * 3)
  })
})

// Everything below requires the pin. Vitest runs the file top-to-bottom; the gate
// above fails first off-pin, and these are then skipped rather than silently
// "passing" — a skipped render is visibly not evidence, a green one would lie.
const pinned = (): boolean => {
  try { return isPinnedFfmpeg(banner()) } catch { return false }
}

interface Rendered {
  plan: EditPlanV1
  out: string
  /** argv as executed, including this run's own temp paths. */
  argv: string[]
  /**
   * The graph SHA and argv with the ASSET PATHS HELD FIXED.
   *
   * The executed graph necessarily names this run's temp files, so its SHA
   * differs between two runs of the SAME plan for a reason that has nothing to do
   * with determinism. Comparing the executed SHA was a test defect, not a finding:
   * it fails on any correct renderer. Determinism is about the plan-to-graph
   * mapping, so the comparison holds the paths constant and varies only the plan.
   */
  canonicalGraphSha: string
  canonicalArgv: string[]
}

const CANON_ASSETS = {
  sourcePath: '/var/tmp/media/source.mp4',
  assPath: '/var/tmp/media/captions.ass',
  outputPath: '/var/tmp/media/out.mp4',
}

/** Read the fixture's binary clock from an output frame -> SOURCE time in ms. */
function clockAt(path: string, outputMs: number): number | null {
  const f = frameRgb(path, outputMs, SRC_W, SRC_H)
  return readClockMs(f, SRC_W, SRC_H, CLOCK_BITS, CLOCK_TICK_MS, CLOCK_CENTRE_Y, clockBitCentreX)
}

/**
 * Compile a plan for a fixture and render it with the PRODUCTION graph.
 * `mutate` lets a control deliberately break one property; the render still goes
 * through the same builder, so a mutation cannot accidentally take a shortcut.
 */
function renderOnce(
  fx: Fixture, tag: string,
  mutate: (p: EditPlanV1) => EditPlanV1 = (p) => p,
  opts: { captions?: boolean } = {},
): Rendered {
  const input = baseInput()
  // Origin decides the window contract: a teleprompter take carries accepted
  // capture windows, an upload carries none and the whole file is eligible.
  input.source = fx.kind === 'teleprompter'
    ? { ...input.source, origin: 'teleprompter' }
    : { ...input.source, origin: 'upload', acceptedWindows: [] }
  let plan = compileEditPlan({ ...input, policy: policy() }).plan
  if (opts.captions === false) {
    const stripped = JSON.parse(canonicalEditPlan(plan)) as EditPlanV1
    stripped.captions.cues = []
    stripped.complexity.cueCount = 0
    plan = validateEditPlan(stripped)
  }
  plan = mutate(plan)

  let assPath: string | null = null
  if (plan.captions.cues.length > 0) {
    assPath = join(work, `${tag}.ass`)
    writeFileSync(assPath, buildAssCaptions(plan, { fontName: CAPTION_FONT }).document)
  }
  const out = join(work, `${tag}.mp4`)
  const graph = buildFfmpegGraph(plan, {
    sourcePath: fx.path, assPath, fontsDir: null, outputPath: out,
  })
  const argv = buildFfmpegArgs(graph)
  execFileSync('ffmpeg', argv, { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 })

  // The same plan, built against FIXED asset paths — the determinism comparison.
  const canonGraph = buildFfmpegGraph(plan, {
    sourcePath: CANON_ASSETS.sourcePath,
    assPath: assPath === null ? null : CANON_ASSETS.assPath,
    fontsDir: null,
    outputPath: CANON_ASSETS.outputPath,
  })
  return {
    plan, out, argv,
    canonicalGraphSha: ffmpegGraphSha256(canonGraph),
    canonicalArgv: buildFfmpegArgs(canonGraph),
  }
}

// Renders are the expensive part (a 40 s 1080x1920 encode each), so a render is
// reused across the cases that need the SAME bytes. Keyed by tag: a case that
// needs an independent execution asks for a different tag and gets one, which is
// how the determinism case still compares two real runs.
const renders = new Map<string, Rendered>()
function render(
  fx: Fixture, tag: string,
  mutate?: (p: EditPlanV1) => EditPlanV1,
  opts?: { captions?: boolean },
): Rendered {
  const hit = renders.get(tag)
  if (hit) return hit
  const r = renderOnce(fx, tag, mutate, opts)
  renders.set(tag, r)
  return r
}
const base = (kind: string): Rendered => render(fixtures[kind], `base-${kind}`)

describe.runIf(pinned())('real renders from both fixtures', () => {
  beforeAll(() => { fixtures = buildFixtures(join(work, 'in')) })

  // ------------------------------------------------------------ (3) container
  it.each(['teleprompter', 'upload'])('%s: ffprobe proves the frozen output profile', (kind) => {
    const r = base(kind)
    const p = ffprobeJson(r.out) as { streams: Array<Record<string, unknown>>; format: Record<string, unknown> }
    const v = p.streams.find((s) => s.codec_type === 'video') as Record<string, unknown>
    const a = p.streams.find((s) => s.codec_type === 'audio') as Record<string, unknown>
    expect(p.streams).toHaveLength(2)               // no unexpected streams
    expect(String(p.format.format_name)).toMatch(/mp4/)
    expect(v.codec_name).toBe('h264')
    expect(v.pix_fmt).toBe('yuv420p')
    expect(v.width).toBe(r.plan.output.width)
    expect(v.height).toBe(r.plan.output.height)
    expect(v.r_frame_rate).toBe(`${r.plan.output.fpsNum}/${r.plan.output.fpsDen}`)
    expect(a.codec_name).toBe('aac')
    expect(Number(a.sample_rate)).toBe(r.plan.output.audioSampleRateHz)
    const durMs = Number(p.format.duration) * 1000
    expect(Math.abs(durMs - r.plan.output.durationMs)).toBeLessThanOrEqual(250)
  })

  // --------------------------------------------------------------- (4) decode
  it.each(['teleprompter', 'upload'])('%s: fully decodes, and frames are non-vacuous', (kind) => {
    const r = base(kind)
    const frames = fullDecodeFrameCount(r.out)
    const expected = Math.round((r.plan.output.durationMs / 1000) * (r.plan.output.fpsNum / r.plan.output.fpsDen))
    expect(frames).toBeGreaterThan(expected * 0.9)
    // Non-vacuous: two different times must not decode to the same bytes, or the
    // frame comparisons below would be meaningless.
    const f1 = frameRgb(r.out, 500, W, H)
    const f2 = frameRgb(r.out, 3500, W, H)
    expect(f1.length).toBeGreaterThan(0)
    expect(sha(f1)).not.toEqual(sha(f2))
  })

  // ------------------------------------------- (4) THE CUTS ACTUALLY HAPPENED
  //
  // The central claim of an EditPlan is not "a video came out" but "output time
  // X shows source time Y". The fixture carries a ten-bit binary clock burned in
  // per frame, so every sampled output frame REPORTS the source instant it was
  // drawn at. Comparing that against the plan's own segment mapping tests the
  // edit itself rather than the encoder.
  it.each(['teleprompter', 'upload'])('%s: every kept segment shows the SOURCE time the plan promised', (kind) => {
    const r = base(kind)
    const zooms = r.plan.video.zooms
    let checked = 0
    let shifted = 0
    for (const seg of r.plan.timeline.segments) {
      for (const frac of [0.25, 0.5, 0.75]) {
        const outMs = Math.round(seg.outputStartMs + (seg.outputEndMs - seg.outputStartMs) * frac)
        // A zoom magnifies about the centre and moves the clock out of position;
        // its own correctness is proven separately, below.
        if (zooms.some((z) => outMs >= z.outputStartMs - 300 && outMs <= z.outputEndMs + 300)) continue
        const expectedSrc = seg.sourceStartMs + (outMs - seg.outputStartMs)
        const read = clockAt(r.out, outMs)
        expect(read, `clock unreadable at output ${outMs}ms (segment ${seg.index})`).not.toBeNull()
        // ±100 ms: the clock ticks at 100 ms and the sampled frame lands within
        // one frame (33 ms) of the request. Nothing here is tuned to the result —
        // the observed error over every sample is at most half a tick.
        expect(
          Math.abs((read as number) - expectedSrc),
          `output ${outMs}ms should show source ${expectedSrc}ms (segment ${seg.index}: `
          + `${seg.sourceStartMs}..${seg.sourceEndMs} -> ${seg.outputStartMs}..${seg.outputEndMs}), `
          + `but the burned-in clock reads ${String(read)}ms`,
        ).toBeLessThanOrEqual(100)
        checked++

        // MUTATION CONTROL, per sample: the NAIVE mapping — "no cuts happened,
        // output time is source time" — must be REFUTED wherever the plan says
        // content was removed. Without this the check above would also pass on a
        // renderer that ignored the removals entirely.
        const shift = seg.sourceStartMs - seg.outputStartMs
        if (shift !== 0) {
          expect(
            Math.abs((read as number) - outMs),
            `segment ${seg.index} is shifted by ${shift}ms, but the frame at output `
            + `${outMs}ms shows source ${String(read)}ms — i.e. the removals were not applied`,
          ).toBeGreaterThan(300)
          shifted++
        }
      }
    }
    // The controls must have had something to control. A plan with no shifted
    // segment would make the mutation branch vacuous.
    expect(checked).toBeGreaterThanOrEqual(6)
    expect(shifted, 'no segment was shifted, so the removal control proved nothing').toBeGreaterThanOrEqual(3)
  })

  // ------------------------------------------------------------- (4)(10) zoom
  it('zoom changes pixels INSIDE its window and nowhere else', () => {
    const fx = fixtures.teleprompter
    const withZoom = base('teleprompter')
    expect(withZoom.plan.video.zooms.length).toBeGreaterThan(0)
    const z = withZoom.plan.video.zooms[0]
    // CONTROL: identical plan with the zoom removed.
    const noZoom = render(fx, 'zoom-off', (p) => {
      const c = JSON.parse(canonicalEditPlan(p)) as EditPlanV1
      c.video.zooms = []
      c.complexity.zoomCount = 0
      return validateEditPlan(c)
    })
    const before = Math.max(0, z.outputStartMs - 800)
    const inside = Math.floor((z.outputStartMs + z.outputEndMs) / 2)
    const after = Math.min(withZoom.plan.output.durationMs - 200, z.outputEndMs + 800)

    const dBefore = frameDiff(frameRgb(withZoom.out, before, W, H), frameRgb(noZoom.out, before, W, H))
    const dInside = frameDiff(frameRgb(withZoom.out, inside, W, H), frameRgb(noZoom.out, inside, W, H))
    const dAfter = frameDiff(frameRgb(withZoom.out, after, W, H), frameRgb(noZoom.out, after, W, H))

    // Inside the window the zoomed render must differ materially; outside it must
    // match the control. This is the exact experiment that killed the crop-based
    // implementation, now frozen as a test.
    expect(dInside, 'zoom had no visible effect inside its own window').toBeGreaterThan(2)
    expect(dBefore, 'zoom leaked before its window').toBeLessThan(1)
    expect(dAfter, 'zoom leaked after its window').toBeLessThan(1)
  })

  // ----------------------------------------------------------- (5) captions
  it('captions appear at cue times and are absent between them', () => {
    const fx = fixtures.teleprompter
    const withCaps = base('teleprompter')
    const noCaps = render(fx, 'cap-off', undefined, { captions: false })
    const cue = withCaps.plan.captions.cues[0]
    const mid = Math.floor((cue.outputStartMs + cue.outputEndMs) / 2)
    // Captions sit in the lower third; compare only that band so unrelated motion
    // cannot masquerade as a caption. The fixture's clock and colour bands both
    // sit above it, so nothing else in the frame can register here.
    const band = [0, Math.floor(H * 0.55), W, H] as const
    const on = frameRgb(withCaps.out, mid, W, H)
    const off = frameRgb(noCaps.out, mid, W, H)
    expect(regionDiff(on, off, W, H, ...band), 'no caption pixels at cue time').toBeGreaterThan(1.5)

    // A time covered by NO cue must match the caption-disabled control.
    const cues = withCaps.plan.captions.cues
    let gap = -1
    for (let i = 1; i < cues.length; i++) {
      const g = cues[i].outputStartMs - cues[i - 1].outputEndMs
      if (g > 400) { gap = cues[i - 1].outputEndMs + Math.floor(g / 2); break }
    }
    if (gap >= 0) {
      const gOn = frameRgb(withCaps.out, gap, W, H)
      const gOff = frameRgb(noCaps.out, gap, W, H)
      expect(regionDiff(gOn, gOff, W, H, ...band), 'caption pixels outside any cue').toBeLessThan(1.0)
    }
  })

  // -------------------------------------------------------------- (6) audio
  it('audio duration and loudness come from decoded PCM, not metadata', () => {
    const r = base('teleprompter')
    const pcm = decodePcm(r.out)
    const seconds = pcm.length / 48000
    expect(Math.abs(seconds * 1000 - r.plan.output.durationMs)).toBeLessThanOrEqual(250)
    // Non-silent: a rendered take whose audio was dropped would pass a duration
    // check but not this one.
    let peak = 0
    for (let i = 0; i < pcm.length; i += 97) peak = Math.max(peak, Math.abs(pcm[i]))
    expect(peak).toBeGreaterThan(1000)
    const lufs = measureLufs(r.out)
    expect(Number.isFinite(lufs)).toBe(true)
    const target = r.plan.audio.targetLufsMilli / 1000
    const tol = r.plan.audio.toleranceLuMilli / 1000
    expect(Math.abs(lufs - target), `integrated ${lufs} LUFS vs target ${target}`).toBeLessThanOrEqual(tol + 1.5)
  })

  it('MUTATION: a deliberately wrong loudness target is caught', () => {
    const r = render(fixtures.teleprompter, 'aud-bad', (p) => {
      const c = JSON.parse(canonicalEditPlan(p)) as EditPlanV1
      c.audio.targetLufsMilli = -30000   // -30 LUFS, far from the frozen -14
      return validateEditPlan(c)
    })
    const lufs = measureLufs(r.out)
    const frozen = -14
    // The render followed the mutated plan, so it must NOT sit at the frozen
    // target — proving the loudness assertion above is measuring the real signal.
    expect(Math.abs(lufs - frozen)).toBeGreaterThan(2)
  })

  // -------------------------------------------------------------- (7) cover
  it('a real non-black cover is produced at the contract timestamp', () => {
    const r = base('teleprompter')
    const at = r.plan.cover.outputTimeMs
    const cover = frameRgb(r.out, at, W, H)
    expect(cover.length).toBeGreaterThan(0)
    expect(meanLuma(cover), 'cover frame is black').toBeGreaterThan(8)
    // The cover must come from the SOURCE instant the plan names, not merely from
    // some frame that happens not to be black.
    expect(clockAt(r.out, at)).not.toBeNull()
    expect(
      Math.abs((clockAt(r.out, at) as number) - r.plan.cover.sourceTimeMs),
      'the cover frame does not show the source time the plan selected',
    ).toBeLessThanOrEqual(100)
    // MUTATION: a wrong timestamp must not decode to the same frame, or "the
    // cover came from the contract time" would be unfalsifiable.
    const wrong = frameRgb(r.out, Math.max(0, at + 2500), W, H)
    expect(sha(cover)).not.toEqual(sha(wrong))
  })

  // ------------------------------------------------- (8) determinism, decoded
  it.each(['teleprompter', 'upload'])('%s: two runs agree on plan, argv and DECODED evidence', (kind) => {
    const a = base(kind)
    const b = render(fixtures[kind], `det-${kind}`)
    expect(canonicalEditPlan(b.plan)).toEqual(canonicalEditPlan(a.plan))
    // Paths held fixed, so the only thing that could differ is the plan-to-graph
    // mapping — which is what determinism actually claims.
    expect(b.canonicalGraphSha).toEqual(a.canonicalGraphSha)
    expect(b.canonicalArgv).toEqual(a.canonicalArgv)
    // CONTROL: the comparison is not vacuous. The EXECUTED argv did differ, by
    // the per-run temp paths, so an equality that ignored the plan would fail.
    expect(b.argv).not.toEqual(a.argv)
    // Decoded, not container bytes: mp4 headers carry timestamps and are expected
    // to differ, so comparing file hashes would fail for a reason that has nothing
    // to do with the render.
    for (const t of [400, 2200, 5200]) {
      expect(sha(frameRgb(b.out, t, W, H)), `frame ${t}ms differs between runs`)
        .toEqual(sha(frameRgb(a.out, t, W, H)))
    }
    const pa = decodePcm(a.out)
    const pb = decodePcm(b.out)
    expect(pb.length).toEqual(pa.length)
  })
})
