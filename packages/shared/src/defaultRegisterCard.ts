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
 */

export function renderDefaultRegisterCard(): string {
  return `SHORT-FORM REGISTER (GENERIC DEFAULT — NOT MEASURED FROM THIS CREATOR, NOTHING OF THEIRS HAS BEEN CAPTURED YET). Write to this until real evidence exists:
- Short sentences. Most under 12 words. One idea each.
- Speak straight to the viewer as "you" — this is a conversation, not a report.
- Contractions throughout ("don't", "it's", "you're") — written speech reads stiff without them.
- Open on a claim or a direct address, never a scene-setting preamble.
- No hedging language ("I think", "maybe", "sort of") — say the thing.`
}
