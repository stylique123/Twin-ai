// Items 33, 34, 35, 36, 38 — the post-generation integrity pass.
import { describe, expect, it } from 'vitest'
import { repairScriptIntegrity, wordBudget, splitSentences, productLineNames, quantities } from '../scriptIntegrity'

describe('item 35: every scene has a header and whole text', () => {
  it('drops a headerless mid-sentence fragment duplicated from a later scene', () => {
    const { beats, report } = repairScriptIntegrity([
      { section: 'Hook', line: 'Snaps were costing me money.' },
      { section: '', line: 'fabric is not the expensive part' },
      { section: 'Setup', line: 'People think the fabric is not the expensive part, but the hardware is.' },
    ])
    expect(beats.map((b) => b.section)).toEqual(['Hook', 'Setup'])
    expect(report.fragmentsDropped).toBe(1)
    expect(report.droppedIndices).toEqual([1])
  })
  it('gives a real headerless beat a header and closes an unterminated line', () => {
    const { beats, report } = repairScriptIntegrity([
      { section: 'Hook', line: 'One line.' },
      { line: 'A different complete point that stands alone' },
    ])
    expect(beats[1]!.section).toBe('Beat 2')
    expect(beats[1]!.line).toBe('A different complete point that stands alone.')
    expect(report.headersFilled).toBe(1)
  })
})

describe('item 33: no invented product-line names', () => {
  it('strips a line name the creator never gave us', () => {
    const { beats, report } = repairScriptIntegrity(
      [{ section: 'Reveal', line: 'That is why I made the Autumn Glow Collection for fall.' }],
      { knownText: 'Scrunchie bandana. Handmade dog accessories.' })
    expect(beats[0]!.line).toBe('That is why I made the collection for fall.')
    expect(report.inventedNames).toEqual(['Autumn Glow Collection'])
  })
  it('keeps a name that is in her data', () => {
    const { beats, report } = repairScriptIntegrity(
      [{ section: 'Reveal', line: 'The Autumn Glow Collection is back.' }],
      { knownText: 'Products: Autumn Glow Collection candles' })
    expect(beats[0]!.line).toBe('The Autumn Glow Collection is back.')
    expect(report.namesStripped).toBe(0)
  })
  it('detects the shape', () => {
    expect(productLineNames('Try our Harvest Kit today')).toEqual(['Harvest Kit'])
    expect(productLineNames('The whole line is sold out')).toEqual([])
  })
})

describe('items 34/36: one story once, numbers consistent', () => {
  it('drops the second telling of one story with a different number', () => {
    const { beats, report } = repairScriptIntegrity([
      { section: 'Hook', line: 'Stop buying cheap snaps.' },
      { section: 'Setup', line: 'Bad snap fasteners cost me 30 orders when the batch failed.' },
      { section: 'Proof', line: 'That faulty snap batch cost me 40 orders before I switched.' },
      { section: 'CTA', line: 'Tag us in your photo.' },
    ])
    expect(beats.map((b) => b.section)).toEqual(['Hook', 'Setup', 'CTA'])
    expect(report.numberConflicts.length).toBeGreaterThan(0)
    expect(report.duplicatesDropped).toBe(1)
  })
  it('restores a number to the one in her own evidence', () => {
    const { beats, report } = repairScriptIntegrity([
      { section: 'Story', line: 'I lost $300 when half the tins leaked.', substance_evidence: 'I ordered tins before testing them and lost $200 when half the batch leaked' },
    ])
    expect(beats[0]!.line).toBe('I lost $200 when half the tins leaked.')
    expect(report.numbersRestored).toBe(1)
  })
  it('leaves two unrelated beats with different numbers alone', () => {
    const { beats } = repairScriptIntegrity([
      { section: 'A', line: 'I restock 3 colors every Friday.' },
      { section: 'B', line: 'Shipping takes 5 days to Canada.' },
    ])
    expect(beats).toHaveLength(2)
  })
  it('reads quantities', () => {
    expect(quantities('three customers asked').map((q) => [q.value, q.unit])).toEqual([[3, 'customer']])
  })
})

describe('item 38: word budget', () => {
  it('budgets from target seconds at 150 wpm by default, and a measured pace when given', () => {
    expect(wordBudget(30)).toEqual({ target: 75, min: 60, max: 90, wpm: 150 })
    expect(wordBudget(30, 180).target).toBe(90)
    expect(wordBudget(30, 20).wpm).toBe(150) // implausible pace is ignored
  })
  it('trims whole trailing sentences from middle beats until within budget', () => {
    const long = Array.from({ length: 8 }, (_, i) => `This is filler sentence number ${i} with some words.`).join(' ')
    const { beats, report } = repairScriptIntegrity([
      { section: 'Hook', line: 'Hook line here.' },
      { section: 'Body', line: long },
      { section: 'CTA', line: 'Follow for more.' },
    ], { targetSec: 15 })
    expect(report.words).toBeLessThanOrEqual(report.budget!.max)
    expect(report.trimmedWords).toBeGreaterThan(0)
    expect(beats[0]!.line).toBe('Hook line here.')
    expect(beats[2]!.line).toBe('Follow for more.')
  })
  it('reports, never pads, a short script', () => {
    const { report } = repairScriptIntegrity([{ section: 'Hook', line: 'Short.' }], { targetSec: 30 })
    expect(report.underBy).toBe(59)
  })
  it('splits sentences without breaking decimals or abbreviations', () => {
    expect(splitSentences('It holds 3.5 kg. Dr. Lee agreed! Done')).toEqual(['It holds 3.5 kg.', 'Dr. Lee agreed!', 'Done'])
  })
})
