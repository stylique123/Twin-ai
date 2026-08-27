import { describe, expect, it } from 'vitest'
import { compileStyle, renderPartialStyleRules, renderStyleRules, PARTIAL_MIN_SENTENCES, MIN_SENTENCES } from '../styleCompiler'

const sample = (n: number, prefix = 'You should try this now.') =>
  Array.from({ length: n }, (_, i) => `${prefix} Number ${i}.`).join(' ')

describe('the partial style card (Voice Cause 1c)', () => {
  it('is silent below the partial floor', () => {
    const style = compileStyle([sample(Math.floor((PARTIAL_MIN_SENTENCES - 1) / 2))])
    expect(style.sentences).toBeLessThan(PARTIAL_MIN_SENTENCES)
    expect(renderPartialStyleRules(style)).toBe('')
  })

  it('renders between the partial floor and the full floor', () => {
    // 2 sentences per iteration ("You should..." + "Number N.")
    const n = Math.floor(PARTIAL_MIN_SENTENCES / 2) + 1
    const style = compileStyle([sample(n)])
    expect(style.sentences).toBeGreaterThanOrEqual(PARTIAL_MIN_SENTENCES)
    expect(style.sentences).toBeLessThan(MIN_SENTENCES)
    const card = renderPartialStyleRules(style)
    expect(card).not.toBe('')
    expect(card).toContain(String(style.sentences))
  })

  // ⚠️ NEVER BOTH CARDS AT ONCE. Full evidence gets the confident card, not
  // an "early read" alongside it.
  it('is silent once the corpus crosses the full floor — renderStyleRules takes over', () => {
    const style = compileStyle([sample(MIN_SENTENCES)])
    expect(style.reportable).toBe(true)
    expect(renderPartialStyleRules(style)).toBe('')
    expect(renderStyleRules(style)).not.toBe('')
  })

  // ⚖️ opener NEVER APPEARS — measured per sample text, not per sentence.
  it('never reports an opener', () => {
    const n = Math.floor(PARTIAL_MIN_SENTENCES / 2) + 1
    const style = compileStyle([sample(n)])
    const card = renderPartialStyleRules(style)
    expect(card.toLowerCase()).not.toMatch(/they open on/)
  })

  it('states the sentence count up front, not as a footnote', () => {
    const n = Math.floor(PARTIAL_MIN_SENTENCES / 2) + 1
    const style = compileStyle([sample(n)])
    const card = renderPartialStyleRules(style)
    expect(card.split('\n')[0]).toContain(String(style.sentences))
  })

  it('is silent on an empty corpus', () => {
    expect(renderPartialStyleRules(compileStyle([]))).toBe('')
  })
})
