import { describe, expect, it } from 'vitest'
import { extractPassages } from '../passages'

const seg = (start: number, text: string) => ({ start, end: start + 3, text })

describe('extractPassages', () => {
  it('keeps a story verbatim with its times and marks it complete', () => {
    const r = extractPassages([
      seg(0, 'So last spring I ordered twenty pounds of green beans for Maya\'s Coffee.'),
      seg(3, 'I roasted the whole batch the night before the market without testing it.'),
      seg(6, 'But it came out way too dark and tasted like charcoal.'),
      seg(9, 'I threw out every bag and stayed up roasting again.'),
      seg(12, 'Now I always test one small batch first, and that is why I never skip it.'),
    ])
    expect(r.skipped).toBeNull()
    expect(r.passages).toHaveLength(1)
    expect(r.passages[0]).toMatchObject({ start: 0, end: 15, kind: 'story', complete: true })
    expect(r.passages[0].text).toContain('tasted like charcoal')
  })

  it('splits on a long pause', () => {
    const a = Array.from({ length: 4 }, (_, i) => seg(i * 3, `I started roasting coffee in my garage with a tiny popcorn machine, week ${['one','two','three','four'][i]}`))
    const b = Array.from({ length: 4 }, (_, i) => seg(40 + i * 3, `First I weigh the beans then I roast them and then I cool them fast, batch ${['one','two','three','four'][i]}`))
    const r = extractPassages([...a, ...b])
    expect(r.passages).toHaveLength(2)
    expect(r.passages[1].start).toBe(40)
  })

  it('skips song lyrics', () => {
    const chorus = ['oh baby baby', 'never let me go', 'oh baby baby', 'never let me go']
    const r = extractPassages(Array.from({ length: 12 }, (_, i) => seg(i * 3, `${chorus[i % 4]} tonight we dance under the lights`)))
    expect(r.skipped).toBe('lyrics')
  })

  it('skips slow, short sung lines even in the first person', () => {
    const song = ['I remember the night', 'you held me so close', 'I knew it was over', 'we danced in the rain', 'my heart in your hands', 'I let you go slow', 'the lights on the bay', 'I sing it again', 'you never came home', 'I wait by the door']
    const r = extractPassages(song.map((l, i) => ({ start: i * 3.5, end: i * 3.5 + 3, text: l })))
    expect(r.skipped).toBe('lyrics')
  })

  it('skips speech with no first person', () => {
    const r = extractPassages(Array.from({ length: 6 }, (_, i) => seg(i * 3, `The weather service says rain will move across the region by evening ${i}`)))
    expect(r.skipped).toBe('not_her')
  })
})
