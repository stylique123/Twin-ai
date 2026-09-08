// LENGTH WAS NEVER A DECISION, SO IT WAS WHATEVER THE MODEL FELT LIKE.
//
// ⚠️ TWO READINGS POINTING OPPOSITE WAYS. A 15-second reference produced a
// 48-second script; a 226-second reference produced a 60-second one. Both land
// near a minute because a minute is what gets written when nobody says
// otherwise — and `scriptLength` beside this module already measured the same
// thing from the other end: 17 of 35 production scripts run >25% longer than
// the reference they adapted and 10 run >25% shorter.
//
// ⚠️ THE PROMPT ALREADY SAYS "target_sec is a real decision in seconds". A
// decision with no budget is a preference, and the frozen experiment showed
// which way that preference runs: removing the substance requirement made the
// writer produce 64% MORE, not less.
import { describe, expect, it } from 'vitest'
import {
  targetSeconds, durationBudget, durationBrief, durationMiss,
  GOAL_TARGET_SEC, MIN_TARGET_SEC, MAX_TARGET_SEC, TOLERANCE,
} from '../script/durationContract'
import { WPM_PRESETS, estimateDurationSec } from '../recordingScript'
import { VIDEO_GOALS } from '../videoIntent'

describe('the target', () => {
  it('takes the reference the creator chose', () => {
    expect(targetSeconds({ referenceSeconds: 45 })).toBe(45)
  })

  it('CLAMPS a long reference rather than copying it', () => {
    // ⚠️ THE 226-SECOND CASE. A creator may study a three-minute teardown and
    // want forty seconds out of it; copying the length would make the study the
    // assignment. 90 is the longest script this contract will ask for — which
    // is NOT the 180s `maxDurationSec` bound, because that is the longest
    // reference Twin will READ, a different question.
    expect(targetSeconds({ referenceSeconds: 226 })).toBe(MAX_TARGET_SEC)
    expect(targetSeconds({ referenceSeconds: 6 })).toBe(MIN_TARGET_SEC)
  })

  it('falls back to the goal when there is no reference', () => {
    expect(targetSeconds({ goal: 'sell' })).toBe(GOAL_TARGET_SEC.sell)
    for (const g of VIDEO_GOALS) expect(targetSeconds({ goal: g })).toBeGreaterThan(0)
  })

  it('refuses to invent a number when nothing decides one', () => {
    // ⚖️ NULL IS THE HONEST ANSWER, and the brief then says nothing about length
    // rather than stating a made-up figure as a requirement — the same refusal
    // `asTarget` makes elsewhere in this codebase.
    expect(targetSeconds({})).toBeNull()
    expect(targetSeconds({ referenceSeconds: 0, goal: null })).toBeNull()
    expect(targetSeconds({ referenceSeconds: Number.NaN })).toBeNull()
    expect(durationBrief({})).toBeNull()
    expect(durationMiss(120, {})).toBeNull()
  })
})

describe('the budget uses the recorder\'s own rate, not a second one', () => {
  it('the word count round-trips through estimateDurationSec', () => {
    // ⚠️ THIS IS THE LOAD-BEARING ASSERTION. If the brief asks for a length the
    // teleprompter then reports as a different one, the script has two runtimes
    // and the creator is shown the one that disagrees with the brief.
    const b = durationBudget(60)
    expect(b.words).toBe(WPM_PRESETS.natural)
    const line = Array.from({ length: b.words }, () => 'word').join(' ')
    expect(Math.round(estimateDurationSec(line))).toBe(60)
  })

  it('honours a non-default recorder speed', () => {
    expect(durationBudget(60, 'fast').words).toBe(WPM_PRESETS.fast)
  })

  it('gives a band, not a point', () => {
    // ⚖️ A writer forced to hit exactly 112 words pads or truncates a sentence
    // to do it, which is a worse script for an exactly-correct number.
    const b = durationBudget(45)
    expect(b.minWords).toBeLessThan(b.words)
    expect(b.maxWords).toBeGreaterThan(b.words)
    expect(b.maxWords - b.words).toBe(Math.round(b.words * TOLERANCE))
  })

  it('leaves the SHAPE to the writer — a range of beats, never a count', () => {
    // ⚖️ At 45 seconds this permits 3 to 9 beats: the difference between a
    // story and a list, and both are legitimate videos of the same length.
    const b = durationBudget(45)
    expect(b.minBeats).toBeLessThan(b.maxBeats)
    expect(b.minBeats).toBeGreaterThanOrEqual(3)
  })

  it('a very short video still gets a workable beat range', () => {
    const b = durationBudget(MIN_TARGET_SEC)
    expect(b.minBeats).toBeGreaterThanOrEqual(3)
    expect(b.maxBeats).toBeGreaterThan(b.minBeats)
  })
})

