// GENERATED FROM packages/shared/src/script/novelDetail.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// EVERY SPECIFIC IN A SCRIPT TRACES TO HER MATERIAL (owner WS1, 2026-10-05).
//
// ⚠️ Blind set 2 still carried invented details the reviewer never listed:
// "equal parts water or milk", "lasts all week" (#9), "to hide age",
// "growing up", "recently" (#2), "I know that exact dread" (#17). The caps
// fired only on claims the model chose to name, so this check does not ask a
// model: it pulls the specifics out of each sentence — numbers, ratios,
// durations, time words, relatives, named items, emotional states — and looks
// each one up in what she gave (facts, answers, approved claims). A specific
// found nowhere is NOVEL: removed from the script, and counted for the
// reviewer's caps.

export type SpecificKind = 'number' | 'ratio' | 'duration' | 'time' | 'relative' | 'named' | 'emotion' | 'event' | 'method' | 'claim' | 'reason' | 'embellish'
export interface Specific { kind: SpecificKind; text: string }

const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|hundred|thousand|half|double|triple|dozen'
const PATTERNS: Array<[SpecificKind, RegExp]> = [
  ['ratio', /\b(?:\d+\s*(?::|to)\s*\d+|equal parts|half and half|double[- ]strength|triple[- ]strength|1:1|2:1)\b/gi],
  ['duration', new RegExp(`\\b(?:\\d+|${NUMBER_WORDS}|a|few|several)[- ](?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\\b|\\b(?:all|every)\\s+(?:week|day|month|morning|year)(?:\\s+long)?\\b|\\bovernight\\b|\\b(?:spent|spend|spends|for|sit|sat|sits|sitting)\\s+(?:\\w+\\s+)?(?:weeks|months|years)\\b`, 'gi')],
  ['number', /(?:\$|£|€)\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:%|percent|lbs?|pounds?|oz|ounces?|grams?|kg|bags?|cups?|batches?|customers?|orders?|people|followers?)?\b/gi],
  // Blind set 3 #15: "a focused three drink menu". A count written as a word.
  ['number', /\b(?:two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)[- ](?!(?:ounce|pound|oz|lb|gram|kilo|minute|second|hour)s?\b)(?:[a-z]+[- ])?(?:drinks?|items?|steps?|ingredients?|flavou?rs?|options?|machines?|bags?|batches?|customers?|orders?|markets?|menus?|days?|weeks?|months?|years?)\b/gi],
  ['time', /\b(?:recently|growing up|as a kid|last (?:week|month|year|summer|winter)|yesterday|this morning|years ago|back then|early on|for years|lately)\b/gi],
  ['relative', /\b(?:my|her|his|their)\s+(?:mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|sister|brother|husband|wife|partner|son|daughter|kids?|aunt|uncle|cousin|best friend)\b/gi],
  // Blind set 2 #4 (owner 5, reviewer 7.9): "Grocery store coffee tasted
  // burned, so I started roasting my own" — an origin she never told. A
  // first-person past event is a specific too: its verb and object must be hers.
  // Set 4 #13 "I got completely stuck…", #5 "I ordered … skipped … loaded":
  // the fixed verb list missed them. Any first-person past action counts.
  ['event', /\bI\s+(?:\w+ly\s+)?(?:got|went|felt|had|made|took|spent|lost|threw|sold|bought|grew up|used to|[a-z]{3,}ed)\b(?:\s+(?:to|a|an|the|my|our|into|up|out|in|on))?(?:\s+[a-z]+){0,3}/g],
  // Blind set 3 T2: "pour it over ice or blend it with milk" for a product
  // with nothing on file. How to use or make a thing is a specific too.
  ['method', /\b(?:pour(?:ed|ing)? (?:it )?over ice|blend(?:ed)? (?:it )?with|dilut(?:e|ed|ing) (?:it )?with|cut (?:it )?with (?:water|milk)|steep(?:ed|ing)? (?:it )?(?:for|overnight)|mix(?:ed)? (?:it )?with|shake (?:it )?with)\b/gi],
  // Set 4 #2 "uniform surface without … yellow spots", #4 "even matte finish",
  // T3 "boiling water scorches the grounds", T5 "scorching away origin
  // flavors": general mechanism and "how it looks" claims nothing of hers
  // backs. Held until a verified-claims library exists (owner plan B6b).
  ['claim', /\b(?:scorch(?:es|ed|ing)?|extract(?:s|ion|ed|ing)?|burn(?:s|ed|ing)? (?:off|away)|oxidi[sz]\w*|degrad\w*|oils?|oily|matte|shiny|glossy|uniform\w*|yellow spots?|boiling|caffeine)\b/gi],
  // Paired 14A "bake beans dark to hide age", C8 "you absorb their scale…":
  // a REASON she never gave for why something is so.
  ['reason', /\b(?:to (?:hide|mask|cover(?: up)?|disguise)|in order to|so that they|because (?:they|it|commercial|grocery|big|most))\b(?:\s+[a-z']+){1,4}/gi],
  // C7 "her line stretching across the parking lot", C10 "holiday blends
  // sell out instantly", C2 "taste just like roast day": vivid outcomes and
  // absolutes added to make a line land.
  ['embellish', /\b(?:stretch(?:ed|ing)? (?:across|around|down)(?:\s+[a-z]+){1,3}|sells? out (?:instantly|immediately|in (?:minutes|hours|seconds))|(?:taste|tastes|tasting) (?:just )?like (?:roast day|the day it was roasted)|flew off the shelves?|went viral|line out the door)\b/gi],
  ['emotion', /\b(?:dread|terrified|terrifying|panic(?:ked)?|devastated|heartbroken|thrilled|ecstatic|overwhelmed|stressed|anxious|scared|ashamed|embarrassed|in tears|cried|crying|shaking)\b/gi],
]
// Named items: two or more Capitalised words not at the start of the sentence.
const NAMED = /(?<=[a-z,;:] )(?:[A-Z][a-zA-Z'-]+(?:\s+(?:&|of|and)\s+[A-Z][a-zA-Z'-]+|\s+[A-Z][a-zA-Z'-]+)+)/g

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9$%:£€ ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** The specifics a sentence asserts. */
function extractSpecifics(sentence: string): Specific[] {
  const out: Specific[] = []
  const seen = new Set<string>()
  for (const [kind, re] of PATTERNS) {
    for (const m of sentence.matchAll(new RegExp(re.source, re.flags))) {
      const text = m[0].trim()
      if (!text || /^\d$/.test(text) && kind === 'number' && /\b(?:step|part|number)\s*$/i.test(sentence.slice(0, m.index))) continue
      const k = `${kind}:${norm(text)}`
      if (seen.has(k) || !norm(text)) continue
      seen.add(k)
      out.push({ kind, text })
    }
  }
  for (const m of sentence.matchAll(NAMED)) {
    const k = `named:${norm(m[0])}`
    if (!seen.has(k)) { seen.add(k); out.push({ kind: 'named', text: m[0].trim() }) }
  }
  return out
}

/** A specific is supported when its words appear in her material (numbers as written or as words). */
function isSupported(s: Specific, material: string): boolean {
  const m = ` ${norm(material)} `
  const t = norm(s.text)
  if (!t) return true
  if (m.includes(` ${t} `) || m.includes(t)) return true
  const WORD_NUM: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', twelve: '12', fifteen: '15', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70', 'seventy five': '75', hundred: '100' }
  for (const [w, d] of Object.entries(WORD_NUM)) if (t.startsWith(`${w} `) && m.includes(`${d} ${t.slice(w.length + 1).split(' ')[0]!.replace(/s$/, '')}`)) return true
  if (s.kind === 'number' || s.kind === 'duration') {
    const digits = t.match(/\d[\d,.]*/)?.[0]?.replace(/,/g, '')
    if (digits && m.includes(digits)) return true
  }
  if (s.kind === 'method') {
    const verb = t.split(' ')[0]!.replace(/(?:ed|ing|e)$/, '')
    return m.includes(` ${verb}`) && /(ice|milk|water|overnight)/.test(m)
  }
  if (s.kind === 'event') {
    const words = t.split(' ').slice(1)
    const verb = words[0] ?? ''
    const objs = words.slice(1).filter((w) => w.length > 3 && !['your', 'their', 'with', 'from', 'that', 'this'].includes(w))
    const adverb = /ly$/.test(verb)
    const v = adverb ? (words[1] ?? '') : verb
    const rest = adverb ? words.slice(2) : words.slice(1)
    const stem = v.length <= 4 ? v : v.replace(/(?:ied|ed|d)$/, '').slice(0, Math.max(3, v.length - 3))
    const content = rest.filter((w) => w.length > 3 && !['your', 'their', 'with', 'from', 'that', 'this', 'completely', 'really', 'just', 'very', 'even', 'before', 'after'].includes(w))
    return m.includes(` ${stem}`) && (content.length === 0 || content.some((w) => m.includes(w.replace(/(?:ing|ed|s)$/, ''))))
  }
  if (s.kind === 'reason' || s.kind === 'embellish') {
    // Supported only when the words it adds are hers.
    const words = t.split(' ').filter((w) => w.length > 3 && !['hide', 'mask', 'cover', 'disguise', 'order', 'because', 'that', 'they', 'just', 'like', 'stretching', 'stretched', 'stretch', 'across', 'around', 'down', 'sell', 'sells', 'tastes', 'taste', 'tasting'].includes(w))
    return words.length > 0 && words.every((w) => m.includes(w.replace(/(?:ing|ed|es|s)$/, '')))
  }
  if (s.kind === 'claim') {
    const stem = t.split(' ')[0]!.replace(/(?:es|ed|ing|ion|s)$/, '').slice(0, 6)
    return m.includes(stem)
  }
  if (s.kind === 'named') {
    const words = t.split(' ').filter((w) => w.length > 3)
    return words.length > 0 && words.every((w) => m.includes(w))
  }
  return false
}

export interface NovelFinding { line: number; sentence: string; novel: Specific[] }

/** Novel specifics, line by line. `material` = her facts, answers, product facts, approved claims, the brief. */
export function findNovelDetails(lines: readonly string[], material: string): NovelFinding[] {
  const out: NovelFinding[] = []
  lines.forEach((line, i) => {
    for (const sentence of line.match(/[^.!?]+[.!?]*/g) ?? []) {
      // "If you brew at home every morning…" describes the viewer, not her.
      const aboutViewer = /^\s*(?:(?:so|and|but|now),?\s+)?(?:if|when|whether|do|does|did|are|have|what|how)\s+you\b|^\s*you(?:'re|r)?\b/i.test(sentence)
      const novel = extractSpecifics(sentence)
        .filter((s) => !(aboutViewer && (s.kind === 'duration' || s.kind === 'time')))
        // "Is your bag shiny or matte?" asks; it does not claim.
        .filter((s) => !(s.kind === 'claim' && /\?\s*$/.test(sentence)))
        // "…what you brew every morning": the viewer's routine, not her claim.
        .filter((s) => !(s.kind === 'duration' && /^every\s/i.test(s.text) && /\b(?:you|your)\b/i.test(sentence) && !/\b(?:I|my|me|we|our)\b/.test(sentence)))
        .filter((s) => !isSupported(s, material))
      if (novel.length) out.push({ line: i, sentence: sentence.trim(), novel })
    }
  })
  return out
}

/** Counts by kind, for the reviewer's caps and the weekly numbers. */
export function novelCounts(findings: readonly NovelFinding[]): Record<SpecificKind, number> {
  const c: Record<SpecificKind, number> = { number: 0, ratio: 0, duration: 0, time: 0, relative: 0, named: 0, emotion: 0, event: 0, method: 0, claim: 0, reason: 0, embellish: 0 }
  for (const f of findings) for (const s of f.novel) c[s.kind]++
  return c
}

/**
 * Removal (trial): drop each sentence that carries a novel specific. A beat
 * left empty is dropped, except the first (hook) and last (close), which keep
 * their original line — a missing hook or close is worse than one detail, and
 * the reviewer's cap still counts it. Returns what was removed for the log.
 */
export function dropNovelSentences<B extends { line?: unknown }>(beats: readonly B[], material: string): { beats: B[]; removed: string[]; kept: string[] } {
  const removed: string[] = [], kept: string[] = []
  const out: B[] = []
  beats.forEach((b, i) => {
    if (typeof b.line !== 'string' || !b.line.trim()) { out.push(b); return }
    const found = findNovelDetails([b.line], material)
    if (!found.length) { out.push(b); return }
    const bad = new Set(found.map((f) => f.sentence))
    const rest = (b.line.match(/[^.!?]+[.!?]*/g) ?? []).filter((s) => !bad.has(s.trim())).join('').trim()
    if (rest) { removed.push(...bad); out.push({ ...b, line: rest }); return }
    if (i === 0 || i === beats.length - 1) { kept.push(...bad); out.push(b); return }
    removed.push(...bad)
  })
  return { beats: out, removed, kept }
}
