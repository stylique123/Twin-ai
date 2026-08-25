import { describe, it, expect } from 'vitest'
import {
  countOneLook, sampleOwnAccount, EMPTY_SAMPLE,
  type SampleCounts, type OneLook,
} from '../ownAccountSample.js'

const look = (talking: boolean | null, failure: string | null = null): OneLook =>
  ({ someoneTalkingToCamera: talking, failure })

const fold = (looks: OneLook[]): SampleCounts =>
  looks.reduce(countOneLook, { ...EMPTY_SAMPLE })

/**
 * ⚠️ THE COUNTING RULE IS WHAT A CREATOR READS. `messageForOwnAccount` renders
 * `checked` into a sentence about their own work —
 *
 *     "None of the 6 videos we looked at are you talking to the camera"
 *
 * — so a video that never downloaded must not be counted as one we looked at.
 * Otherwise Twin states a measurement it never took, to the person it is asking
 * to trust it.
 */
describe('a video we could not read is not a video we looked at', () => {
  it('a download failure counts as no answer, not as a look', () => {
    const c = fold([look(null, 'TRIAGE_DOWNLOAD_FAILED')])
    expect(c.checked).toBe(0)
    expect(c.usable).toBe(0)
    expect(c.noAnswer).toBe(1)
  })

  // ⚖️ `unsure` COUNTS THE SAME WAY. `readEarlyAnswer` returns null for unsure,
  // a missing key, or an unrecognised word — because false is an accusation and
  // null is silence. Folding null into `checked` would convert every decline
  // into a point against the creator.
  it('an unsure answer counts as no answer either', () => {
    const c = fold([look(null)])
    expect(c.checked).toBe(0)
    expect(c.noAnswer).toBe(1)
  })

  it('a real no is a look, and counts against', () => {
    const c = fold([look(false)])
    expect(c.checked).toBe(1)
    expect(c.usable).toBe(0)
    expect(c.noAnswer).toBe(0)
  })

  it('a real yes is a look, and counts for', () => {
    const c = fold([look(true)])
    expect(c.checked).toBe(1)
    expect(c.usable).toBe(1)
  })

  // ⚠️ THE SENTENCE MUST STAY TRUE. Three failures out of six means we looked at
  // three — not six — and `checked` is what the sentence names.
  it('three failures out of six leaves checked at three', () => {
    const c = fold([
      look(true), look(true), look(true),
      look(null, 'TRIAGE_DOWNLOAD_FAILED'), look(null, 'TRIAGE_DOWNLOAD_FAILED'), look(null),
    ])
    expect(c.checked).toBe(3)
    expect(c.usable).toBe(3)
    expect(c.noAnswer).toBe(3)
  })

  // ⚖️ AND checked FALLING SHORT OF THE SAMPLE SIZE IS CORRECT, not a gap.
  // OWN_VIDEOS_TO_CHECK is 6 against a bar of 5 precisely so one unreadable
  // video still leaves a good creator able to be told nothing at all.
  it('five usable and one unreadable still reaches the bar', () => {
    const c = fold([
      look(true), look(true), look(true), look(true), look(true),
      look(null, 'TRIAGE_DOWNLOAD_FAILED'),
    ])
    expect(c.usable).toBe(5)
    expect(c.checked).toBe(5)
  })
})

describe('the sample publishes as it goes and finishes exactly once', () => {
  const run = async (looks: OneLook[], limit = 6) => {
    const published: SampleCounts[] = []
    let i = 0
    const final = await sampleOwnAccount(
      looks.map((_, n) => `v${n}`),
      limit,
      {
        lookAt: async () => looks[i++],
        publish: async (c) => { published.push(c) },
      },
    )
    return { published, final }
  }

  // ⚠️ EVERY INTERIM PUBLISH SAYS complete:false, and that flag is load-bearing.
  // `messageForOwnAccount` refuses to speak from a partial sample; without it a
  // creator sees "None of the 1 video we looked at" seconds in, then watches it
  // silently change.
  it('every publish before the last is marked incomplete', () => {
    return run([look(true), look(false), look(true)]).then(({ published }) => {
      expect(published.length).toBe(4) // one per video, plus the final
      for (const p of published.slice(0, -1)) expect(p.complete).toBe(false)
      expect(published[published.length - 1].complete).toBe(true)
    })
  })

  it('the final counts are the returned counts', async () => {
    const { published, final } = await run([look(true), look(false)])
    expect(final).toEqual({ usable: 1, checked: 2, complete: true, noAnswer: 0 })
    expect(published[published.length - 1]).toEqual(final)
  })

  // ⚠️ THE FINAL PUBLISH IS UNCONDITIONAL. A sample where every look failed must
  // still be marked finished, or the reader waits forever on a check that has
  // already given up. Zero-of-zero is terminal, and it reads as silence.
  it('a sample where everything failed is still marked complete', async () => {
    const { final, published } = await run([
      look(null, 'TRIAGE_DOWNLOAD_FAILED'), look(null, 'TRIAGE_DOWNLOAD_FAILED'),
    ])
    expect(final).toEqual({ usable: 0, checked: 0, complete: true, noAnswer: 2 })
    expect(published[published.length - 1].complete).toBe(true)
  })

  it('no videos at all still finishes', async () => {
    const { final, published } = await run([])
    expect(final.complete).toBe(true)
    expect(published).toEqual([final])
  })
})

describe('nothing here can cost the creator their scan', () => {
  // ⚠️ A THROWN lookAt IS AN ANSWERLESS VIDEO, NOT A FAILED SCAN. The point of
  // moving this off the critical path is that it cannot hurt them.
  it('a throwing look becomes no answer and the rest still run', async () => {
    let n = 0
    const final = await sampleOwnAccount(['a', 'b', 'c'], 6, {
      lookAt: async () => {
        n += 1
        if (n === 1) throw new Error('network')
        return look(true)
      },
      publish: async () => {},
    })
    expect(final).toEqual({ usable: 2, checked: 2, complete: true, noAnswer: 1 })
  })

  // ⚖️ A FAILED WRITE IS NOT A FAILED SAMPLE — the same rule earlyLookStep uses.
  it('a throwing publish does not stop the sample or the return', async () => {
    const final = await sampleOwnAccount(['a', 'b'], 6, {
      lookAt: async () => look(true),
      publish: async () => { throw new Error('db down') },
    })
    expect(final).toEqual({ usable: 2, checked: 2, complete: true, noAnswer: 0 })
  })
})

describe('the sample size is respected', () => {
  it('never looks at more than the limit', async () => {
    let looked = 0
    await sampleOwnAccount(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 6, {
      lookAt: async () => { looked += 1; return look(true) },
      publish: async () => {},
    })
    expect(looked).toBe(6)
  })

  // ⚠️ A NONSENSE LIMIT LOOKS AT NOTHING RATHER THAN AT EVERYTHING. Number(null)
  // is 0 and a negative slice would take from the end, so both are pinned.
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'a limit of %s looks at nothing', async (limit) => {
      let looked = 0
      const final = await sampleOwnAccount(['a', 'b'], limit as number, {
        lookAt: async () => { looked += 1; return look(true) },
        publish: async () => {},
      })
      expect(looked).toBe(0)
      expect(final.complete).toBe(true)
    },
  )

  it('a missing video list looks at nothing and still finishes', async () => {
    const final = await sampleOwnAccount(null as never, 6, {
      lookAt: async () => look(true),
      publish: async () => {},
    })
    expect(final).toEqual({ usable: 0, checked: 0, complete: true, noAnswer: 0 })
  })
})
