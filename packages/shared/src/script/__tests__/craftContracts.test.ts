import { describe, expect, it } from 'vitest'
import {
  craftContractNotes,
  specificityFloorNote,
  callbackTokenNote,
  payoffMustAddNote,
  escalationDependencyNote,
  rhythmBreakNote,
  type CraftBeat,
} from '../craftContracts'

const beat = (section: string, line: string): CraftBeat => ({ section, line })

describe('1. specificity floor', () => {
  it('fires when three or more body beats carry no number, name or amount', () => {
    const note = specificityFloorNote([
      beat('Hook', 'Most people get this wrong.'),
      beat('Body 1', 'You have to think about the whole thing differently.'),
      beat('Body 2', 'It comes down to what you are willing to change.'),
      beat('Body 3', 'And that is really the whole idea here.'),
    ])
    expect(note).toMatch(/3 body beats/)
  })

  it('stays quiet when one body beat carries a number', () => {
    expect(specificityFloorNote([
      beat('Body 1', 'You have to think about the whole thing differently.'),
      beat('Body 2', 'It cost me 400 pounds to find that out.'),
      beat('Body 3', 'And that is really the whole idea here.'),
    ])).toBeNull()
  })

  it('stays quiet when one body beat carries a mid-sentence proper noun', () => {
    expect(specificityFloorNote([
      beat('Body 1', 'You have to think about the whole thing differently.'),
      beat('Body 2', 'My client Priya said the same thing to me.'),
      beat('Body 3', 'And that is really the whole idea here.'),
    ])).toBeNull()
  })

  // ⚠️ THE FALSE POSITIVE THIS EXISTS TO PREVENT: every sentence opens with a
  // capital, so a sentence-initial one must not read as a name.
  it('does not count a sentence-initial capital as a particular', () => {
    expect(specificityFloorNote([
      beat('Body 1', 'Nobody tells you this. They should.'),
      beat('Body 2', 'You will find out anyway. Later.'),
      beat('Body 3', 'That is the whole thing. Really.'),
    ])).not.toBeNull()
  })

  it('is silent on a body too short to judge', () => {
    expect(specificityFloorNote([
      beat('Body 1', 'You have to think about it differently.'),
      beat('Body 2', 'That is the whole idea.'),
    ])).toBeNull()
  })

  it('does not judge the hook or the CTA by the body standard', () => {
    // The only vague-and-nameless beats here are hook and CTA; body is fine.
    expect(specificityFloorNote([
      beat('Hook', 'Most people get this wrong.'),
      beat('Body 1', 'It cost 400 pounds.'),
      beat('Body 2', 'It cost 400 pounds again.'),
      beat('Body 3', 'It cost 400 pounds a third time.'),
      beat('CTA', 'Follow for more of this.'),
    ])).toBeNull()
  })
})

describe('2. callback token', () => {
  it('fires when no later beat reuses a hook word', () => {
    expect(callbackTokenNote([
      beat('Hook', 'I lost a client over a spreadsheet.'),
      beat('Body 1', 'Everything about pricing changed after that.'),
      beat('Body 2', 'Charge for the outcome instead.'),
    ])).toMatch(/comes back to the hook/)
  })

  it('stays quiet when a later beat returns to the hook', () => {
    expect(callbackTokenNote([
      beat('Hook', 'I lost a client over a spreadsheet.'),
      beat('Body 1', 'Everything about pricing changed after that.'),
      beat('Body 2', 'That client came back nine months later.'),
    ])).toBeNull()
  })

  it('is silent when there is no hook beat', () => {
    expect(callbackTokenNote([
      beat('Body 1', 'One thing about pricing.'),
      beat('Body 2', 'Another thing entirely.'),
    ])).toBeNull()
  })

  // ⚖️ A silent beat is not a beat that failed to call back.
  it('does not count silent beats as later beats', () => {
    expect(callbackTokenNote([
      beat('Hook', 'I lost a client over a spreadsheet.'),
      beat('Body 1', '[No spoken audio]'),
      beat('Body 2', 'Charge for the outcome instead.'),
    ])).toBeNull()
  })
})

