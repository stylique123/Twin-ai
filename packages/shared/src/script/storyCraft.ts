// STORY CRAFT CHECKS (owner brief 2026-10-05), measured before they steer.
// Blind set 2: three stories stitched into one script (#3), a story that ends
// mid-way with no ask (#3), embellished retellings ("recently", "growing up",
// #2), and a close bolted on (#12). These checks read a finished script
// against the stories she actually told and count what the brief names:
// stories used, how much of her own wording survives, and whether the close
// follows from the story.

const STOP = new Set(['that', 'this', 'with', 'from', 'your', 'they', 'have', 'what', 'when', 'about', 'into', 'just', 'like', 'more', 'than', 'then', 'them', 'will', 'were', 'been', 'their', 'there', 'would', 'which', 'could', 'first', 'time', 'felt', 'really', 'actually'])

function terms(t: unknown): Set<string> {
  return new Set((String(t ?? '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).map((w) => w.replace(/'s$/, '')).filter((w) => !STOP.has(w)))
}

export interface StoryCraftReport {
  /** Her stories that show up in the script (≥ 40% of a story's words). */
  storiesUsed: number
  /** For the main story: share of its distinctive words that survive. */
  retention: number | null
  /** Lines that retell the main story (same story told twice = > 1). */
  tellings: number
  /** The last spoken line shares a word with the main story or its line before. */
  askFollows: boolean | null
}

export function storyCraft(lines: readonly string[], stories: readonly string[]): StoryCraftReport {
  const bags = stories.map(terms).filter((b) => b.size >= 4)
  const scriptTerms = terms(lines.join(' '))
  const hitShare = (b: Set<string>, against: Set<string>) => [...b].filter((w) => against.has(w)).length / b.size
  const used = bags.map((b) => ({ b, share: hitShare(b, scriptTerms) })).filter((x) => x.share >= 0.4).sort((a, b) => b.share - a.share)
  if (!used.length) return { storiesUsed: 0, retention: null, tellings: 0, askFollows: null }
  const main = used[0]!.b
  const perLine = lines.map((l) => hitShare(main, terms(l)))
  const tellings = perLine.filter((s) => s >= 0.3).length
  const spoken = lines.map((l) => l.trim()).filter(Boolean)
  const last = terms(spoken.at(-1) ?? '')
  const storyIdx = perLine.lastIndexOf(Math.max(...perLine))
  const bridge = terms(lines[storyIdx + 1] ?? '')
  const askFollows = [...last].some((w) => main.has(w) || (bridge.has(w) && storyIdx + 1 < spoken.length - 1))
  return { storiesUsed: used.length, retention: Math.round(used[0]!.share * 100) / 100, tellings, askFollows }
}
