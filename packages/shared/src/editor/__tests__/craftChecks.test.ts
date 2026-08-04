// §7c's craft rules as checks — and the honesty line.
//
// "Twin may say what it CHECKED. It may never say what will PERFORM. The moment
//  it predicts a number it has not measured, it becomes the thing §1.2 exists
//  to prevent."
//
// So the load-bearing tests here are not the individual thresholds. They are:
// every check reports even when it could not run, no reason text predicts
// anything, and the summary counts rather than scores.
import { describe, expect, it } from 'vitest'
import {
  CRAFT_CHECK_IDS, DEFAULT_CRAFT_BOUNDS as B,
  runCraftChecks, summarizeCraftChecks, type CraftCheck, type CraftCheckId,
} from '../craftChecks'

const byId = (checks: CraftCheck[], id: CraftCheckId): CraftCheck =>
  checks.find((c) => c.id === id)!

/** A render where everything measured well. */
const good = () => runCraftChecks({
  firstWordAtMs: 120, hookLandsAtMs: 2100,
  cutsPerMinuteMilli: 24000, outputDurationMs: 42000,
  measuredLufsMilli: -14100, targetLufsMilli: -14000, toleranceLuMilli: 1000,
  widthPx: 1080, heightPx: 1920, captionsInsideSafeArea: true,
})

describe('EVERY check reports, including the ones that could not run', () => {
  it('always returns all seven, in a stable order', () => {
    // A report whose length varies with what happened to be measurable is one
    // a reader cannot compare across two videos — and one where a missing
    // check is invisible.
    for (const facts of [{}, { firstWordAtMs: 100 }, {}]) {
      expect(runCraftChecks(facts).map((c) => c.id)).toEqual([...CRAFT_CHECK_IDS])
    }
  })

  it('an entirely unmeasured render reports six not_checked and one honest refusal', () => {
    const checks = runCraftChecks({})
    expect(checks.every((c) => c.status === 'not_checked')).toBe(true)
    expect(summarizeCraftChecks(checks)).toContain('nothing here could be measured')
  })

  it('"ends on a reason to act" is NEVER checked, and says why', () => {
    // A claim about MEANING, and nothing in this pipeline measures meaning.
    // Omitting it would let a clean report imply the whole list was checked;
    // guessing at it would be the confident number §7c forbids.
    const c = byId(good(), 'ends_on_reason_to_act')
    expect(c.status).toBe('not_checked')
    expect(c.reason).toContain('not something we can measure')
  })

  it('a MISSING measurement is never reported as a passing one', () => {
    // The rule this codebase keeps relearning: absence is not zero, and it is
    // certainly not success.
    const checks = runCraftChecks({ hookLandsAtMs: null, measuredLufsMilli: null })
    expect(byId(checks, 'hook_timing').status).toBe('not_checked')
    expect(byId(checks, 'audio_loudness').status).toBe('not_checked')
    expect(checks.some((c) => c.status === 'pass')).toBe(false)
  })
})

