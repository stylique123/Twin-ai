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
  SCRIPT_INTENTS, SCRIPT_INTENT_LABELS, NO_RECORD_REASONS, NO_RECORD_REASON_LABELS,
  NOT_A_SCRIPT_REJECTION,
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
    // ⚠️ The take uploaded and no edit project was ever created — which is
    // exactly what production shows, and why these are separate stages.
    expect(state(r, 'edit_project_created')).toBe('dropped')
    expect(state(r, 'export_completed')).toBe('pending')
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
      generatedAt: iso(0), firstEditAt: iso(MIN), scriptIntent: 'would_record',
      scriptIntentAt: iso(90_000), recordingStartedAt: iso(2 * MIN),
      recordingCompletedAt: iso(3 * MIN), editProjectCreatedAt: iso(3.5 * MIN),
      exportCompletedAt: iso(4 * MIN), publishIntent: 'would_post', asOf: iso(5 * MIN),
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
    for (const opt of ['script_edited', 'script_intent', 'publish_intent']) {
      expect(state(r, opt), opt).toBe('not_applicable')
    }
    expect(r.filter((x) => x.state === 'pending').length).toBeGreaterThan(0)
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

// ── THE EVENT THAT MAKES THE DROP READABLE ───────────────────────────────────
//
// ⚠️ A FUNNEL SAYS WHERE PEOPLE DIED, NEVER WHAT KILLED THEM. 39 of 41 not
// opening the camera is equally consistent with a bad script, an irrelevant
// premise, an intimidating record button, no time, and somebody clicking around
// at 2am. Those need opposite fixes, so the number is unactionable without a
// stated reason at the seam.
describe('would you make this video — asked at the script, before the camera', () => {
  it('is OPTIONAL, so a question we never asked is not a creator who quit', () => {
    // ⚠️ Left required this would report "dropped at script_intent" for 39 people
    // who were never shown anything, hiding that what they did was not film.
    const r = readFunnel({ generatedAt: iso(0), asOf: iso(STALE_AFTER_MS + MIN) })
    expect(state(r, 'script_intent')).toBe('not_applicable')
    expect(droppedAt(r)).toBe('recording_started')
  })

  it('records the answer when it was actually asked', () => {
    const r = readFunnel({
      generatedAt: iso(0), scriptIntent: 'would_not_record', asOf: iso(MIN),
    })
    expect(state(r, 'script_intent')).toBe('reached')
  })

  it('separates browsing from creative rejection', () => {
    // ⚖️ Somebody who says "I'm just looking around" is not evidence the writer
    // failed. Pooling them is how a quality metric gets dominated by tourists.
    expect(NOT_A_SCRIPT_REJECTION.has('just_exploring')).toBe(true)
    expect(NOT_A_SCRIPT_REJECTION.has('no_time')).toBe(true)
    expect(NOT_A_SCRIPT_REJECTION.has('script_generic')).toBe(false)
    expect(NOT_A_SCRIPT_REJECTION.has('not_my_voice')).toBe(false)
    expect(NOT_A_SCRIPT_REJECTION.has('topic_not_relevant')).toBe(false)
  })

  it('offers reasons that each send us somewhere different', () => {
    // Gallery / writer / product-and-premise / production / neither.
    for (const r of ['topic_not_relevant', 'script_generic', 'not_my_voice',
      'cannot_film_it', 'recording_too_hard'] as const) {
      expect(NO_RECORD_REASONS).toContain(r)
    }
  })

  it('is a different question from publish intent, not an earlier copy of it', () => {
    // ⚠️ By the time publish intent is asked, everyone who rejected the SCRIPT is
    // already gone and uncounted. One cannot diagnose the other.
    expect(SCRIPT_INTENTS).not.toEqual(PUBLISH_INTENTS)
    expect(FUNNEL_STAGES.indexOf('script_intent'))
      .toBeLessThan(FUNNEL_STAGES.indexOf('recording_started'))
    expect(FUNNEL_STAGES.indexOf('publish_intent'))
      .toBeGreaterThan(FUNNEL_STAGES.indexOf('export_completed'))
  })

  it('reads to a creator in plain English, naming no subsystem', () => {
    for (const k of NO_RECORD_REASONS) {
      expect(NO_RECORD_REASON_LABELS[k]).not.toMatch(/gallery|resolver|slot|beat|voice DNA|product library/i)
    }
    expect(SCRIPT_INTENT_LABELS.would_record).toBe('Yes, let’s record')
  })
})

describe('a rejected take is not a missing export', () => {
  it('separates edit_project_created from export_completed', () => {
    // ⚠️ PRODUCTION: one take rejected for `duration_unknown`, two stuck
    // uploading, zero edit projects, zero exports. Pooled, that reads as "nobody
    // exports" and hides that we REFUSED the only take anybody finished.
    const r = readFunnel({
      generatedAt: iso(0), recordingStartedAt: iso(MIN), recordingCompletedAt: iso(2 * MIN),
      asOf: iso(STALE_AFTER_MS + 3 * MIN),
    })
    expect(droppedAt(r)).toBe('edit_project_created')
  })
})
