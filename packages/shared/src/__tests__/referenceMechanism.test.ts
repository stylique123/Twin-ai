// THE COUNT CONTRACT — with §5d's real run as the fixture.
//
// The reference promised FIVE. The plan carried three numbers, none of them
// five, and the script counted to two and went quiet. Every case below is
// either that run or a way of getting that run wrong differently.
//
// ⚖️ The guard rails matter as much as the catches. A check that fires on an
// unenumerated reference, or that finds a count inside the word "money", trains
// whoever reads its output to ignore all of it.
import { describe, expect, it } from 'vitest'
import {
  emptyMechanism, readMechanism, containsCount, countsIn, deliveredItemCount,
  countContractIssues, mechanismPromptLine,
  type ReferenceMechanism, type MechanismScriptBeat,
} from '../referenceMechanism'

const enumerated = (count: number, over: Partial<ReferenceMechanism> = {}): ReferenceMechanism => ({
  ...emptyMechanism(),
  enumeration: { isEnumerated: true, count, unit: 'ways' },
  ...over,
})

/** The run, reduced to the beats that carried the failure. */
const THE_REAL_RUN: MechanismScriptBeat[] = [
  { section: 'Hook', line: 'Most business advice is keeping you broke.' },
  { section: 'Item 1', line: 'The first way is chasing vanity metrics.' },
  { section: 'Item 2', line: 'The second way is hiring before you have proof.' },
  { section: 'B-roll', line: null },
  { section: 'Payoff', line: 'Fix those and the math changes.' },
]

describe('reading the mechanism back', () => {
  it('accepts a count as a number, a numeral string or a word', () => {
    for (const raw of [5, '5', 'five', 'Five']) {
      const m = readMechanism({ enumeration: { is_enumerated: true, count: raw } })
      expect(m.enumeration.count).toBe(5)
      expect(m.enumeration.isEnumerated).toBe(true)
    }
  })

  it('AN ENUMERATION WITHOUT A COUNT IS NOT ONE', () => {
    // The flag and the number have to agree, or the check holds a promise it
    // cannot verify — which is worse than no check, because it reads as verified.
    const m = readMechanism({ enumeration: { is_enumerated: true, count: null } })
    expect(m.enumeration.isEnumerated).toBe(false)
    expect(m.enumeration.count).toBeNull()
  })

  it('refuses counts outside what a short-form list can promise', () => {
    for (const bad of [0, 1, 13, 100, 'many', 'a few', {}, []]) {
      expect(readMechanism({ enumeration: { is_enumerated: true, count: bad } })
        .enumeration.count).toBeNull()
    }
  })

  it('degrades to "not enumerated" rather than inventing a count', () => {
    // A fabricated count would fail every script against a number nobody
    // promised — the same direction `showability` degrades in.
    for (const raw of [null, undefined, 'nonsense', 42, []]) {
      expect(readMechanism(raw).enumeration.isEnumerated).toBe(false)
    }
  })

  it('carries the unit, the hook promise, the re-hook and the beat debts', () => {
    const m = readMechanism({
      enumeration: { is_enumerated: true, count: 3, unit: 'mistakes' },
      hook_promise: 'here are the 3 mistakes',
      rehook_after_item: 2,
      beat_debts: ['open the loop', '', 'pay it off'],
    })
    expect(m.enumeration.unit).toBe('mistakes')
    expect(m.hookPromise).toBe('here are the 3 mistakes')
    expect(m.rehookAfterItem).toBe(2)
    // Empty strings are dropped rather than stored as a debt that says nothing.
    expect(m.beatDebts).toEqual(['open the loop', 'pay it off'])
  })
})

describe('finding a count in text without hallucinating one', () => {
  it('matches a digit or its word', () => {
    expect(containsCount('here are the 5 ways', 5)).toBe(true)
    expect(containsCount('here are the five ways', 5)).toBe(true)
    expect(containsCount('Here Are The FIVE Ways', 5)).toBe(true)
  })

  it('does NOT match a number word inside another word', () => {
    // "money", "gone", "someone" all contain "one". A naive `includes` would
    // report that every hook already carries the count.
    expect(containsCount('this is about money', 1)).toBe(false)
    expect(containsCount('someone told me', 1)).toBe(false)
    expect(containsCount('it is gone', 1)).toBe(false)
  })

  it('does NOT match a digit inside a larger number', () => {
    expect(containsCount('back in 2025', 5)).toBe(false)
    expect(containsCount('a $46 million business', 4)).toBe(false)
    expect(containsCount('1,500 subscribers', 5)).toBe(false)
  })

  it('countsIn reports only plausible list sizes', () => {
    expect(countsIn('the top three pieces of advice')).toEqual([3])
    expect(countsIn('5 ways and 3 mistakes')).toEqual([3, 5])
    // Revenue and years are not list sizes.
    expect(countsIn('a $46 million business in 2025')).toEqual([])
    expect(countsIn(null)).toEqual([])
  })
})

describe('how many items the script actually delivers', () => {
  it('counts the highest ordinal reached, not the beats that carry one', () => {
    // A script saying "first" twice has a different defect from one that stops
    // at two, and conflating them reports the wrong failure.
    expect(deliveredItemCount(THE_REAL_RUN)).toBe(2)
    expect(deliveredItemCount([
      { section: 'a', line: 'the first thing' },
      { section: 'b', line: 'the first thing again' },
    ])).toBe(1)
  })

  it('reads digits used as ordinals', () => {
    expect(deliveredItemCount([
      { section: 'a', line: 'number 1 is pricing' },
      { section: 'b', line: '#2 is positioning' },
      { section: 'c', line: 'number 3 is patience' },
    ])).toBe(3)
  })

  it('ignores silent beats and empty lines', () => {
    expect(deliveredItemCount([{ section: 'b-roll', line: null }, { section: 'x', line: '  ' }]))
      .toBe(0)
  })
})

