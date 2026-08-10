// THE SECOND MEMORY — and the tech creator it was designed around.
//
// "3 things I stopped buying after I turned 30", handed to someone whose stored
// substance is a tone label, produces three invented products. The fixture below
// is the same creator WITH knowledge, and the tests are about what may be spoken
// back to them and what may not.
import { describe, expect, it } from 'vitest'
import {
  emptyKnowledge, readKnowledge, readKnowledgeItem, writableClaims, alreadyCovered,
  rankedKnowledge, sourceExpired, knowledgePromptLine, selectRelevantKnowledge, KNOWLEDGE_KINDS,
  type CreatorKnowledge,
} from '../creatorKnowledge'

const TECH: CreatorKnowledge = readKnowledge({
  items: [
    { kind: 'opinion', text: 'megapixel numbers are oversold', basis: 'stated', timesSeen: 4, sourceRef: 'v1', sourceExpiry: '2026-01-01T00:00:00Z' },
    { kind: 'opinion', text: 'battery life matters more than camera gimmicks', basis: 'stated', timesSeen: 6, sourceRef: 'v2', sourceExpiry: null },
    { kind: 'experience', text: 'has reviewed several foldables', basis: 'demonstrated', timesSeen: 3, sourceRef: 'v3' },
    { kind: 'opinion', text: 'probably dislikes subscription hardware', basis: 'inferred', timesSeen: 1, sourceRef: null },
    { kind: 'covered', text: 'why I stopped upgrading every year', basis: 'stated', timesSeen: 1, sourceRef: 'v4' },
  ],
  audience: [
    { summary: 'people are confused about battery health', asked: 40 },
    { summary: 'many ask for beginner-friendly options', asked: 12 },
  ],
})

describe('what may be put in their mouth', () => {
  it('excludes INFERRED items from anything speakable', () => {
    // The whole point. An inferred belief is our guess about a person, and
    // voicing it is indistinguishable — to them and to their audience — from
    // them having said it.
    const texts = writableClaims(TECH).map((i) => i.text)
    expect(texts).toContain('megapixel numbers are oversold')
    expect(texts).not.toContain('probably dislikes subscription hardware')
  })

  it('excludes already-covered topics from speakable claims, and lists them separately', () => {
    expect(writableClaims(TECH).map((i) => i.kind)).not.toContain('covered')
    expect(alreadyCovered(TECH).map((i) => i.text)).toEqual(['why I stopped upgrading every year'])
  })

  it('ranks what they are KNOWN for above a one-off remark', () => {
    // A bounded prompt takes the top few; the established position must be in
    // them. Six sightings beats four, which beats three.
    expect(rankedKnowledge(TECH).map((i) => i.timesSeen)).toEqual([6, 4, 3])
  })
})

describe('nothing may be invented', () => {
  it('an UNSTATED basis degrades to inferred, never to stated', () => {
    // Silence about provenance must read as the weakest thing. A default of
    // "stated" is precisely how a guess becomes a quote.
    expect(readKnowledgeItem({ kind: 'opinion', text: 'x' })!.basis).toBe('inferred')
    expect(readKnowledgeItem({ kind: 'opinion', text: 'x', basis: 'nonsense' })!.basis).toBe('inferred')
  })

  it('refuses a half-item rather than storing one', () => {
    // A claim with no text, or of no known kind, reads as verified once stored.
    for (const bad of [null, undefined, 42, [], {}, { kind: 'opinion' }, { text: 'x' },
      { kind: 'invented_kind', text: 'x' }, { kind: 'opinion', text: '   ' }]) {
      expect(readKnowledgeItem(bad)).toBeNull()
    }
  })

  it('an empty knowledge base is legal and stays empty', () => {
    for (const bad of [null, undefined, 'nope', 42, []]) {
      expect(readKnowledge(bad)).toEqual(emptyKnowledge())
    }
    expect(readKnowledge({ items: 'not an array' }).items).toEqual([])
  })

  it('EMITS NOTHING when there is nothing — it never asks the model to invent', () => {
    // `generate-blueprint` currently says "NONE STORED. Infer 1-2 stances this
    // creator would plausibly hold". Re-creating that instruction here would
    // rebuild the defect this module exists to remove.
    const line = knowledgePromptLine(emptyKnowledge())
    expect(line).toBe('')
    expect(line).not.toMatch(/infer|plausib|none stored/i)
  })
})

describe('extract, then forget', () => {
  it('a source with no retention at all counts as already expired', () => {
    // Never retained is the STRONGEST state, not a missing value.
    const item = readKnowledgeItem({ kind: 'opinion', text: 'x', basis: 'stated' })!
    expect(item.sourceExpiry).toBeNull()
    expect(sourceExpired(item, new Date('2020-01-01T00:00:00Z'))).toBe(true)
  })

  it('answers whether a retained source is past its date', () => {
    const item = TECH.items.find((i) => i.sourceRef === 'v1')!
    expect(sourceExpired(item, new Date('2025-06-01T00:00:00Z'))).toBe(false)
    expect(sourceExpired(item, new Date('2026-06-01T00:00:00Z'))).toBe(true)
  })

  it('keeps a reference to the source, never the source text', () => {
    // Enough to trace, not enough to reconstitute.
    for (const i of TECH.items) {
      expect(i.text.length).toBeLessThanOrEqual(240)
      expect(i.sourceRef === null || i.sourceRef.length < 40).toBe(true)
    }
  })
})

