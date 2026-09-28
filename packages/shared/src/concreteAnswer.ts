// A FOLLOW-UP ANSWER MUST BE REAL, OR THE WRITER INVENTS ONE (owner's menu
// redesign, Part 4, 2026-09-27).
//
// ⚠️ An empty or vague answer to a product objective's question ("it's great",
// "good quality") gives the writer nothing, so it fills the gap with a
// plausible-sounding detail. Two unrelated reasons agree on the rule: real
// specifics convert better and return less, and an empty field must never be
// silently filled with an invented claim.
//
// ⚖️ CONCRETE IS BROAD ON PURPOSE. Most of these questions ask for a memory
// ("what almost stopped you?"), not a number, so a specific sentence counts:
// a number, a quote, a measurement, a proper name, or a real sentence of
// substance. What never counts is empty, or a stock phrase that could be said
// about anything.

export type Concreteness = 'empty' | 'vague' | 'concrete'

const VAGUE = /^(?:it'?s |they'?re |its )?(?:really |very |super |so )?(?:good|great|amazing|nice|awesome|the best|high[- ]quality|good quality|quality|fine|ok|okay|cool|perfect|beautiful|unique|special)\b[.!]*$|^(?:people love it|everyone loves it|not sure|idk|i don'?t know|n\/?a|none|nothing|no idea|lots of things|everything|many things|a lot)[.!]*$/i
const NUMBER = /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|fifty|hundred|thousand|half|dozen)\b/i
const QUOTE = /["“”][^"“”]{3,}["“”]|\bsaid\b|\btold me\b|\bwrote\b|\basked\b/i
const MEASURE = /\b(?:minutes?|hours?|days?|weeks?|months?|years?|grams?|kg|lbs?|pounds?|ounces?|oz|ml|litres?|liters?|cm|mm|inches?|feet|percent|dollars?|pieces?|times|customers?|orders?|sales|batches?)\b|[$£€%]/i

export function concreteness(text: string | null | undefined): Concreteness {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (t === '') return 'empty'
  if (VAGUE.test(t)) return 'vague'
  const words = t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w))
  // A proper name mid-sentence (not the first word, not "I").
  const named = words.slice(1).some((w) => /^[A-Z][a-z]{2,}/.test(w) && w !== 'I')
  if (NUMBER.test(t) || QUOTE.test(t) || MEASURE.test(t) || named) return 'concrete'
  return words.length >= 15 ? 'concrete' : 'vague'
}

export const CONCRETE_HINT = 'Give one real detail — a number, what someone actually said, or a measurement — and the script will use it.'
