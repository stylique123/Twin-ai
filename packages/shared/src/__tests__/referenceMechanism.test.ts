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
  countContractIssues, mechanismPromptLine, blueprintCountIssues, breaksOnCamera, isContentlessUnit, promisesNothingInParticular,
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

  it('ACCEPTS THE STRING "true", WHICH IS WHAT THE GENERATOR ACTUALLY SENDS', () => {
    // ⚠️ `generate-blueprint`'s schema types every mechanism field as STRING and
    // its prompt asks for "true" in quotes. Reading only the boolean made this
    // false on every real generation, silently withholding the count contract
    // from exactly the plans it was written for. No test had ever fed this
    // function the generator's own output shape.
    for (const raw of ['true', 'TRUE', ' true ']) {
      expect(readMechanism({ enumeration: { is_enumerated: raw, count: '5' } })
        .enumeration.isEnumerated).toBe(true)
    }
  })

  it('still refuses anything that is not an explicit true', () => {
    for (const raw of ['false', 'maybe', '', 1, {}, null, undefined]) {
      expect(readMechanism({ enumeration: { is_enumerated: raw, count: '5' } })
        .enumeration.isEnumerated).toBe(false)
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

  // Wave 3 FIX 6. A run-a/run-c-shaped script ("Number one, you are not
  // promoting enough... Number two...") delivered every promised item but the
  // checker reported zero: the digit regex above requires `\d` and never
  // matched the spelled-out word after "number", so a script that counted
  // this way looked undelivered even though a viewer heard all three.
  it('reads the number word spelled out after "number" ("Number one", "number two")', () => {
    expect(deliveredItemCount([
      { section: 'Reason 1', line: 'Number one, you are not promoting enough.' },
      { section: 'Reason 2', line: 'Number two, your product stopped improving.' },
      { section: 'Reason 3', line: 'Number three, you hire soft pansies.' },
    ])).toBe(3)
  })

  it('still reads ordinal words ("first", "second", "third") — unaffected by the word-number fix', () => {
    expect(deliveredItemCount([
      { section: 'Mistake 1', line: 'The first mistake is quitting the moment something feels hard.' },
      { section: 'Mistake 2', line: 'Second, you measure the actual cost of not doing it.' },
      { section: 'Mistake 3', line: 'And the third mistake is treating every new idea as evidence.' },
    ])).toBe(3)
  })

  it('does not over-count a single non-enumerating ordinal ("This is the first time I...")', () => {
    // One "first" with no "second"/"third" following it is not a list — the
    // highest ordinal reached is 1, same as it would be for a genuine
    // one-item list, which is the correct, unambiguous answer for this
    // function: it reports the highest ordinal reached, and leaves "is this
    // actually a list" to the caller that has the promised count to compare
    // against (`countContractIssues`, which only fires when the reference
    // itself is enumerated).
    expect(deliveredItemCount([
      { section: 'Hook', line: 'This is the first time I have ever tried this.' },
    ])).toBe(1)
  })

  it('mixes digit-word and ordinal-word forms without double counting past the highest', () => {
    expect(deliveredItemCount([
      { section: 'a', line: 'Number one is pricing.' },
      { section: 'b', line: 'The second mistake is positioning.' },
      { section: 'c', line: 'Number three is patience.' },
    ])).toBe(3)
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

// THE WIRING, WHICH WAS THE ONE PART NOTHING TESTED.
//
// ⚠️ `blueprintCountIssues` and `breaksOnCamera` had zero test imports, while
// being the two functions with production callers. Everything below them was
// tested thoroughly and the adapter on top was not — so the module's own
// warning about the `creative_transfer_plans` trap (a careful validator that
// nothing calls) had been half re-earned: the call existed, and nothing checked
// that it read a real blueprint correctly. Deleting the `is_enumerated` guard
// or half of `breaksOnCamera` left the whole suite green.
describe('blueprintCountIssues reads the shape the generator actually emits', () => {
  // The §5d run: the idea says three, the hook drops the number, the script
  // reaches two and stops.
  const THE_REAL_RUN = {
    reference_read: { mechanism: { enumeration: { is_enumerated: 'true', count: '3', unit: 'pieces of advice' } } },
    concept: { premise: 'the three pieces of business advice keeping you broke' },
    hook_options: ['Most business advice is keeping you broke.'],
    script: [
      { section: 'Hook', line: 'Most business advice is keeping you broke.' },
      { section: 'Item 1', line: 'The first one is "follow your passion".' },
      { section: 'Item 2', line: 'The second is "hustle harder".' },
      { section: 'CTA', line: 'Which one got you?' },
    ],
  }

  it('catches the count the audience never hears', () => {
    const codes = blueprintCountIssues(THE_REAL_RUN).map((i) => i.code)
    expect(codes).toContain('undelivered_count')
    expect(codes).toContain('hook_drops_count')
  })

  it('is silent on a plan that pays its promise', () => {
    expect(blueprintCountIssues({
      ...THE_REAL_RUN,
      hook_options: ['Here are the 3 pieces of business advice keeping you broke.'],
      script: [
        { section: 'Hook', line: 'Here are the 3 pieces of business advice keeping you broke.' },
        { section: 'One', line: 'The first one is "follow your passion".' },
        { section: 'Two', line: 'The second is "hustle harder".' },
        { section: 'Three', line: 'And the third is "never take a salary".' },
      ],
    })).toEqual([])
  })

  it('withholds the check rather than inventing one', () => {
    // A blueprint from before the mechanism existed owes no number, and must not
    // be failed against one nobody promised.
    expect(blueprintCountIssues(null)).toEqual([])
    expect(blueprintCountIssues(undefined)).toEqual([])
    expect(blueprintCountIssues({ concept: { premise: 'three ways to save' }, script: [] })).toEqual([])
  })
})

describe('breaksOnCamera separates what the creator can still fix', () => {
  const issue = (code: 'undelivered_count' | 'silent_scene_in_enumeration' | 'hook_drops_count' | 'count_disagreement') =>
    ({ code, field: 'script' as const, detail: 'x' })

  it('is true for the two that reach the camera', () => {
    // Both, separately — testing only the first left the second unguarded.
    expect(breaksOnCamera([issue('undelivered_count')])).toBe(true)
    expect(breaksOnCamera([issue('silent_scene_in_enumeration')])).toBe(true)
  })

  it('is false for the two that are fixable by editing text first', () => {
    expect(breaksOnCamera([issue('hook_drops_count')])).toBe(false)
    expect(breaksOnCamera([issue('count_disagreement')])).toBe(false)
    expect(breaksOnCamera([])).toBe(false)
  })
})

describe('the unit is content — the cross-paired run’s weakest transfer', () => {
  it('flags the units that named nothing', () => {
    // "3 critical items that business owners need to implement" — the tech
    // reference's noun, carried into a business creator's video.
    for (const u of ['items', 'Items', ' things ', 'stuff', 'points']) {
      expect(isContentlessUnit(u)).toBe(true)
    }
  })

  it('leaves real categories alone', () => {
    // The two cases that re-derived correctly, plus the near-misses that must
    // not be swept up: these are genuine promises, not filler.
    for (const u of ['mistakes', 'ways', 'tips', 'signs', 'habits', 'things I stopped buying']) {
      expect(isContentlessUnit(u)).toBe(false)
    }
  })

  it('an ABSENT unit is not a contentless one', () => {
    // Unstated and empty are different facts, and only a stated unit can be
    // judged. Reporting silence as a defect is the mirror of inventing a count.
    for (const u of [null, undefined, '', '   ']) expect(isContentlessUnit(u)).toBe(false)
  })
})

describe('a count the WRITER invented is still a promise', () => {
  // ⚠️ FOUND IN A 36-RUN MATRIX. The contract gated entirely on the REFERENCE
  // being enumerated, so a plan whose mechanism read said `is_enumerated: false`
  // and whose hook then said "these are the 4 common mistakes" was checked by
  // nothing. That run delivered all four, so it cost nothing — and it would have
  // been just as silent had it delivered two.
  const selfEnumerated = (lines: string[]) => ({
    reference_read: { mechanism: { enumeration: { is_enumerated: 'false', count: '', unit: '' } } },
    concept: { premise: 'common mistakes people make with AI tools' },
    hook_options: ['These are the 4 common mistakes I see people making.'],
    script: [{ section: 'Hook', line: 'These are the 4 common mistakes I see people making.' },
      ...lines.map((l, i) => ({ section: `Item ${i + 1}`, line: l }))],
  })

  it('catches a self-promised 4 that delivers 2', () => {
    const codes = blueprintCountIssues(selfEnumerated([
      'The first mistake is not testing them.',
      'The second mistake is only looking for free tools.',
    ])).map((i) => i.code)
    expect(codes).toContain('undelivered_count')
  })

  it('is silent when the self-promise is paid', () => {
    expect(blueprintCountIssues(selfEnumerated([
      'The first mistake is not testing them.',
      'The second mistake is only looking for free tools.',
      'The third mistake is ignoring your workflow.',
      'And the fourth mistake is chasing every shiny object.',
    ]))).toEqual([])
  })

  it('does NOT invent a contract from an ambiguous hook', () => {
    // Two numbers is not a promise anyone tracked, and holding a script to a
    // guess about which one counted would fail good plans.
    const bp = selfEnumerated(['one thing'])
    bp.hook_options = ['I tried 3 tools and made 5 mistakes.']
    expect(blueprintCountIssues(bp)).toEqual([])
  })

  it('still says nothing about a plan with no hook at all', () => {
    const bp = selfEnumerated(['one thing'])
    bp.hook_options = []
    expect(blueprintCountIssues(bp)).toEqual([])
  })
})

describe('a count attached to a noun that names nothing', () => {
  it('catches the hooks that actually shipped — the noun is TERMINAL', () => {
    // Simon produced this shape at all three fidelities, so it is not a stray
    // sample. Nothing follows the noun; the hook promises a number and no more.
    for (const h of [
      "You don't need money or a mentor to start a business, you just need these 3 things.",
      'Want to start a business but think you need money? You actually only need 3 things!',
      'Here is what nobody tells you about the first 5 things.',
    ]) expect(promisesNothingInParticular(h)).toBe(true)
  })

  it('LEAVES A QUALIFIED PROMISE ALONE — including the reference this began with', () => {
    // ⚠️ The first version of this check condemned "Three things I stopped
    // buying after I turned 30", which is the reference the whole Creator
    // Knowledge design was built around and a promise anyone can want. The word
    // "things" is not the defect; an unqualified count is.
    for (const h of [
      'Three things I stopped buying after I turned 30.',
      'Here are 3 things that look totally boring now, but will redefine computing.',
      'Here are 3 items you absolutely need to get your first customers.',
      'Here are the 3 pieces of business advice keeping you broke.',
      'These are the 4 common mistakes I see people making.',
    ]) expect(promisesNothingInParticular(h)).toBe(false)
  })

  it('does not fire on a number that is not a count of anything', () => {
    expect(promisesNothingInParticular('I built a $46 million thing')).toBe(false)
    expect(promisesNothingInParticular('back in 2025 things were different')).toBe(false)
    for (const bad of [null, undefined, 42, {}, '']) {
      expect(promisesNothingInParticular(bad)).toBe(false)
    }
  })
})
