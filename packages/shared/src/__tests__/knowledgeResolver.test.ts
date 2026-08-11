// SUBSTANCE BEFORE PROSE — and Johnny's bracketed script as the fixture.
//
// Every structural check passed on that run. The hook shape worked, the pacing
// worked, the comparison beat was in the right place, nothing was faked or sold
// — and the script was worthless, because it said [Phone Model].
import { describe, expect, it } from 'vitest'
import { readKnowledge } from '../creatorKnowledge'
import {
  evidenceLevel, resolveContainer, resolveAll, resolutionStats, resolutionPromptLine, substanceIssues,
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

  it('does not condemn ordinary opinion phrasing', () => {
    // "I think" and "I'd say" are stance, not history. Failing those would fail
    // every honest talking-head script.
    expect(substanceIssues([
      { line: "I think foldables are finally worth it.", substance: 'creator_knowledge',
        substance_evidence: 'the hinge is the first thing to fail on a foldable' },
    ], supplied)).toEqual([])
  })
})
