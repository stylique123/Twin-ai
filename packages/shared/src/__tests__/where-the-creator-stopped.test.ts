// 41 SCRIPTS, 3 RECORDINGS, 0 EXPORTS. THE FUNNEL IS THE FINDING.
//
// ⚠️ THESE TESTS ARE MOSTLY ABOUT THE THREE-STATE DISCIPLINE, because a
// two-state funnel is worse than none. `pending` is not `dropped`: a generation
// four minutes old with no recording has not been abandoned, and a funnel that
// says otherwise reports its own recent traffic as failure — getting WORSE the
// more people use the product, which is precisely backwards.
import { describe, expect, it } from 'vitest'
import {
  readFunnel, droppedAt, totals, FUNNEL_STAGES, STALE_AFTER_MS,
  PUBLISH_INTENT_LABELS, PUBLISH_INTENTS,
} from '../recordingFunnel'

const T0 = Date.parse('2026-08-19T00:00:00.000Z')
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()
const MIN = 60_000
const state = (rs: ReturnType<typeof readFunnel>, s: string) =>
  rs.find((r) => r.stage === s)!.state

describe('a stage that has not happened yet is not a stage that failed', () => {
  it('calls a fresh generation with no recording PENDING, not dropped', () => {
    const r = readFunnel({ generatedAt: iso(0), asOf: iso(4 * MIN) })
    expect(state(r, 'script_generated')).toBe('reached')
    expect(state(r, 'recording_started')).toBe('pending')
    expect(droppedAt(r)).toBeNull()
  })

  it('calls the same generation DROPPED once it has gone stale', () => {
    const r = readFunnel({ generatedAt: iso(0), asOf: iso(STALE_AFTER_MS + MIN) })
    expect(state(r, 'recording_started')).toBe('dropped')
    expect(droppedAt(r)).toBe('recording_started')
  })

  it('drops only the NEXT stage, never every stage after it', () => {
    // ⚖️ Counting one abandonment at every remaining stage would make late
    // stages look catastrophically worse than they are.
    const r = readFunnel({
      generatedAt: iso(0), recordingStartedAt: iso(MIN), recordingCompletedAt: iso(2 * MIN),
      asOf: iso(STALE_AFTER_MS + 3 * MIN),
    })
    expect(state(r, 'export_completed')).toBe('dropped')
    expect(state(r, 'publish_intent')).toBe('pending')
    expect(r.filter((x) => x.state === 'dropped')).toHaveLength(1)
  })
})

describe('a later stage proves the earlier ones', () => {
  it('back-fills a missing recording event when the video exported', () => {
    // ⚠️ Instrumentation misses events. "Exported but never started recording"
    // would be a report about our logging, not about the creator.
    const r = readFunnel({
      generatedAt: iso(0), exportCompletedAt: iso(10 * MIN), asOf: iso(11 * MIN),
    })
    expect(state(r, 'recording_started')).toBe('reached')
    expect(state(r, 'recording_completed')).toBe('reached')
    expect(state(r, 'export_completed')).toBe('reached')
  })

  it('back-fills the OPTIONAL stage as not_applicable, never as reached', () => {
    // ⚖️ A script good enough to record as written must not be scored as though
    // the creator skipped a required step.
    const r = readFunnel({
      generatedAt: iso(0), exportCompletedAt: iso(10 * MIN), asOf: iso(11 * MIN),
    })
    expect(state(r, 'script_edited')).toBe('not_applicable')
  })
})

describe('an edit before recording is a different signal from an edit after', () => {
  it('counts an edit made BEFORE recording', () => {
    const r = readFunnel({
      generatedAt: iso(0), firstEditAt: iso(2 * MIN), recordingStartedAt: iso(5 * MIN),
      asOf: iso(6 * MIN),
    })
    expect(state(r, 'script_edited')).toBe('reached')
  })

  it('does NOT count an edit made after recording started', () => {
    // ⚠️ Fixing a script you did not trust and fixing something you heard
    // yourself say are different failures with opposite fixes.
    const r = readFunnel({
      generatedAt: iso(0), recordingStartedAt: iso(2 * MIN), firstEditAt: iso(5 * MIN),
      asOf: iso(6 * MIN),
    })
    expect(state(r, 'script_edited')).toBe('not_applicable')
  })
})

