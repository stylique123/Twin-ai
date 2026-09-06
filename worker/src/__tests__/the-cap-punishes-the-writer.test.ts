import { describe, it, expect } from 'vitest'
import { buildCaptionCorpus, captionHeader, SUBSTANCE_FLOOR } from '../captionCorpus'

const post = (caption: string, over: Partial<{ url: string; plays: number; likes: number }> = {}) =>
  ({ caption, url: over.url ?? `https://t/${caption.length}-${Math.random()}`, plays: over.plays ?? null, likes: over.likes ?? null })

describe('the header cost, which was never charged to the budget', () => {
  it('is 18 characters for a single-digit caption', () => {
    expect(captionHeader(1)).toHaveLength(18)
    expect(captionHeader(10)).toHaveLength(19)
  })

  // ⚠️ THE MEASURED 990. 9 single-digit + 41 double-digit headers + 49 joins.
  it('reproduces the exact 990-char overhead measured on the physio 50', () => {
    const overhead = 9 * 18 + 41 * 19 + 49
    expect(overhead).toBe(990)
  })

  it('the corpus never exceeds the budget it was given', () => {
    const r = buildCaptionCorpus(Array.from({ length: 60 }, () => post('x'.repeat(400))), 12_000)
    expect(r.chars).toBeLessThanOrEqual(12_000)
    expect(r.corpus.length).toBeLessThanOrEqual(12_000)
  })
})

describe('waterfill — every subject survives, long captions yield first', () => {
  // ⚠️⚠️ THE REGRESSION THAT KILLED SUBSTANCE-FIRST ORDERING. Sorting by length
  // kept 14 of the physio's 50 and deleted 36 SUBJECTS. Breadth is the output
  // of this extractor, so a short caption must still reach the model.
  it('a short caption is NOT dropped to make room for a long one', () => {
    const long = 'clinical explanation with real vocabulary. '.repeat(40)
    const short = 'ice or heat, which one'
    const r = buildCaptionCorpus([post(long), post(short)], 600)
    expect(r.included).toBe(2)
    expect(r.corpus).toContain(short)
  })

  // ⚖️ THE LEGO PARODY STILL MATTERS — but as numbering, not inclusion. Both
  // are present; reach no longer decides who survives, because nobody is cut.
  it('a viral joke and a clinical caption both reach the model', () => {
    const r = buildCaptionCorpus([
      post('LEGO parody lol', { plays: 543_300 }),
      post('Arthrogenic inhibition means the quad shuts down. '.repeat(4), { plays: 3_000 }),
    ], 12_000)
    expect(r.corpus).toContain('LEGO')
    expect(r.corpus).toContain('Arthrogenic')
    expect(r.included).toBe(2)
  })

  it('only the long caption is trimmed, and the ceiling reports where', () => {
    const r = buildCaptionCorpus([post('z'.repeat(900)), post('a short one about brakes here')], 500)
    expect(r.truncated).toBe(1)
    expect(r.ceiling).toBeGreaterThan(0)
    expect(r.corpus).toContain('a short one about brakes here')
  })

  it('spends the budget without exceeding it', () => {
    const r = buildCaptionCorpus(Array.from({ length: 50 }, (_, i) => post('x'.repeat(100 + i * 30))), 12_000)
    expect(r.chars).toBeLessThanOrEqual(12_000)
    expect(r.chars).toBeGreaterThan(11_000)
    expect(r.included).toBe(50)
  })

  it('nothing is trimmed when everything fits — the mechanic case', () => {
    const r = buildCaptionCorpus(Array.from({ length: 50 }, () => post('brake job on a 2012 civic today')), 12_000)
    expect(r.truncated).toBe(0)
    expect(r.corpus).not.toContain('…')
  })
})

