// GENERATED FROM packages/shared/src/script/scriptHygiene.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// SCRIPT HYGIENE (advisor labels, panel 12 redraw, 28 Oct). Three defects a
// reader saw in 24 scripts, each fixed deterministically after writing:
//
//   1. COPIED OUTSIDE TEXT. A competitor's description from niche research was
//      pasted into a script as if she said it (S-AE16EF). `findLeakedClaims`
//      only catches NUMBERS copied from a reference, so a sentence with no
//      number went straight through. Any line that is mostly a run of someone
//      else's words (reference, niche research, Reddit, trends) is removed,
//      unless the same words are in her own material.
//   2. THE SAME STORY TWICE. A story told in the hook came back word for word
//      later (S-64DCB3, S-0A9D4D). A sentence that repeats an earlier line is
//      cut from the later line; a line left empty is dropped.
//   3. RAW SPOKEN FILLER. Her transcript's "um", "no wait", ", like," were
//      copied into the script. They are stripped; her meaning stays.
// Pure; no I/O. The edge copy is generated.

const norm = (t: string) => String(t ?? '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
const shingles = (t: string, n: number): Set<string> => {
  const w = norm(t).split(' ').filter(Boolean)
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '))
  return out
}
/** Share of `a`'s n-word runs that also appear in `pool`. 0 when `a` is too short to judge. */
export function runOverlap(a: string, pool: ReadonlySet<string>, n = 5): number {
  const s = shingles(a, n)
  if (s.size < 2) return 0
  let hit = 0
  for (const g of s) if (pool.has(g)) hit++
  return hit / s.size
}
const poolOf = (texts: readonly string[], n: number) => {
  const p = new Set<string>()
  for (const t of texts) for (const g of shingles(t, n)) p.add(g)
  return p
}

/**
 * Indices of lines that copy outside text: at least `share` of the line's
 * 5-word runs appear in the outside texts AND less than that share appears in
 * her own material (so her verbatim lines that happen to match a reference
 * stay).
 */
export function copiedOutsideLines(lines: readonly string[], outside: readonly string[], hers: readonly string[], share = 0.5): number[] {
  const o = poolOf(outside.filter(Boolean), 5)
  if (!o.size) return []
  const h = poolOf(hers.filter(Boolean), 5)
  const out: number[] = []
  lines.forEach((l, i) => { if (runOverlap(l, o) >= share && runOverlap(l, h) < share) out.push(i) })
  return out
}

// Split only where punctuation is followed by a space (or ends the line), so
// "$4.99", "3.5x" and "shop.example.com/kit" stay whole (lane 1, 5 Nov).
const clausesOf = (l: string) => String(l ?? '').split(/(?<=[,;.!?])\s+/).map((s) => s.trim()).filter(Boolean)

/**
 * Removes, from each line, any clause that repeats something already said
 * (most of its 4-word runs seen before). An emptied line is dropped; a line
 * that now starts with "and" / "so" is tidied. The first telling always stays.
 */
export function dropRepeatedSentences(lines: readonly string[], share = 0.6): { lines: string[]; cut: number } {
  const said = new Set<string>()
  const out: string[] = []
  let cut = 0
  for (const l of lines) {
    const clauses = clausesOf(l)
    const kept = clauses.filter((c) => {
      const rep = shingles(c, 4).size >= 2 && runOverlap(c, said, 4) >= share
      if (rep) cut++
      return !rep
    })
    for (const g of shingles(l, 4)) said.add(g)
    // Nothing cut: the line comes out exactly as it went in.
    if (kept.length === clauses.length) { if (/[a-z0-9]/i.test(l)) out.push(l); continue }
    let text = kept.join(' ').replace(/\s+/g, ' ').trim().replace(/^(?:and|so|but)\s+/i, '').replace(/^[,;\s]+/, '').replace(/,$/, '.')
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1)
    if (text && /[a-z0-9]/i.test(text)) out.push(text)
  }
  return { lines: out, cut }
}

/** Strips raw spoken filler; keeps her words and meaning. `strict` (panel
 *  accounts, 7 Nov) also takes "I mean", "so yeah" and a filler "like"
 *  wherever they stand, not only between commas. */
