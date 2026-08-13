// ⚠️ WHY THE SELECTION IS WORTH TESTING AT ALL. Transcripts are the ONLY source
// that can produce `stated` positions, so they are the only source that can ever
// license an opinion or experience beat. Caption extraction over the 8-creator
// corpus produced 479 items with ZERO opinions and ZERO experiences — correctly,
// because a title proves a video was made and not what it concluded. Which few
// videos get transcribed therefore decides whether Twin can ever say anything a
// creator actually believes.
import { describe, expect, it } from 'vitest'
import { selectVideosToTranscribe, TRANSCRIPT_BUDGET, TRANSCRIPT_BUDGET } from '../transcriptSelection'

const v = (url: string, plays: number, text = '', postedAt: string | null = null) =>
  ({ url: `https://x/${url}`, plays, text, postedAt })

describe('representative, not merely popular', () => {
  it('does not spend every slot on what went viral', () => {
    // ⚠️ THE BEHAVIOUR THIS REPLACES. Both callers sorted by plays and took
    // five. Viral videos are systematically the LEAST representative source of
    // belief: they skew to spectacle and to older uploads that had time to
    // accumulate reach.
    const c = [
      v('viral1', 900_000, 'a', '2025-01-01'), v('viral2', 800_000, 'a', '2025-01-02'),
      v('viral3', 700_000, 'a', '2025-01-03'), v('viral4', 600_000, 'a', '2025-01-04'),
      v('recent', 50, 'a', '2026-08-01'),
    ]
    const got = selectVideosToTranscribe(c)
    expect(got).toContain('https://x/recent')
    expect(got.filter((u) => u.includes('viral')).length).toBeLessThan(TRANSCRIPT_BUDGET)
  })

  it('takes the two top performers', () => {
    const c = [v('a', 10), v('b', 100), v('c', 50), v('d', 1)]
    const got = selectVideosToTranscribe(c, 2)
    expect(got).toEqual(['https://x/b', 'https://x/c'])
  })

  it('takes what they make NOW — an old viral hit is a different person', () => {
    const c = [
      v('old', 999_999, '', '2024-01-01'),
      v('new1', 10, '', '2026-08-10'), v('new2', 11, '', '2026-08-09'),
    ]
    const got = selectVideosToTranscribe(c, 3)
    expect(got).toContain('https://x/new1')
    expect(got).toContain('https://x/new2')
  })

  it('spends one slot on the densest caption, as an admitted proxy', () => {
    // ⚖️ Caption length is a WEAK signal for "this video has an argument in it"
    // and will sometimes pick something merely wordy. It costs one slot of five
    // and beats a sixth viral clip.
    const c = [
      v('p1', 100, 'x', '2026-01-01'), v('p2', 90, 'x', '2026-01-02'),
      v('r1', 1, 'x', '2026-08-01'), v('r2', 2, 'x', '2026-07-01'),
      v('dense', 3, 'a genuinely long caption that argues a position at length', '2020-01-01'),
      v('short', 4, 'x', '2020-01-02'),
    ]
    expect(selectVideosToTranscribe(c)).toContain('https://x/dense')
  })
})

describe('the three-state and budget rules', () => {
  it('an ABSENT date is unknown, not old', () => {
    // ⚠️ Treating a missing timestamp as epoch would rank every unknown-date
    // video last and quietly turn the recency axis into a second reach axis.
    const c = [v('a', 5, '', null), v('b', 4, '', null), v('c', 3, '', null)]
    expect(selectVideosToTranscribe(c, 3)).toHaveLength(3)
  })

  it('never returns a duplicate when one video wins two axes', () => {
    // Top performer AND most recent — one slot, not two.
    const c = [
      v('both', 1000, 'x', '2026-08-11'), v('b', 10, 'x', '2026-01-01'),
      v('c', 9, 'x', '2025-01-01'), v('d', 8, 'x', '2024-01-01'), v('e', 7, 'x', '2023-01-01'),
    ]
    const got = selectVideosToTranscribe(c)
    expect(new Set(got).size).toBe(got.length)
    expect(got).toHaveLength(5)
  })

  it('spends the whole budget when an axis has nothing to give', () => {
    // ⚖️ An unspent slot is a transcript we could have had for free.
    //
    // ⚠️ ASSERTED AGAINST THE BUDGET, NOT A LITERAL. This read `toHaveLength(5)`
    // and failed when the budget rose to 10 — correctly, but for the wrong
    // reason: the property is "spend everything available", not "pick five".
    // With fewer candidates than budget, every candidate is taken.
    const c = [v('a', 5), v('b', 4), v('c', 3), v('d', 2), v('e', 1), v('f', 0)]
    expect(selectVideosToTranscribe(c))
      .toHaveLength(Math.min(c.length, TRANSCRIPT_BUDGET))
    const many = Array.from({ length: TRANSCRIPT_BUDGET + 4 }, (_, i) => v(`x${i}`, i))
    expect(selectVideosToTranscribe(many)).toHaveLength(TRANSCRIPT_BUDGET)
  })

  it('spends extra budget on stance before falling back to raw reach', () => {
    // ⚠️ THE POINT OF RAISING THE BUDGET. Extra slots should buy DIFFERENT
    // videos — arguments the creator made — not simply the next-biggest
    // spectacles, which is what a pure reach fallback would do.
    const c = [
      v('big1', 100), v('big2', 90), v('big3', 80), v('big4', 70),
      { url: 'https://s1', plays: 5, text: 'why RGB lighting is a scam' },
      { url: 'https://s2', plays: 4, text: 'the mistake everyone makes with lenses' },
    ]
    const got = selectVideosToTranscribe(c, 4)
    expect(got).toContain('https://s1')
    expect(got).toContain('https://s2')
  })

  it('never exceeds the budget, and refuses non-https', () => {
    const c = [{ url: 'javascript:alert(1)', plays: 999 }, { url: 'http://x/insecure', plays: 998 }, v('ok', 1)]
    expect(selectVideosToTranscribe(c)).toEqual(['https://x/ok'])
  })

  it('handles an empty or tiny channel without throwing', () => {
    expect(selectVideosToTranscribe([])).toEqual([])
    expect(selectVideosToTranscribe([v('only', 1)])).toEqual(['https://x/only'])
  })
})
