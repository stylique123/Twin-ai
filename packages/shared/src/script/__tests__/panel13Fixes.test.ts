// Panel 13 labels (7 Nov): wrong-product facts, writing from nothing, the same
// idea twice, spoken filler. Real cases from the labelled scripts.
import { describe, it, expect } from 'vitest'
import { dropWrongProductFacts, needsStoryAsk, storyQuestion } from '../productFactScope'
import { hygieneBeats, stripSpokenFiller } from '../scriptHygiene'

const tideMug = { id: 'mug', name: 'Tide Mug', facts: ['$38 per mug', 'Holds about 12 oz', 'Hand-thrown, trimmed and fired twice', 'Dishwasher safe, with an unglazed foot'] }
const mossBowl = { id: 'bowl', name: 'Moss Bowl', facts: ['$46 per bowl', 'Glazed in a green that pools darker at the rim', 'Holds about 20 oz', 'Dishwasher safe, with an unglazed foot'] }
const calmCream = { id: 'cream', name: 'Calm Cream', facts: ['$28 for a 50 ml jar', '50 ml glass jar', 'Fragrance-free, with no essential oils', 'Made in small batches of sixty jars', 'Launch price of $24 until the end of the month'] }
const meltBalm = { id: 'balm', name: 'Melt Balm', facts: ['$22 for a 90 g tin', '90 g tin', 'A cleansing balm that rinses off with warm water', 'Made in small batches and poured by hand into each tin'] }
const beats = (...l: string[]) => l.map((line, i) => ({ section: i === 0 ? 'Hook' : i === l.length - 1 ? 'CTA' : `Beat ${i}`, line }))

describe('wrong-product facts', () => {
  it('cuts a Tide Mug fact from a Moss Bowl script', () => {
    const r = dropWrongProductFacts(beats('This bowl changed my mornings.', 'The Moss Bowl is glazed in a green that pools darker at the rim.', 'Each one is hand-thrown and fired twice.', 'It holds a big breakfast.', 'Grab one from the shop.'), [tideMug, mossBowl], 'bowl')
    expect(r.cut.wrong).toBe(1)
    expect(r.beats.map((b) => b.line).join(' ')).not.toMatch(/fired twice/)
    expect(r.beats.map((b) => b.line).join(' ')).toMatch(/pools darker/)
  })
  it('cuts a Calm Cream fact from a Melt Balm script', () => {
    const r = dropWrongProductFacts(beats('My cleansing step got simpler.', 'Melt Balm rinses off with warm water.', 'And it has no synthetic fragrance.', 'Each tin is poured by hand.', 'Try it tonight.'), [calmCream, meltBalm], 'balm')
    expect(r.cut.wrong).toBe(1)
    expect(r.beats.map((b) => b.line).join(' ')).not.toMatch(/fragrance/i)
  })
  it('cuts a followers line that mixes two products', () => {
    const r = dropWrongProductFacts(beats('Here is what I make for sensitive skin.', 'Everything is fragrance-free and poured by hand.', 'I test every batch on myself.', 'Follow for the next batch.'), [calmCream, meltBalm], null)
    expect(r.cut.mixed).toBe(1)
    expect(r.beats.map((b) => b.line).join(' ')).not.toMatch(/poured by hand/)
  })
  it('keeps a script that uses only its own product facts, and shared facts', () => {
    const b = beats('This mug is my favourite.', 'The Tide Mug is hand-thrown and fired twice.', 'It is dishwasher safe, with an unglazed foot.', 'Get yours.')
    const r = dropWrongProductFacts(b, [tideMug, mossBowl], 'mug')
    expect(r.cut.sentences).toBe(0)
    expect(r.beats).toEqual(b)
  })
})

describe('ask when there is no material', () => {
  it('asks Quiet Loom (no stories) why she weaves in silence instead of writing', () => {
    const r = needsStoryAsk('why I weave in silence', [])
    expect(r.ask).toBe(true)
    expect(storyQuestion('why I weave in silence')).toMatch(/why I weave in silence/)
  })
  it('does not ask when her material touches the topic', () => {
    expect(needsStoryAsk('why I weave in silence', ['I weave in the early morning when the house is silent.']).ask).toBe(false)
  })
  it('does not ask for a request without why / the day I', () => {
    expect(needsStoryAsk('how to wash wool gently', []).ask).toBe(false)
  })
  it('asks for "the day I nearly quit" with nothing on quitting', () => {
    expect(needsStoryAsk('use the shape of this video for the day I nearly quit', ['My first batch of coffee was sour.']).ask).toBe(true)
  })
})

describe('repeat-line check (strict)', () => {
  it('drops a line that restates an earlier line in new words', () => {
    const b = beats('Hook line here.', 'I glaze the foot with wax so the clay never sticks to the shelf.', 'Waxing the foot keeps the clay from sticking to the kiln shelf.', 'Then I fire it twice.', 'Follow along.')
    const strict = hygieneBeats(b, { outside: [], hers: [], strict: true })
    expect(strict.repeats).toBe(1)
    expect(strict.beats).toHaveLength(4)
    // Default (non-panel) behaviour is unchanged.
    expect(hygieneBeats(b, { outside: [], hers: [] }).beats).toHaveLength(5)
  })
})

describe('filler cleanup (strict)', () => {
  it('strips um, so yeah, like, I mean and keeps her meaning', () => {
    expect(stripSpokenFiller('Um, so yeah, I mean, the glaze, like, ran off the pot.', true)).toBe('The glaze ran off the pot.')
    expect(stripSpokenFiller('Like, I tested it for three days, so yeah.', true)).toBe('I tested it for three days.')
  })
  it('keeps "like" as a verb or comparison', () => {
    expect(stripSpokenFiller('I like how it looks like the sea.', true)).toBe('I like how it looks like the sea.')
  })
  it('default mode is unchanged', () => {
    expect(stripSpokenFiller('I mean it is fine.')).toBe('I mean it is fine.')
  })
})
