// THE STAGING MATRIX'S CAPTION PREDICATES, RUN OFFLINE.
//
// phase8 is the only thing that ever executes the renderer, and it costs ~40
// minutes against real Gemini and ASR on a serialised staging project. An
// assertion written wrong there is not discovered until a run ends — which is
// exactly what nearly happened: the first draft of these predicates read
// `startMs`/`endMs` when a plan's cues carry `outputStartMs`/`outputEndMs`, and
// three of seven would have failed on shape rather than on substance.
//
// So the predicates live in scripts/staging-integration/captionAssertions.mjs
// and this file runs them against a REAL compiled plan from the same fixture
// the compiler's own suite uses. A shape change in the plan breaks this test in
// seconds instead of breaking the matrix in forty minutes.
//
// The negative cases matter more than the positive one. A caption assertion
// that passes on a broken plan proves nothing, and "the matrix goes green
// without examining the thing it covers" is the defect this whole file exists
// to close.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { captionChecks } from '../../../scripts/staging-integration/captionAssertions.mjs'
import { compileEditPlan, loadEditPolicy } from '../jobs/editorCompile.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'

const POLICY = JSON.parse(JSON.stringify(loadEditPolicy())) as Record<string, never>

function realPlan(): Record<string, never> {
  return compileEditPlan({ ...baseInput(), policy: policy() }).plan as unknown as Record<string, never>
}
/** The renderer lands 93-120 ms SHORT of the plan; model that, not the promise. */
function measured(plan: { output: { durationMs: number } }): number {
  return plan.output.durationMs - 110
}
const failures = (plan: unknown, dur: number): string[] =>
  captionChecks(plan, POLICY, dur).filter((c) => !c.ok).map((c) => c.name)

describe('staging caption assertions — against a real compiled plan', () => {
  it('a genuine plan passes every predicate', () => {
    const plan = realPlan()
    expect(failures(plan, measured(plan as never))).toEqual([])
  })

  it('the predicates actually ran — this is not an empty list passing vacuously', () => {
    const plan = realPlan()
    const all = captionChecks(plan, POLICY, measured(plan as never))
    expect(all.length).toBeGreaterThanOrEqual(7)
    expect(all.every((c) => typeof c.name === 'string' && c.name.length > 0)).toBe(true)
  })

  it('CUE FIELD NAMES are pinned — the bug that nearly cost a matrix run', () => {
    // If a plan's cues ever stop carrying outputStartMs/outputEndMs, the
    // ordering predicate silently reads undefined and reports a bad span. This
    // asserts the shape directly so the failure names the cause.
    const cues = (realPlan() as unknown as { captions: { cues: Array<Record<string, unknown>> } }).captions.cues
    expect(cues.length).toBeGreaterThan(0)
    for (const c of cues) {
      expect(Number.isInteger(c.outputStartMs)).toBe(true)
      expect(Number.isInteger(c.outputEndMs)).toBe(true)
      expect(Array.isArray(c.lines)).toBe(true)
    }
  })

  it('NEGATIVE: no cues at all is caught', () => {
    const plan = realPlan() as unknown as { captions: { cues: unknown[] }, output: { durationMs: number } }
    plan.captions.cues = []
    expect(failures(plan, measured(plan))).toContain('A18a the plan carries caption cues at all')
  })

  it('NEGATIVE: overlapping cues are caught', () => {
    const plan = realPlan() as unknown as { captions: { cues: Array<Record<string, number>> }, output: { durationMs: number } }
    plan.captions.cues[1].outputStartMs = plan.captions.cues[0].outputEndMs - 1
    expect(failures(plan, measured(plan))).toContain('A18b cues are ordered, non-overlapping and positive-length')
  })

  it('NEGATIVE: a zero-length cue is caught', () => {
    const plan = realPlan() as unknown as { captions: { cues: Array<Record<string, number>> }, output: { durationMs: number } }
    plan.captions.cues[0].outputEndMs = plan.captions.cues[0].outputStartMs
    expect(failures(plan, measured(plan))).toContain('A18b cues are ordered, non-overlapping and positive-length')
  })

  it('NEGATIVE: an off-catalog caption preset is caught', () => {
    const plan = realPlan() as unknown as { captions: { presetId: string }, output: { durationMs: number } }
    plan.captions.presetId = 'caption-invented-v9'
    expect(failures(plan, measured(plan))).toContain('A18c the plan names a caption preset that exists in the frozen policy')
  })

  it('NEGATIVE: too many lines in one cue is caught', () => {
    const plan = realPlan() as unknown as { captions: { cues: Array<{ lines: string[] }> }, output: { durationMs: number } }
    plan.captions.cues[0].lines = ['a', 'b', 'c', 'd', 'e']
    expect(failures(plan, measured(plan))).toContain('A18d no cue exceeds the frozen maxLinesPerCue')
  })

  it('NEGATIVE: an over-wide caption line is caught', () => {
    const plan = realPlan() as unknown as { captions: { cues: Array<{ lines: string[] }> }, output: { durationMs: number } }
    plan.captions.cues[0].lines = ['x'.repeat(500)]
    expect(failures(plan, measured(plan))).toContain('A18e no caption LINE exceeds the preset maxCharsPerLine')
  })

  it('NEGATIVE: a caption past the MEASURED end is caught — the 93-120 ms defect class', () => {
    // The load-bearing one. This cue is INSIDE the planned duration and OUTSIDE
    // the measured one, so a check against the plan's promise would pass it.
    const plan = realPlan() as unknown as { captions: { cues: Array<Record<string, number>> }, output: { durationMs: number } }
    const last = plan.captions.cues[plan.captions.cues.length - 1]
    last.outputEndMs = plan.output.durationMs
    const f = failures(plan, measured(plan))
    expect(f).toContain('A18f the last caption ends before the MEASURED video does')
    expect(f).toContain('A18g …and clears the frozen tail guard against the measured duration')
  })

  it('NEGATIVE: a cue inside the video but inside the TAIL GUARD is caught by g, not f', () => {
    // Separating the two matters: f is "outside the video at all", g is "too
    // close to the end to be safe". A single combined check could not tell a
    // caller which of those went wrong.
    const plan = realPlan() as unknown as { captions: { cues: Array<Record<string, number>> }, output: { durationMs: number } }
    const dur = measured(plan)
    plan.captions.cues[plan.captions.cues.length - 1].outputEndMs = dur - 10
    const f = failures(plan, dur)
    expect(f).not.toContain('A18f the last caption ends before the MEASURED video does')
    expect(f).toContain('A18g …and clears the frozen tail guard against the measured duration')
  })

  it('bounds come from the FROZEN policy, not restated in the predicates', () => {
    // Raising the ceiling in a copied policy must change the verdict; if it
    // does not, the predicate is reading a number of its own somewhere.
    const plan = realPlan() as unknown as { captions: { cues: Array<{ lines: string[] }> }, output: { durationMs: number } }
    plan.captions.cues[0].lines = ['x'.repeat(500)]
    const loose = JSON.parse(JSON.stringify(POLICY))
    loose.captions.presets[(plan as unknown as { captions: { presetId: string } }).captions.presetId].maxCharsPerLine = 1000
    const names = captionChecks(plan, loose, measured(plan)).filter((c) => !c.ok).map((c) => c.name)
    expect(names).not.toContain('A18e no caption LINE exceeds the preset maxCharsPerLine')
  })
})