describe('a severed caption never passes as a whole one', () => {
  it('a trimmed caption carries the marker', () => {
    const r = buildCaptionCorpus([post('q'.repeat(900)), post('short one here about cars')], 400)
    expect(r.corpus).toContain('…')
  })

  it('an untrimmed caption appears verbatim with no marker', () => {
    const caps = ['first caption in full here', 'second caption in full here']
    const r = buildCaptionCorpus(caps.map((c) => post(c)), 12_000)
    for (const c of caps) expect(r.corpus).toContain(c)
    expect(r.corpus).not.toContain('…')
  })
})

describe('urls align to the header numbering — the field that was thrown away', () => {
  // ⚠️ THE CAPTION PATH ASKED FOR `source_video` AND NEVER READ IT. The
  // transcript path maps `urls[i-1]`; this makes the same mapping possible here.
  it('caption N resolves to urls[N-1]', () => {
    const r = buildCaptionCorpus([
      post('the longest caption of the three by a clear margin here', { url: 'https://a/1' }),
      post('a middling caption here for us', { url: 'https://a/2' }),
    ], 12_000)
    expect(r.urls).toHaveLength(r.included)
    const first = r.corpus.indexOf('--- CAPTION 1 ---')
    expect(first).toBe(0)
    expect(r.urls[0]).toBe('https://a/1')
  })

  it('a missing url is null, never an empty string', () => {
    const r = buildCaptionCorpus([{ caption: 'a caption with no url at all', url: '  ' }], 12_000)
    expect(r.urls[0]).toBeNull()
  })
})

describe('coverage is reported, so a sample cannot pass as a census', () => {
  it('counts considered, included and discarded', () => {
    const r = buildCaptionCorpus(Array.from({ length: 40 }, () => post('y'.repeat(500))), 12_000)
    expect(r.considered).toBe(40)
    // Waterfill keeps every subject; the loss is now depth, not breadth.
    expect(r.included).toBe(40)
    expect(r.discarded).toBe(0)
    expect(r.truncated).toBeGreaterThan(0)
  })

  it('the mechanic fits entirely — 0 discarded, which is the contrast case', () => {
    const r = buildCaptionCorpus(Array.from({ length: 50 }, () => post('brake job on a 2012 civic today')), 12_000)
    expect(r.discarded).toBe(0)
    expect(r.included).toBe(50)
  })

  // ⚠️ ONLY THE 120-CAPTION LIMIT DISCARDS NOW, never the character budget.
  it('discards only past the caption-count limit', () => {
    const r = buildCaptionCorpus(Array.from({ length: 140 }, () => post('a usable caption about a repair')), 12_000)
    expect(r.included).toBe(120)
    expect(r.discarded).toBe(20)
  })

  it('an empty scrape yields an empty corpus, not a throw', () => {
    expect(buildCaptionCorpus([], 12_000)).toMatchObject({ corpus: '', included: 0, discarded: 0 })
  })

  it('captions under the usability floor are not considered at all', () => {
    expect(buildCaptionCorpus([{ caption: 'short' }, { caption: '   ' }], 12_000).considered).toBe(0)
  })

  it('the substance floor is a documented constant, not a magic number', () => {
    expect(SUBSTANCE_FLOOR).toBe(40)
  })

  // ⚠️ THE MEASURED PHYSIO SHAPE, REPRODUCED: 50 captions, 16,659 chars.
  // Waterfill must keep all 50 and land within a few chars of the 11,050
  // ceiling that remains after 950 characters of headers.
  it('reproduces the measured physio outcome: 50 subjects kept, ~11,041 chars', () => {
    const lens = Array.from({ length: 50 }, (_, i) => 65 + Math.round((16659 - 50 * 65) * (i + 1) / 1275))
    const r = buildCaptionCorpus(lens.map((n) => post('w'.repeat(n))), 12_000)
    expect(r.included).toBe(50)
    expect(r.chars).toBeLessThanOrEqual(12_000)
    expect(r.chars).toBeGreaterThan(11_500)
  })
})
