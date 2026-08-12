// SUBSTANCE BEFORE PROSE — and Johnny's bracketed script as the fixture.
//
// Every structural check passed on that run. The hook shape worked, the pacing
// worked, the comparison beat was in the right place, nothing was faked or sold
// — and the script was worthless, because it said [Phone Model].
import { describe, expect, it } from 'vitest'
import { readKnowledge } from '../creatorKnowledge'
import {
  evidenceLevel, resolveContainer, resolveAll, resolutionStats, resolutionPromptLine, substanceIssues,
  groundingDepth,
  type Container,
} from '../knowledgeResolver'

/** What the caption extractor really returned for Johnny, verbatim. */
const FROM_CAPTIONS = readKnowledge({
  items: [
    { kind: 'product', text: "Samsung Z Fold 8, Samsung's passport sized foldable", basis: 'demonstrated', timesSeen: 1 },
    { kind: 'product', text: 'Samsung A80, the most unique Samsung phone', basis: 'demonstrated', timesSeen: 1 },
    { kind: 'covered', text: "fixing the phone Google doesn't want you to buy", basis: 'demonstrated', timesSeen: 1 },
  ],
})

/** The same creator after speech is mined too. */
const WITH_SPEECH = readKnowledge({
  items: [
    ...FROM_CAPTIONS.items,
    { kind: 'opinion', text: 'the hinge is the first thing to fail on a foldable phone', basis: 'stated', timesSeen: 3 },
    { kind: 'experience', text: 'used the Z Fold 8 as his only phone for two weeks', basis: 'stated', timesSeen: 1 },
  ],
})

/** The reference's shape, as containers rather than prose. */
const CONTAINERS: Container[] = [
  { id: 'new product', about: 'the foldable phone being covered', needs: 'coverage' },
  { id: 'overlooked feature', about: 'a hinge feature others miss on the foldable', needs: 'opinion' },
  { id: 'personal use', about: 'living with the foldable phone day to day', needs: 'experience' },
]

describe('the evidence ladder', () => {
  it('a title never becomes a stance', () => {
    // ⚖️ Derived from kind AND basis together. An opinion marked `demonstrated`
    // came from a headline: the video exists, nobody heard the position. Reading
    // the kind alone would promote every title into something quotable.
    expect(evidenceLevel(FROM_CAPTIONS.items[0])).toBe('coverage')
    expect(evidenceLevel(readKnowledge({ items: [
      { kind: 'opinion', text: 'x', basis: 'demonstrated' }] }).items[0])).toBe('coverage')
  })

  it('speech is opinion, and first-person is experience', () => {
    const spoken = WITH_SPEECH.items.find((i) => i.kind === 'opinion')!
    const lived = WITH_SPEECH.items.find((i) => i.kind === 'experience')!
    expect(evidenceLevel(spoken)).toBe('opinion')
    expect(evidenceLevel(lived)).toBe('experience')
  })
})

describe('captions alone cannot fill an opinion or an experience beat', () => {
  const rs = resolveAll(CONTAINERS, FROM_CAPTIONS)

  it('fills the coverage beat — a title genuinely names the product', () => {
    expect(rs[0].source).toBe('creator_knowledge')
    expect(rs[0].evidence[0].text).toMatch(/foldable/i)
  })

  it('REFUSES to fill the opinion beat from a title', () => {
    // Three coverage items about foldables do not add up to a position.
    expect(rs[1].source).not.toBe('creator_knowledge')
    expect(rs[1].evidence).toEqual([])
  })

  it('refuses the experience beat and ASKS rather than inventing', () => {
    // The most expensive error this system can make is a first-person claim the
    // creator never made. There is no research or rephrasing that fixes it.
    expect(rs[2].source).toBe('needs_user')
    expect(rs[2].fallback).toEqual({ kind: 'ask', question: expect.stringContaining('only you know') })
  })
})

