// WHAT HER LAST VIDEOS ALREADY SAID (batch part-13, 2026-10-04: "grocery
// store beans are consistently burned or overly acidic" appeared word for word
// in 16 of 54 scripts). The writer never saw her earlier scripts, so it reached
// for the same strongest-sounding fact every time and every video sounded the
// same. Here the lines her recent scripts already said are found; the writer
// is told to reach for other material first and, if one is needed, to say it
// in new words.

const STOP = new Set('a an and are as at be but by for from has have i if in into is it its just my of on or our so than that the their them then there these they this to was we were what when which who will with you your not no do does did can could would should about out up more most very really'.split(' '))

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
}

/** Runs of 5+ words shared with earlier scripts, in at least `minScripts` of them. */
export function recentlySaid(
  recentScripts: ReadonlyArray<string>,
  opts: { minScripts?: number; max?: number } = {},
): string[] {
  const minScripts = opts.minScripts ?? 2
  const max = opts.max ?? 6
  // Each spoken sentence of each earlier script, by its content words.
  const seen = new Map<string, { text: string; scripts: Set<number> }>()
  recentScripts.forEach((script, si) => {
    for (const sentence of script.split(/(?<=[.!?])\s+|\n+/)) {
      const ws = words(sentence)
      if (ws.length < 5) continue
      // A 5-word window is the fingerprint: it survives a changed opening.
      for (let i = 0; i + 5 <= ws.length; i++) {
        const key = ws.slice(i, i + 5).join(' ')
        const e = seen.get(key) ?? { text: sentence.trim(), scripts: new Set<number>() }
        e.scripts.add(si)
        seen.set(key, e)
      }
    }
  })
  const out: string[] = []
  const taken = new Set<string>()
  for (const { text, scripts } of [...seen.values()].sort((a, b) => b.scripts.size - a.scripts.size)) {
    if (scripts.size < minScripts) break
    const norm = words(text).join(' ')
    if (taken.has(norm) || [...taken].some((t) => t.includes(norm) || norm.includes(t))) continue
    taken.add(norm)
    out.push(text.length > 180 ? `${text.slice(0, 177)}…` : text)
    if (out.length >= max) break
  }
  return out
}

/** The writer's note, or '' when nothing repeats. */
export function renderRecentlySaid(lines: readonly string[], recentHooks: readonly string[] = [], opts: { strict?: boolean } = {}): string {
  // Owner 2026-10-04: "every script should be unique" — the opening too.
  const hooks = [...new Set(recentHooks.map((h) => h.trim()).filter((h) => h.length > 8))].slice(0, 8)
  if (!lines.length && !hooks.length) return ''
  return [
    ...(lines.length ? [
      // ⚠️ BLIND SET 1 (owner 2026-10-05): one real customer story was in five
      // of six scripts — "only if it cannot work without it" was always taken.
      // Strict (trial): her audience has heard it; it rests. Fewer lines beat
      // the same story again.
      opts.strict
        ? 'ALREADY SAID IN HER LAST VIDEOS (her audience has heard these): do NOT use these stories or points in this video, not even reworded. Build it from her other material; if there is none, make the video shorter rather than repeat one of these:'
        : 'ALREADY SAID IN HER LAST VIDEOS (her audience has heard these): build this video from OTHER material of hers first. Use one of these only if this video cannot work without it, and then say it in new words, never the same sentence:',
      ...lines.map((l) => `  • "${l}"`),
    ] : []),
    ...(hooks.length ? [
      'HER LAST OPENINGS (every video must open differently — never reuse one of these, its first words or its shape):',
      ...hooks.map((h) => `  • "${h.length > 140 ? `${h.slice(0, 137)}…` : h}"`),
    ] : []),
  ].join('\n')
}
