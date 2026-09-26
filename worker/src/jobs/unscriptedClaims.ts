// UNSCRIPTED CLAIMS — the second layer after the script gate (master fix doc,
// Fix B). The approved script can be clean and the take still not: a creator
// ad-libs "I use this every day" or "it's forty percent off" on camera. The
// alignment already records every spoken run that is NOT in the script as
// insertions; this reads those runs and flags the ones shaped like a claim.
//
// ⚖️ FLAG, NEVER BLOCK OR CUT. Paraphrase is normal and fine. Only claim-shaped
// ad-libs are surfaced, on the review screen, where she can strike the sentence
// or keep it. Nothing is removed here.
import type { ScriptAlignment, AlignToken } from './scriptAlignment.js'

export type ClaimKind = 'price' | 'number' | 'superlative' | 'personal_use'

const PRICE = /(?:\$|£|€)\s?\d|\b\d+(?:\.\d+)?\s?(?:dollars|bucks|pounds|euros)\b|\b(?:off|discount|sale|free shipping)\b/i
const NUMBER = /\b\d+\s?(?:%|percent|x|times|days|weeks|months|years|customers|people|orders)\b/i
const SUPERLATIVE = /\b(?:best|#1|number one|guaranteed?|proven|clinically|never fails|cures?|the only)\b/i
const PERSONAL_USE = /\bI(?:'ve| have|'m| am)?\s+(?:use|used|been using|using|wear|tried|bought|love|swear by)\b|\bin my experience\b|\bchanged my\b/i

export function claimKinds(text: string): ClaimKind[] {
  const out: ClaimKind[] = []
  if (PRICE.test(text)) out.push('price')
  if (NUMBER.test(text)) out.push('number')
  if (SUPERLATIVE.test(text)) out.push('superlative')
  if (PERSONAL_USE.test(text)) out.push('personal_use')
  return out
}

export interface UnscriptedClaim {
  text: string
  kinds: ClaimKind[]
  startMs: number | null
  endMs: number | null
}

export const UNSCRIPTED_MIN_TOKENS = 3
export const UNSCRIPTED_MAX_REPORTED = 8

/** Runs of consecutive spoken-but-not-scripted tokens that look like a claim. */
export function unscriptedClaims(
  alignment: Pick<ScriptAlignment, 'ops'>,
  spoken: readonly AlignToken[],
  words: ReadonlyArray<{ startMs: number; endMs: number }>,
): UnscriptedClaim[] {
  const out: UnscriptedClaim[] = []
  const ops = alignment.ops
  let i = 0
  while (i < ops.length && out.length < UNSCRIPTED_MAX_REPORTED) {
    if (ops[i].kind !== 'insertion') { i++; continue }
    let j = i
    while (j < ops.length && ops[j].kind === 'insertion') j++
    const idx = ops.slice(i, j).map((o) => (o as { spokenIdx: number }).spokenIdx)
    i = j
    if (idx.length < UNSCRIPTED_MIN_TOKENS) continue
    const text = idx.map((k) => spoken[k]?.text ?? '').join(' ').replace(/\s+/g, ' ').trim()
    const kinds = claimKinds(text)
    if (kinds.length === 0) continue
    out.push({
      text: text.slice(0, 200),
      kinds,
      startMs: words[idx[0]]?.startMs ?? null,
      endMs: words[idx[idx.length - 1]]?.endMs ?? null,
    })
  }
  return out
}
