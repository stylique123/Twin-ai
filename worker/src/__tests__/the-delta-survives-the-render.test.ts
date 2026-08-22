// THE NUMBER THAT USED TO EXIST FOR ONE FUNCTION CALL.
//
// ⚠️ THE VALIDATOR ALWAYS KNEW THE ANSWER AND ALWAYS FORGOT IT. `durationDeltaMs`
// was computed, returned, and read by nobody: on success it evaporated, on
// failure it survived only inside an interpolated error string. When a staging
// render failed at -303ms against a ±250ms tolerance, "is this drifting or was
// it a one-off" could only be answered by re-running a 40-minute matrix.
//
// ⚖️ THE FAILING CASE IS THE ONE WORTH KEEPING, so the observation is handed out
// BEFORE the tolerance check decides. A hook after the check would record only
// the renders nobody needs to investigate.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validateProbedOutput, type DurationObservation, type ProbeResult } from '../jobs/editorValidateOutput.js'
import { loadRenderCatalog } from '../jobs/editorRender.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import type { EditPlanV1 } from '../jobs/editPlanContract.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'
import { resolvePlanDuration } from '../jobs/frameTimeline.js'

/** The frame-grid duration a correct renderer emits. The observation's
 *  `predictedMs` is this, not the Director's request — see 0164. */
const renderableMs = (p: EditPlanV1): number => Math.round(resolvePlanDuration(p).renderableDurationMs)

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0154_what_the_render_promised_and_delivered.sql'), 'utf8')
const RECORDER = readFileSync(join(REPO, 'worker/src/jobs/renderAttempts.ts'), 'utf8')
const STAGE = readFileSync(join(REPO, 'worker/src/jobs/editorRenderStage.ts'), 'utf8')
const V2 = readFileSync(join(REPO, 'worker/src/jobs/editorV2.ts'), 'utf8')

// ⚖️ THE REAL CATALOG PROFILE AND A REAL COMPILED PLAN, not a hand-rolled shape.
// A fixture invented for this test could drift from what the renderer actually
// validates, and then this suite would pass while production disagreed.
const CATALOG = loadRenderCatalog()
const PROFILE = CATALOG.outputProfiles['vertical-social-1080x1920-h264-aac-v1']
const plan = (): EditPlanV1 => compileEditPlan({ ...baseInput(), policy: policy() }).plan
const BYTES = 4_000_000

function probeOf(p: EditPlanV1, actualMs: number): ProbeResult {
  const secs = `${Math.floor(actualMs / 1000)}.${String(actualMs % 1000).padStart(3, '0')}`
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: secs, size: '1000000' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920,
        pix_fmt: 'yuv420p', r_frame_rate: '30/1', avg_frame_rate: '30/1', duration: secs },
      { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, duration: secs },
    ],
  }
}

describe('the duration observation', () => {
  it('is delivered when the render PASSES', () => {
    const p = plan()
    const seen: DurationObservation[] = []
    validateProbedOutput(probeOf(p, renderableMs(p) - 70), p, PROFILE, BYTES, (o) => seen.push(o))
    expect(seen).toHaveLength(1)
    expect(seen[0].predictedMs).toBe(renderableMs(p))
    expect(seen[0].deltaMs).toBe(-70)
    expect(seen[0].withinTolerance).toBe(true)
  })

  it('is delivered when the render FAILS — the case that was trapped in a string', () => {
    // ⚠️ THE SHAPE OF THE REAL 2026-08-20 FAILURE: 303ms short against a ±250ms
    // tolerance. That row is exactly what nobody could query afterwards.
    const p = plan()
    const seen: DurationObservation[] = []
    expect(() =>
      validateProbedOutput(probeOf(p, renderableMs(p) - 303), p, PROFILE, BYTES, (o) => seen.push(o)),
    ).toThrow()
    expect(seen).toHaveLength(1)
    expect(seen[0].deltaMs).toBe(-303)
    expect(seen[0].toleranceMs).toBe(250)
    expect(seen[0].withinTolerance).toBe(false)
  })

  it('carries the frame grid as a rational, not a decimal', () => {
    // ⚖️ 30000/1001 IS A REAL FRAME RATE AND 29.97 IS NOT THE SAME NUMBER. The
    // quantisation hypothesis is arithmetic about frame durations, so rounding
    // here would corrupt the evidence in the one dimension being tested.
    const p = plan()
    const seen: DurationObservation[] = []
    validateProbedOutput(probeOf(p, renderableMs(p)), p, PROFILE, BYTES, (o) => seen.push(o))
    expect(seen[0].fpsNum).toBe(30)
    expect(seen[0].fpsDen).toBe(1)
  })
})

describe('evidence may not decide the thing it is evidence of', () => {
  it('a reporter that throws does not rescue a render that must fail', () => {
    const p = plan()
    expect(() =>
      validateProbedOutput(probeOf(p, renderableMs(p) - 303), p, PROFILE, BYTES, () => {
        throw new Error('the telemetry backend is on fire')
      }),
    ).toThrow(/tolerance/)
  })

  it('a reporter that throws does not sink a render that must pass', () => {
    const p = plan()
    expect(() =>
      validateProbedOutput(probeOf(p, renderableMs(p)), p, PROFILE, BYTES, () => {
        throw new Error('still on fire')
      }),
    ).not.toThrow()
  })

  it('no observer at all is a valid caller', () => {
    // Every existing call site and test passes four arguments and must keep
    // working unchanged. Absent means nobody is recording, not that nothing
    // happened.
    const p = plan()
    expect(() => validateProbedOutput(probeOf(p, renderableMs(p)), p, PROFILE, BYTES)).not.toThrow()
  })
})

describe('what gets stored', () => {
  it('records failures as well as successes', () => {
    expect(RECORDER).toContain("o.withinTolerance ? 'within_tolerance' : 'duration_mismatch'")
  })

  it('never throws out of the write path', () => {
    expect(RECORDER).toMatch(/try \{[\s\S]*render_attempts[\s\S]*catch \(e\)/)
    expect(RECORDER).toContain('render_attempt_not_recorded')
  })

  it('threads applied_cuts from the compiling stage rather than re-deriving it', () => {
    // ⚠️ TWO SOURCES FOR ONE FACT is how a measurement stops being comparable
    // with itself. Counting the plan's segments and calling it applied_cuts
    // would be a different number wearing the same name.
    expect(V2).toContain('compiled?.cutStats.appliedCuts ?? null')
    expect(STAGE).toContain('appliedCuts,')
    expect(STAGE).toContain('segmentCount: plan.timeline.segments.length')
  })

  it('keeps unknown separate from zero', () => {
    expect(RECORDER).toContain('appliedCuts: number | null')
    expect(MIGRATION).toContain('applied_cuts integer,')
    expect(MIGRATION).not.toMatch(/applied_cuts integer not null/)
  })
})

describe('the table cannot hold a row that contradicts itself', () => {
  it('asserts the delta IS the subtraction it claims to be', () => {
    expect(MIGRATION).toContain('duration_delta_ms = actual_duration_ms - predicted_duration_ms')
  })

  it('stores fps as a rational', () => {
    expect(MIGRATION).toContain('output_fps_num integer not null')
    expect(MIGRATION).toContain('output_fps_den integer not null')
    expect(MIGRATION).not.toMatch(/output_fps (numeric|real|double)/)
  })

  it('is system-owned — no client role may touch the evidence', () => {
    expect(MIGRATION).toContain('revoke all on table public.render_attempts from anon, authenticated')
    expect(MIGRATION).toContain('enable row level security')
    expect(MIGRATION).not.toMatch(/grant select on table public\.render_attempts/)
  })
})