describe('speech resolves what captions could not', () => {
  const rs = resolveAll(CONTAINERS, WITH_SPEECH)

  it('the opinion beat now has a real position behind it', () => {
    expect(rs[1].source).toBe('creator_knowledge')
    expect(rs[1].evidence[0].text).toMatch(/hinge/i)
  })

  it('and the experience beat is filled by a first-person statement', () => {
    expect(rs[2].source).toBe('creator_knowledge')
    expect(rs[2].evidence[0].text).toMatch(/only phone for two weeks/i)
  })

  it('the share a creator could film today goes UP, measurably', () => {
    expect(resolutionStats(resolveAll(CONTAINERS, FROM_CAPTIONS)).resolvedShare).toBeCloseTo(1 / 3)
    expect(resolutionStats(rs).resolvedShare).toBe(1)
  })
})

describe('the three honest answers, and no fourth', () => {
  const empty = readKnowledge({ items: [] })

  it('researches a non-personal gap rather than guessing', () => {
    const r = resolveContainer(
      { id: 'spec', about: 'typical hinge durability ratings', needs: 'opinion' },
      empty, { researchable: true })
    expect(r.fallback?.kind).toBe('research')
  })

  it('generalises when research is unavailable — weaker, and honest', () => {
    const r = resolveContainer(
      { id: 'spec', about: 'hinge durability', needs: 'opinion' }, empty)
    expect(r.fallback?.kind).toBe('generalise')
    expect((r.fallback as { framing: string }).framing).toMatch(/rather than as something they personally/i)
  })

  it('NEVER researches or generalises a personal-experience beat', () => {
    // No external fact makes "I used it for six months" true of this person.
    const r = resolveContainer(
      { id: 'lived', about: 'six months with the phone', needs: 'experience' },
      empty, { researchable: true })
    expect(r.source).toBe('needs_user')
    expect(r.fallback?.kind).toBe('ask')
  })

  it('a container needing nothing is resolved and asks for nothing', () => {
    const r = resolveContainer({ id: 'cta', about: 'closing line', needs: 'none' }, empty)
    expect(r.fallback).toBeNull()
  })
})

describe('the writer receives decisions, not a bracket', () => {
  it('names the source for a resolved beat and the instruction for an unresolved one', () => {
    const line = resolutionPromptLine(resolveAll(CONTAINERS, FROM_CAPTIONS))
    expect(line).toMatch(/Samsung/)
    expect(line).toMatch(/DO NOT WRITE THIS BEAT as personal experience/)
  })

  it('forbids the placeholder by name, including the bracketless one', () => {
    const line = resolutionPromptLine(resolveAll(CONTAINERS, FROM_CAPTIONS))
    expect(line).toMatch(/\[Phone Model\]/)
    expect(line).toMatch(/the new XYZ/)
  })

  it('is empty when there are no containers to rule on', () => {
    expect(resolutionPromptLine([])).toBe('')
  })
})

