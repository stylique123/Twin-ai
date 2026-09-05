// THE SECOND MEMORY — and the tech creator it was designed around.
//
// "3 things I stopped buying after I turned 30", handed to someone whose stored
// substance is a tone label, produces three invented products. The fixture below
// is the same creator WITH knowledge, and the tests are about what may be spoken
// back to them and what may not.
import { describe, expect, it } from 'vitest'
import {
  emptyKnowledge, readKnowledge, readKnowledgeItem, writableClaims, alreadyCovered,
  rankedKnowledge, isBareLabel, sourceExpired, knowledgePromptLine, selectRelevantKnowledge, freshness, KNOWLEDGE_KINDS,
  type CreatorKnowledge, type KnowledgeItem,
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

describe('confidence is stored but must not be ranked on', () => {
  // ⚠️ MEASURED. Against real speech the extractor returned 1.0 for all twelve
  // items, prompt instruction notwithstanding. Until a run shows it varying it
  // is a constant that looks like a measurement, and `rankedKnowledge` must keep
  // ordering by things counted from the transcripts rather than asserted.
  it('ranks identically whatever the confidence says', () => {
    const flat = readKnowledge({
      items: [
        { kind: 'opinion', text: 'seen six times, low confidence', basis: 'stated', timesSeen: 6, confidence: 0.1 },
        { kind: 'opinion', text: 'seen once, perfect confidence', basis: 'stated', timesSeen: 1, confidence: 1 },
      ],
    })
    expect(rankedKnowledge(flat).map((i) => i.text))
      .toEqual(['seen six times, low confidence', 'seen once, perfect confidence'])
  })
})

describe('how current a thing is — the niche moves', () => {
  // ⚠️ `lastObservedAt` was stored by the extractor and read by NOTHING. In
  // phones, AI tools or platform payouts, a position from three years ago and
  // one from last month are different facts, and handing both to the writer
  // flat is how a script confidently names last generation's thing.
  const at = (iso: string | null) =>
    readKnowledgeItem({ kind: 'product', text: 'x', basis: 'stated', last_observed_at: iso })!
  const NOW = new Date('2026-08-10T00:00:00Z')

  it('reads recent, established and ageing off the date', () => {
    expect(freshness(at('2026-06-01T00:00:00Z'), NOW)).toBe('recent')
    expect(freshness(at('2025-09-01T00:00:00Z'), NOW)).toBe('established')
    expect(freshness(at('2023-01-01T00:00:00Z'), NOW)).toBe('ageing')
  })

  it('UNDATED is its own answer, never "old"', () => {
    // Guessing stale would quietly bury real substance — the same reason an
    // absent basis reads as inferred rather than as false.
    expect(freshness(at(null), NOW)).toBe('undated')
    expect(freshness(at('not a date'), NOW)).toBe('undated')
  })

  it('the prompt tags each item so the writer knows what it may state flatly', () => {
    const k = readKnowledge({ items: [
      { kind: 'product', text: 'the 200MP sensor loses to an older iPhone', basis: 'stated', last_observed_at: '2026-07-01T00:00:00Z' },
    ] })
    const line = knowledgePromptLine(k, 12, undefined, NOW)
    expect(line).toContain('[recent]')
    expect(line).toMatch(/NAME THE SPECIFIC THING/)
    expect(line).toMatch(/ageing.*something they have said/is)
  })
})

// ── THE RANKING PREFERRED THE WEAKEST MATERIAL ──────────────────────────────
describe('rankedKnowledge puts lived material above subject headings', () => {
  // ⚠️ THE `as unknown as KnowledgeItem` HERE DEFEATED THE COMPILER ENTIRELY, and
  //  the name it cast to was not even imported — so it resolved to nothing and
  //  checked nothing. Typed through `readKnowledgeItem`, which is what production
  //  uses to turn a stored row into an item, the fixture is now built the same
  //  way the real path builds one.
  const item = (kind: string, text: string, basis: string, timesSeen: number): KnowledgeItem => {
    const read = readKnowledgeItem({ kind, text, basis, timesSeen, sourceRef: null, sourceExpiry: null })
    // ⚠️ `readKnowledgeItem` RETURNS null FOR A ROW IT REFUSES, and the old cast
    //  hid that: a fixture the real reader rejects would have become `null` and
    //  been ranked as one, quietly. Throwing here means a fixture that could not
    //  exist in production fails the test that relies on it.
    if (read === null) throw new Error(`fixture rejected by readKnowledgeItem: ${kind}/${basis}`)
    return read
  }

  it('an experience seen ONCE outranks a topic seen twelve times', () => {
    // ⚠️ THE EXACT SHAPE FROM PRODUCTION. Topics recur across every caption, so
    // they accumulate timesSeen — "mobile phone tricks and tips" was stored with
    // 12 — while a thing the creator DID is said once. Sorting by frequency
    // first put the folder name above the story.
    const ranked = rankedKnowledge({ items: [
      item('topic', 'mobile phone tricks and tips', 'demonstrated', 12),
      item('experience', 'Sold a black Birkin bag for £13,500 in forty seconds', 'stated', 1),
    ] } as unknown as CreatorKnowledge)
    expect(ranked[0].kind).toBe('experience')
  })

  it('orders the kinds by how much a script can be built from them', () => {
    // ⚠️ THE TEXTS HERE MUST BE PROPOSITIONS. An earlier version of this test
    // used single letters — 't', 'p', 'o' — which are all BARE LABELS under
    // `isBareLabel`. It went on passing after the bare-label key was added, but
    // only because every row was demoted equally and the sort fell through to
    // kind anyway. A kind-ordering test whose rows are all headings is not
    // testing kind ordering.
    const ranked = rankedKnowledge({ items: [
      item('topic', 'phone tips and tricks for beginners', 'stated', 9),
      item('product', 'Buildpad validates business ideas by researching demand', 'stated', 9),
      item('opinion', 'megapixels are oversold and battery matters more', 'stated', 1),
      item('experience', 'Sold a Birkin bag in forty seconds from one story', 'stated', 1),
      item('framework', 'Every video opens on the result and works backwards', 'stated', 1),
      item('example', 'A nine-follower account outperformed a large one', 'stated', 1),
    ] } as unknown as CreatorKnowledge)
    expect(ranked.map((i) => i.kind)).toEqual(
      ['experience', 'example', 'framework', 'opinion', 'product', 'topic'])
  })

  it('a product that PREDICATES something outranks a subject heading', () => {
    // ⚠️ THE SHAPE THAT WAS BEING BURIED. 36 of the 64 product rows in
    // production are complete propositions like this one, and the old rank of 1
    // filed every one of them below `claim` and `fact` as though it were a
    // folder name.
    const ranked = rankedKnowledge({ items: [
      item('topic', 'AI tools for founders and indie hackers', 'stated', 12),
      item('product', 'Early is an iOS alarm app that needs push-ups to switch off', 'stated', 1),
    ] } as unknown as CreatorKnowledge)
    expect(ranked[0].kind).toBe('product')
  })

  it('a BARE product name sorts below every proposition, whatever its basis', () => {
    // ⚠️ THIS IS WHY THE BARE KEY LEADS BASIS. "Codex" was said out loud, so it
    // carries `stated`; the opinion below it was read off a caption, so it
    // carries `demonstrated`. If basis were consulted first the bare name would
    // win — a noun with nothing said about it beating an actual position.
    const ranked = rankedKnowledge({ items: [
      item('product', 'Codex', 'stated', 9),
      item('opinion', 'battery life matters more than the camera', 'demonstrated', 1),
    ] } as unknown as CreatorKnowledge)
    expect(ranked[0].kind).toBe('opinion')
  })

  it('the bare-label rule cannot reach a real experience', () => {
    // ⚖️ THE BLAST RADIUS, PINNED. In production `experience`, `framework`,
    // `example` and `fact` have ZERO rows at three words or fewer. If a future
    // change widens `isBareLabel` far enough to demote lived material, this
    // fails rather than quietly emptying the scripts again.
    for (const text of [
      'Sold a black Birkin bag for £13,500 in forty seconds',
      'Every video opens on the result and works backwards',
      'A brand new account with nine followers outperformed an established one',
    ]) expect(isBareLabel(text)).toBe(false)
  })

  it('isBareLabel is about the text, never the kind', () => {
    expect(isBareLabel('Codex')).toBe(true)
    expect(isBareLabel('Siri App')).toBe(true)
    expect(isBareLabel('  Codex  ')).toBe(true)
    // ⚠️ A KNOWN MISS, PINNED ON PURPOSE RATHER THAN TUNED AWAY. "Samsung Z Fold
    // 8" is four words and plainly a bare name, so the obvious move is to raise
    // the cut to four. The production counts say no: at four words the rule
    // catches ZERO additional products (all 26 bare product rows are already at
    // three or fewer) while it starts demoting an `experience`. Paying real
    // lived material to catch nothing is the wrong trade, so the miss stays.
    // A future basis for moving this is a count, not an intuition.
    expect(isBareLabel('Samsung Z Fold 8')).toBe(false)
    // Empty is not a label — there is nothing there to demote, and treating it
    // as one would make a blank row sort above a real heading.
    expect(isBareLabel('')).toBe(false)
    expect(isBareLabel('   ')).toBe(false)
  })

  it('timesSeen still breaks ties WITHIN a kind', () => {
    // ⚖️ Where it means what it always meant: a belief the creator keeps
    // returning to is more durable than one mentioned once.
    const ranked = rankedKnowledge({ items: [
      item('opinion', 'said once', 'stated', 1),
      item('opinion', 'said often', 'stated', 5),
    ] } as unknown as CreatorKnowledge)
    expect(ranked[0].text).toBe('said often')
  })

  it('a stated item outranks a demonstrated one of ANY kind', () => {
    // ⚠️ KIND CAN NEVER OUTRANK THE EVIDENCE. A first version sorted by kind
    // first and promoted a DEMONSTRATED experience read off captions above a
    // STATED opinion the creator said aloud — a caption inference beating
    // speech, which is the ladder inverted.
    const across = rankedKnowledge({ items: [
      item('experience', 'has reviewed several foldables', 'demonstrated', 3),
      item('opinion', 'battery life matters more', 'stated', 6),
    ] } as unknown as CreatorKnowledge)
    expect(across[0].basis).toBe('stated')
  })

  it('a stated item still outranks a demonstrated one of the same kind', () => {
    const ranked = rankedKnowledge({ items: [
      item('opinion', 'from a caption', 'demonstrated', 9),
      item('opinion', 'from speech', 'stated', 1),
    ] } as unknown as CreatorKnowledge)
    expect(ranked[0].text).toBe('from speech')
  })
})
