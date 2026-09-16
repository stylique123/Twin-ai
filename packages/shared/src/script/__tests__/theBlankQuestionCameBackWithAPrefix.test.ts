// THE SAME BLANK QUESTION, FIVE TIMES, WITH A SENTENCE IN FRONT OF IT.
//
// ⚠️ THE DEFECT THIS CLOSES IS THE 4608dc73 DEFECT, REOPENED BY AN ANCHOR.
// Production generation 4608dc73 showed a creator the identical sentence —
// "Only you can supply this. What would you actually say here?" — on all FIVE
// unanswered beats, while each beat carried its own section and its own
// direction. `GENERIC_ASKS` was extended to catch it, with the pattern
// `/^\s*what would you actually say here\b/i`.
//
// ⚠️ PINNED TO `^`. And `checkEntitlement`, in `claimEntitlement.ts`, emits:
//
//     "Nothing on record supports this beat. What would you actually say here?"
//
// The anchor slid past the prefix, `askIsGeneric` returned false, and
// `askForBeat` kept the sentence verbatim for every section — the same defect
// arriving by the same words through a gap in the guard built to stop it.
//
// ⚖️ AND THE HISTORY FORM IS THE COMMON CASE, not an edge case. A `history`
// claim is the most frequent entitlement failure there is, and every one of
// them was answered with "This beat only works as something you have personally
// done. What is your real example?" — verbatim, overriding each section's own
// question. It names no moment, no object and no number, which is this list's
// entire definition of generic.
import { describe, expect, it } from 'vitest'
import { askIsGeneric, askForBeat } from '../beatAsk'
import { checkEntitlement } from '../../claimEntitlement'
import type { KnowledgeItem } from '../../creatorKnowledge'

/** ⚖️ LIFTED FROM THE EMITTER, NOT RETYPED. Retyping the sentence here would
 *  let `claimEntitlement` reword it and quietly escape the list again, which is
 *  exactly how the anchored pattern survived. */
const item = (kind: string, basis: string): KnowledgeItem =>
  ({ kind, basis, text: 'something' } as unknown as KnowledgeItem)

const NOTHING_ON_RECORD = checkEntitlement('Wired is better for the money.', []).ask
const HISTORY_ASK = checkEntitlement(
  'those high-end, wired earbuds I used to swear by',
  [item('covered', 'demonstrated')],
).ask

const SECTIONS = ['Setup', 'Inciting Incident', 'False Resolution', 'Re-hook', 'Proof', 'Lesson']

describe('every sentence the entitlement check can emit is recognised as generic', () => {
  it('emits both of them at all, so this test is not asserting over nulls', () => {
    expect(NOTHING_ON_RECORD, 'the nothing-on-record ask disappeared from claimEntitlement').toBeTruthy()
    expect(HISTORY_ASK, 'the history ask disappeared from claimEntitlement').toBeTruthy()
  })

  it('catches the nothing-on-record ask DESPITE its leading sentence', () => {
    expect(askIsGeneric(NOTHING_ON_RECORD)).toBe(true)
  })

  it('catches the history ask, which is the most common one', () => {
    expect(askIsGeneric(HISTORY_ASK)).toBe(true)
  })
})

describe('so five beats get five questions again', () => {
  for (const canned of [NOTHING_ON_RECORD, HISTORY_ASK]) {
    it(`derives a distinct question per section instead of repeating "${String(canned).slice(0, 34)}…"`, () => {
      const asks = SECTIONS.map((s) => askForBeat(s, canned))
      expect(new Set(asks).size, `repeated: ${JSON.stringify(asks)}`).toBe(SECTIONS.length)
      for (const a of asks) expect(a).not.toBe(canned)
    })
  }

  it('still keeps a question the writer actually thought about', () => {
    // ⚠️ THE COST OF UNANCHORING, CHECKED RATHER THAN ASSUMED. Widening a
    // generic-detector can start discarding real writing, and a derived section
    // question is WORSE than a specific one — it is only better than a blank.
    const real = 'Which of the three chargers did you end up keeping on your desk?'
    expect(askIsGeneric(real)).toBe(false)
    expect(askForBeat('Inciting Incident', real)).toBe(real)
  })

  it('does not fire on a question that merely contains the word example', () => {
    const real = 'What is the one example of this your audience always asks you about?'
    expect(askIsGeneric(real)).toBe(false)
    expect(askForBeat('Proof', real)).toBe(real)
  })
})