describe('a declaration nobody checks is a comment', () => {
  const supplied = WITH_SPEECH.items

  it('catches a beat that cites knowledge the prompt never carried', () => {
    // The failure this exists for: the model writes a plausible sentence and
    // labels it `creator_knowledge`. Same shape as a guess wearing a `stated`
    // basis, one layer up.
    const issues = substanceIssues([
      { line: 'The camera bump is the real problem.', substance: 'creator_knowledge',
        substance_evidence: 'creator said camera bumps ruin the design' },
    ], supplied)
    expect(issues.map((i) => i.code)).toContain('unsupported_creator_claim')
  })

  it('accepts a beat that traces back to something real', () => {
    expect(substanceIssues([
      { line: 'Hinges are still what fails first.', substance: 'creator_knowledge',
        substance_evidence: 'the hinge is the first thing to fail on a foldable' },
    ], supplied)).toEqual([])
  })

  it('catches a claim with nothing named to check', () => {
    expect(substanceIssues([
      { line: 'x', substance: 'creator_knowledge', substance_evidence: '' },
    ], supplied).map((i) => i.code)).toContain('undeclared_evidence')
  })

  it('REFUSES an unearned personal history', () => {
    // No research and no rephrasing makes "I used it for six months" true of
    // this person. Nothing licenses it but experience-level evidence.
    const issues = substanceIssues([
      { line: 'I used the Pixel as my only phone for six months.', substance: 'research' },
    ], readKnowledge({ items: [
      { kind: 'product', text: 'Google Pixel', basis: 'demonstrated' }] }).items)
    expect(issues.map((i) => i.code)).toContain('unearned_first_person')
  })

  it('allows a personal history the creator is on record for', () => {
    expect(substanceIssues([
      { line: 'I used the Z Fold 8 as my only phone for two weeks.',
        substance: 'creator_knowledge', substance_evidence: 'used the Z Fold 8 as his only phone for two weeks' },
    ], supplied)).toEqual([])
  })

  // ── THE BEAT THAT DECLARED NOTHING ─────────────────────────────────────────
  // ⚠️ FOUND BY READING THE CORPUS, NOT BY A FAILING TEST. `substance` is a
  // REQUIRED field in the response schema and one beat in 705 came back without
  // it anyway. Both citation branches key on the source matching a known value,
  // so that beat was waved through with its citation never read — a required
  // field is a statement about the request, not about what comes back.
  it('names a beat that declares no substance at all', () => {
    expect(substanceIssues([{ line: "Don't feel locked into the Surface Pro." }], supplied)
      .map((i) => i.code)).toEqual(['undeclared_substance'])
  })

  it('names a source that is not one of the five', () => {
    // `research` reads like a source and is not one. Silently unchecked before.
    expect(substanceIssues([{ line: 'x', substance: 'research' }], supplied)
      .map((i) => i.code)).toContain('undeclared_substance')
  })

  it('an omitted declaration cannot be used to dodge the citation check', () => {
    // ⚖️ THE POINT OF THE CHECK, STATED AS A CONTRAST. Declaring the source
    // honestly and citing something never supplied is caught; declaring nothing
    // used to be free. Both are now reported — otherwise the cheapest way past
    // the check is to say less.
    const declared = substanceIssues([
      { line: 'x', substance: 'creator_knowledge', substance_evidence: 'a thing never supplied' },
    ], supplied)
    const silent = substanceIssues([{ line: 'x', substance_evidence: 'a thing never supplied' }], supplied)
    expect(declared.length).toBeGreaterThan(0)
    expect(silent.length).toBeGreaterThan(0)
  })

  it('every honest source stays silent, so this is not a new false-alarm factory', () => {
    // Measured: 1 beat in 705 lacked a source, 0 in the two other 112-case
    // runs. If this ever fires on `general` or `none` it has become noise.
    for (const s of ['creator_knowledge', 'product_dna', 'general', 'needs_user', 'none']) {
      expect(substanceIssues([
        { line: 'Most people leave this on auto.', substance: s,
          substance_evidence: 'the hinge is the first thing to fail on a foldable' },
      ], supplied).map((i) => i.code), s).not.toContain('undeclared_substance')
    }
  })

  it('does not condemn ordinary opinion phrasing', () => {
    // "I think" and "I'd say" are stance, not history. Failing those would fail
    // every honest talking-head script.
    expect(substanceIssues([
      { line: "I think foldables are finally worth it.", substance: 'creator_knowledge',
        substance_evidence: 'the hinge is the first thing to fail on a foldable' },
    ], supplied)).toEqual([])
  })
})

