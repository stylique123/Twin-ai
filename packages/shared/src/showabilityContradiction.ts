// §T — noticing a `NEVER` that the creator's own sentence contradicts.
//
// ⚠️ THE ROW THAT STARTED THIS. `Custom Bible Rebind` is stored SERVICE / NEVER,
// and its creator_summary reads "I rebind your Bible in full-grain leather —
// Horween or Pueblo, hand-stitched, Oxford hollow spine". Under the direction
// gate that creator gets body-and-face direction ONLY and will never be told to
// hold up the thing she makes. `showability` is hand-set, and nothing measured
// when a hand-set value disagreed with the row beside it.
//
// ⚠️⚠️ AND THE OBVIOUS DETECTOR IS THE ONE THAT MUST NOT BE BUILT. "Does the
// summary mention a physical noun" fires on `Weekly Meal Prep` ("five days of
// fresh meals") and on a workshop row that mentions "a bestselling book" — and
// Weekly Meal Prep is THE product whose creator was once told to hold a clean
// glass of water. A detector that re-flags it would reintroduce the exact
// failure the direction gate exists to prevent.
//
// ⚖️ SO THE TRADE DECIDES THE THRESHOLD, and §T already stated it: a wrong
// NEVER costs a handling cue that should have been offered; a wrong ALWAYS costs
// an invented prop in a creator's script. The first is a thin video, the second
// is a fabrication. This therefore looks for ONE narrow thing — vocabulary that
// names what an object is MADE OF, or a construction verb describing how it was
// built — and stays silent on everything else. A meal is not made of leather. A
// book mentioned among educational resources is not a material.
//
// ⚖️ AND IT NEVER WRITES. It returns evidence for a question rendered above the
// showability corrector that has existed all along; the creator answers. The
// same shape as §R: an objective signal earns a question, never a verdict.

/** What it is made of. Not what it is — `book`, `meal` and `email` are nouns, */
/** not materials, and every one of them appears in a NEVER row that is right. */
const MATERIALS = [
  'leather', 'full-grain', 'top-grain', 'suede', 'shearling',
  'brass', 'bronze', 'copper', 'pewter', 'sterling silver', 'stainless steel',
  'walnut', 'oak', 'maple', 'cherrywood', 'teak', 'bamboo',
  'linen', 'merino', 'cashmere', 'canvas', 'denim', 'silk',
  'ceramic', 'stoneware', 'porcelain', 'enamel',
  'soy wax', 'beeswax', 'resin', 'marble', 'granite',
]

/** How it was built. A construction verb implies a made thing with a surface. */
/** One spelling each: the matcher already treats a hyphen and a space alike. */
const CONSTRUCTION = [
  'hand-stitched', 'hand-sewn', 'hand-poured', 'hand-carved',
  'hand-forged', 'hand-thrown', 'hand-bound', 'hand-dyed',
  'hand-woven', 'hand-turned',
]

export interface ShowabilityContradiction {
  /** The exact words from the creator's own summary that disagree with NEVER. */
  evidence: string[]
}

/**
 * Evidence that a stored `NEVER` disagrees with the creator's own description,
 * or `null` when there is none.
 *
 * ⚠️ ONLY `NEVER` IS CHECKED. A wrong `ALWAYS` is the expensive direction of
 * this error and is not something a word-match may ever assert.
 */
export function showabilityContradiction(
  showability: string | null | undefined,
  creatorSummary: string | null | undefined,
): ShowabilityContradiction | null {
  if (showability !== 'NEVER') return null
  const text = String(creatorSummary ?? '').toLowerCase()
  if (!text.trim()) return null
  const evidence: string[] = []
  for (const term of [...MATERIALS, ...CONSTRUCTION]) {
    // ⚠️ WORD-BOUNDED. Without this, `oak` matches "cloak" and `resin` matches
    // "representing" — a false positive here costs a creator a wrong prop.
    //
    // ⚖️ AND THE HYPHEN IS NOT THE CREATOR'S PROBLEM. "hand poured" and
    // "hand-poured" are one term to this matcher, which is why the lists above
    // carry one spelling each.
    const re = new RegExp(`(^|[^a-z])(${term.replace(/[-\s]/g, '[-\\s]')})([^a-z]|$)`)
    const m = re.exec(text)
    // ⚠️ THE MATCH, NOT THE DICTIONARY ENTRY. Returning the term we searched for
    // put a spelling in front of the creator that she had not written — the
    // question is meant to quote her back to herself, and a question that
    // misquotes its evidence is not showing its work, it is inventing it.
    if (m && !evidence.includes(m[2])) evidence.push(m[2])
  }
  return evidence.length ? { evidence } : null
}
