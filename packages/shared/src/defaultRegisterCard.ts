/**
 * THE FLOOR BELOW THE FLOOR — VOICE CAUSE 1(a).
 *
 * ⚠️ THE VOICE EVIDENCE CLIFF. `styleRules` (measured, from real speech) and
 * `voiceSamples` (verbatim, pasted by the creator) both render nothing below
 * their own thresholds — correctly, since asserting a voice from three
 * sentences is worse than saying nothing. But "nothing" is not neutral: a
 * writer given zero cadence guidance defaults to generic long-form prose,
 * which is a WORSE floor than a labeled genre default would be.
 *
 * ⚖️ HONESTLY LABELED, NEVER PRESENTED AS THEIRS. This is short-form register
 * — how the genre reads, not how this creator sounds. Every line says so.
 * Rendered ONLY when there is truly nothing else: both `styleRules` and
 * `voiceSamples` are empty. The moment either has real evidence, this card
 * must not appear — genre default is a fallback, never a competing signal.
 *
 * ⚠️ AND IT USED TO HAND THE SMALLEST CREATORS A VOICE ONLY THE BIGGEST CAN
 * CARRY. This card said "open on a CLAIM", "speak straight to the viewer as
 * you", and "no hedging — say the thing". Together those three produce the
 * second-person diagnosis that runs through every audited script: "You stay
 * poor even though you work all day." "You refuse to fire the people who
 * suck." "You're chasing shiny objects."
 *
 * That register works for the reference creators it was learned from because
 * they have public receipts — the tone is cashing authority already banked.
 * Delivered by someone with no track record it does not read as authoritative,
 * it reads as arrogant, and the comments say so.
 *
 * ⚠️ AND THE GATE POINTED THE WRONG WAY. This card renders ONLY when a creator
 * has NO captured voice evidence — so the product was issuing the borrowed
 * authority voice EXCLUSIVELY to the creators least able to carry it, and
 * withholding it from the established ones who could. Precisely inverted.
 *
 * ⚖️ THE FIX IS NOT A SOFTER VOICE. Short sentences, contractions, direct
 * address and no padding are short-form CRAFT and all stay. What changes is
 * WHERE THE CLAIM SITS: the same idea, moved from a diagnosis of the viewer to
 * something the creator lived. "I stayed poor while working all day" needs no
 * track record — it IS the evidence — and it is a stronger sentence than "you
 * are getting this wrong", not a weaker one.
 *
 * ⚖️ NO FOLLOWER COUNT IS INVOLVED, DELIBERATELY. Creator size looks like the
 * natural gate and is the wrong one: only 13 of 43 production voices carry a
 * follower count at all, so a size-keyed rule would be inert for 70% of them,
 * and its failure mode is the dangerous direction — absent would read as
 * "small". Absence of evidence is exactly what this card already keys on, and
 * it is available for every creator.
 */

export function renderDefaultRegisterCard(): string {
  return `SHORT-FORM REGISTER (GENERIC DEFAULT — NOT MEASURED FROM THIS CREATOR, NOTHING OF THEIRS HAS BEEN CAPTURED YET). Write to this until real evidence exists:
- Short sentences. Most under 12 words. One idea each.
- Speak straight to the viewer as "you" — this is a conversation, not a report.
- Contractions throughout ("don't", "it's", "you're") — written speech reads stiff without them.
- Open on something concrete, never a scene-setting preamble.
- ⚠️ THIS CREATOR HAS SHOWN NO TRACK RECORD YET, SO THE SCRIPT MAY NOT SPEND ONE. Do not diagnose the viewer's life or character — no "you stay poor even though you work all day", no "you refuse to fire the people who suck", no "you're chasing shiny objects". That register reads as authority, and it only lands from someone whose results the audience already knows. From everyone else it reads as arrogance, and the comments say so.
- SAME IDEA, OWNED INSTEAD OF BORROWED. Put the claim where the creator can actually stand behind it: "I stayed poor while working all day", "nobody told me this", "here is what I got wrong". First person about their own experience needs no track record — it IS the evidence. A question to the viewer works too. An accusation does not.
- Say the thing plainly: no padding ("I think", "maybe", "sort of", "in my opinion"). Owning a claim in the first person is not padding — "I got this wrong for two years" is a stronger sentence than "you are getting this wrong", not a weaker one.`
}
