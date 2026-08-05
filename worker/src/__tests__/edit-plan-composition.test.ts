// COMPOSITION — the plan's second source, and what the graph does with it.
//
// Two halves, deliberately in one file because they are one claim: a plan may
// say "show this clip here", and the renderer must produce exactly that or
// refuse. Splitting them would let the contract accept a shape the graph cannot
// build, which is the failure mode both files exist to prevent.
import { describe, it, expect } from 'vitest'
import {
  validateEditPlan, canonicalEditPlan, editPlanSha256, EditPlanError,
  MAX_OVERLAYS, MAX_COMPOSITION_SOURCES,
  type EditPlanV1, type PlanComposition,
} from '../jobs/editPlanContract.js'
import { buildFfmpegGraph, buildFfmpegArgs, serializeFilterGraph } from '../jobs/ffmpegGraph.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { baseInput, policy, shippedEncoder, SOURCE_ASSET_ID } from './fixtures/editPlanFixture.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}

const CLIP_ASSET_ID = '11111111-2222-3333-4444-555555555555'
const CLIP_ASSET_ID_2 = '66666666-7777-8888-9999-aaaaaaaaaaaa'
const CLIP_SHA = 'a'.repeat(64)
const CLIP_SHA_2 = 'b'.repeat(64)
const LABEL_SHA = 'c'.repeat(64)

function hardCutPlan(): EditPlanV1 {
  const input = baseInput()
  input.decision.transitionPolicy = 'hard_cuts_only'
  return compileEditPlan({ ...input, policy: policy() }).plan
}

/** A plan with one screen-capture cutaway placed inside the finished video.
 *  Built by mutating a compiled plan rather than hand-writing a document, so
 *  every OTHER invariant in the contract is still the compiler's real output. */
function withComposition(
  build: (plan: EditPlanV1) => PlanComposition = defaultComposition,
): EditPlanV1 {
  const plan = JSON.parse(JSON.stringify(hardCutPlan())) as EditPlanV1
  plan.composition = build(plan)
  plan.complexity.overlayCount = plan.composition.overlays.length
  return validateEditPlan(JSON.parse(JSON.stringify(plan)))
}

function defaultComposition(plan: EditPlanV1): PlanComposition {
  // Placed in the middle of the video and 2s long, so there is a base window on
  // BOTH sides of it — the case that exercises the split, the two conformances
  // and the three-way concat at once.
  const startMs = Math.floor(plan.output.durationMs / 3)
  return {
    sources: [{
      index: 0, origin: 'screen_capture', assetId: CLIP_ASSET_ID,
      checksum: CLIP_SHA, durationMs: 9000,
    }],
    overlays: [{
      index: 0, sourceIndex: 0, fit: 'full_frame',
      sourceStartMs: 500, sourceEndMs: 2500,
      outputStartMs: startMs, outputEndMs: startMs + 2000,
      clipLabelSha256: LABEL_SHA, reasonCode: 'declared_clip',
    }],
  }
}

const ENCODER = shippedEncoder()
const ASSETS = {
  sourcePath: '/var/tmp/edit/source.mp4',
  assPath: '/var/tmp/edit/captions.ass',
  fontsDir: '/opt/fonts',
  outputPath: '/var/tmp/edit/out.mp4',
  encoder: ENCODER,
}
const CLIP_PATH = '/var/tmp/edit/clip0.mp4'

// ---------------------------------------------------------------------------
describe('the empty composition is a real, complete state', () => {
  it('the compiler emits one, and it validates', () => {
    const plan = hardCutPlan()
    expect(plan.composition).toEqual({ sources: [], overlays: [] })
    expect(plan.complexity.overlayCount).toBe(0)
    expect(() => validateEditPlan(JSON.parse(canonicalEditPlan(plan)))).not.toThrow()
  })

  it('a plan that composes nothing builds the graph it always did', () => {
    // The new code path must be reachable ONLY by the new capability — the same
    // discipline the crossfade fold was added under. A plan with no overlays
    // must not gain a single node, or every hard-cut plan already proven against
    // the shipped graph would silently change its hash.
    const graph = buildFfmpegGraph(hardCutPlan(), ASSETS)
    expect(graph.inputs).toHaveLength(1)
    expect(serializeFilterGraph(graph)).not.toContain('cx')
  })
})

