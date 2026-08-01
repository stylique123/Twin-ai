// Batch 8.5 — THE RENDERER, ACTUALLY EXECUTED.
//
// Everything else Phase 8 has is a typecheck, a unit test of a pure function, or
// a database gate against a throwaway Postgres. `ffmpegGraph.test.ts` proves the
// graph STRING is the one intended; nothing proved ffmpeg accepts it. Those are
// different claims, and the gap between them is where a filter that does not
// exist in this build, an option ffmpeg silently reorders, or a stream label
// that never gets consumed all live.
//
// Until now the only thing that ran the encoder was the staging matrix — a
// ~35-minute round trip per attempt, three of which were spent on defects that
// never reached ffmpeg at all. This runs it here.
//
// WHAT THIS PROVES:  the graph executes, produces a file, and that file probes
//                    as the profile the plan named.
// WHAT IT DOES NOT:  loudness, true peak, A/V drift, that the cut points are the
//                    ones the plan chose, or that the captions are legible.
//                    `editorValidateOutput.ts` says the same about itself and
//                    means it. A test that overstates its reach is worse than no
//                    test, because it stops anyone looking.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { baseInput, policy, shippedPolicy, SOURCE_DURATION_MS } from './fixtures/editPlanFixture.js'
import { renderEditPlan, extractCover, fileSha256, cleanupRenderWorkDir } from '../jobs/editorRender.js'
import { validateRenderedOutput, validateCaptionsAgainstOutput } from '../jobs/editorValidateOutput.js'
import { renderAssDocument, assertNoOverrideBlock } from '../jobs/assCaptions.js'
import { loadRenderCatalog } from '../jobs/editorRender.js'
import { resolveCaptionColours } from '../jobs/captionColours.js'
import type { EditPlanV1 } from '../jobs/editPlanContract.js'

const execFile = promisify(_execFile)

// ffmpeg is installed in CI (staging-integration installs it, pr-checks may
// not). SKIPPING IS ANNOUNCED, not silent: a suite that quietly evaporates on
// the machine that matters reports green for having done nothing.
const HAVE_FFMPEG = (() => {
  try { return existsSync('/usr/bin/ffmpeg') && existsSync('/usr/bin/ffprobe') } catch { return false }
})()
if (!HAVE_FFMPEG) {
  console.warn('render-end-to-end: ffmpeg/ffprobe absent — THE RENDERER IS NOT BEING EXERCISED in this run')
}
const FONTS_DIR = '/usr/share/fonts/truetype/dejavu'

let dir = ''
let sourcePath = ''
let plan: EditPlanV1
// Whether THIS machine's on-disk fonts are the pinned bookworm bytes — checked
// by DIGEST, not by existence. A machine can have a file at this path (its own
// OS's font package) that is present but WRONG, and existence alone said
// nothing about that: it forced strict mode on against Ubuntu-packaged fonts
// after the catalog was corrected to Debian bookworm's bytes, failing a
// developer's local run for a reason that has nothing to do with a defect in
// the renderer. The comment below already stated the intended rule; this is
// what actually implements it.
let strictFontsAvailable = false

/** A synthetic source with the fixture's exact geometry and duration.
 *
 *  It must be SOURCE_DURATION_MS long and 1080x1920 because the compiled plan
 *  cuts against those numbers; a shorter source would make every segment a
 *  read past the end and the failure would look like a graph bug. */
async function makeSource(path: string): Promise<void> {
  const seconds = (SOURCE_DURATION_MS / 1000).toFixed(3)
  await execFile('/usr/bin/ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=1080x1920:rate=30:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest', path,
  ], { timeout: 300_000, maxBuffer: 8 << 20 })
}