describe('THE HONESTY LINE: checked, never predicted', () => {
  it('no reason text predicts performance', () => {
    // The moment it predicts a number it has not measured, it becomes the thing
    // §1.2 exists to prevent. Asserted across every status, on a good render and
    // a bad one, so a future reason cannot quietly slip a promise in.
    const bad = runCraftChecks({
      firstWordAtMs: 2400, hookLandsAtMs: 6000,
      cutsPerMinuteMilli: 1000, outputDurationMs: 42000,
      measuredLufsMilli: -22000, targetLufsMilli: -14000, toleranceLuMilli: 1000,
      widthPx: 1920, heightPx: 1080, captionsInsideSafeArea: false,
    })
    const forbidden = /\bwill\b|\bperform|\bviral\b|\bviews\b|\bscore\b|\bengagement\b|\bboost\b|\bguarantee/i
    for (const c of [...good(), ...bad]) {
      expect(c.reason, `${c.id}: ${c.reason}`).not.toMatch(forbidden)
      expect(c.reason.length).toBeGreaterThan(0)
    }
  })

  it('there is no `fail` status — a craft rule is arguable, not a law', () => {
    // A six-second hook is unusual and may be exactly right. A checker that
    // says FAIL has stopped being arguable, which is what §7c's own example
    // sentence is careful to remain.
    const bad = runCraftChecks({ hookLandsAtMs: 9000 })
    expect(bad.every((c) => ['pass', 'attention', 'not_checked'].includes(c.status))).toBe(true)
    expect(byId(bad, 'hook_timing').status).toBe('attention')
  })

  it('an `attention` reason states BOTH numbers, so the creator can disagree', () => {
    // §7c's example: "Your hook takes 6 seconds to reach its point; the
    // reference reached its point in 2."
    const c = byId(runCraftChecks({ hookLandsAtMs: 6000 }), 'hook_timing')
    expect(c.reason).toContain('6.0s')
    expect(c.reason).toContain('3.0s')
  })

  it('the summary COUNTS, it does not score', () => {
    expect(summarizeCraftChecks(good())).toBe('6 of 7 things checked, and all of them look right.')
    const one = runCraftChecks({ hookLandsAtMs: 9000 })
    expect(summarizeCraftChecks(one)).toContain('1 wants a look')
    expect(summarizeCraftChecks(one)).not.toMatch(/%|score|\/10/)
  })
})

describe('the individual bounds', () => {
  it('the hook: inside is a pass, outside wants a look', () => {
    expect(byId(runCraftChecks({ hookLandsAtMs: B.hookLandsByMs }), 'hook_timing').status).toBe('pass')
    expect(byId(runCraftChecks({ hookLandsAtMs: B.hookLandsByMs + 1 }), 'hook_timing').status).toBe('attention')
  })

  it('dead air before the first word', () => {
    expect(byId(runCraftChecks({ firstWordAtMs: B.maxLeadingSilenceMs }), 'dead_air_before_first_word').status).toBe('pass')
    expect(byId(runCraftChecks({ firstWordAtMs: 3000 }), 'dead_air_before_first_word').status).toBe('attention')
  })

  it('a cut rate over a very short video is NOT CHECKED rather than reported', () => {
    // A rate measured over three seconds is not a rate. Saying so beats
    // printing a number that means nothing.
    const c = byId(runCraftChecks({ cutsPerMinuteMilli: 0, outputDurationMs: 3000 }), 'visual_change_rate')
    expect(c.status).toBe('not_checked')
    expect(c.reason).toContain('too short')
  })

  it('loudness compares the DELIVERED measurement to the target, within tolerance', () => {
    const inside = runCraftChecks({
      measuredLufsMilli: -14900, targetLufsMilli: -14000, toleranceLuMilli: 1000,
    })
    expect(byId(inside, 'audio_loudness').status).toBe('pass')
    const outside = runCraftChecks({
      measuredLufsMilli: -16000, targetLufsMilli: -14000, toleranceLuMilli: 1000,
    })
    expect(byId(outside, 'audio_loudness').status).toBe('attention')
    expect(byId(outside, 'audio_loudness').reason).toContain('-16.0')
  })

  it('the frame: upright passes, landscape wants a look', () => {
    expect(byId(runCraftChecks({ widthPx: 1080, heightPx: 1920 }), 'vertical_frame').status).toBe('pass')
    expect(byId(runCraftChecks({ widthPx: 1920, heightPx: 1080 }), 'vertical_frame').status).toBe('attention')
    expect(byId(runCraftChecks({ widthPx: 0, heightPx: 0 }), 'vertical_frame').status).toBe('not_checked')
  })

  it('bounds are a PARAMETER — every number here is chosen, not measured', () => {
    const strict = { ...B, hookLandsByMs: 1000 }
    expect(byId(runCraftChecks({ hookLandsAtMs: 2000 }, strict), 'hook_timing').status).toBe('attention')
    expect(byId(runCraftChecks({ hookLandsAtMs: 2000 }), 'hook_timing').status).toBe('pass')
  })
})
