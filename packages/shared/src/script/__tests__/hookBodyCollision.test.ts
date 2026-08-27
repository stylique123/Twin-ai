import { describe, expect, it } from 'vitest'
import { containment, hookBodyCollisionBeatCount, hookBodyCollisions } from '../hookBodyCollision'

describe('containment, not Jaccard', () => {
  it('a short hook fully inside a long body line scores 1', () => {
    expect(containment('stop chasing motivation', 'You need to stop chasing motivation every single morning before work.')).toBe(1)
  })

  it('two disjoint lines score 0', () => {
    expect(containment('stop chasing motivation', 'buy the course today')).toBe(0)
  })

  it('null when either side has no content words', () => {
    expect(containment('', 'a real sentence with content words')).toBeNull()
    expect(containment('a real sentence', '')).toBeNull()
    expect(containment('the a is', 'stop chasing motivation')).toBeNull() // all stopwords
  })

  it('non-string input is treated as empty, never throws', () => {
    expect(containment(null, 'stop chasing motivation')).toBeNull()
    expect(containment(undefined, undefined)).toBeNull()
  })
})

describe('the audited fixture: scene 4 restates hook option 2', () => {
  const hookOptions = [
    'Your fear of judgement is cementing you into a life you hate.',
    'Stop chasing motivation — build a system that works without it.',
    'The comfort zone is a trap, and you built it yourself.',
    'Nobody is coming to save your career but you.',
    'Three habits that quietly ruined my twenties.',
  ]
  const beats = [
    { line: 'Your fear of judgement is cementing you into a life you hate.' }, // hook beat itself
    { line: 'Here is the actual system I used to change course.' },
    { line: 'Most people quit at step two, which is the whole problem.' },
    // Restates hook_options[1] almost word for word.
    { line: 'Stop chasing motivation, and build a system that works without it.' },
  ]

  it('flags beat 3 against hook_options[1]', () => {
    const hits = hookBodyCollisions(hookOptions, beats)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ hookIndex: 1, beatIndex: 3 })
    expect(hits[0]!.containmentScore).toBeGreaterThanOrEqual(0.6)
  })

  it('does not flag the hook beat against hook_options[0]', () => {
    // hook_options[0] is never checked, so beat 0 (which IS hook_options[0])
    // must not appear as a collision even though it is a perfect match.
    const hits = hookBodyCollisions(hookOptions, beats)
    expect(hits.some((h) => h.hookIndex === 0)).toBe(false)
  })

  it('counts the beat once for the audit metric', () => {
    expect(hookBodyCollisionBeatCount(hookOptions, beats)).toBe(1)
  })
})

describe('a beat colliding with two different hooks counts once', () => {
  it('beat count is per-beat, not per-pair', () => {
    const hookOptions = [
      'irrelevant opener here today',
      'stop chasing motivation every single day',
      'stop chasing motivation every single morning',
    ]
    const beats = [{ line: 'You should stop chasing motivation every single day and morning.' }]
    const hits = hookBodyCollisions(hookOptions, beats)
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hookBodyCollisionBeatCount(hookOptions, beats)).toBe(1)
  })
})

describe('the boundary', () => {
  it('below the threshold is not flagged', () => {
    // Share only "motivation" (1 of 3 content words on the shorter side ~0.33).
    const hookOptions = ['irrelevant', 'stop chasing motivation']
    const beats = [{ line: 'motivation alone never built anything real for anyone' }]
    expect(hookBodyCollisions(hookOptions, beats)).toHaveLength(0)
  })
})

describe('malformed input', () => {
  it('non-array hookOptions or beats returns no collisions rather than throwing', () => {
    for (const v of [null, undefined, 'x', 3, {}]) {
      expect(hookBodyCollisions(v, [])).toEqual([])
      expect(hookBodyCollisions([], v)).toEqual([])
      expect(hookBodyCollisionBeatCount(v, v)).toBe(0)
    }
  })

  it('a beat with no line, or a non-string hook option, is skipped rather than crashing', () => {
    const hookOptions = ['irrelevant', 42, null, 'stop chasing motivation every single day']
    const beats = [{}, { line: null }, { line: 'stop chasing motivation every single day please' }]
    expect(() => hookBodyCollisions(hookOptions, beats)).not.toThrow()
    expect(hookBodyCollisionBeatCount(hookOptions, beats)).toBe(1)
  })
})
