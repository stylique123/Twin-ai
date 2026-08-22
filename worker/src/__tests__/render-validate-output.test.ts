// Batch 8.3 — output validation.
//
// WHAT THIS SUITE IS ACTUALLY DEFENDING AGAINST. `ffmpeg` exiting 0 means it
// ran the graph without erroring. It does not mean the result is the length the
// plan promised, that the raster survived the encoder, or that the captions
// land inside the video. Every one of those fails while leaving a playable file
// and a zero exit status — which is the class of defect that reaches users,
// because nothing upstream is unhappy about it.
//
// The probe is INJECTED rather than mocked at the module level, so each test
// states the exact measurement it is reasoning about. That matters more than
// realism here: a real fixture would exercise one point of a continuous space,
// and what needs proving is the behaviour AT the tolerance boundary, on both
// sides of it, which no single fixture can show.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  validateProbedOutput, validateCaptionsAgainstOutput, validateCoverFile,
  validateRenderedOutput, secondsStringToMs, parseRational, type ProbeResult,
} from '../jobs/editorValidateOutput.js'
import { loadRenderCatalog } from '../jobs/editorRender.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { EditPlanError, type EditPlanV1 } from '../jobs/editPlanContract.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'
import { resolvePlanDuration } from '../jobs/frameTimeline.js'

/** What a CORRECT renderer emits: whole frames, so not necessarily the
 *  millisecond the Director asked for. Every duration assertion below is
 *  anchored here rather than on `plan.output.durationMs`, because charging the
 *  encoder for a frame it cannot emit is the bias this suite used to encode. */
function renderableMs(p: EditPlanV1): number {
  return Math.round(resolvePlanDuration(p).renderableDurationMs)
}

const CATALOG = loadRenderCatalog()
const PROFILE = CATALOG.outputProfiles['vertical-social-1080x1920-h264-aac-v1']

function plan(): EditPlanV1 {
  return compileEditPlan({ ...baseInput(), policy: policy() }).plan
}
function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}

/** A probe of a CORRECT output for the given plan. Every test starts from this
 *  and changes exactly one thing, so a failure names the field it is about. */
function goodProbe(p: EditPlanV1, overrides: { durationMs?: number } = {}): ProbeResult {
  const ms = overrides.durationMs ?? renderableMs(p)
  const secs = `${Math.floor(ms / 1000)}.${String(ms % 1000).padStart(3, '0')}`
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: secs, size: '1000000' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920,
        pix_fmt: 'yuv420p', r_frame_rate: '30/1', avg_frame_rate: '30/1', duration: secs },
      { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, duration: secs },
    ],
  }
}
const BYTES = 4_000_000

describe('numeric parsing', () => {
  it('rounds seconds to milliseconds rather than truncating', () => {
    expect(secondsStringToMs('12.9995')).toBe(13000)
    expect(secondsStringToMs('0.001')).toBe(1)
    expect(secondsStringToMs('60')).toBe(60000)
  })
  it('refuses junk instead of producing 0 — unknown is not zero', () => {
    expect(secondsStringToMs('N/A')).toBeNull()
    expect(secondsStringToMs(undefined)).toBeNull()
    expect(secondsStringToMs('')).toBeNull()
  })
  it('reads a rational, and treats 0/0 as unknown rather than as a rate', () => {
    expect(parseRational('30/1')).toEqual({ num: 30, den: 1 })
    expect(parseRational('30000/1001')).toEqual({ num: 30000, den: 1001 })
    expect(parseRational('0/0')).toBeNull()
    expect(parseRational('bad')).toBeNull()
  })
})

describe('CONTROL: a correct output validates', () => {
  it('passes, so every refusal below is about the mutation and not the fixture', () => {
    const p = plan()
    const r = validateProbedOutput(goodProbe(p), p, PROFILE, BYTES)
    expect(r.durationDeltaMs).toBe(0)
    expect(r.measurements.width).toBe(1080)
    expect(r.measurements.durationSourceField).toBe('video_stream')
  })
})

