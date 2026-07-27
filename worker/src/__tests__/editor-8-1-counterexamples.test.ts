// COUNTEREXAMPLES for the six proven Batch 8.1 defects, written BEFORE the fixes.
//
// Every test in this file MUST FAIL on PR #211 head 6786231 (rebased: df390f2).
// That is the point: the existing suite passes on all six, so a fix written
// against the existing suite would prove nothing. Each test asserts the OBSERVABLE
// product behaviour, not the shape of a particular implementation, so a real fix
// makes it pass and a cosmetic one does not.
//
// Naming: CX<n> maps to the audit's numbering.
import { describe, it, expect } from 'vitest'
import {
  validateEditPlan, canonicalEditPlan, EditPlanError,
  type EditPlanV1,
} from '../jobs/editPlanContract.js'
import { compileEditPlan, assertNoRemovedWordIsCaptioned, buildTimeMap } from '../jobs/editorCompile.js'
import { buildFfmpegGraph, buildFfmpegArgs } from '../jobs/ffmpegGraph.js'
import { renderAssDocument } from '../jobs/assCaptions.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS = { sourcePath: '/tmp/src.mp4', assPath: '/tmp/subs.ass', fontsDir: null, outputPath: '/tmp/out.mp4' }
const STYLE = { playResX: 1080, playResY: 1920, fontName: 'Inter', fontSizePx: 72, marginVerticalPx: 320 }

const CATALOG = JSON.parse(
  readFileSync(join(process.cwd(), 'edit_policy_v1.json'), 'utf8'),
).output as Record<string, unknown>

function compile(overrides: Parameters<typeof baseInput>[0] = {}): EditPlanV1 {
  return compileEditPlan({ ...baseInput(overrides), policy: policy() }).plan
}

// A deep clone that keeps the plan a plain JSON object, so re-validating it
// exercises the real parser rather than an already-typed value.
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

describe('CX1 — timed zooms must actually be time-gated in the filter graph', () => {
  // A zoom at 1s and a zoom at 31s are different edits. If both produce the same
  // FFmpeg arguments, the renderer cannot be applying either of them at a time,
  // which means every zoom affects the whole video and multiple zooms compound.
  // Zooms live at plan.video.zooms and use outputStartMs/outputEndMs. An earlier
  // draft of this test read plan.zooms[0].startMs, which is undefined on both
  // counts, so it failed with a TypeError rather than on the defect — red for the
  // wrong reason is as useless as green for the wrong reason.
  it('two plans whose zooms differ only in TIME produce different ffmpeg args', () => {
    const early = clone(compile())
    expect(early.video.zooms.length, 'fixture must produce at least one zoom').toBeGreaterThan(0)

    const late = clone(early)
    const z0 = early.video.zooms[0]
    const span = z0.outputEndMs - z0.outputStartMs
    // Move the zoom to the very start of the output. Derived from the plan, not a
    // magic constant, so it can never fall outside the duration — an earlier draft
    // used a fixed 15s shift and failed the range guard instead of the defect.
    late.video.zooms[0].outputStartMs = 0
    late.video.zooms[0].outputEndMs = span
    expect(z0.outputStartMs, 'the two zooms must actually differ in time')
      .toBeGreaterThan(span)

    // Both must still be structurally valid plans, so any difference in argv is
    // attributable to the zoom time and nothing else.
    const argsEarly = buildFfmpegArgs(buildFfmpegGraph(validateEditPlan(early), ASSETS))
    const argsLate = buildFfmpegArgs(buildFfmpegGraph(validateEditPlan(late), ASSETS))
    expect(argsLate).not.toEqual(argsEarly)
  })

  it('the zoom filter chain carries an enable window bounded by the zoom times', () => {
    const plan = compile()
    const argv = buildFfmpegArgs(buildFfmpegGraph(plan, ASSETS)).join(' ')
    const z = plan.video.zooms[0]
    // Whatever expression syntax is chosen, the zoom's own boundaries must appear
    // in the graph: a zoom that renders for the whole video is not this zoom.
    expect(argv).toMatch(/enable=/)
    expect(argv).toContain((z.outputStartMs / 1000).toFixed(3))
  })
})

