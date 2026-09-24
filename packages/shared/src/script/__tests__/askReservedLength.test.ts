import { describe, expect, it } from 'vitest'
import { askReservedWords, repairScriptIntegrity, shouldExtendScript } from '../scriptIntegrity'
import { isUnconfirmedInferredProduct, matchesConfirmedProduct } from '../goalFidelity'

const words = (n: number, w = 'word'): string => `${Array.from({ length: n }, () => w).join(' ')}.`

// Shape of generation c54c3e40 (target 90s = 225 words): 8 beats, one an
// unanswered ask, 160 written words — logged as 71% of budget.
const c54c = [
  { section: 'Hook', line: words(15, 'hook') },
  { section: 'Setup', line: words(25, 'setup') },
  { section: 'Story', line: '', ask: 'What happened the first time a customer asked for this?' },
  { section: 'Proof', line: words(30, 'proof') },
  { section: 'Turn', line: words(30, 'turn') },
  { section: 'Payoff', line: words(30, 'payoff') },
  { section: 'Rehook', line: words(15, 'rehook') },
  { section: 'CTA', line: words(15, 'cta') },
]
const plan = [5, 10, 15, 12, 12, 12, 12, 12]

describe('item 37: an ask beat reserves its planned time', () => {
  it('reserves the plan seconds of the unanswered ask', () => {
    expect(askReservedWords(c54c, 90, null, plan)).toBe(38) // 15s at 150 wpm
  })
  it('falls back to an even share when no plan is aligned', () => {
    expect(askReservedWords(c54c, 90, null, null)).toBe(28) // 90/8 s
  })
  it('does not call the c54c shape short once the creator\'s answer is counted', () => {
    const { report } = repairScriptIntegrity(c54c, { targetSec: 90, beatSeconds: plan })
    expect(report.words).toBe(160)
    expect(report.reservedWords).toBe(38)
    expect(report.underBy).toBe(0) // 160 + 38 >= 180
  })
  it('does not pad the other beats to cover time the creator will fill', () => {
    const r = repairScriptIntegrity(c54c, { targetSec: 90, beatSeconds: plan }).report.reservedWords
    expect(shouldExtendScript(c54c, 90, null, r).extend).toBe(false)
    // Without the reservation the old decision would have extended.
    expect(shouldExtendScript(c54c, 90, null).extend).toBe(true)
  })
  it('still extends a genuinely short script with asks, by only the missing words', () => {
    const short = c54c.map((b) => (b.line ? { ...b, line: words(8) } : b))
    const r = repairScriptIntegrity(short, { targetSec: 90, beatSeconds: plan }).report.reservedWords
    const d = shouldExtendScript(short, 90, null, r)
    expect(d.extend).toBe(true)
    expect(d.wordsWanted).toBe(225 - 56 - 38)
  })
  it('an over-budget script still trims with the reservation counted', () => {
    const long = c54c.map((b, i) => (b.line && i > 0 && i < 7 ? { ...b, line: `${words(30)} ${words(20)}` } : b))
    const { report } = repairScriptIntegrity(long, { targetSec: 90, beatSeconds: plan })
    expect(report.words + report.reservedWords).toBeLessThanOrEqual(report.budget!.max)
  })
  it('keeps the plan aligned when an earlier beat was dropped', () => {
    const beats = [
      { section: 'Hook', line: words(10, 'alpha') },
      { section: '', line: 'fragment of later beat' },
      { section: 'Later', line: 'This is a fragment of later beat and more.' },
      { section: 'Ask', line: '', ask: 'Your real example?' },
      { section: 'CTA', line: words(5, 'omega') },
    ]
    const { report } = repairScriptIntegrity(beats, { targetSec: 60, beatSeconds: [5, 5, 10, 20, 5] })
    expect(report.droppedIndices).toEqual([1])
    expect(report.reservedWords).toBe(50) // the ASK's 20s, not the dropped beat's
  })
})

describe('item 2: caption-inferred product names are not confirmed names', () => {
  const library = ['Reversible Scrunchie Bandana', 'Custom Embroidered Bandana']
  it('the real "Autumn Collection" row is unconfirmed', () => {
    expect(isUnconfirmedInferredProduct({ kind: 'product', source: 'caption', text: 'Autumn Collection scrunchie bandanas' }, library)).toBe(true)
  })
  it('a row naming a library product, a confirmed row, or a non-product row is not', () => {
    expect(matchesConfirmedProduct('custom embroidered bandanas for pups', library)).toBe(true)
    expect(isUnconfirmedInferredProduct({ kind: 'product', source: 'caption', text: 'custom embroidered bandanas' }, library)).toBe(false)
    expect(isUnconfirmedInferredProduct({ kind: 'product', source: 'caption', text: 'Autumn Collection', creator_confirmed_at: '2026-09-01' }, library)).toBe(false)
    expect(isUnconfirmedInferredProduct({ kind: 'product', source: 'asked', text: 'Autumn Collection' }, library)).toBe(false)
    expect(isUnconfirmedInferredProduct({ kind: 'opinion', source: 'caption', text: 'Autumn Collection' }, library)).toBe(false)
  })
  it('a name grounded only in caption inference is stripped when names ground against confirmed text', () => {
    const beats = [{ section: 'Setup', line: 'I make these Autumn Collection scrunchie bandanas because replacing bad snap fasteners cost me 30 free orders.' }]
    const knownText = 'Autumn Collection scrunchie bandanas\nReversible Scrunchie Bandana'
    const kept = repairScriptIntegrity(beats, { knownText })
    expect(kept.report.namesStripped).toBe(0)
    const fixed = repairScriptIntegrity(beats, { knownText, nameGroundingText: library.join('\n') })
    expect(fixed.report.inventedNames).toEqual(['Autumn Collection'])
    expect(String(fixed.beats[0]!.line)).not.toMatch(/Autumn Collection/)
  })
})