// ---------------------------------------------------------------------------
describe('the contract refuses a composition the renderer could not honour', () => {
  it('accepts a well-formed cutaway', () => {
    expect(() => withComposition()).not.toThrow()
  })

  it('refuses an overlay that would retime the clip', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.overlays[0].sourceEndMs = c.overlays[0].sourceStartMs + 1000 // half the output span
      return c
    }))).toBe('edit_plan_divergent')
  })

  it('refuses two clips claiming the same instant of the finished video', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.sources.push({
        index: 1, origin: 'screen_capture', assetId: CLIP_ASSET_ID_2,
        checksum: CLIP_SHA_2, durationMs: 9000,
      })
      const first = c.overlays[0]
      c.overlays.push({
        ...first, index: 1, sourceIndex: 1,
        outputStartMs: first.outputStartMs + 500, outputEndMs: first.outputEndMs + 500,
      })
      return c
    }))).toBe('edit_plan_invalid')
  })

  it('refuses an overlay running past the end of the video', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.overlays[0].outputStartMs = plan.output.durationMs - 500
      c.overlays[0].outputEndMs = plan.output.durationMs + 1500
      c.overlays[0].sourceEndMs = c.overlays[0].sourceStartMs + 2000
      return c
    }))).toBe('edit_plan_invalid')
  })

  it('refuses a source span the clip is not long enough to contain', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.sources[0].durationMs = 1000
      return c
    }))).toBe('edit_plan_invalid')
  })

  it('refuses the take listed as a composed source — a clip is not a source', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.sources[0].assetId = SOURCE_ASSET_ID
      return c
    }))).toBe('edit_plan_divergent')
  })

  it('refuses a declared source no overlay ever shows', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.sources.push({
        index: 1, origin: 'screen_capture', assetId: CLIP_ASSET_ID_2,
        checksum: CLIP_SHA_2, durationMs: 9000,
      })
      return c
    }))).toBe('edit_plan_divergent')
  })

  it('refuses an overlay with no composed source to point at', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.sources = []
      return c
    }))).toBe('edit_plan_divergent')
  })

  it('refuses the same clip declared twice', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.sources.push({ ...c.sources[0], index: 1 })
      c.overlays.push({
        ...c.overlays[0], index: 1, sourceIndex: 1,
        outputStartMs: c.overlays[0].outputEndMs, outputEndMs: c.overlays[0].outputEndMs + 2000,
      })
      return c
    }))).toBe('edit_plan_invalid')
  })

  it('refuses a fit the renderer does not implement', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      ;(c.overlays[0] as unknown as Record<string, unknown>).fit = 'pip_bottom_right'
      return c
    }))).toBe('edit_plan_invalid')
  })

  it('refuses an origin borrowed from the take vocabulary', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      ;(c.sources[0] as unknown as Record<string, unknown>).origin = 'upload'
      return c
    }))).toBe('edit_plan_invalid')
  })

  it('refuses a clip label carried as text rather than as a digest', () => {
    expect(codeOf(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      ;(c.overlays[0] as unknown as Record<string, unknown>).clipLabelSha256 = 'the settings page'
      return c
    }))).toBe('edit_plan_invalid')
  })

  it('null is a real label value — a clip placed without a declared slot', () => {
    expect(() => withComposition((plan) => {
      const c = defaultComposition(plan)
      c.overlays[0].clipLabelSha256 = null
      return c
    })).not.toThrow()
  })

  it('refuses a complexity counter that disagrees with the composition', () => {
    const plan = withComposition()
    const doc = JSON.parse(canonicalEditPlan(plan)) as Record<string, unknown>
    ;(doc.complexity as Record<string, number>).overlayCount = 0
    expect(codeOf(() => validateEditPlan(doc))).toBe('edit_plan_invalid')
  })

  it('bounds both arrays', () => {
    expect(MAX_OVERLAYS).toBeGreaterThan(0)
    expect(MAX_COMPOSITION_SOURCES).toBeGreaterThan(0)
    const plan = withComposition()
    const doc = JSON.parse(canonicalEditPlan(plan)) as Record<string, unknown>
    const comp = doc.composition as { overlays: unknown[] }
    comp.overlays = Array.from({ length: MAX_OVERLAYS + 1 }, () => comp.overlays[0])
    expect(codeOf(() => validateEditPlan(doc))).toBe('edit_plan_invalid')
  })

  it('the hash covers the composition', () => {
    const withClip = withComposition()
    const moved = JSON.parse(JSON.stringify(withClip)) as EditPlanV1
    moved.composition.overlays[0].outputStartMs += 40
    moved.composition.overlays[0].outputEndMs += 40
    expect(editPlanSha256(validateEditPlan(JSON.parse(JSON.stringify(moved)))))
      .not.toBe(editPlanSha256(withClip))
  })
})

