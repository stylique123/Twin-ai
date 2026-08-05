// Feeding §7c's checks from a real render.
//
// The rule this file exists to hold: a fact the plan does not carry must arrive
// as MISSING, so the checker reports `not_checked` rather than a pass. Every
// substitution, default or nearby-number-that-will-do defeats the whole design
// of the checker it feeds.
import { describe, expect, it } from 'vitest'
import { craftFactsFromPlan, captionsInsideSafeArea, measuredLufsFromEvents } from '../craftFacts'
import { runCraftChecks } from '../craftChecks'

const plan = (over: Record<string, unknown> = {}) => ({
  output: { durationMs: 42000, width: 1080, height: 1920 },
  timeline: { cutsPerMinuteMilli: 24000 },
  audio: { targetLufsMilli: -14000, toleranceLuMilli: 1000 },
  captions: { marginVerticalPx: 600, cues: [{ outputStartMs: 120, outputEndMs: 2100 }] },
  video: { framing: { safeTopPx: 120, safeBottomPx: 320, safeLeftPx: 60, safeRightPx: 60 } },
  ...over,
})

describe('a fact the plan does not carry arrives MISSING', () => {
  it('an empty plan supplies nothing, and every check reports not_checked', () => {
    const facts = craftFactsFromPlan(null)
    const checks = runCraftChecks(facts)
    expect(checks.every((c) => c.status === 'not_checked')).toBe(true)
  })

  it('a plan with NO CUES supplies neither timing — 0 is not "the hook lands instantly"', () => {
    const facts = craftFactsFromPlan(plan({ captions: { marginVerticalPx: 600, cues: [] } }))
    expect(facts.firstWordAtMs).toBeNull()
    expect(facts.hookLandsAtMs).toBeNull()
    // A silent video is not a video whose hook lands at zero milliseconds.
    const checks = runCraftChecks(facts)
    expect(checks.find((c) => c.id === 'hook_timing')!.status).toBe('not_checked')
  })

  it('non-integer values are dropped rather than coerced', () => {
    const facts = craftFactsFromPlan(plan({
      output: { durationMs: '42000', width: 1080.5, height: null },
    }))
    expect(facts.outputDurationMs).toBeNull()
    expect(facts.widthPx).toBeNull()
    expect(facts.heightPx).toBeNull()
  })
})

describe('what a full plan supplies', () => {
  it('reads the timings, rate, frame and loudness targets', () => {
    const facts = craftFactsFromPlan(plan())
    expect(facts).toMatchObject({
      firstWordAtMs: 120, hookLandsAtMs: 2100,
      cutsPerMinuteMilli: 24000, outputDurationMs: 42000,
      targetLufsMilli: -14000, toleranceLuMilli: 1000,
      widthPx: 1080, heightPx: 1920,
    })
  })

  it('a hook TITLE beats the first-cue proxy — it is the actual hook', () => {
    const facts = craftFactsFromPlan(plan({
      hook: { title: { outputEndMs: 1400 } },
    }))
    expect(facts.hookLandsAtMs).toBe(1400)
  })

  it('and a full plan makes the checks actually run', () => {
    const checks = runCraftChecks(craftFactsFromPlan(plan()))
    const notChecked = checks.filter((c) => c.status === 'not_checked').map((c) => c.id)
    // Only the two that genuinely cannot be answered from a plan alone: the
    // delivered loudness (no events supplied here) and the one about meaning.
    expect(notChecked).toEqual(['audio_loudness', 'ends_on_reason_to_act'])
  })
})

describe('the loudness is a REAL measurement, from the event trail', () => {
  it('reads integratedLufsMilli from an audio_measured event', () => {
    const events = [
      { message_code: 'stage_started', details: {} },
      { message_code: 'audio_measured', details: { integratedLufsMilli: -14100 } },
    ]
    expect(measuredLufsFromEvents(events)).toBe(-14100)
    const checks = runCraftChecks(craftFactsFromPlan(plan(), events))
    expect(checks.find((c) => c.id === 'audio_loudness')!.status).toBe('pass')
  })

  it('takes the LAST measurement — a re-render replaces the file', () => {
    // Reading the first would report a number about bytes that no longer exist.
    const events = [
      { message_code: 'audio_measured', details: { integratedLufsMilli: -22000 } },
      { message_code: 'audio_measured', details: { integratedLufsMilli: -14100 } },
    ]
    expect(measuredLufsFromEvents(events)).toBe(-14100)
  })

  it('no measurement means the check does not run', () => {
    expect(measuredLufsFromEvents([])).toBeNull()
    expect(measuredLufsFromEvents([{ message_code: 'audio_measured', details: {} }])).toBeNull()
    expect(measuredLufsFromEvents([{ message_code: 'cuts_measured', details: { integratedLufsMilli: -14000 } }]))
      .toBeNull()
  })
})

describe('the caption safe area', () => {
  it('null when either number is absent — that is not an accusation', () => {
    // "We did not check where your captions sit" and "your captions are in the
    // wrong place" are different sentences.
    expect(captionsInsideSafeArea(null)).toBeNull()
    expect(captionsInsideSafeArea(plan({ captions: { cues: [] } }))).toBeNull()
    expect(captionsInsideSafeArea(plan({ video: { framing: {} } }))).toBeNull()
  })

  it('compares the caption margin to the frozen inset', () => {
    expect(captionsInsideSafeArea(plan())).toBe(true)
    expect(captionsInsideSafeArea(plan({
      captions: { marginVerticalPx: 100, cues: [] },
    }))).toBe(false)
  })

  it('checks the BOTTOM only, because the collision was never vertical', () => {
    // Phase 9's measurement established that the caption collision is the
    // horizontal ACTION RAIL, and the fix was made by width. A vertical-only
    // check re-asserting the disproved thing would be worse than none; the
    // horizontal case needs rendered line widths the plan does not carry, so it
    // is absent rather than approximated.
    const wideSafeSides = plan({
      video: { framing: { safeTopPx: 9999, safeBottomPx: 320, safeLeftPx: 9999, safeRightPx: 9999 } },
    })
    expect(captionsInsideSafeArea(wideSafeSides)).toBe(true)
  })
})