describe('the audience memory holds summaries, not people', () => {
  it('carries the question and how often it was asked', () => {
    expect(TECH.audience[0]).toEqual({ summary: 'people are confused about battery health', asked: 40 })
  })

  it('has no author, no comment text and no id to attach one to', () => {
    // Comments are written by people who never signed up for anything here.
    expect(Object.keys(TECH.audience[0]).sort()).toEqual(['asked', 'summary'])
  })

  it('drops an entry with no summary rather than keeping an empty one', () => {
    expect(readKnowledge({ audience: [{ asked: 9 }, { summary: '  ' }] }).audience).toEqual([])
  })
})

describe('provenance a person can act on', () => {
  it('carries the video, the date it was last seen, and a confidence', () => {
    const i = readKnowledgeItem({
      kind: 'opinion', text: 'x', basis: 'stated', confidence: 0.9,
      source_url: 'https://youtube.com/shorts/abc', last_observed_at: '2026-03-01T00:00:00Z',
    })!
    expect(i.sourceUrl).toBe('https://youtube.com/shorts/abc')
    expect(i.lastObservedAt).toBe('2026-03-01T00:00:00Z')
    expect(i.confidence).toBe(0.9)
  })

  it('an ABSENT confidence is 0.5, never 1', () => {
    // Nobody said how sure they were. Reading that as certainty is the same
    // error as defaulting `basis` to `stated`.
    expect(readKnowledgeItem({ kind: 'fact', text: 'x' })!.confidence).toBe(0.5)
    expect(readKnowledgeItem({ kind: 'fact', text: 'x', confidence: 'nonsense' })!.confidence).toBe(0.5)
    expect(readKnowledgeItem({ kind: 'fact', text: 'x', confidence: 9 })!.confidence).toBe(1)
    expect(readKnowledgeItem({ kind: 'fact', text: 'x', confidence: -3 })!.confidence).toBe(0)
  })

  it('separates a FACT from an OPINION', () => {
    // "USB-C is reversible" survives being attributed to anybody. "Megapixels
    // are oversold" is a stance, and stating it flatly puts a position in
    // someone's mouth as though it were measurement.
    expect(readKnowledgeItem({ kind: 'fact', text: 'x' })!.kind).toBe('fact')
    expect(readKnowledgeItem({ kind: 'opinion', text: 'x' })!.kind).toBe('opinion')
    expect(readKnowledgeItem({ kind: 'product', text: 'x' })!.kind).toBe('product')
  })
})

describe('the blueprint reads a SUBSET, never the whole store', () => {
  it('picks what the video is actually about', () => {
    const picked = selectRelevantKnowledge(TECH, 'a video about phone camera quality', 2)
    expect(picked.map((i) => i.text)).toContain('battery life matters more than camera gimmicks')
  })

  it('still returns something when nothing matches the topic', () => {
    // A creator whose stored positions miss this topic still has positions, and
    // sending none is the failure this module exists to end.
    const picked = selectRelevantKnowledge(TECH, 'sourdough baking for beginners', 2)
    expect(picked).toHaveLength(2)
    expect(picked[0].timesSeen).toBe(6) // best-established first
  })

  it('never exceeds the limit, and never returns an inferred item', () => {
    const picked = selectRelevantKnowledge(TECH, 'phones', 2)
    expect(picked.length).toBeLessThanOrEqual(2)
    expect(picked.every((i) => i.basis !== 'inferred')).toBe(true)
  })

  it('is empty only when the store is', () => {
    expect(selectRelevantKnowledge(emptyKnowledge(), 'anything')).toEqual([])
  })
})

describe('the prompt line', () => {
  const line = knowledgePromptLine(TECH)

  it('offers the real substance and says it may be voiced', () => {
    expect(line).toContain('battery life matters more than camera gimmicks')
    expect(line).toMatch(/may put them in their mouth/i)
  })

  it('never leaks an inferred item into the speakable block', () => {
    expect(line).not.toContain('probably dislikes subscription hardware')
  })

  it('warns off what they already made', () => {
    expect(line).toContain('ALREADY COVERED')
    expect(line).toContain('why I stopped upgrading every year')
  })

  it('says the covered list is NEVER SPOKEN — it leaked into a real script', () => {
    // ⚠️ MEASURED. The first version said only "do not hand them their own upload
    // back", and a run produced the spoken line: "The first thing I stopped
    // caring about is megapixel count. WE'VE HAD A VIDEO ON THIS, but it's still
    // true." That is our notes narrated to the audience, plus an unchecked claim
    // about their back catalogue. The general rule was already there; naming the
    // specific way it broke is what the count contract needed too.
    expect(line).toMatch(/NEVER SPOKEN/)
    expect(line).toMatch(/had a video on this/)
  })

  it('respects a bound, keeping the best-established items', () => {
    expect(knowledgePromptLine(TECH, 1)).toContain('battery life matters more')
    expect(knowledgePromptLine(TECH, 1)).not.toContain('megapixel numbers are oversold')
  })

  it('covers every declared kind, so none is silently unspeakable', () => {
    for (const kind of KNOWLEDGE_KINDS) {
      const one = readKnowledge({ items: [{ kind, text: `a ${kind}`, basis: 'stated' }] })
      expect(knowledgePromptLine(one)).toContain(`a ${kind}`)
    }
  })
})
