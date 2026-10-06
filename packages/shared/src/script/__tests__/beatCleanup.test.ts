import { describe, it, expect } from 'vitest'
import { stripEmptyBridge, cleanBeats, dropEchoCloser, stripProfileLabels, dropWriterNotes } from '../beatCleanup.js'

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

describe('stripProfileLabels never touches her own wording (owner 2026-10-05)', () => {
  const labels = ['everyday people', 'beginners', 'ecommerce', 'coffee lovers']
  const topics = ['starting and operating a small coffee roasting business in Farmington, NM']
  it.each([
    'Someone told me they could taste the difference between my roast and the grocery store bag their mom always bought.',
    'I roast in small batches out of a tiny space, and every batch tastes slightly different depending on humidity and bean age.',
    'Honestly, there is no clean formula. It is messy, and the best first step is to start small from home.',
    'I bought green beans from a new supplier without testing a sample first, and the whole lot had to be tossed.',
    'When I was a beginner I burned my first batch.',
  ])('leaves "%s" unchanged', (line) => {
    expect(stripProfileLabels(line, labels, topics)).toBe(line)
  })
})

describe('single profile labels (blind set 3: 14, 17, 18, T2, T4)', () => {
  const labels = ['everyday people', 'beginners', 'ecommerce']
  it('drops the label word before a noun, once', () => {
    expect(stripProfileLabels('I help everyday people plan their first coffee cart.', labels)).toBe('I help people plan their first coffee cart.')
    expect(stripProfileLabels('Most everyday beginners think you need every machine.', labels)).toBe('Most beginners think you need every machine.')
  })
  it('never touches a noun-led label', () => {
    expect(stripProfileLabels('Our coffee lovers club meets Fridays.', ['coffee lovers', 'beginners'])).toBe('Our coffee lovers club meets Fridays.')
  })
})

describe('dropWriterNotes (blind set 3 #4)', () => {
  it('cuts her note to the writer from a spoken line', () => {
    expect(dropWriterNotes("The first thing I'd do is start small from home and learn as you go — no numbers, just first steps.")).toBe("The first thing I'd do is start small from home and learn as you go.")
  })
  it('leaves an ordinary line alone', () => {
    expect(dropWriterNotes('Numbers matter less than your first market.')).toBe('Numbers matter less than your first market.')
  })
})

describe('a standalone bridge beat (set 4 T3)', () => {
  it('drops a middle beat that is only "And this is where it clicks."', () => {
    const r = cleanBeats([{ line: 'If your coffee tastes burnt, try this.' }, { line: 'Most cups end up bitter for one reason.' }, { line: 'And this is where it clicks.' }, { line: 'Tell me what brewer you use.' }], 'personal_brand')
    expect(r.beats.map((b) => b.line)).not.toContain('And this is where it clicks.')
  })
})
