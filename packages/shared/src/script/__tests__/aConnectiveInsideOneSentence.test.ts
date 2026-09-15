// A CONNECTIVE INSIDE ONE SENTENCE IS NOT A DEPENDENCY BETWEEN TWO BEATS.
//
// ⚠️ MEASURED ON A REAL SCRIPT, @woodsyleather, 2026-09-15. Scene 2 read:
// "Most factory covers split because cheap bonded leather falls apart, but
// everyday crafters often use fold overs." The creator's own words: 'The "but"
// connects two unrelated statements. It reads as a sentence assembled from two
// facts rather than written.'
//
// ⚖️ `escalationDependencyNote` SAW THAT SENTENCE AND STAYED SILENT, because it
// searched for a connective ANYWHERE in the line and found two. Neither points
// at the beat before it. This is the guard's own recorded failure mode in a new
// place: counting a mention as a call.
//
// ⚠️ THESE TESTS FAIL ON THE PRE-FIX GUARD. That is the point — the fix makes
// the check catch MORE, and a test that passed either way would prove nothing.
import { describe, expect, it } from 'vitest'
import { escalationDependencyNote, type CraftBeat } from '../craftContracts'

// ⚠️ NO CAST. `CraftBeat` is `{ section?, line? }`, so a plain object satisfies
// it structurally — and a cast here would defeat the compiler on the one thing
// these fixtures have to get right, which is being real beats.
const beat = (section: string, line: string): CraftBeat => ({ section, line })

describe('a connective inside one sentence is not a dependency', () => {
  it('fires on the measured production sentence, which carries TWO connectives', () => {
    // Neither `because` nor `but` links this to the beat before it.
    const note = escalationDependencyNote([
      beat('Body 1', 'A rebind starts by cutting the old glued spine away.'),
      beat('Body 2', 'Most factory covers split because cheap bonded leather falls apart, '
        + 'but everyday crafters often use fold overs.'),
      beat('Body 3', 'Tokonole burnishes a clean-cut goatskin edge.'),
    ])
    expect(note).toMatch(/would play the same in any order/)
  })

  it('still stays quiet when a beat OPENS with a connective', () => {
    // This is the case the contract exists to allow, and it must keep passing.
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', 'So the contract writes itself later.'),
      beat('Body 3', 'Take August off entirely.'),
    ])).toBeNull()
  })

  it('accepts a leading connective behind punctuation or capitals', () => {
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', '"But that is not the whole story here."'),
      beat('Body 3', 'Take August off entirely.'),
    ])).toBeNull()
  })

  it('does NOT accept a buried `because` as a dependency', () => {
    const note = escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', 'Invoices get paid because clients respect a deposit.'),
      beat('Body 3', 'Take August off entirely.'),
    ])
    expect(note).toMatch(/would play the same in any order/)
  })

  it('does NOT accept a buried `but` joining two unrelated facts', () => {
    const note = escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', 'Deposits are normal, but summer is quiet anyway.'),
      beat('Body 3', 'Take August off entirely.'),
    ])
    expect(note).toMatch(/would play the same in any order/)
  })

  // ⚖️ THE SAFETY VALVE. Tightening the connective rule must not make the note
  // fire on a real sequence that carries its subject forward instead of using a
  // connective — otherwise this fix trades one wrong answer for another.
  it('stays quiet when a beat carries the previous subject forward, connective or not', () => {
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', 'Every project then pays for itself.'),
      beat('Body 3', 'Take August off entirely.'),
    ])).toBeNull()
  })

  it('is still silent on a body too short to judge', () => {
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront.'),
      beat('Body 2', 'Take August off.'),
    ])).toBeNull()
  })
})