describe('the target is the frame grid, not the request', () => {
  it('predicts what the renderer can emit, and reports the gap separately', () => {
    const p = plan()
    const resolved = resolvePlanDuration(p)
    // This fixture's requested duration does NOT land on a frame boundary — it
    // sits 33 ms above the last frame the renderer can emit. That gap is not the
    // encoder's fault, and before this change it was silently spent out of the
    // ±250 ms tolerance on every single render.
    expect(renderableMs(p)).not.toBe(p.output.durationMs)
    expect(Math.round(resolved.planQuantizationDeltaMs)).toBe(-33)

    let seen: { predictedMs: number; planQuantizationDeltaMs: number; targetFrameCount: number } | null = null
    const r = validateProbedOutput(goodProbe(p), p, PROFILE, BYTES, (o) => { seen = o })
    // A render that emits exactly the reachable frame count is EXACTLY on
    // target now, not 33 ms short of it.
    expect(r.durationDeltaMs).toBe(0)
    expect(seen!.predictedMs).toBe(renderableMs(p))
    expect(seen!.planQuantizationDeltaMs).toBe(-33)
    expect(seen!.targetFrameCount).toBe(resolved.targetFrameCount)
  })
})

describe('duration: the tolerance is ±250 ms and it is symmetric', () => {
  it('accepts exactly at the tolerance, both directions', () => {
    const p = plan()
    expect(() => validateProbedOutput(goodProbe(p, { durationMs: renderableMs(p) + 250 }), p, PROFILE, BYTES)).not.toThrow()
    expect(() => validateProbedOutput(goodProbe(p, { durationMs: renderableMs(p) - 250 }), p, PROFILE, BYTES)).not.toThrow()
  })

  it('MUTATION: one millisecond past the tolerance is refused — LONG', () => {
    const p = plan()
    expect(codeOf(() => validateProbedOutput(goodProbe(p, { durationMs: renderableMs(p) + 251 }), p, PROFILE, BYTES)))
      .toBe('output_duration_mismatch')
  })

  it('MUTATION: and one millisecond past it — SHORT', () => {
    // Asserted separately because a check written as `measured > planned + tol`
    // passes every short render, and a video that is silently truncated is the
    // more damaging of the two.
    const p = plan()
    expect(codeOf(() => validateProbedOutput(goodProbe(p, { durationMs: renderableMs(p) - 251 }), p, PROFILE, BYTES)))
      .toBe('output_duration_mismatch')
  })

  it('an output of zero length is refused however short the plan is', () => {
    const p = plan()
    expect(codeOf(() => validateProbedOutput(goodProbe(p, { durationMs: 0 }), p, PROFILE, BYTES)))
      .toBe('output_duration_mismatch')
  })
})

describe('the container header is a CLAIM; the stream is the measurement', () => {
  it('prefers the video stream duration when the two disagree', () => {
    // A container that lies about its length is what a broken faststart remux
    // produces. The header is written by the encoder under audit; the stream
    // extent is what a decoder will actually play.
    const p = plan()
    const probe = goodProbe(p)
    probe.format!.duration = '9999.000'
    const r = validateProbedOutput(probe, p, PROFILE, BYTES)
    expect(r.measurements.durationSourceField).toBe('video_stream')
    expect(r.measurements.durationMs).toBe(renderableMs(p))
  })

  it('falls back to the header only when the stream has no duration, and SAYS SO', () => {
    const p = plan()
    const probe = goodProbe(p)
    delete probe.streams![0].duration
    const r = validateProbedOutput(probe, p, PROFILE, BYTES)
    expect(r.measurements.durationSourceField).toBe('format')
  })

  it('MUTATION: a file with no readable duration anywhere is refused, not assumed', () => {
    const p = plan()
    const probe = goodProbe(p)
    delete probe.streams![0].duration
    delete probe.format!.duration
    expect(codeOf(() => validateProbedOutput(probe, p, PROFILE, BYTES))).toBe('output_decode_failed')
  })
})

