import { describe, it, expect } from 'vitest'
import { unsupportedCauses, dropInventedCauses, isSubjectOnlyTopic, subjectsLine } from '../inventedCause'

// Fictional: Maya's Coffee.
const SUPPORT = [
  'I roast in two-pound batches every Tuesday.',
  'Beans go stale fast once the bag is opened because oxygen gets in.',
  'Our cold brew steeps for eighteen hours.',
  'Maya opened the cart in 2019.',
].join('\n')

describe('unsupportedCauses', () => {
  it('flags a weather cause she never gave', () => {
    expect(unsupportedCauses("The beans go stale because the town's weather shifts.", SUPPORT)).toHaveLength(1)
  })
  it('keeps a cause she gave', () => {
    expect(unsupportedCauses('The beans go stale because oxygen gets in once the bag is opened.', SUPPORT)).toEqual([])
  })
  it('flags "because of the heat"', () => {
    expect(unsupportedCauses('Sales dipped because of the heat.', SUPPORT)).toHaveLength(1)
  })
  it('flags "since" when causal', () => {
    expect(unsupportedCauses('It tastes better since the water here is softer.', SUPPORT)).toHaveLength(1)
  })
  it('leaves temporal "since 2019" alone', () => {
    expect(unsupportedCauses("I've been roasting since 2019.", SUPPORT)).toEqual([])
    expect(unsupportedCauses('Ever since I was a kid I loved coffee.', SUPPORT)).toEqual([])
  })
  it('flags due to / thanks to / caused by', () => {
    expect(unsupportedCauses('Lines got longer due to the new festival downtown.', SUPPORT)).toHaveLength(1)
    expect(unsupportedCauses('The crema is thicker thanks to mineral spring water.', SUPPORT)).toHaveLength(1)
    expect(unsupportedCauses('Bitterness is caused by cheap grinders.', SUPPORT)).toHaveLength(1)
  })
  it('keeps a supported "so that"', () => {
    expect(unsupportedCauses('I roast on Tuesday so that the batches are fresh.', SUPPORT)).toEqual([])
  })
})

describe('dropInventedCauses', () => {
  it('cuts the clause, keeps the main clause', () => {
    const r = dropInventedCauses([{ line: "The beans go stale because the town's weather shifts." }], SUPPORT)
    expect(r.beats[0].line).toBe('The beans go stale.')
    expect(r.cut).toBe(1)
  })
  it('cuts a ", which is why" tail', () => {
    const r = dropInventedCauses([{ line: 'Our cold brew steeps for eighteen hours, which is why regulars drive across the county.' }], SUPPORT)
    expect(r.beats[0].line).toBe('Our cold brew steeps for eighteen hours.')
  })
  it('cuts a leading "Because…," and capitalises the rest', () => {
    const r = dropInventedCauses([{ line: 'Because the humidity is lower here, it tastes better.' }], SUPPORT)
    expect(r.beats[0].line).toBe('It tastes better.')
  })
  it('keeps a supported cause untouched', () => {
    const line = 'Beans go stale fast because oxygen gets in once the bag is opened.'
    const r = dropInventedCauses([{ line }], SUPPORT)
    expect(r.beats[0].line).toBe(line)
    expect(r.cut).toBe(0)
  })
  it('never turns a line empty', () => {
    const r = dropInventedCauses([{ line: "That's why the weather matters." }], SUPPORT)
    expect(r.beats[0].line).toBe("That's why the weather matters.")
    expect(r.cut).toBe(0)
  })
  it('only touches the offending sentence in a multi-sentence line', () => {
    const r = dropInventedCauses([{ line: 'I roast in two-pound batches. Sales dipped because of the heat. Come by Tuesday.' }], SUPPORT)
    expect(r.beats[0].line).toBe('I roast in two-pound batches. Sales dipped. Come by Tuesday.')
  })
  it('leaves non-string lines and since-2019 alone', () => {
    const beats = [{ line: undefined }, { line: 'Maya opened the cart since 2019.' }]
    const r = dropInventedCauses(beats, SUPPORT)
    expect(r.beats).toEqual(beats)
    expect(r.cut).toBe(0)
  })
})

describe('topic rows are subjects, not facts', () => {
  it('a scanned topic is subject-only', () => {
    expect(isSubjectOnlyTopic({ kind: 'topic', source: 'caption' })).toBe(true)
  })
  it('her own or confirmed topics, and non-topics, are not', () => {
    expect(isSubjectOnlyTopic({ kind: 'topic', source: 'asked' })).toBe(false)
    expect(isSubjectOnlyTopic({ kind: 'topic', source: 'caption', creator_confirmed_at: '2026-10-01' })).toBe(false)
    expect(isSubjectOnlyTopic({ kind: 'fact', source: 'caption' })).toBe(false)
  })
  it('renders subjects on a "she talks about" line, not as claims', () => {
    const line = subjectsLine([{ text: 'operating a coffee cart' }, { text: 'latte art' }])
    expect(line).toContain('SHE TALKS ABOUT')
    expect(line).toContain('never state')
    expect(line).toContain('operating a coffee cart; latte art')
    expect(subjectsLine([])).toBe('')
  })
})
