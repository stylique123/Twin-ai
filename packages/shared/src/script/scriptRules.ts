/**
 * Two hard rules the writer is told and the final script is held to.
 *
 * ⚠️ AUDIT 2026-09-30 (THE COFFEE-CART IDEA RUN). An Idea-mode script with no
 * product picked said "while brewing Sunflower Coffee Roasters Colombia washed
 * medium roast coffee beans". Nothing checked the finished script against what
 * she picked: every library name counted as "grounded". And the niche research
 * offered "Follow for Part 2" as a close that works, against the standing rule
 * that a script never ends on a follow ask. A prompt line is advice; these are
 * the checks that make both rules hold.
 */

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `

/**
 * The first name from `names` this text says, or null. Whole-phrase match on
 * normalized text, so "Signature Blend Beans" never matches "signature".
 */
export function namedIn(text: string, names: readonly string[]): string | null {
  const t = norm(String(text ?? ''))
  for (const n of names) {
    const k = norm(String(n ?? ''))
    if (k.trim().length >= 4 && t.includes(k)) return String(n).trim()
  }
  return null
}

/**
 * The names the writer may NOT say: every library product and the brand, minus
 * what she picked or mentioned, minus any name she wrote herself in this
 * video's own words (her idea, her answers) — her own sentence is her choice.
 */
export function unpickedNames(
  allNames: readonly (string | null | undefined)[],
  pickedNames: readonly (string | null | undefined)[],
  herWords: string,
): string[] {
  const picked = new Set(pickedNames.map((n) => norm(String(n ?? '')).trim()).filter(Boolean))
  const own = norm(herWords ?? '')
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of allNames) {
    const n = String(raw ?? '').trim()
    const k = norm(n).trim()
    if (k.length < 4 || picked.has(k) || seen.has(k) || own.includes(` ${k} `)) continue
    seen.add(k)
    out.push(n)
  }
  return out
}

/** A close that asks for a follow: "follow for more", "follow for part 2", "hit follow". */
export const FOLLOW_ASK = /\b(follow (for|me|my|along)|give (me|us) a follow|hit (the )?follow|smash (that )?follow|part (\d+|two|2) (is )?coming|see you in part|for part (\d+|two))\b/i

export function isFollowAsk(text: string): boolean {
  return FOLLOW_ASK.test(String(text ?? ''))
}

export interface RuleCut { beat: number; reason: 'unpicked_product' | 'follow_ask'; sentence: string }

/**
 * Remove every sentence that names an unpicked product/brand, and every
 * sentence that asks for a follow (unless she chose follow as her ask).
 * Beats keep their order; a beat emptied here is left empty for the caller to
 * drop and disclose, never refilled.
 */
export function enforceScriptRules<B extends { line?: unknown }>(
  beats: readonly B[],
  opts: { unpicked: readonly string[]; followAllowed: boolean },
): { beats: B[]; removed: RuleCut[] } {
  const removed: RuleCut[] = []
  const out = beats.map((beat, i) => {
    if (typeof beat.line !== 'string') return beat
    const kept: string[] = []
    for (const s of beat.line.split(/(?<=[.!?])\s+/)) {
      if (!s.trim()) continue
      if (opts.unpicked.length && namedIn(s, opts.unpicked)) { removed.push({ beat: i, reason: 'unpicked_product', sentence: s }); continue }
      if (!opts.followAllowed && isFollowAsk(s)) { removed.push({ beat: i, reason: 'follow_ask', sentence: s }); continue }
      kept.push(s)
    }
    return removed.some((r) => r.beat === i) ? { ...beat, line: kept.join(' ').trim() } : beat
  })
  return { beats: out, removed }
}
