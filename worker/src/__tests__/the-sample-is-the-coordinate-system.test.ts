// THE FRAME NUMBERING IS LOAD-BEARING, SO IT GETS TESTED LIKE IT IS.
//
// `visualExtraction` rejects any citation outside 1..framesSampled. That check
// is worth exactly as much as the guarantee that the frames handed over are in
// time order with an honest count — which is what this file asserts. The ffmpeg
// and ffprobe calls are not tested here; the decisions around them are.

import { describe, it, expect } from 'vitest'
import { frameSchedule, DEFAULT_FRAME_COUNT, SCHEDULE_BASES } from '../frameSample.js'
import { FIELD_QUESTIONS, visualPrompt } from '../visualPrompt.js'

describe('the sampling schedule', () => {
  it('never lands on the first or last frame', () => {
    // ⚠️ THE TITLE-CARD PROBLEM. Frame 0 of a short-form video is disproportionately
    // a title card, and the final frame an end card; a sample containing both is
    // largely a description of the packaging.
    const s = frameSchedule(20, 4)
    expect(s[0]).toBeGreaterThan(0)
    expect(s[s.length - 1]).toBeLessThan(20)
    expect(s).toEqual([2.5, 7.5, 12.5, 17.5])
  })

  it('is uniformly spaced, because temporal citations assume it', () => {
    // A claim citing [1, 4] means "across the video". That is only true if the
    // gaps are equal — a clustered sample makes a weak span look like a wide one.
    const s = frameSchedule(60, 5)
    const gaps = s.slice(1).map((v, i) => Math.round((v - s[i]) * 1000) / 1000)
    expect(new Set(gaps).size).toBe(1)
  })

  it('is strictly increasing, so frame 1 is always earliest', () => {
    for (const [dur, n] of [[9, 4], [1, 3], [180, 8], [0.4, 2]] as const) {
      const s = frameSchedule(dur, n)
      for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1])
    }
  })

  it('refuses rather than guesses when the duration is unknown', () => {
    // ⚖️ `probeDurationSec` returns 0 for "cannot say". Inventing a duration
    // would produce seek targets past the end of the file, and ffmpeg answers
    // those with silence — a short sample for a reason nobody records.
    expect(frameSchedule(0, 4)).toEqual([])
    expect(frameSchedule(-5, 4)).toEqual([])
    expect(frameSchedule(NaN, 4)).toEqual([])
    expect(frameSchedule(20, 0)).toEqual([])
  })

  it('returns exactly the count asked for when it returns anything', () => {
    expect(frameSchedule(20, DEFAULT_FRAME_COUNT)).toHaveLength(DEFAULT_FRAME_COUNT)
    expect(frameSchedule(3, 7)).toHaveLength(7)
  })

  it('names both schedule bases, since the pilot has to compare them', () => {
    expect([...SCHEDULE_BASES]).toEqual(['content_beats', 'uniform'])
  })
})

describe('the visual prompt', () => {
  it('names the frame count it was actually given', () => {
    // ⚠️ THE INVITATION TO HALLUCINATE. Telling the model there are four frames
    // when three were attached does not produce a hallucination — it produces a
    // citation to a frame we said existed, which the parser then rejects as if
    // the model had invented it.
    expect(visualPrompt(3)).toContain('numbered 1 to 3')
    expect(visualPrompt(3)).toContain('between 1 and 3')
    expect(visualPrompt(1)).toContain('1 still frame taken in order')
    expect(visualPrompt(4)).toContain('4 still frames taken in order')
  })

  it('states the two-frame rule for changes in a form a model can comply with', () => {
    const p = visualPrompt(4)
    expect(p).toMatch(/cite TWO frames as \[earlier, later\]/)
    expect(p).toMatch(/One frame can never establish a change/)
  })

  it('offers not_determined as a correct answer, not a failure', () => {
    // ⚖️ THE FIELD THIS PASS MOST NEEDS. A settled "the frames cannot say"
    // retires the question; a plausible guess costs a wrong gallery promise.
    const p = visualPrompt(4)
    expect(p).toContain('"value": "not_determined"')
    expect(p).toMatch(/correct and useful answer/)
  })

  it('never hands the model the caption, transcript or URL', () => {
    // ⚠️ THE WRONG EPISTEMIC SOURCE. A visual model given the caption answers
    // from the caption, and the answer is indistinguishable from an observation.
    const p = visualPrompt(4).toLowerCase()
    expect(p).toContain('you have not seen the video, its caption, its audio, or its title')
    expect(p).not.toContain('http')
  })

  it('asks every field the contract will try to read', () => {
    // The module-load assertion already fails the build on a missing question;
    // this is the same guarantee stated where a reader will find it.
    expect(Object.keys(FIELD_QUESTIONS)).toHaveLength(15)
    for (const q of Object.values(FIELD_QUESTIONS)) {
      expect(q.length).toBeGreaterThan(10)
      expect(visualPrompt(4)).toContain(q)
    }
  })
})