describe('THE REAL RUN — five promised, and every way it broke', () => {
  const hooks = ['Most business advice is keeping you broke.', 'These exact three pieces.']
  const issues = countContractIssues({
    mechanism: enumerated(5),
    idea: 'the top three pieces of common business advice',
    hooks,
    beats: THE_REAL_RUN,
  })
  const codes = issues.map((i) => i.code)

  it('catches the hook that dropped the number', () => {
    // Not one of the five generated hook options named five. The hook is where
    // the promise is MADE, so this breaks the format before scene 2 exists.
    expect(codes).toContain('hook_drops_count')
    expect(issues.find((i) => i.code === 'hook_drops_count')?.field).toBe('hook_options')
  })

  it('catches the idea that said three where the reference said five', () => {
    expect(codes).toContain('count_disagreement')
    expect(issues.find((i) => i.code === 'count_disagreement')?.detail).toContain('3')
  })

  it('catches the script that promised five and delivered two', () => {
    expect(codes).toContain('undelivered_count')
    expect(issues.find((i) => i.code === 'undelivered_count')?.detail).toContain('delivers 2')
  })

  it('catches the silent beat sitting inside the enumeration', () => {
    // Scene 4 was a silent shot between item 2 and where item 3 should have
    // been. That is precisely how "three" became "two".
    expect(codes).toContain('silent_scene_in_enumeration')
  })

  it('finds all four faults in the one plan', () => {
    expect(new Set(codes).size).toBe(4)
  })
})

describe('the guard rails — what must NOT fire', () => {
  it('says nothing at all about an unenumerated reference', () => {
    // A teardown or a myth-bust owes no number. Inventing a complaint for them
    // would train whoever reads these to ignore all of them.
    expect(countContractIssues({
      mechanism: emptyMechanism(),
      idea: 'the top three pieces of advice',
      hooks: ['no number here'],
      beats: THE_REAL_RUN,
    })).toEqual([])
  })

  it('passes a plan that keeps its promise end to end', () => {
    expect(countContractIssues({
      mechanism: enumerated(3),
      idea: 'the 3 pricing mistakes founders make',
      hooks: ['Here are the 3 pricing mistakes that kept me broke.'],
      beats: [
        { section: 'Hook', line: 'Here are the 3 pricing mistakes that kept me broke.' },
        { section: 'Item 1', line: 'The first is discounting to win.' },
        { section: 'Item 2', line: 'The second is charging for time.' },
        { section: 'Item 3', line: 'The third is never raising prices.' },
        { section: 'CTA', line: 'Fix one this week.' },
      ],
    })).toEqual([])
  })

  it('accepts the count written as a word', () => {
    expect(countContractIssues({
      mechanism: enumerated(3),
      idea: 'the three pricing mistakes founders make',
      hooks: ['Here are the three pricing mistakes.'],
      beats: [
        { section: 'i1', line: 'The first is discounting.' },
        { section: 'i2', line: 'The second is hourly.' },
        { section: 'i3', line: 'The third is never raising.' },
      ],
    })).toEqual([])
  })

  it('allows a silent beat BEFORE the first item and AFTER the last', () => {
    // An opening visual or a closing card breaks nothing — only a gap between
    // two items breaks the run the viewer is counting.
    expect(countContractIssues({
      mechanism: enumerated(2),
      idea: 'the 2 things',
      hooks: ['The 2 things nobody tells you.'],
      beats: [
        { section: 'Cold open', line: null },
        { section: 'i1', line: 'The first is timing.' },
        { section: 'i2', line: 'The second is patience.' },
        { section: 'End card', line: null },
      ],
    })).toEqual([])
  })

  it('checks the RECOMMENDED hook, not whichever option happens to have a number', () => {
    // `normalizeHookLine` writes `hook_options[0]` into the opening beat, so a
    // count sitting in option four is a count nobody says.
    const issues = countContractIssues({
      mechanism: enumerated(4),
      hooks: ['No number in this one.', 'The 4 things nobody tells you.'],
    })
    expect(issues.map((i) => i.code)).toContain('hook_drops_count')
  })

  it('does not complain about artifacts it was not given', () => {
    // A caller checking only the hooks must not be told the script is short.
    expect(countContractIssues({ mechanism: enumerated(5), hooks: ['The 5 ways.'] })).toEqual([])
    expect(countContractIssues({ mechanism: enumerated(5) })).toEqual([])
  })
})

describe('the prompt line is built FROM the record', () => {
  it('names the count, the unit and every rule it has to keep', () => {
    const line = mechanismPromptLine(enumerated(5, { rehookAfterItem: 3 }))
    expect(line).toContain('ENUMERATED LIST OF 5 WAYS')
    expect(line).toContain('MUST say the number 5')
    expect(line).toContain('re-hooks after item 3')
    expect(line).toContain('No silent beat')
  })

  it('is EMPTY for a format that owes no number', () => {
    // Handing a count to an unenumerated reference is the mirror-image failure
    // of dropping one.
    expect(mechanismPromptLine(emptyMechanism())).toBe('')
  })
})
