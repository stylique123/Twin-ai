import { describe, it, expect } from 'vitest'
import { buildVideoPlan, planGapDrift } from '../videoPlan'
import { SUBSTANCE_KINDS, carriesFigure, isFirstPerson } from '../knowledgeSelection'

// ⚠️ SHAPED LIKE THE PHYSIO'S REAL STORE, measured 2026-09-05: 26 of his 50
// items are caption-derived `covered`, and he has 2 `experience` rows. The
// interesting case is not an empty store — it is a FULL one that is still
// missing the thing a beat needs.
const CAPTION_HEAVY = [
  ...Array(26).fill(null).map(() => ({ kind: 'covered', text: 'ACL rehab', source: 'caption' })),
  { kind: 'opinion', text: 'Ice is overprescribed', source: 'transcript' },
  { kind: 'claim', text: 'Most knee pain is load related', source: 'transcript' },
]
const WITH_EPISODE = [...CAPTION_HEAVY, { kind: 'experience', text: 'I tore mine in 2019', source: 'transcript' }]
const WITH_FIGURE = [...CAPTION_HEAVY, { kind: 'claim', text: 'Recovery took 9 months', source: 'transcript' }]

describe('the third line is derived, never guessed', () => {
  it('names the missing story when the store has no first-person substance', () => {
    const p = buildVideoPlan({ angle: 'ACL rehab', knowledge: CAPTION_HEAVY, readyFacts: [] })
    expect(p.gaps.map((g) => g.basis)).toContain('isFirstPerson')
    // ⚠️ THE PREDICATE, NOT A COPY OF IT. If `isFirstPerson` ever changes, this
    // fixture's verdict changes with it and the plan follows.
    expect(CAPTION_HEAVY.filter((i) => SUBSTANCE_KINDS.has(i.kind)).some(isFirstPerson)).toBe(false)
  })

  it('drops that gap the moment the writer would actually have one', () => {
    const p = buildVideoPlan({ angle: 'ACL rehab', knowledge: WITH_EPISODE, readyFacts: [] })
    expect(p.gaps.map((g) => g.basis)).not.toContain('isFirstPerson')
    expect(p.willUse).toContain('something that happened to you')
  })

  it('names missing numbers, and stops when a real figure appears', () => {
    expect(buildVideoPlan({ angle: 'x', knowledge: CAPTION_HEAVY, readyFacts: [] })
      .gaps.map((g) => g.basis)).toContain('carriesFigure')
    expect(WITH_FIGURE.filter((i) => SUBSTANCE_KINDS.has(i.kind)).some(carriesFigure)).toBe(true)
    expect(buildVideoPlan({ angle: 'x', knowledge: WITH_FIGURE, readyFacts: [] })
      .gaps.map((g) => g.basis)).not.toContain('carriesFigure')
  })

  // ⚖️ 26 `covered` ITEMS LOOK LIKE A FULL STORE AND CANNOT CARRY A BEAT.
  // `covered` is excluded from SUBSTANCE_KINDS upstream — it steers choice and
  // is never spoken — so a plan counting rows rather than substance would tell
  // this creator he is well supplied on the day he is not.
  it('does not let 26 caption topics look like substance', () => {
    const p = buildVideoPlan({ angle: 'x', knowledge: CAPTION_HEAVY, readyFacts: [] })
    expect(p.gaps.length).toBeGreaterThan(0)
    expect(p.willUse.join(' ')).not.toMatch(/26 /)
  })
})

describe('an empty store says so once', () => {
  it('does not stack five absences that all mean the same thing', () => {
    const p = buildVideoPlan({ angle: 'x', knowledge: [], readyFacts: [] })
    expect(p.gaps.filter((g) => g.basis === 'wasSpoken')).toHaveLength(1)
    expect(p.gaps.map((g) => g.basis)).not.toContain('isFirstPerson')
    expect(p.gaps.map((g) => g.basis)).not.toContain('carriesFigure')
  })
})

describe('the plan never promises what the writer lacks', () => {
  const cases = [
    { name: 'caption-heavy, no facts', k: CAPTION_HEAVY, f: [] as string[] },
    { name: 'with an episode', k: WITH_EPISODE, f: [] as string[] },
    { name: 'with a figure', k: WITH_FIGURE, f: [] as string[] },
    { name: 'with product facts', k: CAPTION_HEAVY, f: ['what it does', 'who it is for'] },
    { name: 'everything', k: [...WITH_EPISODE, ...WITH_FIGURE], f: ['what it does'] },
  ]

  // ⚠️ THE DRIFT TEST. The screen and the writer must agree about what exists.
  // A plan that lists a gap the writer does not have is a promise the script
  // then breaks, and the creator cannot tell which half lied.
  it.each(cases)('agrees with the writer on $name', ({ k, f }) => {
    const plan = buildVideoPlan({ angle: 'x', knowledge: k, readyFacts: f })
    const substance = k.filter((i) => SUBSTANCE_KINDS.has(i.kind))
    const drift = planGapDrift(plan, {
      hasFirstPerson: substance.some(isFirstPerson),
      hasFigure: substance.some(carriesFigure),
      factCount: f.length,
    })
    expect(drift, drift.join(' | ')).toEqual([])
  })

  // ⚖️ AND THE DRIFT DETECTOR MUST ITSELF BE ABLE TO FAIL. A checker that
  // always returns [] would make every case above pass vacuously.
  it('reports a disagreement when there is one', () => {
    const plan = buildVideoPlan({ angle: 'x', knowledge: CAPTION_HEAVY, readyFacts: [] })
    const drift = planGapDrift(plan, { hasFirstPerson: true, hasFigure: true, factCount: 3 })
    expect(drift).toContain('plan says no story, writer has one')
    expect(drift).toContain('plan says no numbers, writer has one')
    expect(drift).toContain('plan says no product facts, writer has some')
  })
})

describe('it describes and never blocks', () => {
  it('returns a plan even when everything is missing', () => {
    const p = buildVideoPlan({ angle: null, knowledge: [], readyFacts: [], canShowProduct: 'no' })
    expect(p.angle).toBeNull()
    expect(p.gaps.length).toBeGreaterThan(0)
    // Nothing here is a refusal, a status, or a blocker — it is three lines.
    expect(Object.keys(p).sort()).toEqual(['angle', 'gaps', 'willUse'])
  })

  it('says the capability out loud when the creator answered no', () => {
    const p = buildVideoPlan({ angle: 'x', knowledge: WITH_EPISODE, readyFacts: ['a'], canShowProduct: 'no' })
    expect(p.gaps.map((g) => g.basis)).toContain('canShowProduct')
  })

  // ⚠️ UNANSWERED IS NOT NO. Run G invented a whiteboard on an unanswered
  // capability; asserting a refusal on silence would be the same error mirrored.
  it('says nothing about a capability the creator never answered', () => {
    for (const v of [null, undefined]) {
      const p = buildVideoPlan({ angle: 'x', knowledge: WITH_EPISODE, readyFacts: ['a'], canShowProduct: v })
      expect(p.gaps.map((g) => g.basis)).not.toContain('canShowProduct')
    }
  })
})