beforeAll(async () => {
  if (!HAVE_FFMPEG) return
  dir = mkdtempSync(join(tmpdir(), 'render-e2e-'))
  sourcePath = join(dir, 'source.mp4')
  await makeSource(sourcePath)
  // The plan must cite the digest of the file it will be rendered against —
  // `renderEditPlan` reads the expectation from the PLAN, never from the caller,
  // so this is the only place the two can be made to agree.
  const compiled = compileEditPlan({ ...baseInput(), policy: policy() })
  plan = { ...compiled.plan, identity: { ...compiled.plan.identity, sourceChecksum: await fileSha256(sourcePath) } }

  // BY DIGEST, not by existence — see the comment on the variable declaration.
  const catalog = loadRenderCatalog()
  strictFontsAvailable = true
  for (const [name, spec] of Object.entries(catalog.fonts)) {
    const path = join(FONTS_DIR, name)
    if (!existsSync(path)) { strictFontsAvailable = false; break }
    if (await fileSha256(path) !== spec.sha256) { strictFontsAvailable = false; break }
  }
  if (!strictFontsAvailable) {
    console.warn(
      'render-end-to-end: on-disk fonts do not match render_catalog_v1.json — ' +
      'running the caption-cue case with strictFontIntegrity OFF. This machine\'s ' +
      'font package (likely the host OS\'s own, not Debian bookworm\'s) is not the ' +
      'production one; that is a fact about this machine, not a defect under test.',
    )
  }
}, 420_000)

afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

const maybe = HAVE_FFMPEG ? describe : describe.skip

