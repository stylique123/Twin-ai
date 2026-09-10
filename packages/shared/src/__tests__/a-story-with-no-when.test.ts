// A STORY THAT NEVER SAYS WHEN IT HAPPENED.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-09: 276 spoken beats across 62 scripts, and
// ONE carries a time anchor. Every script this system has written is untethered
// in time.
//
// ⚖️ AND THE NARROWNESS IS THE POINT. "Every script must land in time" would
// fire on 98% of them, and a note that fires on 98% of scripts is a nag that
// teaches its reader to skip all the others. Measured fire rate for the rule as
// built: 8 of 62 scripts (13%) — and all eight first-person episodes in
// production lack an anchor, so it is neither hypothetical nor universal.
import { describe, expect, it } from 'vitest'
import {
  momentAnchorNote, hasMomentAnchor, craftContractNotes, type CraftBeat,
} from '../script/craftContracts'

const beat = (section: string, line: string | null): CraftBeat =>
  ({ section, line } as CraftBeat)

// A first-person episode: their voice AND something that happened.
const EPISODE = 'I lost a client because my pricing page said nothing about scope.'
const NO_EPISODE = 'Most people price by the hour and it caps what they can earn.'

describe('it fires only where a moment is owed', () => {
  it('a first-person episode with no anchor is named', () => {
    const note = momentAnchorNote([
      beat('Hook', 'Pricing by the hour is why you are stuck.'),
      beat('Body', EPISODE),
      beat('Payoff', 'Price the outcome instead.'),
    ])
    expect(note).toContain('never says when')
  })

  it('a script with NO episode says nothing at all', () => {
    // ⚠️⚠️ THE LOAD-BEARING ONE, and the reason this rule is worth having. 54
    // of 62 production scripts are in this state. A contract that spoke here
    // would fire on nearly everything and be ignored everywhere.
    expect(momentAnchorNote([
      beat('Hook', 'Pricing by the hour is why you are stuck.'),
      beat('Body', NO_EPISODE),
      beat('Payoff', 'Price the outcome instead.'),
    ])).toBeNull()
  })

  it('an anchored episode passes', () => {
    expect(momentAnchorNote([
      beat('Hook', 'Pricing by the hour is why you are stuck.'),
      beat('Body', `Last March, ${EPISODE}`),
    ])).toBeNull()
  })

  it('the anchor may sit in ANY beat, not the episode beat', () => {
    // ⚖️ A script that opens "Last March" and tells the episode three beats
    // later HAS landed it. Demanding the anchor share a sentence with the verb
    // would fail correct writing.
    //
    // ⚠️⚠️ THIS TEST WAS INCOMPLETE AND A MUTATION PROVED IT. The first draft
    // anchored on "Last March everything about MY pricing CHANGED" — which is
    // itself a first-person episode, so restricting the search to episode beats
    // still passed and the mutation survived. The anchor beat here carries no
    // first-person marker at all, so it can only be found by searching every
    // spoken beat.
    expect(momentAnchorNote([
      beat('Hook', 'Last March the rules on scope creep quietly changed.'),
      beat('Body', 'Nobody sends a memo about that sort of thing.'),
      beat('Body', EPISODE),
    ])).toBeNull()
  })

  it('a silent beat cannot carry the anchor', () => {
    // Absence is not an anchor: a beat with no spoken line says nothing.
    expect(momentAnchorNote([
      beat('Hook', 'Pricing by the hour is why you are stuck.'),
      beat('B-roll', null),
      beat('Body', EPISODE),
    ])).toContain('never says when')
  })
})

describe('what counts as fixing a point in time', () => {
  it('accepts the forms real speech actually uses', () => {
    for (const s of [
      'Last March I raised my rates.',
      'Two years ago I raised my rates.',
      'Back in 2019 I raised my rates.',
      'The other day a client asked.',
      'When I was starting out I charged nothing.',
      'Yesterday I sent the invoice.',
      'The day I opened, nobody came.',
    ]) expect(hasMomentAnchor(s), s).toBe(true)
  })

  it('refuses durations and quantities, which are not moments', () => {
    // ⚠️ THE `six month deal` TRAP, IN A NEW COSTUME. This repo has already
    // shipped a checker that could not tell a DURATION from a PROMISE. "It took
    // three months" says how long, not when — anchoring on it would call an
    // unanchored story anchored.
    for (const s of [
      'It took three months to build.',
      'I charge four hundred dollars.',
      'Give it a week and see.',
      'A six month deal changed nothing.',
    ]) expect(hasMomentAnchor(s), s).toBe(false)
  })

  it('does not match a month name inside another word', () => {
    // "may" is a month AND a modal verb; word boundaries do the work.
    expect(hasMomentAnchor('You may want to raise your rates.')).toBe(true)
    // Documented honestly: the modal "may" is a known false positive of the
    // month list. It is admitted because it can only ever cause the note to be
    // WITHHELD from a script that has an episode — the safe direction — and
    // never to fire one wrongly.
    expect(hasMomentAnchor('Marching through the list is not a plan.')).toBe(false)
  })
})

describe('it joins the aggregate the result screen already renders', () => {
  it('appears in craftContractNotes', () => {
    // ⚖️ NO SURFACE WORK: `craftContractNotes` is already called and rendered at
    // Result.tsx:2054, so a new contract is wired the moment it exists.
    const notes = craftContractNotes([
      beat('Hook', 'Pricing by the hour is why you are stuck.'),
      beat('Body', EPISODE),
      beat('Body', 'And it kept happening on the next three projects.'),
      beat('Payoff', 'Price the outcome instead of the clock.'),
    ])
    expect(notes.some((n) => n.includes('never says when'))).toBe(true)
  })

  it('a non-array script is not a crash', () => {
    expect(craftContractNotes(null as unknown as CraftBeat[])).toEqual([])
  })
})