describe('stream parameters must have survived the encoder', () => {
  const cases: [string, (pr: ProbeResult) => void, string][] = [
    ['no video stream', (pr) => { pr.streams = pr.streams!.filter((s) => s.codec_type !== 'video') }, 'output_stream_mismatch'],
    ['no audio stream', (pr) => { pr.streams = pr.streams!.filter((s) => s.codec_type !== 'audio') }, 'output_stream_mismatch'],
    ['a second video stream', (pr) => { pr.streams!.push({ ...pr.streams![0] }) }, 'output_stream_mismatch'],
    ['a second audio stream', (pr) => { pr.streams!.push({ ...pr.streams![1] }) }, 'output_stream_mismatch'],
    ['the wrong video codec', (pr) => { pr.streams![0].codec_name = 'vp9' }, 'output_stream_mismatch'],
    ['the wrong audio codec', (pr) => { pr.streams![1].codec_name = 'opus' }, 'output_audio_invalid'],
    ['the wrong raster', (pr) => { pr.streams![0].width = 720; pr.streams![0].height = 1280 }, 'output_stream_mismatch'],
    ['the wrong pixel format', (pr) => { pr.streams![0].pix_fmt = 'yuv444p' }, 'output_stream_mismatch'],
    ['the wrong frame rate', (pr) => { pr.streams![0].avg_frame_rate = '25/1'; pr.streams![0].r_frame_rate = '25/1' }, 'output_stream_mismatch'],
    ['no frame rate at all', (pr) => { pr.streams![0].avg_frame_rate = '0/0'; pr.streams![0].r_frame_rate = '0/0' }, 'output_stream_mismatch'],
    ['the wrong sample rate', (pr) => { pr.streams![1].sample_rate = '44100' }, 'output_audio_invalid'],
    ['the wrong channel count', (pr) => { pr.streams![1].channels = 1 }, 'output_audio_invalid'],
    ['a container the profile forbids', (pr) => { pr.format!.format_name = 'matroska,webm' }, 'output_stream_mismatch'],
    ['no container at all', (pr) => { pr.format!.format_name = '' }, 'output_decode_failed'],
  ]
  for (const [name, mutate, code] of cases) {
    it(`MUTATION: ${name} is refused with ${code}`, () => {
      const p = plan()
      const probe = goodProbe(p)
      mutate(probe)
      expect(codeOf(() => validateProbedOutput(probe, p, PROFILE, BYTES))).toBe(code)
    })
  }

  it('the frame rate is compared as a RATIO — 30000/1000 is 30/1', () => {
    // An encoder is free to express the same rate either way, and failing a
    // valid render over its notation would be a false alarm that trains people
    // to ignore this check.
    const p = plan()
    const probe = goodProbe(p)
    probe.streams![0].avg_frame_rate = '30000/1000'
    expect(() => validateProbedOutput(probe, p, PROFILE, BYTES)).not.toThrow()
  })
})

describe('file size sanity', () => {
  it('an empty file is refused even when the probe looks perfect', () => {
    const p = plan()
    expect(codeOf(() => validateProbedOutput(goodProbe(p), p, PROFILE, 0))).toBe('output_decode_failed')
  })

  it('MUTATION: an implausibly large file for its duration is refused', () => {
    const p = plan()
    const tooBig = p.output.durationMs * PROFILE.maxOutputBytesPerOutputMs + 1
    expect(codeOf(() => validateProbedOutput(goodProbe(p), p, PROFILE, tooBig))).toBe('output_stream_mismatch')
  })

  it('a very SMALL but non-empty file passes — a static frame compresses to almost nothing', () => {
    // Deliberately no lower bound in bytes. A floor here would fail valid
    // renders of near-static footage, which is a real thing users record.
    const p = plan()
    expect(() => validateProbedOutput(goodProbe(p), p, PROFILE, 1024)).not.toThrow()
  })
})

