import { describe, expect, it } from 'vitest'
import {
  applyLineRewrites, cleanAddedLines, keepRewrite, normalizeAudience, openingWithHook, resolveGaps,
  rewriteFixTags, scriptRewritePrompt, SCRIPT_REWRITE_SYSTEM, type Gap,
} from './audienceParse'

// Audit 2026-10-03 Part 6: 78 of 516 named gaps were fixed. Every gap is now
// either fixed in the delivered script or recorded with why it could not be.
const lines = [
  'This one trick changed my mornings.',
  'I roast in small batches at home.',
  'Most people grind too fine.',
  'Anyway, that is my coffee.',
]
const s = { hooks: ['h0', 'h1'], lines }
const viewers = (watched: number) => Array.from({ length: 6 }, (_, i) => ({ who: `v${i}`, quote: 'q', stops_for: 0, would_stop: [0], leaves_at: i < watched ? -1 : 2 }))
const tested = (watched: number, fixes: unknown[] = []) => normalizeAudience({ viewers: viewers(watched), fixes }, s)!
const gapList = [
  { issue: 'promise_not_kept', fix: 'Deliver the trick promised in the hook.', beat: 2 },
  { issue: 'weak_ending', fix: 'Tell people where to get it.', beat: 3 },
  { issue: 'hard_to_follow', fix: 'Say why small batches matter.', beat: 1 },
]

describe('every named gap reaches the rewriter and must be answered', () => {
  it('numbers each gap in the prompt and the system demands an answer for each', () => {
    const r = tested(3, gapList)
    const gaps: Gap[] = r.fixes.map((f, id) => ({ id, ...f }))
    const p = scriptRewritePrompt(s, r, [], gaps)
    for (const g of gaps) expect(p).toContain(`FIX ${g.id} (line ${g.beat})`)
    expect(SCRIPT_REWRITE_SYSTEM).toMatch(/EVERY numbered FIX must be answered/)
    expect(SCRIPT_REWRITE_SYSTEM).toMatch(/NEVER add a fact/)
  })

  it('a rewrite that tags a line or an added line to each gap fixes every gap', () => {
    const raw = {
      lines: [
        { index: 2, text: 'Most people grind too fine, so go one notch coarser.', fix: 0 },
        { index: 1, text: 'I roast in small batches at home so every bag is fresh.', fix: 2 },
      ],
      add: [{ after: 2, text: 'You can get the same beans from my shop link below.', action: 'Point down at the caption', camera: 'front', fix: 1 }],
    }
    const drafted = applyLineRewrites(lines, raw)!
    const adds = cleanAddedLines(lines, raw)
    const tags = rewriteFixTags(raw)
    const fixedBy = new Set([...tags.lines.values(), ...tags.adds.values()])
    expect(drafted.changed.sort()).toEqual([1, 2])
    expect(adds).toHaveLength(1)
    const out = resolveGaps(gapList.map((g, id) => ({ id, ...g })) as Gap[],
      { fixedBy, changedLines: drafted.changed, addedAfter: adds.map((a) => a.after) }, new Map(), new Map())
    expect(out.map((g) => g.status)).toEqual(['fixed', 'fixed', 'fixed'])
  })

  it('a gap that needs a fact she has not given becomes a question, never an invented line', () => {
    const raw = {
      lines: [{ index: 3, text: 'Get it for $18 at the market.', fix: 1 }],
      cannot: [{ fix: 0, reason: 'needs_fact', question: 'What is the one trick you promised?' }],
    }
    // The invented price is refused by the no-invention rule…
    expect(applyLineRewrites(lines, raw)).toBeNull()
    const tags = rewriteFixTags(raw)
    const attempts = new Map<number, 'refused'>([[1, 'refused']])
    const cannot = new Map(tags.cannot.map((c) => [c.fix, c]))
    const out = resolveGaps(gapList.map((g, id) => ({ id, ...g })) as Gap[],
      { fixedBy: new Set(), changedLines: [], addedAfter: [] }, attempts, cannot)
    // …and both gaps become her questions; the untouched one says why.
    expect(out[0]).toMatchObject({ status: 'needs_her', question: 'What is the one trick you promised?' })
    expect(out[1].status).toBe('needs_her')
    expect(out[1].question).toMatch(/\?$/)
    expect(out[2]).toMatchObject({ status: 'not_fixed' })
    expect(out[2].reason).toBeTruthy()
    for (const g of out) expect(g.status === 'fixed' || !!g.reason).toBe(true)
  })

  it('keeps a gap-closing rewrite that tests no worse, refuses one that loses viewers', () => {
    const before = tested(3, gapList)
    expect(keepRewrite(before, tested(3, gapList.slice(0, 2)), true)).toBe(true)
    expect(keepRewrite(before, tested(3, gapList), true)).toBe(true)
    expect(keepRewrite(before, tested(3, gapList), false)).toBe(false)
    expect(keepRewrite(before, tested(2), true)).toBe(false)
  })
})

describe('added lines take the camera their action calls for', () => {
  it('a demonstration added by the panel is back, a talking one is front', () => {
    const adds = cleanAddedLines(lines, { add: [
      { after: 1, text: 'Watch how coarse this grind really looks.', action: 'Pouring the grounds into her palm', camera: 'front' },
      { after: 2, text: 'That is the whole difference right there.', action: 'Lean in to the lens', camera: 'back' },
    ] })
    expect(adds.map((a) => a.camera)).toEqual(['back', 'front'])
  })
})

// Audit 2026-10-03 Part 5: the opening line was the top hook in 43.5% of scripts.
describe('openingWithHook — the shipped opening line is the top tested hook', () => {
  const hooks = ['I ruined 40 bags before this.', 'Stop grinding your coffee like this.']
  it('swaps a lower tested hook for the top one and keeps the rest of the beat', () => {
    expect(openingWithHook('I ruined 40 bags before this. Here is why.', hooks, hooks[1])).toBe('Stop grinding your coffee like this. Here is why.')
  })
  it('replaces an untested opening sentence', () => {
    expect(openingWithHook('Good morning everyone. Here is why.', hooks, hooks[1])).toBe('Stop grinding your coffee like this. Here is why.')
  })
  it('leaves a line that already opens with it', () => {
    const l = 'Stop grinding your coffee like this! Here is why.'
    expect(openingWithHook(l, hooks, hooks[1])).toBe(l)
  })
})
