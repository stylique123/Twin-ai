// THE CLASSIFIER MUST NOT CLAIM WHAT THE STRINGS DO NOT SHOW.
//
// ⚖️ 0127 STORES THE PAIR AND REFUSES THE JUDGEMENT; this reads at query time so
// the reading can be revised. The risk it carries is the opposite one — a label
// confident enough to be quoted, computed from nothing — so these tests pin
// what it may and may not decide.
import { describe, expect, it } from 'vitest'
import {
  classifyEdit, summariseEdits, NEEDS_JUDGEMENT, MIN_PAIRS_GLOBAL, MIN_PAIRS_PER_CREATOR, REWRITE_KEPT_SHARE, deriveLessons, LESSON_SUPPORT,
} from '../editClassification'
import { describeEditFacts } from '../scriptEditRecord'

const facts = (before: string, after: string) => describeEditFacts(before, after)

describe('it reads only what the two strings show', () => {
  it('calls a replacement a rewrite, not a trim', () => {
    // ⚠️ ORDER MATTERS. A replaced line is often also shorter; reporting that as
    // "tightened" would teach the writer to trim when the creator started over.
    const f = facts('This dramatically improves your workflow over time.', 'I saved six hours last Tuesday.')
    expect(f.keptShare).toBeLessThan(REWRITE_KEPT_SHARE)
    expect(classifyEdit(f)).toBe('rewritten')
  })

  it('counts an added figure as concreteness, not as length', () => {
    expect(classifyEdit(facts(
      'It saves you a lot of time every week here',
      'It saves you 6 hours every week here'))).toBe('made_concrete')
  })

  it('sees first person arriving', () => {
    expect(classifyEdit(facts(
      'Most founders underestimate onboarding costs entirely',
      'Most founders underestimate what I pay for onboarding'))).toBe('made_personal')
  })

  it('separates tightening from expanding', () => {
    expect(classifyEdit(facts('one two three four five six seven eight', 'one two three'))).toBe('tightened')
    expect(classifyEdit(facts('one two three', 'one two three four five six seven'))).toBe('expanded')
  })

  it('says UNCLASSIFIED rather than guessing', () => {
    // A two-word swap is a tweak with no direction, and inventing one is how a
    // corpus becomes untrustworthy.
    expect(classifyEdit(facts('you should try this today', 'you might try this today'))).toBe('unclassified')
  })
})

describe('what it refuses to claim', () => {
  it('names the judgements it does not compute', () => {
    // ⚠️ THE ABSENCE IS DECLARED so a reader finds out here, rather than by
    // trusting a number nothing measured.
    expect(NEEDS_JUDGEMENT).toContain('salesy_to_natural')
    expect(NEEDS_JUDGEMENT).toContain('weak_hook_to_stronger')
    expect(NEEDS_JUDGEMENT).toContain('formal_to_conversational')
  })
})

describe('it refuses to call a small sample a preference', () => {
  const pairs = Array.from({ length: 5 }, () => ({
    ownerId: 'a', facts: facts('one two three four five six', 'one two three'),
  }))

  it('counts, but is not reportable, below the creator threshold', () => {
    const l = summariseEdits(pairs, 'creator', 'a')
    expect(l.pairs).toBe(5)
    expect(l.byType.tightened).toBe(5)
    expect(l.reportable).toBe(false)
    expect(MIN_PAIRS_PER_CREATOR).toBe(20)
  })

  it('holds global lessons to a higher bar, because people disagree', () => {
    expect(summariseEdits(pairs, 'global').reportable).toBe(false)
    expect(MIN_PAIRS_GLOBAL).toBeGreaterThan(MIN_PAIRS_PER_CREATOR)
  })

  it('scopes a creator lesson to that creator', () => {
    const mixed = [...pairs, { ownerId: 'b', facts: facts('x y z', 'x y z q r s') }]
    expect(summariseEdits(mixed, 'creator', 'b').pairs).toBe(1)
  })
})

describe('lessons say what to SUPPLY, not what to tell the writer', () => {
  const concrete = (n: number) => Array.from({ length: n }, () => ({
    ownerId: 'a', facts: describeEditFacts('It saves you a lot of time each week', 'It saves you 6 hours each week'),
  }))
  const mixed = (n: number) => Array.from({ length: n }, (_, i) => ({
    ownerId: 'a',
    facts: i % 2 === 0
      ? describeEditFacts('It saves you a lot of time each week', 'It saves you 6 hours each week')
      : describeEditFacts('one two three', 'one two three four five six seven'),
  }))

  it('every action changes selection or shape, never prose instruction', () => {
    // ⚠️ THE ONE INTERVENTION WITH HUMAN EVIDENCE CHANGED WHAT REACHED THE WRITER.
    // Every prompt rule measured this session was inert, so a lesson that
    // compiled into prompt text would be learning aimed at the one lever known
    // not to move.
    const actions = deriveLessons(concrete(30), 'creator', 'a').map((l) => l.action)
    expect(actions).toContain('prefer_figures')
    expect(actions.every((a) => ['prefer_figures', 'prefer_experience', 'shorter_beats'].includes(a))).toBe(true)
  })

  it('is actionable only when the sample AND the agreement clear their bars', () => {
    const strong = deriveLessons(concrete(30), 'creator', 'a').find((l) => l.action === 'prefer_figures')!
    expect(strong.pairs).toBe(30)
    expect(strong.support).toBe(1)
    expect(strong.actionable).toBe(true)
  })

  it('refuses a split creator: half one way is not a preference', () => {
    // ⚖️ Someone who tightens half their lines and expands the other half has no
    // preference — they have a script with some long lines and some short ones.
    const l = deriveLessons(mixed(30), 'creator', 'a').find((x) => x.action === 'prefer_figures')!
    expect(l.support).toBeLessThan(LESSON_SUPPORT)
    expect(l.actionable).toBe(false)
  })

  it('refuses a strong pattern on too few pairs', () => {
    const l = deriveLessons(concrete(5), 'creator', 'a').find((x) => x.action === 'prefer_figures')!
    expect(l.support).toBe(1)          // unanimous…
    expect(l.actionable).toBe(false)   // …and still not a preference
  })

  it('holds global lessons to the higher bar, because people disagree', () => {
    const l = deriveLessons(concrete(30), 'global').find((x) => x.action === 'prefer_figures')!
    expect(l.pairs).toBe(30)
    expect(l.actionable).toBe(false)   // 30 < MIN_PAIRS_GLOBAL
  })

  it('shows what is nearly true rather than hiding it until it fires', () => {
    expect(deriveLessons(concrete(5), 'creator', 'a').length).toBeGreaterThan(0)
    expect(deriveLessons([], 'creator', 'a')).toEqual([])
  })
})
