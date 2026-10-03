import { describe, expect, it } from 'vitest'
import { cleanNewHooks, normalizeAudience } from './audienceParse'

const s = { hooks: ['a', 'b', 'c'], lines: ['x', 'y'] }
const viewer = (n: number, would: number[], fav: number) => ({ who: `v${n}`, quote: 'q', stops_for: fav, would_stop: would, leaves_at: -1 })

describe('hook scoring', () => {
  it('counts every hook a viewer would stop for, not only the favourite', () => {
    const r = normalizeAudience({ viewers: [0, 1, 2, 3].map((n) => viewer(n, [0, 1], 0)) }, s)!
    expect(r.hooks.map((h) => h.stopped)).toEqual([4, 4, 0])
    expect(r.best_hook).toBe(0)
  })
  it('still counts the favourite when would_stop is missing, and drops bad indexes', () => {
    const r = normalizeAudience({ viewers: [0, 1, 2].map((n) => ({ ...viewer(n, [9, -1], 2), would_stop: n ? [9] : undefined })) }, s)!
    expect(r.hooks[2].stopped).toBe(3)
    expect(r.viewers[0].would_stop).toEqual([])
  })
})

describe('cleanNewHooks', () => {
  it('drops duplicates of old hooks, empties and overlong lines, keeps at most 2 (owner audit 2026-10-01: 4–16 hooks)', () => {
    const long = Array(20).fill('w').join(' ')
    expect(cleanNewHooks({ hooks: ['A', ' new  one ', '', long, 'two', 'three', 'four'] }, ['a'])).toEqual(['new one', 'two'])
    expect(cleanNewHooks(null, [])).toEqual([])
  })
})

import { applyLineRewrites, betterVersion, scriptFromBlueprint } from './audienceParse'

describe('applyLineRewrites', () => {
  const lines = ['We roast 12 bags on Friday.', 'Sarah picks the beans.', 'Order before noon.']
  it('keeps a tighter line that adds nothing new', () => {
    expect(applyLineRewrites(lines, { lines: [{ index: 2, text: 'Order by noon.' }] })).toEqual({ lines: [lines[0], lines[1], 'Order by noon.'], changed: [2] })
  })
  it('refuses a new number, a new name, a bad index or a much longer line', () => {
    expect(applyLineRewrites(lines, { lines: [
      { index: 0, text: 'We roast 40 bags on Friday.' },
      { index: 1, text: 'Sarah and Tom pick the beans.' },
      { index: 9, text: 'x' },
      { index: 2, text: 'Order before noon because otherwise you will wait a whole extra week for the next batch to arrive at home.' },
    ] })).toBeNull()
  })
  it('allows names and numbers already in the script', () => {
    expect(applyLineRewrites(lines, { lines: [{ index: 1, text: 'Every Friday, Sarah picks 12 bags of beans.' }] })?.changed).toEqual([1])
  })
})

describe('betterVersion', () => {
  const res = (watched: number, best: number) => ({
    viewers: Array.from({ length: 10 }, (_, i) => ({ who: 'v', quote: 'q', stops_for: -1, would_stop: [], leaves_at: i < watched ? -1 : 1, question: null })),
    hooks: [{ hook: 'h', stopped: best }], best_hook: 0, fixes: [], summary: null,
  })
  it('needs more viewers to the end without a worse hook', () => {
    expect(betterVersion(res(4, 7) as never, res(6, 7) as never)).toBe(true)
    expect(betterVersion(res(4, 7) as never, res(6, 5) as never)).toBe(false)
    expect(betterVersion(res(4, 7) as never, res(4, 9) as never)).toBe(false)
  })
})

describe('scriptFromBlueprint', () => {
  it('maps lines to their script position and their scene', () => {
    const s = scriptFromBlueprint({
      hook_options: ['h'], script: [{ line: 'a' }, { line: '' }, { line: 'b' }],
      shot_list: [{ shot: 'Close-up', framing: 'tight', notes: '', spoken_text: 'b' }],
    })!
    expect(s.at).toEqual([0, 2])
    expect(s.shots).toEqual([null, 'Close-up · tight'])
  })
})

import { oneBased } from './audienceParse'
describe('viewer notes use the numbers she sees (1.5)', () => {
  it('shifts line/hook numbers in words to 1-based', () => {
    expect(oneBased('Line 2 is slow; use Hook 0 instead')).toBe('Line 3 is slow; use Hook 1 instead')
    expect(oneBased(null)).toBeNull()
  })
})

describe('owner 2026-10-03: what the viewers point out is actually done', () => {
  it('an added line may use her facts but nothing beyond them, and never lands before the hook or after the close', async () => {
    const { cleanAddedLines } = await import('./audienceParse')
    const lines = ['Hook line here.', 'Here is the trick that changes everything.', 'Order from the link in my bio.']
    const raw = { add: [
      { after: 1, text: 'Pour slowly in small circles so the grounds bloom evenly.', action: 'Flip to the back camera on the kettle spout', camera: 'back' },
      { after: 1, text: 'Use 18 grams every single time for the best cup.', action: '', camera: 'front' },
      { after: 2, text: 'And one more thing after the close.', action: '', camera: 'front' },
    ] }
    const out = cleanAddedLines(lines, raw, 'pour slowly in small circles so the grounds bloom')
    expect(out.map((a) => a.text)).toEqual(['Pour slowly in small circles so the grounds bloom evenly.'])
    expect(out[0].camera).toBe('back')
  })
  it('as many watching with fewer open fixes is a better version', () => {
    const v = (w: number, fixes: number) => ({ hooks: [{ stopped: 5 }], viewers: Array.from({ length: 10 }, (_, i) => ({ leaves_at: i < w ? -1 : 1 })), fixes: Array.from({ length: fixes }, () => ({})), promise_kept: true })
    expect(betterVersion(v(4, 3) as never, v(4, 1) as never)).toBe(true)
    expect(betterVersion(v(4, 1) as never, v(4, 1) as never)).toBe(false)
    expect(betterVersion(v(4, 1) as never, v(3, 0) as never)).toBe(false)
  })
})
