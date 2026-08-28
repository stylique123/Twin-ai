import { describe, expect, it } from 'vitest'
import { parseTargetSec, timingFlagCount, timingFlags, timingThreshold } from '../timingMath'

describe('parseTargetSec: a string schema field, not a number', () => {
  it('reads a plain number string', () => {
    expect(parseTargetSec('6')).toBe(6)
  })
  it('reads "6s" and "6 seconds"', () => {
    expect(parseTargetSec('6s')).toBe(6)
    expect(parseTargetSec('6 seconds')).toBe(6)
  })
  it('reads a real number type too', () => {
    expect(parseTargetSec(6)).toBe(6)
  })
  it('an unparseable value is null, never a fabricated 0', () => {
    expect(parseTargetSec('a while')).toBeNull()
    expect(parseTargetSec('')).toBeNull()
    expect(parseTargetSec(null)).toBeNull()
    expect(parseTargetSec(undefined)).toBeNull()
  })
  it('zero and negative are not real targets', () => {
    expect(parseTargetSec('0')).toBeNull()
    expect(parseTargetSec(-3)).toBeNull()
  })
})

describe('timingThreshold: max(2s, 30%)', () => {
  it('the flat floor wins on a short beat', () => {
    expect(timingThreshold(3)).toBe(2)
  })
  it('the percentage wins on a long beat', () => {
    expect(timingThreshold(40)).toBe(12)
  })
})

describe('the spec fixtures', () => {
  it('scene 2: ~31 words in an 8s beat flags', () => {
    const line = Array(31).fill('word').join(' ')
    const script = [{ line }]
    const beatPlan = [{ target_sec: '8s' }]
    const flags = timingFlags(script, beatPlan)
    expect(flags).toHaveLength(1)
    expect(flags[0]!.index).toBe(0)
    expect(flags[0]!.targetSec).toBe(8)
  })

  it('a 15-word/6s beat does not flag (matches the natural rate exactly)', () => {
    const line = Array(15).fill('word').join(' ')
    const script = [{ line }]
    const beatPlan = [{ target_sec: '6 seconds' }]
    expect(timingFlags(script, beatPlan)).toHaveLength(0)
  })
})

describe('a beat with no line, or no parseable target, is skipped not flagged', () => {
  it('an unwritten needs_user beat has no line to measure', () => {
    const script = [{ line: '' }, { line: null }]
    const beatPlan = [{ target_sec: '6s' }, { target_sec: '6s' }]
    expect(timingFlags(script, beatPlan)).toHaveLength(0)
  })
  it('an unparseable target excludes the beat rather than comparing to 0', () => {
    const line = Array(40).fill('word').join(' ')
    const script = [{ line }]
    const beatPlan = [{ target_sec: 'a moment' }]
    expect(timingFlags(script, beatPlan)).toHaveLength(0)
  })
})

describe('one beat per script entry, matched by position', () => {
  it('mismatched array lengths compare only the overlap', () => {
    const matching = Array(15).fill('word').join(' ') // 15 words / 2.5 wps = 6s, matches target exactly
    const overshoot = Array(31).fill('word').join(' ')
    const script = [{ line: matching }, { line: overshoot }]
    const beatPlan = [{ target_sec: '6s' }]
    // index 1 has no beatPlan entry to compare against, so it cannot be flagged
    // even though its own words (31) would badly overshoot a 6s target.
    expect(timingFlags(script, beatPlan)).toHaveLength(0)
  })
})

describe('malformed input', () => {
  it('non-array inputs return no flags rather than throwing', () => {
    for (const v of [null, undefined, 'x', 3, {}]) {
      expect(() => timingFlags(v as never, v as never)).not.toThrow()
      expect(timingFlags(v as never, v as never)).toEqual([])
      expect(timingFlagCount(v as never, v as never)).toBe(0)
    }
  })
})

describe('the counter matches the flags length', () => {
  it('counts what it flags', () => {
    const line = Array(31).fill('word').join(' ')
    const script = [{ line }, { line: 'a short line here' }]
    const beatPlan = [{ target_sec: '8s' }, { target_sec: '6s' }]
    expect(timingFlagCount(script, beatPlan)).toBe(timingFlags(script, beatPlan).length)
  })
})
