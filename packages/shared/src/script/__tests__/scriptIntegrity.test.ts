// Items 33, 34, 35, 36, 38 — the post-generation integrity pass.
import { describe, expect, it } from 'vitest'
import {
  repairScriptIntegrity, wordBudget, splitSentences, productLineNames, quantities,
  tagStorySources, distinctiveContent, stem, shouldExtendScript, buildExtensionPrompt, acceptExtension,
} from '../scriptIntegrity'

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

// ── Real case: production generation 8ce1290d, creator_knowledge 3dc9d9f3 / f91e6ce6.
const SNAP_STORY = {
  id: '3dc9d9f3',
  text: "I bought a bulk roll of snap fasteners without checking they'd hold on my fabric weight, and half popped open within a week — I had to replace 30 orders for free. Now I test every new fastener batch on scrap fabric first.",
}
const SWITCH_STORY = { id: 'f91e6ce6', text: 'why I switched from snaps to scrunchie ties' }
const REAL_SCRIPT = [
  { section: 'Hook', line: 'Your dog hates ties. Mine did too.' },
  { section: 'Setup', line: "Replacing bad snap fasteners cost me 30 free orders — people think fabric's the expensive part, it's the hardware.", substance_evidence: 'Common audience frustration with traditional tie and snap bandanas.' },
  { section: 'Product Reveal', line: 'That is exactly why I design custom slip-on scrunchie bandanas, handmade with soft breathable fabric and personalized right here in the studio.', substance_evidence: 'handmade dog collars and accessories' },
  { section: 'Durability Proof', line: 'I used to work with snap hardware until faulty batches taught me that reinforced elastic scrunchie bands stay secure through every backyard zoomie.', substance_evidence: 'why I switched from snaps to scrunchie ties' },
  { section: 'Call to Action', line: 'Try one on your dog and tag us in the photo, we repost our favorites.' },
]

describe('items 34/36: a paraphrased retelling of one stored story (real case)', () => {
  it('word overlap alone did not see it', () => {
    const { report } = repairScriptIntegrity(REAL_SCRIPT)
    expect(report.duplicatesDropped).toBe(0)
  })
  it('tags both beats with the snap-fastener story they tell', () => {
    const tagged = tagStorySources(REAL_SCRIPT, [SNAP_STORY, SWITCH_STORY])
    expect(tagged[1]!.source_story_ids).toContain('3dc9d9f3')
    expect(tagged[3]!.source_story_ids).toContain('3dc9d9f3')
    expect(tagged[3]!.source_story_ids).toContain('f91e6ce6')
    expect(tagged[0]!.source_story_ids).toBeUndefined()
  })
  it('drops the second telling once beats carry their story tag', () => {
    const tagged = tagStorySources(REAL_SCRIPT, [SNAP_STORY, SWITCH_STORY])
    const { beats, report } = repairScriptIntegrity(tagged)
    expect(beats.map((b) => b.section)).toEqual(['Hook', 'Setup', 'Product Reveal', 'Call to Action'])
    expect(report.duplicatesDropped).toBe(1)
    expect(report.droppedIndices).toEqual([3])
  })
  it('catches a paraphrase by distinctive content even without a story tag', () => {
    const { report } = repairScriptIntegrity([
      { section: 'Hook', line: 'Cheap hardware nearly sank my shop.' },
      { section: 'Setup', line: 'A bulk roll of snap fasteners popped open and I replaced 30 orders.' },
      { section: 'Proof', line: 'When those fasteners popped, 30 customers got replacement orders from me.' },
      { section: 'CTA', line: 'Tag us.' },
    ])
    expect(report.duplicatesDropped).toBe(1)
  })
  it('does not merge two different stories that share one word', () => {
    const { report } = repairScriptIntegrity(tagStorySources([
      { section: 'Hook', line: 'Two lessons.' },
      { section: 'Setup', line: 'Snap fasteners popped open on 30 orders.' },
      { section: 'Story', line: 'A customer sent me a video of her dog wearing the bandana at the beach.' },
      { section: 'CTA', line: 'Tag us.' },
    ], [SNAP_STORY, { id: 'dog', text: 'A customer sent me a video of her dog wearing it at the beach' }]))
    expect(report.duplicatesDropped).toBe(0)
  })
  it('stems and keeps numbers as distinctive content', () => {
    const d = distinctiveContent('Replacing 30 fasteners in batches')
    expect(d.has('#30')).toBe(true)
    expect(d.has(stem('replace'))).toBe(true)
    expect(d.has(stem('fastener'))).toBe(true)
    expect(d.has(stem('batch'))).toBe(true)
  })
})

