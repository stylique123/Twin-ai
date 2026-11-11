// SCRIPT_CLEANUP_V1 (panel 13c, 11 Nov; default OFF). Three cut-only fixes,
// each case written as a test before the fix.
import { describe, it, expect, afterEach } from 'vitest'
import { setUrlSafeSplitting, sentenceMatch, scriptCleanupV1On } from '../urlSafe'
import { splitSentences } from '../inventionGate'
import { dropRepeatedAsk } from '../beatCleanup'
import { dropNovelSentences } from '../novelDetail'
import { scriptCleanupV1 } from '../scriptCleanupV1'

const RE = /[^.!?]+[.!?]*/g
const beats = (...l: string[]) => l.map((line, i) => ({ section: i === 0 ? 'Hook' : i === l.length - 1 ? 'CTA' : `Beat ${i}`, line }))
const text = (b: Array<{ line?: unknown }>) => b.map((x) => String(x.line)).join(' | ')
afterEach(() => setUrlSafeSplitting(false))

describe('the flag', () => {
  it('is on only for the exact value "on"', () => {
    expect(scriptCleanupV1On('on')).toBe(true)
    for (const v of [undefined, '', 'true', '1', 'ON', 'off']) expect(scriptCleanupV1On(v)).toBe(false)
  })
})

describe('1. the splitter never cuts inside a URL or domain', () => {
  const scarf = 'Eighty-five dollars. It is at https://example.com/quiet-loom.'
  const pip = 'Tickets for Pip and Sprocket Live at https://example.com/pip-live.'
  it('panel 13c: no sentence starts with "com/quiet-loom." or "com/pip-live."', () => {
    setUrlSafeSplitting(true)
    expect(splitSentences(scarf)).toEqual(['Eighty-five dollars.', 'It is at https://example.com/quiet-loom.'])
    expect(splitSentences(pip)).toEqual([pip])
    expect(sentenceMatch('Grab one at shop.example.co.uk/mug. Thanks!', RE)!.map((s) => s.trim())).toEqual(['Grab one at shop.example.co.uk/mug.', 'Thanks!'])
  })
  it('a step that drops a sentence can no longer leave "com/pip-live." behind', () => {
    setUrlSafeSplitting(true)
    const r = dropNovelSentences([{ section: 'Beat 1', line: 'Hi.' }, { section: 'Beat 2', line: pip }, { section: 'CTA', line: 'Bye.' }], '')
    expect(text(r.beats)).not.toMatch(/^com\/|\| com\//)
  })
  it('"link in bio" lines are not affected', () => {
    setUrlSafeSplitting(true)
    expect(splitSentences('Tickets are in the link in bio. See you there!')).toEqual(['Tickets are in the link in bio.', 'See you there!'])
    expect(dropRepeatedAsk('Link in bio. Link in my bio, go.')).toBe(dropRepeatedAsk('Link in bio. Link in my bio, go.'))
  })
  it('off (the default) splits exactly as before', () => {
    expect(splitSentences(pip)).toEqual(['Tickets for Pip and Sprocket Live at https://example.', 'com/pip-live.'])
  })
})

const tide = { id: 'mug', name: 'Tide Mug', facts: ['$38 per mug', 'Holds about 12 oz', 'Hand-thrown, trimmed and fired twice', 'Dishwasher safe, with an unglazed foot'] }
const ctx = { products: [tide], stories: [] as string[], offers: ['Tide Mug, link in bio'] }

describe('2. a dangling last line is cut', () => {
  it('cuts "Here is the part everyone forgets." when it is the last line', () => {
    const r = scriptCleanupV1(beats('This mug holds the tide.', 'It is hand-thrown and fired twice.', 'It holds about 12 oz.', 'Tide Mug, link in bio.', 'Here is the part everyone forgets.'), ctx)
    expect(r.beats.at(-1)!.line).toBe('Tide Mug, link in bio.')
    expect(r.cut.dangling_last).toBe(1)
  })
  it('never cuts a real CTA or a question to the viewer', () => {
    const cta = beats('This mug holds the tide.', 'It is hand-thrown and fired twice.', 'It holds about 12 oz.', 'Here is the link: grab a Tide Mug, link in bio.')
    expect(scriptCleanupV1(cta, ctx).beats).toEqual(cta)
    const q = beats('This mug holds the tide.', 'It is hand-thrown and fired twice.', 'It holds about 12 oz.', 'Here is the question: which glaze would you pick?')
    expect(scriptCleanupV1(q, ctx).beats).toEqual(q)
  })
  it('keeps a last line that delivers something', () => {
    const b = beats('This mug holds the tide.', 'It is hand-thrown and fired twice.', 'It holds about 12 oz.', 'Here is the part everyone forgets: the foot stays bare so it never sticks.')
    expect(scriptCleanupV1(b, ctx).beats).toEqual(b)
  })
})

describe('3. repeated facts and stories', () => {
  it('cuts "Holds about 12 oz." after the line before already gave the size', () => {
    const r = scriptCleanupV1(beats('Morning coffee, but slower.', 'The Tide Mug is hand-thrown and holds about 12 oz of coffee.', 'Holds about 12 oz.', 'It is $38.', 'Tide Mug, link in bio.'), ctx)
    expect(text(r.beats)).not.toMatch(/\| Holds about 12 oz\./)
    expect(text(r.beats)).toMatch(/holds about 12 oz of coffee/)
    expect(r.cut.fact_repeat).toBe(1)
  })
  const kiln = 'My first kiln load came out with every mug glued to the shelf because I glazed the bottoms.'
  it('the same story twice: keeps the stronger telling, cuts the other', () => {
    const r = scriptCleanupV1(beats('Why is the bottom bare?', 'My first kiln load glued every mug to the shelf.', 'I glazed the bottoms, and my first kiln load came out with every mug glued to the shelf for good.', 'Now I wax the foot.', 'Tide Mug, link in bio.'),
      { ...ctx, stories: [kiln] })
    expect(text(r.beats)).not.toMatch(/\| My first kiln load glued every mug to the shelf\. \|/)
    expect(text(r.beats)).toMatch(/I glazed the bottoms, and my first kiln load/)
    expect(r.cut.story_repeat).toBe(1)
  })
  it('never cuts the hook or the CTA, even when they repeat', () => {
    const b = beats('It holds about 12 oz.', 'It is hand-thrown and fired twice.', 'It is $38.', 'A 12 oz Tide Mug, link in bio.')
    expect(scriptCleanupV1(b, ctx).beats).toEqual(b)
  })
  it('respects the cap: at most 2 cuts', () => {
    const r = scriptCleanupV1(beats('Morning coffee, but slower.', 'The Tide Mug holds about 12 oz, costs $38 and is fired twice.', 'Holds about 12 oz.', '$38 per mug.', 'Hand-thrown, trimmed and fired twice.', 'Tide Mug, link in bio.', 'Here is the part everyone forgets.'), ctx)
    expect(r.cut.fact_repeat + r.cut.story_repeat + r.cut.dangling_last).toBe(2)
    expect(r.cut.capped).toBeGreaterThanOrEqual(1)
  })
})