export function stripSpokenFiller(line: string, strict = false): string {
  let t = String(line ?? '')
  if (strict) {
    // "it's more like, they need…": that "like" carries the sentence (replay, 10 Nov).
    t = t.replace(/\b(more|just|exactly|something|kind of|sort of),?\s+like,\s*/gi, '$1 like ')
    t = t.replace(/,\s*like,\s*/gi, ' ')
    t = t.replace(/(^|[\s,.!?])(?:so,?\s+yeah|yeah,?\s+so)(?=[\s,.!?]|$),?/gi, '$1')
    t = t.replace(/(^|[\s,.!?])I mean(?=[\s,.!?]|$),?/gi, '$1')
    // "like" as filler: at the start, after a comma, or before a comma. "I like
    // it" and "looks like rain" stay (a verb or a comparison).
    t = t.replace(/(^|[.!?]\s+)like,?\s+/gi, '$1').replace(/,\s*like\s+/gi, ', ').replace(/\s+like,\s*/gi, ' ')
    t = t.replace(/(^|[.!?]\s+|,\s*)so\s+yeah\b[,.]?/gi, '$1')
  }
  // "the first hour, no wait, first forty minutes" → "the first forty minutes".
  // Only a parallel correction (the fix restarts on the same word) and never
  // around a figure: "$50, no wait, $60" or "a week, no wait, more like ten
  // days" stay as she said them rather than come out mangled.
  t = t.replace(/\b([A-Za-z]+)\s+([A-Za-z]+),\s*no wait,\s*([A-Za-z]+)\b/g, (m, w1: string, _w2: string, y: string) =>
    w1.toLowerCase() === y.toLowerCase() ? y : m)
  t = t.replace(/(^|[\s,])(?:um+|uh+|erm+|uhm+)(?=[\s,.!?]|$),?/gi, '$1')
  t = t.replace(/,\s*like,\s*/gi, ' ').replace(/\bjust,\s*like,?\s*/gi, 'just ')
  t = t.replace(/\b(?:so yeah|you know),\s*/gi, '')
  t = t.replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/^\s*,\s*/, '').trim()
  // Panel 13b: a lone "…" left where filler stood, and "I think," whose comma
  // only fenced off an "um" ("I think, um, … so yeah, I mean, most shops…").
  if (strict) t = t.replace(/(^|[\s,])(?:…|\.\.\.)(?=[\s,]|$),?/g, '$1').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/\bI think,\s+(?=[a-z])/g, 'I think ')
  if (strict) t = t.replace(/,\s*([.!?])/g, '$1').replace(/^[,.\s]+/, '').replace(/([.!?])\s+([a-z])/g, (_m, p: string, c: string) => `${p} ${c.toUpperCase()}`).trim()
  // No filler found: the line comes out exactly as it went in.
  const orig = String(line ?? '')
  if (t === orig.replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim()) return orig
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