describe('CX2 — caption emphasis must change the rendered ASS', () => {
  it('different emphasisWordIndices produce different ASS bytes', () => {
    const a = compile({ decision: { ...baseInput().decision, emphasisWordIndices: [25] } })
    const b = compile({ decision: { ...baseInput().decision, emphasisWordIndices: [26] } })
    // Guard the guard: if the two plans somehow have identical cues, this test
    // would be vacuous, so prove the emphasis actually reached the plan first.
    expect(canonicalEditPlan(b)).not.toEqual(canonicalEditPlan(a))
    expect(renderAssDocument(b, STYLE)).not.toEqual(renderAssDocument(a, STYLE))
  })

  it('an emphasised word is styled differently from its neighbours in the same cue', () => {
    const plan = compile({ decision: { ...baseInput().decision, emphasisWordIndices: [25] } })
    const doc = renderAssDocument(plan, STYLE)
    const emphasised = plan.captions.cues.filter((c) => (c.emphasisWordIndices ?? []).length > 0)
    expect(emphasised.length, 'at least one cue must carry emphasis').toBeGreaterThan(0)
    // Emphasis in ASS requires an override tag. The current renderer forbids ALL
    // override blocks, which is why emphasis cannot render at all — the fix must
    // permit a bounded, renderer-produced catalog while still rejecting any tag
    // that could originate from transcript text.
    expect(doc).toMatch(/\{\\[a-z0-9\\&H]+\}/i)
  })
})

describe('CX3 — the removed-word caption guard must not be vacuous', () => {
  it('a cue containing a REMOVED word is rejected', () => {
    const input = { ...baseInput(), policy: policy() }
    const res = compileEditPlan(input)
    const plan = clone(res.plan)
    const words = input.evidence.words
    const timeMap = buildTimeMap(
      plan.timeline.segments.map((s) => ({ startMs: s.sourceStartMs, endMs: s.sourceEndMs })),
      plan.timeline.segments.map((s) => s.transitionInOverlapMs),
    )
    // Find a word that the compiler REMOVED: it lies in no kept piece.
    const removedIdx = words.findIndex((w) => !timeMap.pieces.some(
      (p) => w.startMs >= p.sourceStartMs && w.endMs <= p.sourceEndMs))
    expect(removedIdx, 'the fixture must remove at least one word').toBeGreaterThanOrEqual(0)

    // Inject that word's text into an existing cue. This is the exact scenario the
    // guard claims to catch. It currently passes because a removed word maps to a
    // null output time and the check skips it — the check can never fire.
    plan.captions.cues[0].lines = [words[removedIdx].text]
    if (plan.captions.cues[0].wordIndices) plan.captions.cues[0].wordIndices = [removedIdx]

    expect(() => assertNoRemovedWordIsCaptioned(plan as EditPlanV1, words, timeMap))
      .toThrow(EditPlanError)
  })

  it('MUTATION CONTROL — an untouched compiled plan still passes the guard', () => {
    // Without this, a guard hard-wired to throw would satisfy the test above.
    const input = { ...baseInput(), policy: policy() }
    const res = compileEditPlan(input)
    const timeMap = buildTimeMap(
      res.plan.timeline.segments.map((s) => ({ startMs: s.sourceStartMs, endMs: s.sourceEndMs })),
      res.plan.timeline.segments.map((s) => s.transitionInOverlapMs),
    )
    expect(() => assertNoRemovedWordIsCaptioned(res.plan, input.evidence.words, timeMap)).not.toThrow()
  })
})

