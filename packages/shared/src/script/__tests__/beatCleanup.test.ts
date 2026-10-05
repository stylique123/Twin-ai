import { describe, it, expect } from 'vitest'
import { stripEmptyBridge, cleanBeats } from '../beatCleanup.js'

describe('blind set 1 leftovers (owner 2026-10-05)', () => {
  it.each([
    ['And this is the part people miss. By keeping our base concentrated, you save that entire footprint.', 'By keeping our base concentrated, you save that entire footprint.'],
    ['Here is the reality. In a sixty minute call we strip away the noise.', 'In a sixty minute call we strip away the noise.'],
    ['And this is where it gets genuinely tricky. You want to keep the quality high.', 'You want to keep the quality high.'],
  ])('strips the empty bridge: %s', (a, b) => expect(stripEmptyBridge(a)).toBe(b))
  it('keeps a bridge that carries its point', () => {
    const l = 'And this is where it gets weird — thigh bones are stronger than concrete.'
    expect(stripEmptyBridge(l)).toBe(l)
  })
  it('drops a stray "stick around" closer on a non-follow video, keeps it for followers', () => {
    const beats = [{ line: 'Hook here.' }, { line: 'Middle with substance here.' }, { line: 'Book the call through the link in my bio.' }, { line: 'If starting a coffee cart is your dream, stick around.' }]
    expect(cleanBeats(beats, 'educate').beats.map((b) => b.line)).toEqual(['Hook here.', 'Middle with substance here.', 'Book the call through the link in my bio.'])
    expect(cleanBeats(beats, 'followers').beats).toHaveLength(4)
  })
  it('trims a follow ask tacked onto the last line', () => {
    const beats = [{ line: 'a b c d.' }, { line: 'e f g h.' }, { line: 'Starting out from home is messy, but you do not have to guess. If starting a coffee cart is your dream, stick around.' }]
    expect(cleanBeats(beats, 'personal_brand').beats.at(-1)!.line).toBe('Starting out from home is messy, but you do not have to guess.')
  })
})
