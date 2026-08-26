// C6, first half only: what a render cost, from facts already recorded.
//
// These pin the two properties that make the measurement worth having — that a
// missing number stays missing rather than becoming zero, and that no total is
// produced while the largest cost of a video pipeline is unrecorded.
import { describe, expect, it } from 'vitest'
import { costIsComparable, renderCost, UNMEASURED_TODAY } from '../renderCost'

const P = 'p1'
const ev = (stage: string, iso: string) => ({ stage, created_at: iso })

describe('stage spans come from the event log, and only from it', () => {
  it('measures each stage from its first to its last event', () => {
    const c = renderCost({
      projectId: P,
      events: [
        ev('analyze', '2026-08-06T10:00:00Z'), ev('analyze', '2026-08-06T10:00:30Z'),
        ev('render', '2026-08-06T10:01:00Z'), ev('render', '2026-08-06T10:03:00Z'),
      ],
      directorCall: null,
    })
    expect(c.stages).toEqual([
      { stage: 'render', ms: 120_000 },
      { stage: 'analyze', ms: 30_000 },
    ])
  })

  it('orders longest first, breaking ties by name so the order is stable', () => {
    const c = renderCost({
      projectId: P,
      events: [ev('b', '2026-08-06T10:00:00Z'), ev('a', '2026-08-06T10:00:00Z')],
      directorCall: null,
    })
    expect(c.stages.map((s) => s.stage)).toEqual(['a', 'b'])
  })

  it('DROPS an unparseable timestamp instead of treating it as epoch', () => {
    // Epoch would turn one bad row into a fifty-year render, and a cost report
    // that can be destroyed by a single malformed row is not a cost report.
    const c = renderCost({
      projectId: P,
      events: [ev('render', 'not a date'), ev('render', '2026-08-06T10:00:00Z'), ev('render', '2026-08-06T10:00:10Z')],
      directorCall: null,
    })
    expect(c.stages).toEqual([{ stage: 'render', ms: 10_000 }])
    expect(c.wallClockMs).toBe(10_000)
  })

  it('has no wall clock when there are no usable events', () => {
    expect(renderCost({ projectId: P, events: [], directorCall: null }).wallClockMs).toBeNull()
  })
})

describe('a number nobody recorded stays missing', () => {
  it('reports null tokens for a call that predates 0101', () => {
    // That call USED tokens and did not say how many. Reporting 0 would make an
    // old render look free, which is worse than saying nothing.
    const c = renderCost({
      projectId: P, events: [],
      directorCall: { model: 'gemini-x', prompt_tokens: null, response_tokens: null, total_tokens: null },
    })
    expect(c.directorTokens).toBeNull()
    // The model is still known, so somebody who has the rate can price it later.
    expect(c.directorModel).toBe('gemini-x')
  })

  it('keeps a partial token record rather than discarding it', () => {
    const c = renderCost({
      projectId: P, events: [],
      directorCall: { model: 'm', prompt_tokens: 100, response_tokens: null, total_tokens: null },
    })
    expect(c.directorTokens).toEqual({ prompt: 100, response: null, total: null })
  })

  it('refuses a non-integer or negative token count', () => {
    const c = renderCost({
      projectId: P, events: [],
      directorCall: { model: 'm', prompt_tokens: -1, response_tokens: 1.5, total_tokens: 7 },
    })
    expect(c.directorTokens).toEqual({ prompt: null, response: null, total: 7 })
  })

  it('reports no director call at all as null, not as a zeroed one', () => {
    expect(renderCost({ projectId: P, events: [], directorCall: null }).directorTokens).toBeNull()
    expect(renderCost({ projectId: P, events: [], directorCall: null }).directorModel).toBeNull()
  })

  it('takes the MEASURED output duration, and null when there is none', () => {
    expect(renderCost({ projectId: P, events: [], directorCall: null, outputDurationMs: 31_000 }).outputDurationMs)
      .toBe(31_000)
    expect(renderCost({ projectId: P, events: [], directorCall: null }).outputDurationMs).toBeNull()
  })
})