describe('the whole journey', () => {
  it('reports every stage reached when the creator finished and answered', () => {
    const r = readFunnel({
      generatedAt: iso(0), firstEditAt: iso(MIN), recordingStartedAt: iso(2 * MIN),
      recordingCompletedAt: iso(3 * MIN), exportCompletedAt: iso(4 * MIN),
      publishIntent: 'would_post', asOf: iso(5 * MIN),
    })
    expect(r.every((x) => x.state === 'reached')).toBe(true)
    expect(droppedAt(r)).toBeNull()
  })

  it('reference_selected falls back to the generation time rather than going blank', () => {
    const r = readFunnel({ generatedAt: iso(0), asOf: iso(MIN) })
    expect(state(r, 'reference_selected')).toBe('reached')
  })

  it('a creator who did nothing at all has dropped nothing', () => {
    // ⚖️ AN OPTIONAL STAGE IS NEVER `pending` AND NEVER `dropped` — only
    // `reached` or `not_applicable`. You either rewrote the script or you did
    // not; there is no state in which the edit stage is owed. My first version
    // of this test asserted "pending everywhere" and the implementation was
    // right where the expectation was lazy.
    const r = readFunnel({ asOf: iso(0) })
    expect(state(r, 'script_edited')).toBe('not_applicable')
    expect(r.filter((x) => x.stage !== 'script_edited').every((x) => x.state === 'pending')).toBe(true)
    expect(droppedAt(r)).toBeNull()
  })
})

describe('totals keep pending out of the failure count', () => {
  it('counts reached, dropped and pending separately', () => {
    const finished = readFunnel({
      generatedAt: iso(0), recordingStartedAt: iso(MIN), recordingCompletedAt: iso(2 * MIN),
      exportCompletedAt: iso(3 * MIN), publishIntent: 'would_post', asOf: iso(4 * MIN),
    })
    const abandoned = readFunnel({ generatedAt: iso(0), asOf: iso(STALE_AFTER_MS + MIN) })
    const inFlight = readFunnel({ generatedAt: iso(0), asOf: iso(MIN) })
    const t = totals([finished, abandoned, inFlight])
    expect(t.of).toBe(3)
    expect(t.reached.script_generated).toBe(3)
    expect(t.reached.export_completed).toBe(1)
    expect(t.dropped.recording_started).toBe(1)
    expect(t.pending.recording_started).toBe(1)
    // ⚠️ THE POINT: the in-flight journey is in neither the reached nor the
    // dropped column for recording, so no rate computed from these can charge it
    // as a failure.
    expect(t.reached.recording_started + t.dropped.recording_started).toBe(2)
  })

  it('exposes no rate of its own', () => {
    // ⚖️ `reached / of` is the wrong denominator while journeys are in flight.
    // Whoever needs a rate must say which denominator they mean.
    const t = totals([])
    expect(Object.keys(t).sort()).toEqual(['dropped', 'of', 'pending', 'reached'])
  })
})

describe('the question the creator actually reads', () => {
  it('is plain English with no product vocabulary in it', () => {
    // ⚠️ HARD UX RULE. No "publish intent", no "conversion", nothing about
    // Twin's insides. Understandable in under two seconds.
    for (const k of PUBLISH_INTENTS) {
      const label = PUBLISH_INTENT_LABELS[k]
      expect(label.length).toBeGreaterThan(1)
      expect(label).not.toMatch(/intent|funnel|convert|stage|metric|publish_/i)
    }
    expect(PUBLISH_INTENT_LABELS.would_post).toBe('Yes, I’d post this')
  })

  it('offers a middle answer, because yes/no would collect a lie', () => {
    // ⚖️ "Only if I changed some of it" is the most useful answer we can get and
    // a two-option question forces it into one of the extremes.
    expect(PUBLISH_INTENTS).toHaveLength(3)
    expect(PUBLISH_INTENT_LABELS.needs_changes).toMatch(/changed/i)
  })
})

describe('the stage list itself', () => {
  it('is the order a creator passes them, and script_edited comes before recording', () => {
    expect(FUNNEL_STAGES.indexOf('script_edited'))
      .toBeLessThan(FUNNEL_STAGES.indexOf('recording_started'))
    expect(FUNNEL_STAGES.indexOf('recording_completed'))
      .toBeLessThan(FUNNEL_STAGES.indexOf('export_completed'))
  })
})
