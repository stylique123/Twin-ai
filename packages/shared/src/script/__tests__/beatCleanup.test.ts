import { describe, it, expect } from 'vitest'
import { stripEmptyBridge, cleanBeats, dropEchoCloser, stripProfileLabels } from '../beatCleanup.js'

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

describe('blind set 2 leftovers (owner 2026-10-05)', () => {
  it('drops a "So remember: <echo>" closer (#8)', () => {
    const beats = [{ line: 'Why does your cold brew taste bitter?' }, { line: 'Here is the operational reality that changes everything. Brew it strong.' }, { line: 'Brew the base heavy and cut it in the glass. So remember: here is the operational reality that changes everything.' }]
    expect(dropEchoCloser(beats).at(-1)!.line).toBe('Brew the base heavy and cut it in the glass.')
  })
  it('keeps a real "so remember" takeaway that says something new', () => {
    const beats = [{ line: 'a' }, { line: 'b' }, { line: 'So remember: test a small batch before you buy a full lot.' }]
    expect(dropEchoCloser(beats)).toHaveLength(3)
  })
  it('turns her audience labels said as a run into one plain phrase (#11, #12)', () => {
    expect(stripProfileLabels('It keeps things simple for everyday people and beginners.', ['everyday people', 'beginners', 'ecommerce']))
      .toBe('It keeps things simple for people just starting out.')
  })
  it('removes a scan topic opening a line (#11)', () => {
    expect(stripProfileLabels('Starting and operating Sunflower Coffee Roasters as a micro roaster in Farmington, I see people expecting a smoky bite.', [], ['starting and operating a small coffee roasting business in Farmington, NM']))
      .toBe('I see people expecting a smoky bite.')
  })
})
