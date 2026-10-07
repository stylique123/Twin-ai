import { describe, it, expect } from 'vitest'
import { repeatedSentences, restRepeatedLines } from '../lineRepeat.js'

const RECENT = [
  'There is no clean formula, so start small from home and learn as you go.',
  'Honestly there is no clean formula, start small from home and learn as you go step by step.',
  'Grab a bag through the link in my bio.',
]

describe('lineRepeat', () => {
  it('finds a sentence said in two of the recent scripts', () => {
    expect(repeatedSentences(['There is no clean formula, so start small from home and learn as you go.'], RECENT)).toHaveLength(1)
    expect(repeatedSentences(['Map your menu before you buy gear.'], RECENT)).toHaveLength(0)
  })
  it('drops it from a middle beat, keeps hook and close, keeps the floor', () => {
    const beats = [{ line: 'Stop buying gear first.' }, { line: 'There is no clean formula, so start small from home and learn as you go. Map your menu before you buy gear.' }, { line: 'Test three drinks on friends.' }, { line: 'Book the call through the link.' }]
    const r = restRepeatedLines(beats, RECENT)
    expect(r.removed).toHaveLength(1)
    expect(r.beats[1]!.line).toBe('Map your menu before you buy gear.')
    const thin = [{ line: 'Stop buying gear first.' }, { line: 'There is no clean formula, so start small from home and learn as you go.' }, { line: 'Book the call.' }]
    expect(restRepeatedLines(thin, RECENT).removed).toHaveLength(0)
  })
})
