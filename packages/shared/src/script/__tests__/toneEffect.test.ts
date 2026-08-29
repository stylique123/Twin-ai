import { describe, expect, it } from 'vitest'
import { toneEffect } from '../toneEffect'

describe('balanced tone', () => {
  it('is always observed with no contradictions, whatever the delivery text says', () => {
    expect(toneEffect([], [], 'balanced')).toEqual({ tone: 'balanced', tone_effect_observed: true, contradictions: 0 })
    const script = [{ direction: 'rapid jump cuts, high energy' }]
    expect(toneEffect(script, [], 'balanced')).toEqual({ tone: 'balanced', tone_effect_observed: true, contradictions: 0 })
  })
})

describe('punchy tone', () => {
  it('is unobserved when nothing in the delivery text names energy', () => {
    const script = [{ direction: 'Medium shot, facing the window.' }]
    const sprint = [{ minute: '0-5', task: 'Film the intro in one clean take.' }]
    const result = toneEffect(script, sprint, 'punchy')
    expect(result.tone_effect_observed).toBe(false)
    expect(result.contradictions).toBe(0)
  })

  it('is observed when a beat direction names energy', () => {
    const script = [{ direction: 'Fast cuts, high energy delivery.' }]
    expect(toneEffect(script, [], 'punchy').tone_effect_observed).toBe(true)
  })

  it('is observed when a production_sprint task names energy', () => {
    const sprint = [{ minute: '0-5', task: 'Quick cuts, bold pacing throughout.' }]
    expect(toneEffect([], sprint, 'punchy').tone_effect_observed).toBe(true)
  })

  it('flags a contradiction when calm language appears with no energy language anywhere', () => {
    const script = [{ direction: 'Medium shot, calm and understated.' }]
    const result = toneEffect(script, [], 'punchy')
    expect(result.tone_effect_observed).toBe(false)
    expect(result.contradictions).toBe(1)
  })

  it('does not flag a contradiction once energy language is present elsewhere', () => {
    const script = [
      { direction: 'Medium shot, calm.' },
      { direction: 'Fast cuts, high energy.' },
    ]
    const result = toneEffect(script, [], 'punchy')
    expect(result.tone_effect_observed).toBe(true)
    expect(result.contradictions).toBe(0)
  })
})

describe('understated tone', () => {
  it('is unobserved when nothing in the delivery text names a calm register', () => {
    const script = [{ direction: 'Medium shot, standard.' }]
    expect(toneEffect(script, [], 'understated').tone_effect_observed).toBe(false)
  })

  it('is observed when a beat direction names a calm register', () => {
    const script = [{ direction: 'Medium shot, calm and composed.' }]
    expect(toneEffect(script, [], 'understated').tone_effect_observed).toBe(true)
  })

  // The exact run-d audited shape: a calm beat direction sitting next to a
  // production_sprint task describing "rapid jump cuts to mimic the
  // energetic delivery" -- observed AND contradicted at once, because the
  // energetic language is a direct violation regardless of what else is true.
  it('flags the run-d contradiction: energetic sprint text under an understated tone', () => {
    const script = [{ direction: 'Medium shot, calm.' }, { direction: 'Medium shot, calm.' }]
    const sprint = [{ minute: '0-5', task: 'A direct to camera rant... rapid jump cuts to mimic the energetic delivery.' }]
    const result = toneEffect(script, sprint, 'understated')
    expect(result.tone_effect_observed).toBe(true)
    expect(result.contradictions).toBe(1)
  })

  it('no contradiction when every passage stays calm', () => {
    const script = [{ direction: 'Medium shot, calm.' }, { direction: 'Medium shot, steady.' }]
    const sprint = [{ minute: '0-5', task: 'A composed, measured piece, no hype anywhere.' }]
    const result = toneEffect(script, sprint, 'understated')
    expect(result.tone_effect_observed).toBe(true)
    expect(result.contradictions).toBe(0)
  })
})

describe('malformed input', () => {
  it('non-array script and production_sprint do not throw and read as unobserved for punchy/understated', () => {
    for (const v of [null, undefined, 'x', 3, {}]) {
      expect(() => toneEffect(v, v, 'punchy')).not.toThrow()
      expect(toneEffect(v, v, 'punchy').tone_effect_observed).toBe(false)
      expect(toneEffect(v, v, 'understated').tone_effect_observed).toBe(false)
    }
  })

  it('a beat with no direction or non-string direction is skipped, not a crash', () => {
    const script = [{}, { direction: null }, { direction: 42 }]
    expect(() => toneEffect(script, [], 'punchy')).not.toThrow()
  })
})