describe('no total is produced while the biggest cost is unrecorded', () => {
  it('names what it cannot see', () => {
    const c = renderCost({ projectId: P, events: [], directorCall: null })
    expect(c.unmeasured).toEqual(UNMEASURED_TODAY)
    expect(c.unmeasured).toContain('compute_seconds')
    expect(c.unmeasured).toContain('egress_bytes')
  })

  it('is NOT comparable today, and says so', () => {
    // The first person to build a budget has to confront this before picking a
    // threshold, rather than picking one from a total silently missing its
    // largest term — which would make every render look affordable and let
    // through exactly the expensive ones a gate is for.
    expect(costIsComparable(renderCost({ projectId: P, events: [], directorCall: null }))).toBe(false)
  })

  it('exposes no total, no price and no threshold', () => {
    const c = renderCost({ projectId: P, events: [], directorCall: null }) as unknown as Record<string, unknown>
    for (const forbidden of ['total', 'totalCost', 'price', 'usd', 'cents', 'budget', 'allowed', 'withinBudget']) {
      expect(c[forbidden]).toBeUndefined()
    }
  })
})

// ── COMPUTE IS MEASURED NOW, AND EGRESS IS STILL NOT ─────────────────────────
//
// The module used to assert all three costs were unrecordable. `render_measured`
// (worker/src/jobs/editorV2.ts) has been writing render_ms and output_bytes for
// some time, so that assertion had gone stale and made this under-report.
describe('render_measured moves compute out of the gap, and nothing else', () => {
  const base = { projectId: 'p1', events: [], directorCall: null }

  it('a render with render_ms reports it and drops compute_seconds', () => {
    const c = renderCost({ ...base, renderMeasured: { render_ms: 41000, output_bytes: 9_400_000 } })
    expect(c.computeMs).toBe(41000)
    expect(c.outputBytes).toBe(9_400_000)
    expect(c.unmeasured).not.toContain('compute_seconds')
  })

  // ⚠️ THE ONE THAT MUST NEVER FLIP. Knowing two of three terms is not knowing
  // the total, and the missing term is the one that varies with popularity.
  it('egress stays unmeasured even with compute and bytes in hand', () => {
    const c = renderCost({ ...base, renderMeasured: { render_ms: 41000, output_bytes: 9_400_000 } })
    expect(c.unmeasured).toContain('egress_bytes')
    expect(c.unmeasured).toContain('storage_bytes_months')
    expect(costIsComparable(c)).toBe(false)
  })

  it('no render_measured leaves the full baseline gap', () => {
    const c = renderCost(base)
    expect(c.computeMs).toBeNull()
    expect(c.outputBytes).toBeNull()
    expect(c.unmeasured).toEqual(UNMEASURED_TODAY)
  })

  // ⚠️ ABSENT IS NOT ZERO, AND A BAD VALUE IS ABSENT. A render_measured event
  // carrying junk must not retire the compute gap — a zeroed compute term makes
  // the most expensive renders look like the cheapest.
  it.each([
    ['null', null], ['undefined', undefined], ['negative', -1],
    ['a string', '41000'], ['NaN', Number.NaN], ['fractional', 4.5],
  ])('render_ms = %s is not a measurement', (_label, v) => {
    const c = renderCost({ ...base, renderMeasured: { render_ms: v, output_bytes: 1 } })
    expect(c.computeMs).toBeNull()
    expect(c.unmeasured).toContain('compute_seconds')
  })

  it('0 ms IS a measurement — a render can genuinely be instant', () => {
    const c = renderCost({ ...base, renderMeasured: { render_ms: 0, output_bytes: 0 } })
    expect(c.computeMs).toBe(0)
    expect(c.unmeasured).not.toContain('compute_seconds')
  })
})
