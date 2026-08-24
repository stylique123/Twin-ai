import { describe, it, expect } from 'vitest'
import { earlyLookStep, type EarlyLookStepDeps } from '../earlyLookStep.js'
import type { EarlyLookResult } from '../earlyLookRules.js'

const ANSWER: EarlyLookResult = {
  someoneTalkingToCamera: true, peopleOnCamera: 'one', looksAnimated: false,
  framesLookedAt: 2, failure: null,
}

function spy(over: Partial<EarlyLookStepDeps> = {}) {
  const order: string[] = []
  const deps: EarlyLookStepDeps = {
    download: async () => { order.push('download') },
    look: async () => { order.push('look'); return ANSWER },
    persist: async () => { order.push('persist') },
    ...over,
  }
  // Re-wrap any override so it still records its own name in `order`.
  for (const k of Object.keys(over) as (keyof EarlyLookStepDeps)[]) {
    const fn = over[k]! as (...a: never[]) => Promise<unknown>
    ;(deps as Record<string, unknown>)[k] = async (...a: never[]) => {
      order.push(k)
      return fn(...a)
    }
  }
  return { deps, order }
}

describe('the order the early check happens in', () => {
  // ⚠️ THE WHOLE REQUIREMENT IN ONE ASSERTION. Look, write it down, and only
  // then let the slow work start.
  it('downloads, looks, then persists — in that order', async () => {
    const { deps, order } = spy()
    await earlyLookStep('/tmp/v.mp4', deps)
    expect(order).toEqual(['download', 'look', 'persist'])
  })

  // ⚠️ RECORDING ON *CALL* WOULD NOT PROVE THIS. A fire-and-forget persist is
  // invoked in the right place and completes in the wrong one — transcription
  // would start while the answer is still in flight, which is exactly the
  // "analyse first, apologise later" behaviour the step exists to prevent. So
  // this persist only records itself after yielding, and the assertion runs
  // after earlyLookStep has returned: it can only pass if the write was AWAITED.
  it('the write is awaited, not fired and forgotten', async () => {
    const order: string[] = []
    await earlyLookStep('/tmp/v.mp4', {
      download: async () => { order.push('download') },
      look: async () => { order.push('look'); return ANSWER },
      persist: async () => {
        await new Promise((r) => setTimeout(r, 5))
        order.push('persist')
      },
    })
    expect(order).toEqual(['download', 'look', 'persist'])
  })

  it('returns the answer it persisted', async () => {
    const { deps } = spy()
    await expect(earlyLookStep('/tmp/v.mp4', deps)).resolves.toEqual(ANSWER)
  })
})

describe('failures are answers, not obstacles', () => {
  it('a failed download still persists an all-null answer', async () => {
    const seen: EarlyLookResult[] = []
    const { deps, order } = spy({
      download: async () => { throw new Error('yt-dlp exploded') },
      persist: async (r: EarlyLookResult) => { seen.push(r) },
    })
    const r = await earlyLookStep('/tmp/v.mp4', deps)
    expect(r.failure).toBe('TRIAGE_DOWNLOAD_FAILED')
    expect(r.someoneTalkingToCamera).toBeNull()
    expect(seen).toEqual([r])
    // ⚠️ AND THE LOOK IS NOT ATTEMPTED. Sampling a file that was never written
    // would produce an answer about nothing, which reads like a finding.
    expect(order).not.toContain('look')
  })

  it('a look that throws becomes an all-null answer, not an exception', async () => {
    const { deps } = spy({ look: async () => { throw new Error('gemini exploded') } })
    const r = await earlyLookStep('/tmp/v.mp4', deps)
    expect(r.failure).toBe('EARLY_LOOK_THREW')
    expect(r.peopleOnCamera).toBeNull()
  })

  // ⚖️ LOSING A WARNING MUST NEVER COST THE CREATOR THE VIDEO THEY ASKED FOR.
  it('a failed write does not fail the step', async () => {
    const { deps } = spy({ persist: async () => { throw new Error('db down') } })
    await expect(earlyLookStep('/tmp/v.mp4', deps)).resolves.toEqual(ANSWER)
  })

  it('nothing here throws, whatever fails', async () => {
    const { deps } = spy({
      download: async () => { throw new Error('a') },
      persist: async () => { throw new Error('b') },
    })
    await expect(earlyLookStep('/tmp/v.mp4', deps)).resolves.toMatchObject({
      failure: 'TRIAGE_DOWNLOAD_FAILED',
    })
  })
})
