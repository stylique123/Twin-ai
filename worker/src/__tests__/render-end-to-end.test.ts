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
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { baseInput, policy, SOURCE_DURATION_MS } from './fixtures/editPlanFixture.js'
import { renderEditPlan, extractCover, fileSha256, cleanupRenderWorkDir } from '../jobs/editorRender.js'
import { validateRenderedOutput } from '../jobs/editorValidateOutput.js'
import { renderAssDocument, assertNoOverrideBlock } from '../jobs/assCaptions.js'
import { loadRenderCatalog } from '../jobs/editorRender.js'
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
const HAVE_FONTS = existsSync(join(FONTS_DIR, 'DejaVuSans-Bold.ttf'))

let dir = ''
let sourcePath = ''
let plan: EditPlanV1

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
}, 420_000)

afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

const maybe = HAVE_FFMPEG ? describe : describe.skip

maybe('the graph ffmpeg is actually given', () => {
  it('ENCODES — the plan compiles to a graph this ffmpeg build accepts and runs', async () => {
    const workDir = join(dir, 'w1')
    const assPath = plan.captions.cues.length > 0 ? join(workDir, 'captions.ass') : null
    if (assPath) {
      const catalog = loadRenderCatalog()
      const preset = catalog.captionPresets[plan.captions.presetId]
      const doc = renderAssDocument(plan, {
        playResX: plan.output.width, playResY: plan.output.height,
        fontName: preset.fontFamily, fontSizePx: plan.captions.fontSizePx,
        marginVerticalPx: plan.captions.marginVerticalPx,
      })
      assertNoOverrideBlock(doc, plan.captions.cues.length)
      require('node:fs').mkdirSync(workDir, { recursive: true })
      writeFileSync(assPath, doc, 'utf8')
    }

    const { outputPath, evidence } = await renderEditPlan({
      plan, sourcePath, assPath,
      fontsDir: assPath ? FONTS_DIR : null,
      workDir,
      // Strict only when the fonts really are the pinned ones. On a machine
      // whose DejaVu differs, refusing would be correct behaviour reported as a
      // test failure, which teaches the wrong lesson.
      strictFontIntegrity: HAVE_FONTS,
    })

    expect(existsSync(outputPath)).toBe(true)
    expect(evidence.outputBytes).toBeGreaterThan(0)
    expect(statSync(outputPath).size).toBe(evidence.outputBytes)
    expect(evidence.outputSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(evidence.graphSha256).toMatch(/^[0-9a-f]{64}$/)

    // THE VALIDATOR, ON A REAL ENCODE. Every other test feeds it a probe object
    // written by hand — which proves it judges a probe correctly, not that a
    // real encode produces a probe it accepts.
    const validation = await validateRenderedOutput({ outputPath, coverPath: null, plan })
    expect(validation.measurements.width).toBe(plan.output.width)
    expect(validation.measurements.height).toBe(plan.output.height)
    expect(Math.abs(validation.measurements.durationMs - plan.output.durationMs)).toBeLessThanOrEqual(250)

    // The cover, from the finished file rather than the source.
    const { coverPath, bytes } = await extractCover(outputPath, plan, workDir)
    expect(bytes).toBeGreaterThan(0)
    const withCover = await validateRenderedOutput({ outputPath, coverPath, plan })
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
