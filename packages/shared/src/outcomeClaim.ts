// FIX C (master fix doc): A CLAIM IS NOT A FACT.
// Confirming that a page SAYS "clinically proven" is not confirming it is TRUE.
// A price, a material or a size is a fact; a result, a guarantee or a
// superlative is a claim, and the confirm screen treats them differently.
const OUTCOME_FIELDS = new Set(['claim', 'guarantee', 'benefit'])
const OUTCOME_WORDS = /\b(?:proven|guarantee[ds]?|results?|clinically|scientifically|best|number one|cures?|heals?|boosts?|\d+x)\b|#1|\d+\s?%/i

export function isOutcomeClaim(f: { field: string; value: string }): boolean {
  return OUTCOME_FIELDS.has(f.field) || OUTCOME_WORDS.test(f.value)
}