// THE SAME IDEA TWICE (panel 13, 7 Nov; strict mode, panel accounts only).
// The 4-word-run check above catches a line said again word for word; a
// reader also marked a line that says an earlier line's point in new words.
// A clause that shares 4 or more content words (5-letter stems) with ONE
// earlier line, and at least 60% of the shorter of the two, repeats its idea.
const IDEA_STOP = new Set(['about', 'after', 'again', 'because', 'before', 'being', 'could', 'every', 'going', 'never', 'other', 'really', 'should', 'still', 'their', 'there', 'these', 'thing', 'think', 'those', 'though', 'through', 'where', 'which', 'while', 'would', 'actually', 'something', 'anything', 'everything', 'with', 'from', 'that', 'this', 'then', 'them', 'what', 'when', 'your', 'have', 'just', 'like', 'into', 'over', 'only', 'more', 'most', 'very', 'much', 'they', 'were', 'will', 'want'])
export function ideaStems(t: string): Set<string> {
  return new Set((norm(t).split(' ').filter((w) => w.length >= 4 && !IDEA_STOP.has(w))).map((w) => w.replace(/'/g, '').slice(0, 5)))
}
/** True when `clause` restates one of `earlier`'s ideas. */
export function repeatsIdea(clause: string, earlier: readonly Set<string>[], share = 0.6): boolean {
  const c = ideaStems(clause)
  if (c.size < 4) return false
  return earlier.some((e) => { let hit = 0; for (const w of c) if (e.has(w)) hit++; return hit >= 4 && hit / Math.min(c.size, e.size) >= share })
}

/** Hook and CTA section names the writer and the templates use. */
export const PROTECTED_SECTION = /^(?:hook|cta|call to action|close|closing|outro|sign ?off)\b/i

export interface HygieneResult { lines: string[]; copied: number; repeats: number; filler: number }

/** All three, in order: drop copied lines, cut repeated sentences, strip filler. */
export function scriptHygiene(lines: readonly string[], ctx: { outside: readonly string[]; hers: readonly string[] }): HygieneResult {
  const copiedIdx = new Set(copiedOutsideLines(lines, ctx.outside, ctx.hers))
  const kept = lines.filter((_, i) => !copiedIdx.has(i))
  const rep = dropRepeatedSentences(kept)
  let filler = 0
  const clean = rep.lines.map((l) => { const s = stripSpokenFiller(l); if (s !== l) filler++; return s }).filter(Boolean)
  return { lines: clean, copied: copiedIdx.size, repeats: rep.cut, filler }
}

/**
 * The same three, beat by beat, so nothing has to be matched back: a copied
 * beat is dropped; a repeated clause is trimmed from its beat (an emptied beat
 * is dropped); filler is stripped. Beats with no spoken line pass through.
 * Never adds a beat or a word.
 */
export function hygieneBeats<T extends { line?: unknown }>(beats: readonly T[], ctx: { outside: readonly string[]; hers: readonly string[]; strict?: boolean }): { beats: T[]; copied: number; repeats: number; filler: number; hookCopied: number } {
  const strict = ctx.strict === true
  const earlierIdeas: Set<string>[] = []
  const o = poolOf(ctx.outside.filter(Boolean), 5)
  const h = poolOf(ctx.hers.filter(Boolean), 5)
  const said = new Set<string>()
  const out: T[] = []
  let copied = 0, repeats = 0, filler = 0, hookCopied = 0
  // The writer's section names are free text ("Hook", "CTA", "Close", ...), so
  // the hook and the CTA are found by name OR by place: the first and the last
  // spoken beat.
  const spoken = beats.map((b, i) => (typeof b?.line === 'string' && b.line.trim() ? i : -1)).filter((i) => i >= 0)
  const ends = new Set([spoken[0], spoken[spoken.length - 1]])
  for (const [i, b] of beats.entries()) {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line.trim()) { out.push(b); continue }
    // The hook and the CTA are never dropped or trimmed (a callback in the CTA
    // is deliberate); only their filler goes, and they count as said.
    if (ends.has(i) || PROTECTED_SECTION.test(String((b as { section?: unknown }).section ?? '').trim())) {
      // Kept by design, but counted (advisor review of #1351): a copied hook
      // is reported as hook_copied so panels can measure it.
      if (i === spoken[0] && o.size && runOverlap(line, o) >= 0.5 && runOverlap(line, h) < 0.5) hookCopied++
      for (const g of shingles(line, 4)) said.add(g)
      earlierIdeas.push(ideaStems(line))
      const clean = stripSpokenFiller(line, strict)
      if (clean !== line) filler++
      out.push(clean === line ? b : { ...b, line: clean })
      continue
    }
    if (o.size && runOverlap(line, o) >= 0.5 && runOverlap(line, h) < 0.5) { copied++; continue }
    const clauses = clausesOf(line)
    const kept = clauses.filter((c) => {
      const rep = (shingles(c, 4).size >= 2 && runOverlap(c, said, 4) >= 0.6) || (strict && repeatsIdea(c, earlierIdeas))
      if (rep) repeats++
      return !rep
    })
    for (const g of shingles(line, 4)) said.add(g)
    earlierIdeas.push(ideaStems(kept.join(' ')))
    let text = line
    if (kept.length !== clauses.length) {
      text = kept.join(' ').replace(/\s+/g, ' ').trim().replace(/^(?:and|so|but)\s+/i, '').replace(/^[,;\s]+/, '').replace(/,$/, '.')
      if (!text || !/[a-z0-9]/i.test(text)) continue
      text = text.charAt(0).toUpperCase() + text.slice(1)
    }
    const clean = stripSpokenFiller(text, strict)
    if (clean !== text) filler++
    out.push(clean === line ? b : { ...b, line: clean })
  }
  return { beats: out, copied, repeats, filler, hookCopied }
}