describe('captions must land inside the video that was produced', () => {
  it('CONTROL: the compiler\'s own cues fit the measured output', () => {
    const p = plan()
    expect(p.captions.cues.length).toBeGreaterThan(0)
    expect(() => validateCaptionsAgainstOutput(p, p.output.durationMs)).not.toThrow()
  })

  it('MUTATION: a cue ending after the video does is refused', () => {
    // Not cosmetic: it means the caption timeline and the video timeline came
    // from different maps, which makes the cues that DO fit suspect too.
    const p = plan()
    p.captions.cues[p.captions.cues.length - 1].outputEndMs = p.output.durationMs + 1
    expect(codeOf(() => validateCaptionsAgainstOutput(p, p.output.durationMs))).toBe('output_caption_invalid')
  })

  it('MUTATION: it is checked against the MEASURED length, not the promised one', () => {
    // This is the case a plan-only check cannot see: the plan is internally
    // consistent and the render came out short.
    const p = plan()
    expect(codeOf(() => validateCaptionsAgainstOutput(p, p.output.durationMs - 5000)))
      .toBe('output_caption_invalid')
  })

  it('MUTATION: a cue that does not advance is refused', () => {
    const p = plan()
    p.captions.cues[0].outputEndMs = p.captions.cues[0].outputStartMs
    expect(codeOf(() => validateCaptionsAgainstOutput(p, p.output.durationMs))).toBe('output_caption_invalid')
  })

  it('MUTATION: a cue starting before the output does is refused', () => {
    const p = plan()
    p.captions.cues[0].outputStartMs = -1
    expect(codeOf(() => validateCaptionsAgainstOutput(p, p.output.durationMs))).toBe('output_caption_invalid')
  })
})

describe('cover validation', () => {
  const dirs: string[] = []
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'cover-')); dirs.push(d); return d }
  const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

  it('CONTROL: a plausibly sized cover passes', () => {
    const d = tmp()
    const f = join(d, 'cover.jpg')
    writeFileSync(f, Buffer.alloc(50_000, 1))
    expect(validateCoverFile(f, CATALOG).bytes).toBe(50_000)
    cleanup()
  })

  it('MUTATION: a cover under the frozen minimum is refused', () => {
    const d = tmp()
    const f = join(d, 'cover.jpg')
    writeFileSync(f, Buffer.alloc(10, 1))
    expect(codeOf(() => validateCoverFile(f, CATALOG))).toBe('output_cover_invalid')
    cleanup()
  })

  it('MUTATION: and one over the frozen maximum', () => {
    const d = tmp()
    const f = join(d, 'cover.jpg')
    writeFileSync(f, Buffer.alloc(CATALOG.cover.maxBytes + 1, 1))
    expect(codeOf(() => validateCoverFile(f, CATALOG))).toBe('output_cover_invalid')
    cleanup()
  })

  it('a missing cover is a failure, not a null result', () => {
    expect(codeOf(() => validateCoverFile(join(tmp(), 'gone.jpg'), CATALOG))).toBe('output_cover_invalid')
    cleanup()
  })
})

describe('every code this module emits is in the FROZEN catalog (Gate-0 §5)', () => {
  it('uses no invented error code', () => {
    // A stable catalog that code drifts away from is worse than none: callers
    // branch on codes, and an unlisted one is unhandled by definition.
    const FROZEN = new Set([
      'edit_plan_identity_mismatch', 'edit_plan_invalid', 'edit_plan_too_large',
      'edit_plan_divergent', 'edit_plan_unsafe_cut', 'edit_plan_filler_disabled',
      'edit_plan_no_kept_media', 'render_asset_integrity_failed', 'render_font_integrity_failed',
      'render_watermark_integrity_failed', 'speech_language_policy_invalid',
      'render_music_license_invalid', 'render_graph_invalid', 'render_output_profile_invalid',
      'output_decode_failed', 'output_duration_mismatch', 'output_stream_mismatch',
      'output_audio_invalid', 'output_caption_invalid', 'output_cover_invalid',
      'output_completion_conflict', 'source_too_long_for_editor',
    ])
    const seen = new Set<string>()
    const p = plan()
    const collect = (fn: () => unknown) => { try { fn() } catch (e) { if (e instanceof EditPlanError) seen.add(e.code) } }
    collect(() => { const pr = goodProbe(p); pr.streams![0].codec_name = 'vp9'; validateProbedOutput(pr, p, PROFILE, BYTES) })
    collect(() => { const pr = goodProbe(p); pr.streams![1].codec_name = 'opus'; validateProbedOutput(pr, p, PROFILE, BYTES) })
    collect(() => validateProbedOutput(goodProbe(p, { durationMs: 0 }), p, PROFILE, BYTES))
    collect(() => validateProbedOutput(goodProbe(p), p, PROFILE, 0))
    collect(() => validateCaptionsAgainstOutput(p, 1))
    collect(() => validateCoverFile('/nonexistent/cover.jpg', CATALOG))
    expect(seen.size).toBeGreaterThanOrEqual(6)
    for (const c of seen) expect(FROZEN.has(c)).toBe(true)
  })
})

