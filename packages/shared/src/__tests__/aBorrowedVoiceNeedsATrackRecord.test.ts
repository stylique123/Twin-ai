// THE SMALLEST CREATORS WERE HANDED A VOICE ONLY THE BIGGEST CAN CARRY.
//
// ⚠️ THE GATE POINTED THE WRONG WAY. `renderDefaultRegisterCard` fires ONLY when
// a creator has no captured voice evidence at all — no style rules, no voice
// samples. So the instructions below reached the NEWEST creators exclusively,
// and never the established ones. Whatever this card says, it says to the
// people with the least standing to say it.
//
// ⚠️ AND IT SAID: "open on a CLAIM", "speak straight to the viewer as you",
// "no hedging — say the thing". Those three together produce the second-person
// diagnosis running through every audited script — "You stay poor even though
// you work all day", "You refuse to fire the people who suck", "You're chasing
// shiny objects". That register works for the reference creators it was learned
// from because their results are public; the tone is cashing authority already
// banked. From a creator with no track record it reads as arrogance.
//
// ⚖️ THESE ASSERT THE PROPERTY, NOT THE PROSE. The card is written to be edited,
// so pinning its exact wording would fail on every legitimate rewrite and be
// deleted. What must survive any rewrite: the craft rules stay, and the card
// never again tells an unproven creator to diagnose the viewer.
import { describe, it, expect } from 'vitest'
import { renderDefaultRegisterCard } from '../defaultRegisterCard'

const card = renderDefaultRegisterCard()

describe('a register card issued to creators with no evidence', () => {
  it('still teaches short-form craft — the half that was never the problem', () => {
    // ⚖️ THE FIX IS NOT A SOFTER VOICE. Short sentences, contractions and no
    // preamble are craft and are the reason this card exists at all: a writer
    // given nothing defaults to generic long-form prose, which is worse. A
    // future edit that removes the borrowed authority AND the craft has thrown
    // out the floor along with the defect.
    expect(card).toMatch(/short sentences/i)
    expect(card).toMatch(/contractions/i)
    expect(card).toMatch(/preamble/i)
    expect(card).toMatch(/12 words/)
  })

  it('does not tell an unproven creator to open on a claim', () => {
    // "Open on a claim" is the single instruction that turns direct address
    // into diagnosis. Direct address itself is fine and stays.
    expect(card).not.toMatch(/open on a claim/i)
  })

  it('names the accusation pattern as forbidden, in the model\'s own terms', () => {
    // ⚠️ SHOWN, NOT DESCRIBED. A rule that says "avoid an accusatory register"
    // is read as a style preference. The measured lines are quoted so the model
    // has the actual shape to refuse.
    expect(card).toMatch(/do not diagnose the viewer/i)
    expect(card).toMatch(/stay poor/i)
  })

  it('routes the same idea into something the creator can stand behind', () => {
    // ⚖️ THE IDEA IS NOT DROPPED, IT MOVES. Refusing the accusation without
    // offering the owned version would just make the script vaguer, which is a
    // different way to be worse.
    expect(card).toMatch(/first person/i)
    expect(card).toMatch(/I stayed poor|I got wrong|what I got wrong/i)
  })

  it('does not let "no hedging" push the writer back into unearned assertion', () => {
    // The old rule was "no hedging language — say the thing", which reads as a
    // push toward flat assertion. Padding is still banned; OWNING a claim in
    // the first person must be explicitly distinguished from padding, or the
    // two rules contradict each other and the stronger-sounding one wins.
    expect(card).toMatch(/not padding|is not padding/i)
  })
})
