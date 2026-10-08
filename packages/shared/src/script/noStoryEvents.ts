// NO STORY, NO INVENTED EVENT (owner 2026-10-08, trial).
//
// When the request carries no story (no first-person moment in her note and no
// story-kind item supplied to the writer), the writer still narrated a specific
// past event from the topic ("When the city knocked, my heart dropped",
// "He told me I'm doing everything right") in 3-4 of 8 scripts. A sentence that
// narrates a specific past event involving the speaker is removed then.
// Pure; no I/O.

const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|me|my|mine|we|we're|we've|us|our)\b/i
const THIRD_PARTY = /\b(?:someone|somebody|a customer|a regular|a neighbor|a neighbour|a stranger|a guy|a woman|a man|he|she|they|the (?:inspector|city|county|health department|officer|landlord|customer|owner|neighbor|neighbour|regular))\b/i
const ACTS_ON_HER = /\b(?:knocked|showed up|came (?:by|in|over|to)|walked (?:in|up)|told (?:me|us)|said to (?:me|us)|asked (?:me|us|to|if|for)|looked at|checked|inspected|saw|called (?:me|us)|emailed (?:me|us)|messaged (?:me|us)|visited|stopped by)\b/i
const TIME_ANCHOR = /\b(?:today|yesterday|last (?:week|month|year|night|summer|winter|spring|fall|weekend|time)|the other day|this (?:morning|week)|one day|(?:years?|weeks?|days?|months?) ago)\b/i
// Common irregular past forms plus frequent narrative -ed verbs. The subject
// gate (first person, or a third party acting on her) narrows it.
const PAST_VERB = /\b(?:was|were|had|did|went|came|saw|told|said|took|got|made|found|felt|heard|knew|left|ran|gave|thought|bought|sold|began|started|knocked|dropped|asked|looked|checked|showed|walked|called|happened|realized|realised|decided|tried|opened|stopped|visited|inspected|learned|learnt|noticed|wanted|needed|panicked|froze|quit|lost|cried|burned|burnt)\b/i
const HYPOTHETICAL = /^\s*(?:if|when(?:ever)? (?:you|your)|what if|imagine|suppose|say)\b/i
const BELIEF = /\b(?:I|we) (?:believe|think|feel that|know that|always say|guess|bet)\b/i

function splitSentences(line: string): string[] {
  return line.match(/[^.!?]+[.!?]*["')\]]*\s*/g) ?? [line]
}

/** True for a sentence that narrates a specific past event involving the speaker. */
export function narratesEvent(sentence: string): boolean {
  const s = sentence.trim()
  if (!s) return false
  if (/\?\s*["')\]]*$/.test(s)) return false
  if (HYPOTHETICAL.test(s)) return false
  if (BELIEF.test(s)) return false
  const firstPerson = FIRST_PERSON.test(s)
  const actsOnHer = THIRD_PARTY.test(s) && ACTS_ON_HER.test(s)
  if (!firstPerson && !actsOnHer) return false
  return PAST_VERB.test(s) || TIME_ANCHOR.test(s)
}

/**
 * Remove invented-event sentences when no story was supplied. Never leaves
 * fewer than three spoken beats (then nothing changes and would_stub is set);
 * the hook (first beat) keeps its line if removal would empty it.
 */
export function dropInventedEvents<T extends { line?: unknown }>(
  beats: readonly T[],
  opts: { hasStory: boolean },
): { beats: T[]; dropped: number; would_stub: boolean } {
  if (opts.hasStory) return { beats: [...beats], dropped: 0, would_stub: false }
  let dropped = 0
  const out = beats.map((b, i) => {
    if (typeof b.line !== 'string') return b
    const parts = splitSentences(b.line)
    const kept = parts.filter((p) => !narratesEvent(p))
    if (kept.length === parts.length) return b
    const line = kept.join('').trim()
    if (i === 0 && !line) return b
    dropped += parts.length - kept.length
    return { ...b, line }
  })
  if (!dropped) return { beats: [...beats], dropped: 0, would_stub: false }
  const spoken = out.filter((b) => typeof b.line === 'string' && b.line.trim()).length
  if (spoken < 3) return { beats: [...beats], dropped: 0, would_stub: true }
  return { beats: out, dropped, would_stub: false }
}
