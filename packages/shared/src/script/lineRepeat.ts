// A LINE SAID IN TWO OF HER LAST FIVE SCRIPTS RESTS (owner 2026-10-07).
//
// Paired set: "no clean formula" in 7 of 37 scripts, "start small from home"
// in 9, "learn as you go" in 10 — nearly every cart script, because the cart
// material is three paraphrases of one answer. Story rotation rests a fact by
// id; the writer still reaches the same sentence through twins, the brief and
// the voice profile. This is a sentence-level limit on what ships.

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean)
const grams = (t: string, n = 4): Set<string> => {
  const w = norm(t)
  const g = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) g.add(w.slice(i, i + n).join(' '))
  return g
}

/** Share of a sentence's 4-grams found in another text. */
function overlap(sentence: string, other: Set<string>): number {
  const mine = grams(sentence)
  if (mine.size === 0) return 0
  let hit = 0
  for (const g of mine) if (other.has(g)) hit++
  return hit / mine.size
}

export const LINE_REST_AFTER = 2
export const LINE_REPEAT_OVERLAP = 0.5

/**
 * Sentences of this script that already appeared (≥50% of their 4-grams) in
 * at least LINE_REST_AFTER of her recent scripts.
 */
export function repeatedSentences(lines: readonly string[], recentScripts: readonly string[]): string[] {
  const recent = recentScripts.map((s) => grams(s))
  const out: string[] = []
  for (const line of lines) {
    for (const sentence of line.match(/[^.!?]+[.!?]*/g) ?? []) {
      const s = sentence.trim()
      if (norm(s).length < 5) continue
      const seen = recent.filter((r) => overlap(s, r) >= LINE_REPEAT_OVERLAP).length
      if (seen >= LINE_REST_AFTER) out.push(s)
    }
  }
  return out
}

/** Drop repeated sentences from middle beats; hook and close keep theirs; never below `floor` spoken beats. */
export function restRepeatedLines<B extends { line?: unknown }>(beats: readonly B[], recentScripts: readonly string[], floor = 3): { beats: B[]; removed: string[] } {
  const lines = beats.map((b) => (typeof b.line === 'string' ? b.line : ''))
  const bad = new Set(repeatedSentences(lines, recentScripts))
  if (!bad.size) return { beats: [...beats], removed: [] }
  const removed: string[] = []
  let out: B[] = beats.map((b, i) => {
    if (typeof b.line !== 'string' || i === 0 || i === beats.length - 1) return b
    const sents = b.line.match(/[^.!?]+[.!?]*/g) ?? []
    const kept = sents.filter((s) => !bad.has(s.trim()))
    if (kept.length === sents.length) return b
    removed.push(...sents.filter((s) => bad.has(s.trim())).map((s) => s.trim()))
    return { ...b, line: kept.join('').trim() }
  })
  out = out.filter((b) => typeof b.line !== 'string' || b.line.trim() !== '')
  const spoken = out.filter((b) => typeof b.line === 'string' && b.line.trim().split(/\s+/).length >= 3).length
  if (spoken < floor) return { beats: [...beats], removed: [] }
  return { beats: out, removed }
}
