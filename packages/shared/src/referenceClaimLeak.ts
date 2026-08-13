// THE REFERENCE'S OWN NUMBER, SPOKEN BY SOMEBODY WHO NEVER EARNED IT.
//
// ── THE DEFECT, MEASURED ──────────────────────────────────────────────────
//
// A matrix reference carries this note, written by hand when the case was built:
//
//     Claim risk: '3x more productive' is self-reported creator experience
//     and MUST NOT transfer
//
// It transferred 9 times across 16 runs, to five different creators:
//
//     AlexHormozi     general   "If you want to be 3x more productive and…"
//     real_techh      none      "Here are 3 simple ways to make your mobile
//                                phone 3x more productive."
//     starterstory    general   …
//     matthew_berman  general   …
//     aliabdaal       creator_knowledge  "…genuinely 3x'd my productivity"
//
// Ali Abdaal's self-reported multiplier is now spoken, in the first person, by a
// tech reviewer and a founder-story channel. None of them said it. None of them
// can support it.
//
// ⚠️ AND EVERY SAFETY COUNTER READ CLEAN WHILE IT HAPPENED. UNSUPPORTED 0,
// unearned-first-person 0, money-claims 0. Those counters ask whether a beat's
// CITED knowledge traces to something supplied — and these beats cite nothing.
// They declare `general`, which means "common knowledge, nobody's claim". A
// specific measured multiplier from a named creator's video is not general
// knowledge, the declaration is false, and nothing was checking it.
//
// ── WHY A CONTRACT CHECK AND NOT ONLY A PROMPT RULE ───────────────────────
//
// ⚖️ THE PROMPT ALREADY FORBIDS THIS. "We copy STRUCTURE, never content… Never
// reproduce the reference's exact words, footage, or claims." It was ignored
// nine times out of sixteen. A rule the writer is asked to follow and a check
// that reads the output are different instruments, and this defect is DECIDABLE
// from the two texts — the number is either in both or it is not.
//
// ── THE HARD PART: THE COUNT IS ALLOWED TO TRANSFER ───────────────────────
//
// ⚠️ "3 SIMPLE WAYS" IS LEGITIMATE AND "3X MORE PRODUCTIVE" IS NOT, and both are
// the digit 3 taken from the same reference. The count contract is explicit:
//
//     THE COUNT TRANSFERS. THE UNIT DOES NOT.
//
// A format that promises three things promises three things for everyone. What
// may not transfer is a MEASURED OUTCOME — a multiplier, a percentage, a sum of
// money, a duration attached to a result. So a bare integer matching the
// enumeration count is left alone, and a number wearing a unit is not.

/** A number that asserts a RESULT rather than counting items.
 *
 *  ⚠️ THE UNIT IS WHAT MAKES IT A CLAIM. `3` is a count; `3x` is a multiplier,
 *  `40%` is a proportion, `$10k` is a sum, `10 hours` is a saving. Each of those
 *  is a measurement somebody took, and taking it from a reference means
 *  attributing their measurement to a different person. */
const MEASURED = new RegExp(
  '\\d[\\d,.]*\\s*(?:x\\b|×|%|k\\b|m\\b|bn\\b|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?'
  + '|dollars?|pounds?|euros?|subscribers?|followers?|customers?|users?|views?|clients?)'
  + '|[$£€]\\s?\\d[\\d,.]*',
  'gi')

/** Normalised form, so "3x", "3X" and "3 x" are one claim. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s,]/g, '').replace(/\.$/, '')
}

/** Every measured claim a text asserts. */
export function measuredClaims(text: string): string[] {
  const out = new Set<string>()
  for (const m of String(text ?? '').matchAll(MEASURED)) out.add(normalise(m[0]))
  return [...out]
}

export interface LeakedClaim {
  /** The claim as it appears in the script, for a person reading the report. */
  claim: string
  /** Which script beat carried it. */
  beat: number
  /** What the beat said its substance was — the false declaration. */
  substance: string
}

/**
 * Measured claims that appear in BOTH the reference and the script.
 *
 * `enumerationCount` is the one number allowed to cross: a format promising
 * three things promises three for everyone. It is excluded only as a BARE
 * integer — "3" is spared, "3x" is not, because the unit is what turns a count
 * into a measurement.
 *
 * ⚖️ SUBSTANCE IS REPORTED, NOT FILTERED ON. A leak declared `creator_knowledge`
 * is not automatically fine: the writer may be citing the creator for a number
 * the creator never gave. Reporting the declaration lets the caller see which
 * lie was told, rather than deciding here that one of them is acceptable.
 */
export function findLeakedClaims(
  referenceText: string,
  script: readonly { line?: unknown; substance?: unknown }[],
  enumerationCount?: number | null,
): LeakedClaim[] {
  const fromReference = new Set(measuredClaims(referenceText))
  if (fromReference.size === 0) return []

  // The count may cross, bare. `3` is spared; `3x` never reaches here as `3`
  // because `measuredClaims` only emits a token WITH its unit attached.
  const allowed = typeof enumerationCount === 'number' && enumerationCount > 0
    ? new Set([String(enumerationCount)]) : new Set<string>()

  const out: LeakedClaim[] = []
  script.forEach((b, i) => {
    const line = typeof b?.line === 'string' ? b.line : ''
    for (const claim of measuredClaims(line)) {
      if (!fromReference.has(claim) || allowed.has(claim)) continue
      out.push({
        claim,
        beat: i + 1,
        substance: typeof b?.substance === 'string' ? b.substance : 'none',
      })
    }
  })
  return out
}

/** One line per leak, for the log and for the repair prompt.
 *
 *  ⚠️ NAMES THE ATTRIBUTION, NOT JUST THE STRING. "Remove 3x" invites the writer
 *  to reword around it; "this is the reference creator's own measurement and
 *  this creator never made it" says why no rewording helps. */
export function describeLeak(l: LeakedClaim): string {
  return `Beat ${l.beat} repeats "${l.claim}" from the reference and declares it`
    + ` ${l.substance}. That number is the REFERENCE creator's own measurement;`
    + ` this creator never made it and cannot support it.`
}
