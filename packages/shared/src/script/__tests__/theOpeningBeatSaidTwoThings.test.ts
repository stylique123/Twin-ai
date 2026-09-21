import { describe, it, expect } from 'vitest'
import { hookRemainder } from '../hookRemainder'

/**
 * ⚠️ THE SHOT LIST WAS RIGHT AND THE TELEPROMPTER WAS SHORT.
 *
 * The owner reported "the shot list carries an extra sentence". Measured
 * against run 788d20b4 of their 2026-09-20 test: `script[0].line` is the
 * selected hook followed by a second, entirely new sentence. The adapter
 * builds scene 1 from the hook, then drops any beat that looks like the hook
 * so nobody says it twice — and dropped both sentences. The second reached the
 * shot card (which quotes `script[]`) and was spoken nowhere.
 */

// The same duplicate test the adapter uses, so the fixtures exercise the real
// rule rather than a convenient one.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
const hookLike = (hook: string) => {
  const hookWords = new Set(norm(hook).slice(0, 8))
  return (line: string): boolean => {
    const lw = norm(line).slice(0, 8)
    if (!lw.length) return false
    const overlap = lw.filter((w) => hookWords.has(w)).length
    return overlap >= Math.min(4, Math.ceil(lw.length * 0.6))
  }
}

const HOOK = 'I lost two hundred dollars on candles before learning this one rule.'
const REST = 'I bought hundreds of shiny metal tins before running a single burn test.'

describe('recovering the part of the opening beat that was not the hook', () => {
  it('returns the sentence the teleprompter was losing', () => {
    expect(hookRemainder(`${HOOK} ${REST}`, hookLike(HOOK))).toBe(REST)
  })

  it('returns nothing when the beat is wholly the hook', () => {
    expect(hookRemainder(HOOK, hookLike(HOOK))).toBe('')
  })

  // ⚠️ A BEAT THAT REWORDS THE HOOK ACROSS SEVERAL SENTENCES IS STILL A
  // DUPLICATE. Splitting it would put the creator back where the drop started.
  it('declines when the first sentence is not itself the duplicate', () => {
    const spread = 'Something else entirely opens this. I lost two hundred dollars on candles before learning this one rule.'
    expect(hookRemainder(spread, hookLike(HOOK))).toBe('')
  })

  it('declines when the remainder only restates the hook again', () => {
    expect(hookRemainder(`${HOOK} ${HOOK}`, hookLike(HOOK))).toBe('')
  })

  // ⚖️ A FRAGMENT ON ITS OWN CARD IS WORSE THAN THE DROP IT REPLACES.
  it('declines a remainder too short to be a beat', () => {
    expect(hookRemainder(`${HOOK} And that was that.`, hookLike(HOOK))).toBe('')
  })

  it('does not split on a decimal point inside a figure', () => {
    const line = `${HOOK} Each tin costs me 2.50 in wax and wick alone.`
    expect(hookRemainder(line, hookLike(HOOK))).toBe('Each tin costs me 2.50 in wax and wick alone.')
  })

  it('handles an empty or absent line without throwing', () => {
    expect(hookRemainder('', hookLike(HOOK))).toBe('')
    expect(hookRemainder(null, hookLike(HOOK))).toBe('')
    expect(hookRemainder(undefined, hookLike(HOOK))).toBe('')
  })

  it('keeps a remainder that runs to several sentences', () => {
    const line = `${HOOK} ${REST} Half the batch cracked on the first pour.`
    expect(hookRemainder(line, hookLike(HOOK))).toBe(`${REST} Half the batch cracked on the first pour.`)
  })
})
