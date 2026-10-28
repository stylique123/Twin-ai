// GENERATED FROM packages/shared/src/script/scriptHygiene.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
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

const clausesOf = (l: string) => (String(l ?? '').match(/[^,;.!?]+[,;.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean)

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
    const kept = clausesOf(l).filter((c) => {
      const rep = shingles(c, 4).size >= 2 && runOverlap(c, said, 4) >= share
      if (rep) cut++
      return !rep
    })
    for (const g of shingles(l, 4)) said.add(g)
    let text = kept.join(' ').replace(/\s+/g, ' ').trim().replace(/^(?:and|so|but)\s+/i, '').replace(/^[,;\s]+/, '').replace(/,$/, '.')
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1)
    if (text && /[a-z0-9]/i.test(text)) out.push(text)
  }
  return { lines: out, cut }
}

/** Strips raw spoken filler; keeps her words and meaning. */
export function stripSpokenFiller(line: string): string {
  let t = String(line ?? '')
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
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

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
export function hygieneBeats<T extends { line?: unknown }>(beats: readonly T[], ctx: { outside: readonly string[]; hers: readonly string[] }): { beats: T[]; copied: number; repeats: number; filler: number } {
  const o = poolOf(ctx.outside.filter(Boolean), 5)
  const h = poolOf(ctx.hers.filter(Boolean), 5)
  const said = new Set<string>()
  const out: T[] = []
  let copied = 0, repeats = 0, filler = 0
  for (const b of beats) {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line.trim()) { out.push(b); continue }
    // The hook and the CTA are never dropped or trimmed (a callback in the CTA
    // is deliberate); only their filler goes, and they count as said.
    if (/^(?:hook|cta)\b/i.test(String((b as { section?: unknown }).section ?? ''))) {
      for (const g of shingles(line, 4)) said.add(g)
      const clean = stripSpokenFiller(line)
      if (clean !== line) filler++
      out.push(clean === line ? b : { ...b, line: clean })
      continue
    }
    if (o.size && runOverlap(line, o) >= 0.5 && runOverlap(line, h) < 0.5) { copied++; continue }
    const kept = clausesOf(line).filter((c) => {
      const rep = shingles(c, 4).size >= 2 && runOverlap(c, said, 4) >= 0.6
      if (rep) repeats++
      return !rep
    })
    for (const g of shingles(line, 4)) said.add(g)
    let text = kept.join(' ').replace(/\s+/g, ' ').trim().replace(/^(?:and|so|but)\s+/i, '').replace(/^[,;\s]+/, '').replace(/,$/, '.')
    if (!text || !/[a-z0-9]/i.test(text)) continue
    text = text.charAt(0).toUpperCase() + text.slice(1)
    const clean = stripSpokenFiller(text)
    if (clean !== text) filler++
    out.push(clean === line ? b : { ...b, line: clean })
  }
  return { beats: out, copied, repeats, filler }
}