// ---- the ASYNC WRAPPER, which is where the loudness meter was added ---------
//
// Everything above tests pure functions. `validateRenderedOutput` is the thing
// production actually calls, and until Phase 9 no test in this file touched it
// — so the meter's wiring (as opposed to its arithmetic, covered in
// loudness.test.ts) had no coverage at all. Both children are injected, so this
// runs with no ffmpeg and no media file.
describe('validateRenderedOutput — the wrapper production calls', () => {
  const REPORT = (i: string, tp: string): string =>
    `frame= 90 fps=0.0 q=-0.0 Lsize=N/A\n[Parsed_loudnorm_0 @ 0x5]\n` +
    `{\n\t"input_i" : "${i}",\n\t"input_tp" : "${tp}",\n\t"input_lra" : "0.10",\n` +
    `\t"input_thresh" : "-31.80",\n\t"output_i" : "-13.99",\n\t"output_tp" : "-8.29",\n` +
    `\t"output_lra" : "0.00",\n\t"output_thresh" : "-23.99",\n` +
    `\t"normalization_type" : "dynamic",\n\t"target_offset" : "-0.01"\n}`

  function outputFile(): { dir: string; path: string } {
    const dir = mkdtempSync(join(tmpdir(), 'validate-wrapper-'))
    const path = join(dir, 'output.mp4')
    // Real bytes on disk: the wrapper stats the file for its size, so an
    // injected probe alone would not get it past the existence check.
    writeFileSync(path, Buffer.alloc(4_000_000, 7))
    return { dir, path }
  }

  async function run(i: string, tp: string): Promise<Awaited<ReturnType<typeof validateRenderedOutput>>> {
    const { dir, path } = outputFile()
    const p = plan()
    try {
      return await validateRenderedOutput(
        { outputPath: path, coverPath: null, plan: p },
        {
          spawn: (() => { throw new Error('no child should be spawned when both deps are injected') }) as never,
          now: () => 0,
          probe: () => Promise.resolve(goodProbe(p)),
          measureLoudnessText: () => Promise.resolve(REPORT(i, tp)),
        },
      )
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  it('measures the delivered loudness and returns it alongside the structure', async () => {
    const v = await run('-14.04', '-6.80')
    expect(v.loudness.measurement).toEqual({
      silent: false, integratedLufsMilli: -14040, truePeakDbtpMilli: -6800,
    })
    expect(v.loudness.integratedDeviationMilli).toBe(-40)
    // Still does everything it did before.
    expect(v.measurements.width).toBe(1080)
  })

  it('a true peak over the frozen ceiling is REPORTED, and the video survives', async () => {
    // The measured pink-noise case. This is the assertion that stops a future
    // tightening from silently starting to destroy real renders.
    const v = await run('-14.05', '-0.12')
    expect(v.loudness.truePeakOvershootMilli).toBe(880)
  })

  it('SILENT audio fails the whole validation', async () => {
    await expect(run('-inf', '-inf')).rejects.toMatchObject({ code: 'output_audio_invalid' })
  })

  it('CLIPPING fails the whole validation', async () => {
    await expect(run('-14.00', '0.30')).rejects.toMatchObject({ code: 'output_audio_invalid' })
  })

  it('an unreadable meter report fails rather than being treated as "fine"', async () => {
    const { dir, path } = outputFile()
    const p = plan()
    try {
      await expect(validateRenderedOutput(
        { outputPath: path, coverPath: null, plan: p },
        {
          spawn: (() => { throw new Error('unexpected spawn') }) as never,
          now: () => 0,
          probe: () => Promise.resolve(goodProbe(p)),
          measureLoudnessText: () => Promise.resolve('frame= 90 fps=0.0 — no report here'),
        },
      )).rejects.toMatchObject({ code: 'output_audio_invalid' })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})


describe('the audio and video streams are compared to EACH OTHER', () => {
  // Everything else in this file measures VIDEO against the plan. Nothing
  // looked at the audio stream's own extent or origin, so drift between the
  // two was invisible to every check: codec right, raster right, frame rate
  // right, duration right, lips wrong. For a product whose whole output is a
  // person talking to camera that is the most damaging defect that can ship.
  // Sign handled explicitly: a naive `${Math.floor(n/1000)}.${n%1000}` renders
  // -300 as "-1.-300", which ffprobe would never emit and secondsStringToMs
  // correctly refuses — so the negative cases below would have passed by
  // failing to parse rather than by being caught.
  const ms = (n: number): string => {
    const sign = n < 0 ? '-' : ''
    const a = Math.abs(n)
    return `${sign}${Math.floor(a / 1000)}.${String(a % 1000).padStart(3, '0')}`
  }

  /** A probe whose audio stream differs from its video stream on purpose. */
  function drifted(p: EditPlanV1, o: { audioDeltaMs?: number; startDeltaMs?: number }): ProbeResult {
    const base = goodProbe(p)
    const vMs = renderableMs(p)
    const streams = base.streams!.map((st) => st.codec_type === 'audio'
      ? { ...st, duration: ms(vMs + (o.audioDeltaMs ?? 0)), start_time: ms(o.startDeltaMs ?? 0) }
      : { ...st, start_time: '0.000' })
    return { ...base, streams }
  }

  it('records the geometry on every render, not only when it is wrong', () => {
    // The recurring defect in this codebase is a number computed and read by
    // nobody. These are carried out to the durable event trail.
    const p = plan()
    const r = validateProbedOutput(drifted(p, { audioDeltaMs: 93, startDeltaMs: 0 }), p, PROFILE, BYTES)
    expect(r.measurements.audioMinusVideoDurationMs).toBe(93)
    expect(r.measurements.audioMinusVideoStartMs).toBe(0)
  })

  it('accepts audio outlasting video by the amount real renders produce', () => {
    // MEASURED, not assumed: real renders on this build put audio 93-120ms
    // past video, because video truncates to whole frames and to segment
    // boundaries and audio does not. Failing those would fail every render.
    const p = plan()
    for (const delta of [93, 120, 200]) {
      expect(() => validateProbedOutput(drifted(p, { audioDeltaMs: delta }), p, PROFILE, BYTES)).not.toThrow()
    }
  })

  it('refuses a stream that genuinely ran out early', () => {
    const p = plan()
    expect(codeOf(() => validateProbedOutput(drifted(p, { audioDeltaMs: 1500 }), p, PROFILE, BYTES)))
      .toBe('output_av_drift')
    expect(codeOf(() => validateProbedOutput(drifted(p, { audioDeltaMs: -1500 }), p, PROFILE, BYTES)))
      .toBe('output_av_drift')
  })

  it('refuses streams pinned to different origins — the whole video is out of sync', () => {
    // This is the one that matters most and is hardest to see: a constant
    // offset does not shorten anything, so every other check passes.
    const p = plan()
    expect(codeOf(() => validateProbedOutput(drifted(p, { startDeltaMs: 300 }), p, PROFILE, BYTES)))
      .toBe('output_av_drift')
    expect(codeOf(() => validateProbedOutput(drifted(p, { startDeltaMs: -300 }), p, PROFILE, BYTES)))
      .toBe('output_av_drift')
  })

  it('CONTROL: an offset just inside the bound passes, so the bound is the thing being tested', () => {
    const p = plan()
    expect(() => validateProbedOutput(drifted(p, { startDeltaMs: 90 }), p, PROFILE, BYTES)).not.toThrow()
  })

  it('a probe that omits the fields records null rather than inventing a zero', () => {
    // "We could not measure" must stay distinct from "measured zero drift",
    // or a probe that lost a field would read as a perfectly synced render.
    const p = plan()
    const base = goodProbe(p)
    const streams = base.streams!.map((st) => st.codec_type === 'audio'
      ? { ...st, duration: undefined, start_time: undefined } : st)
    const r = validateProbedOutput({ ...base, streams }, p, PROFILE, BYTES)
    expect(r.measurements.audioMinusVideoDurationMs).toBeNull()
    expect(r.measurements.audioMinusVideoStartMs).toBeNull()
  })
})