describe('the brief the writer actually reads', () => {
  it('names the seconds, the words, the beat range and WHY', () => {
    const text = durationBrief({ referenceSeconds: 45 })!
    expect(text).toMatch(/45 seconds/)
    expect(text).toMatch(/reference they chose runs 45 seconds/)
    expect(text).toMatch(/\b\d+ spoken words/)
    expect(text).toMatch(/between \d+ and \d+ beats/)
  })

  it('tells it to cut rather than pad, in both directions', () => {
    // ⚠️ THE FROZEN EXPERIMENT'S FINDING, TURNED INTO AN INSTRUCTION. Left to
    // itself the writer fills time with more words; the brief has to say that
    // filling is not the way to reach the number.
    const text = durationBrief({ goal: 'sell' })!
    expect(text).toMatch(/cut the video shorter rather than padding/)
    expect(text).toMatch(/cut a point rather than speeding up/)
  })

  it('says why from the goal when there is no reference', () => {
    expect(durationBrief({ goal: 'leads' })).toMatch(/what this video is for/)
  })
})

describe('the miss, once the script exists', () => {
  it('reports over and under separately, and zero when inside the band', () => {
    const b = durationBudget(GOAL_TARGET_SEC.sell)
    expect(durationMiss(b.words, { goal: 'sell' })).toMatchObject({ overBy: 0, underBy: 0 })
    expect(durationMiss(b.maxWords + 30, { goal: 'sell' })!.overBy).toBe(30)
    expect(durationMiss(b.minWords - 10, { goal: 'sell' })!.underBy).toBe(10)
    // ⚖️ NEVER BOTH AT ONCE. One number that could mean either direction is the
    // shape that makes a counter unreadable.
    const over = durationMiss(b.maxWords + 30, { goal: 'sell' })!
    expect(over.underBy).toBe(0)
  })
})

// ── AND THE EDGE ASKS FOR IT ──────────────────────────────────────────────
//
// ⚖️ THE EDGE CANNOT IMPORT @twinai/shared, so the rule lives twice and this
// copy is the tested one. Without these the contract would be a module nobody
// reads — which is the defect class this whole session has been closing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the writer is actually told the length', () => {
  it('puts the brief in the prompt, not merely in a variable', () => {
    // ⚠️ A COMPUTED STRING THAT NEVER REACHES THE TEMPLATE is exactly the shape
    // `creator_summary` had for a whole release: written, stored, never read.
    expect(EDGE).toMatch(/\$\{durationBriefLine\}- beat_plan:/)
    expect(EDGE).toMatch(/durationBriefInline\(ref\?\.duration_sec \?\? null/)
  })

  it('the two copies agree on every constant', () => {
    expect(EDGE).toMatch(new RegExp(`const MIN_TARGET_SEC_INLINE = ${MIN_TARGET_SEC}\\b`))
    expect(EDGE).toMatch(new RegExp(`const MAX_TARGET_SEC_INLINE = ${MAX_TARGET_SEC}\\b`))
    expect(EDGE).toMatch(new RegExp(`const DURATION_TOLERANCE_INLINE = ${TOLERANCE}\\b`))
    for (const [goal, sec] of Object.entries(GOAL_TARGET_SEC)) {
      expect(EDGE, goal).toMatch(new RegExp(`${goal}: ${sec}\\b`))
    }
  })

  it('the edge uses the recorder rate it already has, not a new one', () => {
    // ⚖️ `NATURAL_WPM_INLINE` is the same 150 wpm `estimateDurationSecInline`
    // measures with, so the brief cannot ask for a length the teleprompter
    // reports differently.
    const fn = EDGE.slice(EDGE.indexOf('function durationBriefInline'))
    expect(fn.slice(0, 1200)).toMatch(/NATURAL_WPM_INLINE/)
    expect(fn.slice(0, 1200)).not.toMatch(/\b150\b/)
  })

  it('says nothing when nothing decides a length', () => {
    const fn = EDGE.slice(EDGE.indexOf('function durationBriefInline'))
    expect(fn.slice(0, 400)).toMatch(/if \(target === null\) return ''/)
    expect(EDGE).toMatch(/durationBrief_ === '' \? '' :/)
  })

  it('the two copies teach the same sentence, not only the same numbers', () => {
    // ⚠️ THE PROSE DRIFTS BEFORE THE NUMBERS DO — one copy gets reworded and
    // the other keeps teaching the old rule, with every constant still equal.
    // These fragments carry no interpolation, so they compare exactly.
    const mine = durationBrief({ referenceSeconds: 45 })!
    for (const fragment of [
      'LENGTH IS DECIDED, NOT DISCOVERED.',
      'spoken words at a natural pace — write between',
      'cut the video shorter rather than padding it',
      'cut a point rather than speeding up',
    ]) {
      expect(mine, fragment).toContain(fragment)
      expect(EDGE, fragment).toContain(fragment)
    }
  })
})