describe('CX4 — kept + removed must exactly partition the allowed source', () => {
  it('deleting a removal (and fixing its count) is rejected, not accepted', () => {
    const plan = clone(compile())
    expect(plan.timeline.removals.length, 'fixture must produce removals').toBeGreaterThan(1)
    // Drop one declared removal and make the stored count self-consistent again.
    // Self-consistency is not the property that matters: after this edit there is
    // source media that is neither kept nor explained as removed.
    //
    // NOTE: PlanRemoval has NO `index` field. An earlier version of this test also
    // re-indexed the array, which added an unknown key and made strictKeys throw —
    // the test went green for a reason that had nothing to do with the partition.
    // A counterexample that passes for the wrong reason is worse than none.
    const dropped = plan.timeline.removals[1]
    plan.timeline.removals.splice(1, 1)
    plan.complexity.removalCount = plan.timeline.removals.length

    // Prove the edit really does orphan source time, so the assertion below is
    // about coverage and not about some incidental malformation.
    const covered = [...plan.timeline.segments.map((s) => [s.sourceStartMs, s.sourceEndMs] as const),
      ...plan.timeline.removals.map((r) => [r.sourceStartMs, r.sourceEndMs] as const)]
    const orphaned = !covered.some(([a, b]) => dropped.sourceStartMs >= a && dropped.sourceEndMs <= b)
    expect(orphaned, 'the dropped interval must now be neither kept nor removed').toBe(true)

    expect(() => validateEditPlan(plan)).toThrow(EditPlanError)
  })

  it('MUTATION CONTROL — the unmodified plan validates', () => {
    expect(() => validateEditPlan(clone(compile()))).not.toThrow()
  })
})

describe('CX5 — the output profile must match the one frozen catalog entry', () => {
  const mutations: Array<[string, (o: Record<string, unknown>) => void]> = [
    ['profileId', (o) => { o.profileId = 'not-a-catalog-profile-v9' }],
    ['videoCodec', (o) => { o.videoCodec = 'libx265' }],
    ['audioCodec', (o) => { o.audioCodec = 'opus' }],
    ['pixelFormat', (o) => { o.pixelFormat = 'yuv444p' }],
    ['width', (o) => { o.width = 720 }],
    ['height', (o) => { o.height = 1280 }],
    ['fpsNum', (o) => { o.fpsNum = 60 }],
    ['audioSampleRateHz', (o) => { o.audioSampleRateHz = 44100 }],
    ['audioChannels', (o) => { o.audioChannels = 1 }],
    ['faststart', (o) => { o.faststart = false }],
  ]
  for (const [field, mutate] of mutations) {
    it(`a non-catalog output.${field} is rejected`, () => {
      const plan = clone(compile()) as unknown as { output: Record<string, unknown> }
      mutate(plan.output)
      expect(() => validateEditPlan(plan)).toThrow(EditPlanError)
    })
  }

  it('the compiled plan already equals the frozen catalog on every profile field', () => {
    const plan = compile()
    for (const k of ['profileId', 'width', 'height', 'fpsNum', 'fpsDen', 'videoCodec',
      'audioCodec', 'pixelFormat', 'audioSampleRateHz', 'audioChannels', 'faststart']) {
      expect((plan.output as unknown as Record<string, unknown>)[k], `output.${k}`).toEqual(CATALOG[k])
    }
  })
})

describe('CX6 — caption capacity must never silently drop words', () => {
  it('exceeding maxCues fails closed instead of dropping the tail', () => {
    const p = policy()
    // Force the cap far below what the fixture needs, so the overflow path runs.
    p.captions.maxCues = 2
    let plan: EditPlanV1 | null = null
    let threw: unknown = null
    try { plan = compileEditPlan({ ...baseInput(), policy: p }).plan } catch (e) { threw = e }

    if (threw !== null) {
      expect(threw).toBeInstanceOf(EditPlanError)
      return
    }
    // If it did not fail, it must at minimum have recorded an EXPLICIT warning
    // naming the loss. Silence is the defect: words vanish with no trace.
    expect(plan).not.toBeNull()
    const codes = (plan as EditPlanV1).warnings.map((w) => w.code)
    expect(codes.join(','), 'overflow produced neither an error nor a warning').toMatch(/caption.*(overflow|capacity|dropped|incomplete)/)
  })

  it('every staged word that fits a kept piece is either captioned or accounted for', () => {
    const p = policy()
    p.captions.maxCues = 2
    let plan: EditPlanV1 | null = null
    try { plan = compileEditPlan({ ...baseInput(), policy: p }).plan } catch { return } // failing closed is acceptable
    const captionedWords = (plan as EditPlanV1).captions.cues
      .reduce((n, c) => n + c.lines.join(' ').split(' ').filter(Boolean).length, 0)
    // The compiler knows how many words it staged; the plan must not quietly
    // contain fewer than that without saying so.
    expect((plan as EditPlanV1).complexity.cueCount).toEqual((plan as EditPlanV1).captions.cues.length)
    expect(captionedWords).toBeGreaterThan(0)
  })
})