describe('a citation carries the prefix the prompt taught it', () => {
  // ⚠️ MEASURED. The prompt renders knowledge as `* (product) cardboard PC`, so
  // the writer cites it back that way. All 18 claims flagged as fabrications
  // across a 60-run matrix were this, and every one cited real knowledge.
  const CARTER = readKnowledge({ items: [
    { kind: 'product', text: 'This cardboard PC is insane', basis: 'demonstrated' },
    { kind: 'product', text: 'This IPHONE 14 PRO MAX is going to one of YOU', basis: 'demonstrated' },
  ]})

  it('accepts a citation written the way the prompt displayed it', () => {
    // Two words, one of which is the kind marker. Before the strip, "product"
    // joined the term set and forced a two-term match that could not be made.
    expect(substanceIssues([
      { line: 'Look at my cardboard PC.', substance: 'creator_knowledge',
        substance_evidence: '(product) cardboard PC' },
    ], CARTER.items)).toEqual([])
  })

  it('accepts it for every kind marker, not just product', () => {
    for (const k of ['topic', 'opinion', 'covered', 'experience']) {
      expect(substanceIssues([
        { line: 'x', substance: 'creator_knowledge',
          substance_evidence: `(${k}) cardboard PC` },
      ], CARTER.items)).toEqual([])
    }
  })

  it('STILL CATCHES a fabrication that merely wears the prefix', () => {
    // The strip must not become a way through. A prefixed citation that traces
    // to nothing is exactly as unsupported as an unprefixed one.
    expect(substanceIssues([
      { line: 'x', substance: 'creator_knowledge',
        substance_evidence: '(product) quantum toaster subscription' },
    ], CARTER.items).map((i) => i.code)).toContain('unsupported_creator_claim')
  })

  it('a bare kind marker with nothing after it supports nothing', () => {
    expect(substanceIssues([
      { line: 'x', substance: 'creator_knowledge', substance_evidence: '(product)' },
    ], CARTER.items).map((i) => i.code)).toContain('unsupported_creator_claim')
  })
})

describe('a beat may rest on more than one item', () => {
  const JEREMY = readKnowledge({ items: [
    { kind: 'topic', text: 'AI ads for dropshipping', basis: 'demonstrated' },
    { kind: 'product', text: 'ChatGPT can run your email marketing', basis: 'demonstrated' },
  ]})

  it('accepts a comma-joined citation of two real items', () => {
    // MEASURED: three correctly-sourced beats were reported as fabrications
    // because the whole string carried two items' worth of terms and no single
    // stored item could match enough of them.
    expect(substanceIssues([
      { line: 'x', substance: 'creator_knowledge',
        substance_evidence: 'ChatGPT, AI ads for dropshipping' },
    ], JEREMY.items)).toEqual([])
  })

  it('still refuses a list where NOTHING traces', () => {
    expect(substanceIssues([
      { line: 'x', substance: 'creator_knowledge',
        substance_evidence: 'quantum toasters, orbital mattresses' },
    ], JEREMY.items).map((i) => i.code)).toContain('unsupported_creator_claim')
  })

  it('catches the no-knowledge fabrication, which is what it is FOR', () => {
    // ⚠️ MEASURED AND REAL: in 4 of 4 runs with knowledge deliberately withheld,
    // the writer still declared `creator_knowledge` and invented a citation —
    // "Goal: educate", "his focus on tech reviews implies…". Given nothing, it
    // claimed something. This is the case the whole check exists for.
    expect(substanceIssues([
      { line: 'x', substance: 'creator_knowledge', substance_evidence: 'Goal: educate' },
    ], []).map((i) => i.code)).toContain('unsupported_creator_claim')
  })
})