maybe('the graph ffmpeg is actually given', () => {
  it('ENCODES — the plan compiles to a graph this ffmpeg build accepts and runs', async () => {
    const workDir = join(dir, 'w1')
    // A MISMATCHED font digest is a hard failure regardless of strictFontIntegrity
    // — that flag only ever governs an UNPINNED (null) digest, never a wrong one,
    // and that asymmetry is correct: it is the exact check that caught a real
    // font substitution earlier in this batch, and weakening it "for local dev"
    // would defeat the reason it exists. So a machine without the real bookworm
    // bytes cannot exercise the caption-burn path with integrity meaning anything
    // — it renders WITHOUT captions instead. CI fetches the actual bookworm font
    // (see pr-checks.yml / staging-integration.yml), so there strictFontsAvailable
    // is true and the full caption path — the one that matters — runs for real.
    const renderPlan = strictFontsAvailable ? plan : { ...plan, captions: { ...plan.captions, cues: [] } }
    if (!strictFontsAvailable) {
      console.warn('render-end-to-end: skipping the caption-burn path on this machine (see beforeAll warning)')
    }
    const assPath = renderPlan.captions.cues.length > 0 ? join(workDir, 'captions.ass') : null
    if (assPath) {
      const catalog = loadRenderCatalog()
      const preset = catalog.captionPresets[renderPlan.captions.presetId]
      const { primaryColourAss, emphasisColourAss } = resolveCaptionColours(renderPlan.captions, preset)
      const doc = renderAssDocument(renderPlan, {
        playResX: renderPlan.output.width, playResY: renderPlan.output.height,
        fontName: preset.fontFamily, fontSizePx: renderPlan.captions.fontSizePx,
        marginVerticalPx: renderPlan.captions.marginVerticalPx,
        emphasisColourAss, primaryColourAss,
      })
      assertNoOverrideBlock(doc, renderPlan.captions.cues.length, emphasisColourAss)
      require('node:fs').mkdirSync(workDir, { recursive: true })
      writeFileSync(assPath, doc, 'utf8')
    }

    const { outputPath, evidence } = await renderEditPlan({
      plan: renderPlan, sourcePath, assPath,
      fontsDir: assPath ? FONTS_DIR : null,
      workDir,
      strictFontIntegrity: strictFontsAvailable,
    })

    expect(existsSync(outputPath)).toBe(true)
    expect(evidence.outputBytes).toBeGreaterThan(0)
    expect(statSync(outputPath).size).toBe(evidence.outputBytes)
    expect(evidence.outputSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(evidence.graphSha256).toMatch(/^[0-9a-f]{64}$/)

    // THE VALIDATOR, ON A REAL ENCODE. Every other test feeds it a probe object
    // written by hand — which proves it judges a probe correctly, not that a
    // real encode produces a probe it accepts. Validated against `renderPlan` —
    // the plan actually rendered — not `plan`, which may carry cues that were
    // deliberately stripped above.
    const validation = await validateRenderedOutput({ outputPath, coverPath: null, plan: renderPlan })
    expect(validation.measurements.width).toBe(renderPlan.output.width)
    expect(validation.measurements.height).toBe(renderPlan.output.height)
    expect(Math.abs(validation.measurements.durationMs - renderPlan.output.durationMs)).toBeLessThanOrEqual(250)

    // THE LOUDNESS METER, AGAINST A FILE THIS FFMPEG ACTUALLY PRODUCED.
    // loudness.test.ts proves the arithmetic on captured text; only this proves
    // the meter runs, that its report survives a real render's stderr, and that
    // real output clears the disaster band. An `expect(...).not.toThrow()` on
    // the wrapper would have proven none of it — the numbers are asserted to be
    // present and finite so a meter that silently stopped measuring fails here.
    expect(validation.loudness.measurement.silent).toBe(false)
    expect(Number.isInteger(validation.loudness.measurement.integratedLufsMilli)).toBe(true)
    expect(Number.isInteger(validation.loudness.measurement.truePeakDbtpMilli)).toBe(true)
    expect(validation.loudness.measurement.truePeakDbtpMilli!).toBeLessThan(0)

    // The cover, from the finished file rather than the source.
    const { coverPath, bytes } = await extractCover(outputPath, renderPlan, workDir)
    expect(bytes).toBeGreaterThan(0)
    const withCover = await validateRenderedOutput({ outputPath, coverPath, plan: renderPlan })
    expect(withCover.cover).not.toBeNull()

    cleanupRenderWorkDir(workDir)
    expect(existsSync(workDir)).toBe(false)
  }, 900_000)
})

maybe('the HARD-CUT graph, which is the common shape', () => {
  it('ENCODES — the n-way concat path also survives the timebase conformance', async () => {
    // The timebase fix went into `segmentChain`, which EVERY plan uses, so it
    // changed the hard-cut graph too. Hard cuts never hit the bug (`concat`
    // conforms timebases itself), which is exactly why they are the path most
    // likely to be broken by fixing it and least likely to complain.
    // THE OVERLAP LIVES ON THE SEGMENT, not on `video.transitions` — the graph
    // derives `hasTransition` from `segment.transitionInOverlapMs`. Emptying
    // only the transitions list leaves a plan whose two halves disagree, and the
    // graph's independent duration cross-check refused it before ffmpeg was
    // started. That refusal is the guard working: it is the check that would
    // otherwise let a plan render at the wrong length.
    const segments = plan.timeline.segments.map((s) => ({ ...s, transitionInOverlapMs: 0 }))
    const hardCut: EditPlanV1 = {
      ...plan,
      video: { ...plan.video, transitions: [] },
      timeline: { ...plan.timeline, segments },
      output: {
        ...plan.output,
        durationMs: segments.reduce((n, s) => n + (s.sourceEndMs - s.sourceStartMs), 0),
      },
      captions: { ...plan.captions, cues: [] },
    }
    const workDir = join(dir, 'w4')
    const { outputPath, evidence } = await renderEditPlan({
      plan: hardCut, sourcePath, assPath: null, fontsDir: null, workDir, strictFontIntegrity: false,
    })
    expect(evidence.outputBytes).toBeGreaterThan(0)
    const v = await validateRenderedOutput({ outputPath, coverPath: null, plan: hardCut })
    expect(v.measurements.width).toBe(hardCut.output.width)
    expect(Math.abs(v.measurements.durationMs - hardCut.output.durationMs)).toBeLessThanOrEqual(250)
    cleanupRenderWorkDir(workDir)
  }, 900_000)
})

maybe('what a real encode refuses', () => {
  it('a source whose bytes are not the ones the plan was compiled against is REFUSED', async () => {
    // Integrity is checked BEFORE the encoder starts, so this must fail fast
    // rather than after minutes of encoding.
    const wrong = { ...plan, identity: { ...plan.identity, sourceChecksum: 'f'.repeat(64) } }
    await expect(renderEditPlan({
      plan: wrong, sourcePath, assPath: null, fontsDir: null,
      workDir: join(dir, 'w2'), strictFontIntegrity: false,
    })).rejects.toThrow()
  }, 120_000)

  it('a cover placed past the end of the output is REFUSED', async () => {
    const past = { ...plan, cover: { ...plan.cover, outputTimeMs: plan.output.durationMs + 1 } }
    await expect(extractCover(sourcePath, past, join(dir, 'w3'))).rejects.toThrow()
  }, 60_000)
})


// THE GAP THAT LET A BROKEN RENDER REACH STAGING.
//
// Every case above compiles with `policy()`, whose edge trim is OFF — it is
// the Batch 8.1 baseline and deliberately frozen. So the SHIPPED policy, the
// one production actually renders with, had never once been through a real
// ffmpeg here. Staging caught what this suite could not:
//
//     output_caption_invalid: caption cue 4 ends after the video does
//
// The edge trim ends the video keepMs after the last spoken word, the
// reading-speed rule extends the final cue into whatever room remains, and
// the output validator compares cues to the MEASURED duration with zero
// tolerance. Planned duration and measured duration are not the same number.
//
// This case closes the gap the only way that actually proves anything: encode
// with the shipped policy, probe what came out, and run the real validator
// against it.
describe('the SHIPPED policy survives a real encode', () => {
  const maybe = HAVE_FFMPEG ? it : it.skip

  maybe('captions fit inside the video that was ACTUALLY produced', async () => {
    // A LONG FINAL WORD, which is what actually reproduces the staging
    // failure. The reading-speed rule sizes a cue by its character count, so a
    // long last word makes the final cue reach for every millisecond left in
    // the video. With the edge trim ending the file keepMs after that word,
    // "every millisecond left" is the exact planned duration — and the encoded
    // file is not exactly that long. The stock fixture does NOT reproduce it:
    // its final cue ends 120 ms early by luck of where its words fall, which
    // is why the first version of this test passed with the guard disabled and
    // proved nothing.
    const input = baseInput()
    const words = input.evidence.words
    words[words.length - 1] = { ...words[words.length - 1], text: 'extraordinarily'.repeat(6) }
    const compiled = compileEditPlan({ ...input, policy: shippedPolicy() })
    const shipped: EditPlanV1 = {
      ...compiled.plan,
      identity: { ...compiled.plan.identity, sourceChecksum: await fileSha256(sourcePath) },
    }
    expect(shipped.captions.cues.length).toBeGreaterThan(0)

    // Rendered WITHOUT burning the captions, deliberately. What is under test
    // is whether the planned cue timings fit the encoded duration, and burn-in
    // does not change how long the file is — it is the timeline and `-t` that
    // decide that. Dropping the cues for the encode keeps this case working on
    // any machine, instead of skipping wherever the pinned fonts are absent,
    // which is exactly how the gap it closes stayed open.
    const workDir = join(dir, 'shipped')
    const forEncode: EditPlanV1 = { ...shipped, captions: { ...shipped.captions, cues: [] } }
    const { outputPath } = await renderEditPlan({
      plan: forEncode, sourcePath, assPath: null, fontsDir: null, workDir,
      strictFontIntegrity: false,
    })

    const probed = await execFile('/usr/bin/ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outputPath,
    ], { timeout: 120_000 })
    const measuredDurationMs = Math.round(Number(probed.stdout.trim()) * 1000)

    // THE ASSERTION THAT WOULD HAVE CAUGHT IT. Not "the plan is
    // self-consistent" — the plan always was. This runs the production
    // validator against the real file's real duration.
    expect(() => validateCaptionsAgainstOutput(shipped, measuredDurationMs)).not.toThrow()

    // And state the margin, so a future change that erodes it is visible in the
    // failure rather than only in a staging log an hour later.
    const last = shipped.captions.cues[shipped.captions.cues.length - 1]
    expect(measuredDurationMs - last.outputEndMs).toBeGreaterThan(0)
    cleanupRenderWorkDir(workDir)
  }, 400_000)
})
