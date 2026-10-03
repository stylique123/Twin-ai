// GENERATED FROM packages/shared/src/script/offerScope.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// ONE PRODUCT'S OFFER STAYS IN ITS OWN SCRIPTS (script batch audit 2026-10-03,
// parts 9 and 10).
//
// ⚠️ MEASURED: 15 of 370 scripts quoted Signature Blend's "12oz / $18 / 5lb /
// $65" for House Espresso, Bella Donovan, Cold Brew, Single-Origin — products
// with no stored offer — and once in an idea video with no product chosen.
// When the chosen product has no price or size, the writer borrowed the only
// priced one, through the account-level offer fallbacks (the scanned
// `vp.offer`, a persisted `brief.offer`) and any fact that quotes it.
//
// ⚖️ ONE RULE, TWO PLACES. A price or size that belongs to ANOTHER product, and
// not to the chosen one or to her words for this video, is cut from every
// fallback offer line before the writer sees it, and from every spoken
// sentence after it writes. Deterministic: it cannot be talked round.

const SMALL: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const SIZE: Record<string, string> = {
  oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', ml: 'ml', l: 'l', liter: 'l', litre: 'l',
}
const MONEY = new Set(['dollar', 'dollars', 'buck', 'bucks', 'usd'])

function tokens(text: string): string[] {
  return String(text ?? '').toLowerCase()
    .replace(/\$\s?(\d+(?:\.\d+)?)/g, ' $1 dollars ')
    .replace(/(\d)\s*([a-z]+)/g, '$1 $2')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(' ').filter((w) => w && w !== '.')
}

/** Prices ("$18", "eighteen dollars") and sizes ("12oz", "five-pound") a text states. */
export function offerFigures(text: string): Set<string> {
  const w = tokens(text)
  const out = new Set<string>()
  for (let i = 0; i < w.length; i++) {
    let n: number | null = null
    let next = i + 1
    if (/^\d+(\.\d+)?$/.test(w[i]!)) n = Number(w[i])
    else if (TENS[w[i]!] !== undefined) {
      n = TENS[w[i]!]!
      if (SMALL[w[i + 1] ?? ''] !== undefined && SMALL[w[i + 1]!]! < 10) { n += SMALL[w[i + 1]!]!; next++ }
    } else if (SMALL[w[i]!] !== undefined) n = SMALL[w[i]!]!
    if (n === null || !Number.isFinite(n)) continue
    const after = w[next] ?? ''
    i = next - 1
    if (MONEY.has(after)) out.add(`$${n}`)
    else if (SIZE[after]) out.add(`${n}${SIZE[after]}`)
  }
  return out
}

/**
 * Figures that belong to another product and not to this video's own material.
 * `others` are the other products' offer lines and facts; `own` is the chosen
 * product, its facts, and what she typed for this video.
 */
export function foreignOfferFigures(others: readonly string[], own: readonly string[]): Set<string> {
  const mine = offerFigures(own.join('\n'))
  const out = new Set<string>()
  for (const f of offerFigures(others.join('\n'))) if (!mine.has(f)) out.add(f)
  return out
}

const SENTENCES = /(?<=[.!?])\s+/
const carries = (s: string, foreign: ReadonlySet<string>) => [...offerFigures(s)].some((f) => foreign.has(f))

/** A fallback offer line with another product's price or size cut out; undefined when nothing is left. */
export function scrubForeignOffer(text: string | null | undefined, foreign: ReadonlySet<string>): string | undefined {
  if (typeof text !== 'string') return undefined
  if (!foreign.size || !carries(text, foreign)) return text
  const kept = text.split(SENTENCES).filter((s) => !carries(s, foreign)).join(' ').trim()
  return kept || undefined
}

export interface ForeignOfferRemoval { beat: number; reason: 'other_product_offer'; figures: string[]; sentence: string }

/** THE OUTPUT CHECK: a spoken sentence quoting another product's price or size is removed. */
export function stripForeignOffer<T extends { line?: unknown }>(
  beats: readonly T[], foreign: ReadonlySet<string>,
): { beats: T[]; removed: ForeignOfferRemoval[] } {
  const removed: ForeignOfferRemoval[] = []
  if (!foreign.size) return { beats: [...beats], removed }
  const out = beats.map((b, i) => {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line) return b
    const kept: string[] = []
    for (const s of line.split(SENTENCES)) {
      const hit = [...offerFigures(s)].filter((f) => foreign.has(f))
      if (hit.length) { removed.push({ beat: i, reason: 'other_product_offer', figures: hit, sentence: s }); continue }
      kept.push(s)
    }
    const next = kept.join(' ').trim()
    return next === line ? b : { ...b, line: next }
  })
  return { beats: out, removed }
}