// THE UNCHECKED DECLARED SOURCE.
//
// `product_dna` was accepted on the model's word while `creator_knowledge` was
// verified. Across 112 real runs for 8 creators with no product DNA supplied,
// 70 beats declared `product_dna` anyway — and the count GREW by half in the
// run that tightened the CTA and claim rules. Pressure follows the unchecked
// path, so leaving one open is not a gap, it is a drain.
describe('substanceIssues — product_dna', () => {
  const beat = (evidence: string) => ([
    { line: 'It keeps your desk clear.', substance: 'product_dna', substance_evidence: evidence },
  ])

  it('an empty fact list makes the claim IMPOSSIBLE, not merely unsupported', () => {
    // The distinction is the whole point: nothing was carried, so there is no
    // source the writer could have used. That is a different defect from a
    // citation that misses, and it deserves a different word.
    expect(substanceIssues(beat('The product provides a dedicated charging spot.'), [], [])
      .map((i) => i.code)).toEqual(['impossible_product_claim'])
  })

  it('UNDEFINED runs no product check at all — silence is not evidence', () => {
    // ⚖️ The three-state rule. A caller that has not been updated must not be
    // converted into a false-alarm factory, which is exactly how the citation
    // check lost its credibility the first time.
    expect(substanceIssues(beat('anything at all'), [])).toEqual([])
    expect(substanceIssues(beat('anything at all'), [], null)).toEqual([])
  })

  it('traces a real citation to the supplied facts', () => {
    expect(substanceIssues(beat('magnetic charging dock'), [],
      ['magnetic charging dock, 15W', 'aluminium body'])).toEqual([])
  })

  it('flags a citation the supplied facts do not contain', () => {
    expect(substanceIssues(beat('waterproof to 50 metres'), [],
      ['magnetic charging dock, 15W', 'aluminium body'])
      .map((i) => i.code)).toEqual(['unsupported_product_claim'])
  })

  it('flags a product claim that cites nothing', () => {
    expect(substanceIssues(beat(''), [], ['magnetic charging dock'])
      .map((i) => i.code)).toEqual(['undeclared_evidence'])
  })

  it('uses the SAME tracing rule as creator_knowledge', () => {
    // Two matchers would let one citation pass one check and fail the other
    // for no reason a reader could defend. Multi-part citations and the kind
    // prefix must behave identically on both paths.
    expect(substanceIssues(beat('(product) magnetic dock, some invented thing'), [],
      ['magnetic dock for the desk'])).toEqual([])
  })

  it('leaves the other declared sources alone', () => {
    for (const src of ['general', 'needs_user', 'none']) {
      expect(substanceIssues([{ line: 'x', substance: src, substance_evidence: '' }], [], []))
        .toEqual([])
    }
  })
})

// ── HOW DEEP DOES THE GROUNDING GO? ──────────────────────────────────────────
// ⚠️ FOUND BY READING, AND DELIBERATELY NOT WIRED TO A GATE. 28% of the 265
// `creator_knowledge` beats in the last matrix cite a bare subject. Every layer
// handles them correctly — they trace, and a topic maps to coverage, which
// licenses exactly the discussion-strength claims those lines make. What is
// wrong is the COUNT: `beat_substance` reports them as creator-grounded
// alongside beats resting on something the creator actually said.
describe('groundingDepth — a subject is not a claim', () => {
  const supplied = readKnowledge({ items: [
    { kind: 'topic', text: '3D printing', basis: 'demonstrated' },
    { kind: 'product', text: 'Unihertz', basis: 'demonstrated' },
    { kind: 'opinion', text: 'megapixels are oversold on flagship phones', basis: 'stated' },
    { kind: 'experience', text: 'printed a full-size helmet over three days', basis: 'stated' },
  ] }).items

  it('calls a bare subject citation what it is', () => {
    expect(groundingDepth('(topic) 3D printing', supplied)).toBe('subject')
    expect(groundingDepth('(product) Unihertz', supplied)).toBe('subject')
  })

  it('calls a citation that reaches something they SAID a proposition', () => {
    expect(groundingDepth('megapixels are oversold', supplied)).toBe('proposition')
    expect(groundingDepth('printed a full-size helmet', supplied)).toBe('proposition')
  })

  it('reports nothing traced as nothing traced, not as shallow', () => {
    // ⚖️ Three states. `none` is already caught by `unsupported_creator_claim`;
    // collapsing it into `subject` would hide a fabrication inside a
    // shallowness metric and make the split useless for both questions.
    expect(groundingDepth('the battery lasts nine days', supplied)).toBe('none')
  })

  it('a citation reaching BOTH counts as the deeper one', () => {
    // `tracesTo` already accepts one real hit among several, so anything
    // stricter would answer differently about the same citation.
    expect(groundingDepth('3D printing, printed a full-size helmet', supplied)).toBe('proposition')
  })

  it('is a measurement and refuses no beat', () => {
    // If this ever appears in `substanceIssues`, the split has quietly become a
    // gate — which is an owner-level call, not a refactor.
    expect(substanceIssues([
      { line: 'Infill is what makes a print strong.', substance: 'creator_knowledge',
        substance_evidence: '(topic) 3D printing' },
    ], supplied)).toEqual([])
  })
})
