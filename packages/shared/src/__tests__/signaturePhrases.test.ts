import { describe, it, expect } from 'vitest'
import { extractSignaturePhrases, renderSignaturePhrases } from '../signaturePhrases'

const v = (id: string, text: string) => ({ id, text })

describe('phrases this creator actually repeats, measured (Voice Cause 3)', () => {
  it('a phrase in fewer than 3 distinct videos does not qualify', () => {
    const out = extractSignaturePhrases([
      v('a', 'here is the thing about growth'),
      v('b', 'here is the thing about pricing'),
    ])
    expect(out.find((p) => p.phrase === 'here is')).toBeUndefined()
  })

  it('a phrase repeated across 3+ distinct videos qualifies', () => {
    const out = extractSignaturePhrases([
      v('a', 'listen closely friends because growth compounds slowly'),
      v('b', 'listen closely friends this changes everything'),
      v('c', 'listen closely friends nobody talks about this'),
    ])
    const found = out.find((p) => p.phrase === 'listen closely friends')
    expect(found).toBeDefined()
    expect(found!.videos).toBe(3)
  })

  // ⚠️ WITHIN ONE VIDEO IS NOT SPREAD. Repeating a phrase five times in a
  // single long transcript is not a verbal habit measured across their work —
  // it is one thing said once, at length.
  it('repeating a phrase many times inside ONE video still counts as one video', () => {
    const out = extractSignaturePhrases([
      v('a', 'trust me trust me trust me trust me'),
      v('b', 'something else entirely'),
    ])
    expect(out.find((p) => p.phrase === 'trust me')).toBeUndefined()
  })

  // ⚖️ BOUNDARY STOPWORDS ARE FRAGMENTS, NOT PHRASES.
  it('drops phrases whose first or last word is a stopword', () => {
    const out = extractSignaturePhrases([
      v('a', 'the way to do this is simple'),
      v('b', 'the way forward is clear'),
      v('c', 'the way out is through'),
    ])
    expect(out.find((p) => p.phrase === 'the way')).toBeUndefined()
  })

  it('a stopword in the MIDDLE of a phrase is fine', () => {
    const out = extractSignaturePhrases([
      v('a', 'start of the day matters most'),
      v('b', 'start of the day sets everything'),
      v('c', 'start of the day changed for me'),
    ])
    expect(out.find((p) => p.phrase === 'start of the day')).toBeDefined()
  })

  it('caps at 10 phrases', () => {
    const videos = Array.from({ length: 20 }, (_, i) =>
      v(`video-${i}`, Array.from({ length: 20 }, (_, j) => `zebra${j} quokka${j}`).join(' ')))
    const out = extractSignaturePhrases(videos)
    expect(out.length).toBeLessThanOrEqual(10)
  })

  it('ranks by video count, then longer phrases, deterministically', () => {
    const out = extractSignaturePhrases([
      v('a', 'listen to me carefully okay listen up now'),
      v('b', 'listen to me carefully please listen up now'),
      v('c', 'listen to me carefully friend listen up now'),
      v('d', 'listen up now for real'),
    ])
    // "listen up now" appears in all 4; "listen to me carefully" in 3.
    expect(out[0].phrase).toBe('listen up now')
    expect(out[0].videos).toBe(4)
  })

  it('no videos, or videos with no text, yields nothing', () => {
    expect(extractSignaturePhrases([])).toEqual([])
    expect(extractSignaturePhrases([v('a', ''), v('b', '   ')])).toEqual([])
  })

  it('render is empty when there is nothing measured', () => {
    expect(renderSignaturePhrases([])).toBe('')
  })

  // ⚖️ NO SCORE, NO PERCENTAGE — matches the rest of this module family.
  it('the render never uses a percentage or a score', () => {
    const out = extractSignaturePhrases([
      v('a', 'start of the day matters most'),
      v('b', 'start of the day sets everything'),
      v('c', 'start of the day changed for me'),
    ])
    expect(renderSignaturePhrases(out)).not.toMatch(/%|score|rating/i)
    expect(renderSignaturePhrases(out)).toContain('start of the day')
  })
})