// ---------------------------------------------------------------------------
describe('the graph renders exactly what the composition says', () => {
  it('adds ONE ffmpeg input per composed source, after the take', () => {
    const graph = buildFfmpegGraph(withComposition(), { ...ASSETS, clipPaths: [CLIP_PATH] })
    expect(graph.inputs.map((i) => i.path)).toEqual([ASSETS.sourcePath, CLIP_PATH])
    // The clip is read as an INPUT, never as a path inside a filter string —
    // the property the whole builder exists to preserve.
    expect(serializeFilterGraph(graph)).not.toContain(CLIP_PATH)
    expect(buildFfmpegArgs(graph)).toContain(CLIP_PATH)
  })

  it('fails rather than rendering the take where a clip was asked for', () => {
    expect(codeOf(() => buildFfmpegGraph(withComposition(), ASSETS))).toBe('render_graph_invalid')
  })

  it('fails on more clip paths than the plan composes', () => {
    expect(codeOf(() => buildFfmpegGraph(hardCutPlan(), { ...ASSETS, clipPaths: [CLIP_PATH] })))
      .toBe('render_graph_invalid')
  })

  it('cuts the timeline into base/clip/base and joins them back', () => {
    const graph = buildFfmpegGraph(withComposition(), { ...ASSETS, clipPaths: [CLIP_PATH] })
    const concat = graph.nodes.find((n) => n.id === 'cxconcat')
    expect(concat).toBeDefined()
    // three windows: before the cutaway, the cutaway, after it.
    expect(concat!.args).toContainEqual({ key: 'n', value: 3 })
    expect(concat!.args).toContainEqual({ key: 'a', value: 0 })
    // The clip's picture is trimmed from ITS OWN input, at its own timestamps.
    const clipTrim = graph.nodes.find((n) => n.id === 'cxctrim1')
    expect(clipTrim!.inputs).toEqual(['1:v'])
    expect(clipTrim!.args).toContainEqual({ key: 'start', value: '0.500' })
    expect(clipTrim!.args).toContainEqual({ key: 'end', value: '2.500' })
  })

  it('never routes a clip into the audio path', () => {
    const graph = buildFfmpegGraph(withComposition(), { ...ASSETS, clipPaths: [CLIP_PATH] })
    // No node anywhere reads the clip's audio stream. A screen capture's system
    // audio silently mixed under a creator's voice is the failure this pins.
    for (const node of graph.nodes) expect(node.inputs).not.toContain('1:a')
    expect(graph.audioOut).toBe('aout')
  })

  it('composes UNDER the captions, so a spoken line is never painted over', () => {
    const graph = buildFfmpegGraph(withComposition(), { ...ASSETS, clipPaths: [CLIP_PATH] })
    const ids = graph.nodes.map((n) => n.id)
    expect(ids.indexOf('cxconcat')).toBeLessThan(ids.indexOf('subs'))
  })

  it('sinks the base picture rather than dangling it when a clip covers everything', () => {
    const plan = withComposition((p) => ({
      sources: [{
        index: 0, origin: 'screen_capture', assetId: CLIP_ASSET_ID,
        checksum: CLIP_SHA, durationMs: p.output.durationMs + 5000,
      }],
      overlays: [{
        index: 0, sourceIndex: 0, fit: 'full_frame',
        sourceStartMs: 0, sourceEndMs: p.output.durationMs,
        outputStartMs: 0, outputEndMs: p.output.durationMs,
        clipLabelSha256: null, reasonCode: 'declared_clip',
      }],
    }))
    const graph = buildFfmpegGraph(plan, { ...ASSETS, clipPaths: [CLIP_PATH] })
    // An unconsumed pad makes ffmpeg refuse the graph outright, so the take's
    // picture is sunk explicitly. Its AUDIO is still what plays.
    expect(graph.nodes.some((n) => n.filter === 'nullsink')).toBe(true)
    expect(graph.audioOut).toBe('aout')
    expect(() => buildFfmpegArgs(graph)).not.toThrow()
  })

  it('is deterministic: the same plan and paths produce the same argv', () => {
    const a = buildFfmpegArgs(buildFfmpegGraph(withComposition(), { ...ASSETS, clipPaths: [CLIP_PATH] }))
    const b = buildFfmpegArgs(buildFfmpegGraph(withComposition(), { ...ASSETS, clipPaths: [CLIP_PATH] }))
    expect(a).toEqual(b)
  })

  it('refuses a clip path that is not a plain absolute local path', () => {
    for (const bad of ['relative/clip.mp4', '/var/tmp/../etc/passwd', 'http://x/clip.mp4', '-i']) {
      expect(codeOf(() => buildFfmpegGraph(withComposition(), { ...ASSETS, clipPaths: [bad] })))
        .toBe('render_graph_invalid')
    }
  })
})
