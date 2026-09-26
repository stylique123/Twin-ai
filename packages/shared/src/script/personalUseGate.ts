// THE PERSONAL-USE GATE — a hard check after the writer, not an instruction.
//
// ⚠️ CONFIRMED FAILURE (owner's master fix doc, 2026-09-26, §2.2): a script
// gave a first-person personal endorsement of an AFFILIATE product whose
// `personal_use` was not confirmed. The prompt already forbids it; the model
// sometimes writes it anyway, and a confirmation screen gets clicked through.
// So the rule is enforced on the finished script: a beat that claims the
// creator USES, BOUGHT, LOVES or GOT A RESULT FROM the product, when she has
// not confirmed personal use, never reaches her teleprompter.
//
// Pure. The edge function asks the model to rewrite the flagged beats in the
// third person (maker-attributed), re-checks them, and drops any sentence
// that still claims use. A beat left empty fails the generation.

/** First-person claims of using, owning, buying, loving or benefiting from
 *  the thing. Deliberately about the CREATOR'S experience — "I think", "I
 *  made this video", "I'll show you" are narration and never match. */
const PERSONAL_USE = [
  /\bI(?:'ve| have|'m| am)?\s+(?:use|used|been using|using|wear|wore|been wearing|tried|test(?:ed)?|swear by|rely on)\b/i,
  /\bI(?:'ve| have)?\s+(?:bought|purchased|ordered|paid for|picked up|owned|own)\b/i,
  /\bI\s+(?:love|adore|am obsessed with|can'?t live without|recommend)\s+(?:it|this|these|them|my|the)\b/i,
  /\b(?:in my experience|I'?ve found|for me,? (?:it|this|that)|(?:saved|changed|fixed|transformed|helped)\s+(?:me|my))\b/i,
  /\bmy (?:favou?rite|go-to|holy grail|daily)\b/i,
  /\bwhen I (?:tried|used|got|bought|switched|tested|started using)\b/i,
]

export function claimsPersonalUse(text: string): boolean {
  return PERSONAL_USE.some((re) => re.test(text))
}

/** The gate applies unless the creator herself confirmed using it. */
export function personalUseGateApplies(personalUse: string | null | undefined, hasProduct: boolean): boolean {
  return hasProduct && String(personalUse ?? '').toUpperCase() !== 'CONFIRMED'
}

/** Indexes of beats whose line claims personal use. */
export function personalUseViolations(beats: ReadonlyArray<{ line?: unknown }>): number[] {
  const out: number[] = []
  beats.forEach((b, i) => {
    if (typeof b?.line === 'string' && claimsPersonalUse(b.line)) out.push(i)
  })
  return out
}

/** Last resort: drop only the sentences that claim use. '' when nothing is left. */
export function dropPersonalUseSentences(line: string): string {
  const parts = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line]
  return parts.filter((s) => !claimsPersonalUse(s)).join('').trim()
}

export const PERSONAL_USE_REPAIR_SYSTEM = 'You rewrite single script lines so the creator makes NO claim of personally using,'
  + ' owning, buying, loving or benefiting from the product — she has not confirmed that. Attribute instead to'
  + ' the maker or the product itself ("the maker designed it to…", "it is made from…", "it comes with…").'
  + ' Never invent a fact, number, result or experience. Keep each line about the same length, purpose and'
  + ' position. You return JSON only.'

export function personalUseRepairPrompt(beats: ReadonlyArray<{ line?: unknown }>, indexes: readonly number[], product: string): string {
  return `The creator has NOT confirmed she personally uses "${product}". These lines claim she does.`
    + ' Rewrite ONLY these lines in the third person, maker- or product-attributed.'
    + ' Return JSON: {"rewrites":[{"index":<number>,"line":"<new line>"}]}\n\n'
    + indexes.map((i) => `index ${i}\nLINE: ${String(beats[i]?.line ?? '')}`).join('\n\n')
}