describe('3. payoff must add', () => {
  it('fires when the payoff adds no word the hook did not have', () => {
    expect(payoffMustAddNote([
      beat('Hook', 'Nobody buys from a confusing price list.'),
      beat('Body 1', 'I rewrote mine over a weekend.'),
      beat('Payoff', 'A confusing price list: nobody buys.'),
    ])).toMatch(/only says the hook again/)
  })

  it('stays quiet when the payoff introduces something new', () => {
    expect(payoffMustAddNote([
      beat('Hook', 'Nobody buys from a confusing price list.'),
      beat('Body 1', 'I rewrote mine over a weekend.'),
      beat('Payoff', 'One line, one number, and orders doubled.'),
    ])).toBeNull()
  })

  it('uses the last non-CTA beat when no beat is named payoff', () => {
    expect(payoffMustAddNote([
      beat('Hook', 'Nobody buys from a confusing price list.'),
      beat('Body 1', 'A confusing price list: nobody buys.'),
      beat('CTA', 'Follow for the rest of it.'),
    ])).toMatch(/only says the hook again/)
  })
})

describe('4. escalation dependency', () => {
  it('fires when no body beat depends on the one before it', () => {
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', 'Write contracts nobody has to read twice.'),
      beat('Body 3', 'Take August off entirely.'),
    ])).toMatch(/would play the same in any order/)
  })

  it('stays quiet when one beat uses a connective', () => {
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', 'So the contract writes itself later.'),
      beat('Body 3', 'Take August off entirely.'),
    ])).toBeNull()
  })

  it('stays quiet when one beat picks up the previous beat subject', () => {
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront for every project.'),
      beat('Body 2', 'Every project then pays for itself.'),
      beat('Body 3', 'Take August off entirely.'),
    ])).toBeNull()
  })

  it('is silent on a body too short to judge', () => {
    expect(escalationDependencyNote([
      beat('Body 1', 'Charge upfront.'),
      beat('Body 2', 'Take August off.'),
    ])).toBeNull()
  })
})

describe('5. rhythm break', () => {
  it('fires when every beat is within a few words of the others', () => {
    expect(rhythmBreakNote([
      beat('Hook', 'One two three four five six seven'),
      beat('Body 1', 'One two three four five six seven eight'),
      beat('Body 2', 'One two three four five six'),
      beat('CTA', 'One two three four five six seven'),
    ])).toMatch(/6–8 words/)
  })

  it('stays quiet when one beat is much shorter', () => {
    expect(rhythmBreakNote([
      beat('Hook', 'One two three four five six seven'),
      beat('Body 1', 'One two three four five six seven eight'),
      beat('Body 2', 'Stop.'),
      beat('CTA', 'One two three four five six seven'),
    ])).toBeNull()
  })

  it('is silent under four spoken beats', () => {
    expect(rhythmBreakNote([
      beat('Hook', 'One two three four five'),
      beat('Body 1', 'One two three four five'),
      beat('CTA', 'One two three four five'),
    ])).toBeNull()
  })
})

describe('craftContractNotes', () => {
  it('returns nothing for a script that holds all five contracts', () => {
    expect(craftContractNotes([
      beat('Hook', 'I lost a 400 pound client over one spreadsheet.'),
      beat('Body 1', 'The spreadsheet had eleven prices on it, so nobody could choose.'),
      beat('Body 2', 'Cut it down to three.'),
      beat('Body 3', 'Now there are three prices and my client Priya picked one in a minute.'),
      beat('Payoff', 'Fewer choices, faster yes, more revenue every single month.'),
      beat('CTA', 'Follow if you price things.'),
    ])).toEqual([])
  })

  it('collects every note that fires, in fix order', () => {
    const notes = craftContractNotes([
      beat('Hook', 'Nobody tells you the truth here'),
      beat('Body 1', 'You have to work it out for yourself'),
      beat('Body 2', 'It takes a while to work out'),
      beat('Body 3', 'Then one day it just makes sense'),
    ])
    expect(notes.length).toBeGreaterThan(1)
    expect(notes[0]).toMatch(/body beats is specific/)
  })

  it('survives a script that is not an array', () => {
    expect(craftContractNotes(undefined as unknown as CraftBeat[])).toEqual([])
  })
})