describe('item 38: one grounded extension pass for a short script', () => {
  const short = [
    { section: 'Hook', line: 'Snaps fail.' },
    { section: 'Setup', line: 'Half my snap batch popped open.' },
    { section: 'Proof', line: 'I test every batch now.' },
    { section: 'CTA', line: 'Tag us.' },
  ]
  const facts = SNAP_STORY.text
  it('decides to extend below 80% of the budget, only on middle unprotected beats', () => {
    const d = shouldExtendScript(short, 30)
    expect(d.extend).toBe(true)
    expect(d.target).toBe(75)
    expect(d.indices).toEqual([1, 2])
    expect(d.wordsWanted).toBe(75 - d.words)
  })
  it('does not extend at or above 80%, without a target, or with nothing extendable', () => {
    const long = [{ section: 'Hook', line: 'w '.repeat(30).trim() }, { section: 'Body', line: 'w '.repeat(31).trim() }, { section: 'CTA', line: 'end' }]
    expect(shouldExtendScript(long, 30).extend).toBe(false) // 62 >= 60
    expect(shouldExtendScript(short, null).extend).toBe(false)
    expect(shouldExtendScript([{ section: 'Hook', line: 'Hi.' }, { section: 'CTA', line: 'Bye.' }], 60).extend).toBe(false)
  })
  it('prompt carries the facts and only the allowed beats', () => {
    const d = shouldExtendScript(short, 30)
    const p = buildExtensionPrompt(short, d, facts)
    expect(p).toContain('SUPPLIED FACTS')
    expect(p).toContain('index 1')
    expect(p).not.toContain('index 0')
    expect(p).toContain('NEVER add a new number')
  })
  it('accepts a grounded extension and re-runs integrity on it', () => {
    const d = shouldExtendScript(short, 30)
    const r = acceptExtension(short, [
      { index: 1, line: 'I bought a bulk roll of snap fasteners without checking they would hold on my fabric weight, and half of them popped open within a week.' },
      { index: 2, line: 'So now every new fastener batch gets tested on scrap fabric first, before it ever touches an order.' },
    ], d, { knownText: facts, targetSec: 30 })
    expect(r.accepted).toBe(true)
    expect(r.wordsAfter).toBeGreaterThan(r.wordsBefore)
    expect(r.report).not.toBeNull()
  })
  it('keeps the original when the extension invents a number or a name', () => {
    const d = shouldExtendScript(short, 30)
    const r = acceptExtension(short, [
      { index: 1, line: 'I bought 500 snap fasteners from Amazon and half of them popped open within a week.' },
    ], d, { knownText: facts, targetSec: 30 })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('invented')
    expect(r.invented).toEqual(expect.arrayContaining(['500', 'amazon']))
    expect(r.beats).toEqual(short)
  })
  it('keeps the original when re-validation finds a retold story', () => {
    const d = shouldExtendScript(short, 30)
    const same = 'Half of my bulk roll of snap fasteners popped open within a week, so I test every fastener batch on scrap fabric.'
    const r = acceptExtension(short, [{ index: 1, line: same }, { index: 2, line: same }], d, { knownText: facts, targetSec: 30 })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('integrity_removed')
    expect(r.beats).toEqual(short)
  })
  it('ignores rewrites of protected beats and keeps the original when nothing applies', () => {
    const d = shouldExtendScript(short, 30)
    const r = acceptExtension(short, [{ index: 0, line: 'A much longer hook line that should never be applied here.' }], d, { knownText: facts })
    expect(r.reason).toBe('no_rewrites')
  })
})
