// GENERATED FROM packages/shared/src/script/lineSources.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// WHERE DID THIS LINE COME FROM (fact-scoping part 3, 2026-09-29).
//
// ⚠️ WHY. Every leak so far was found by her reading a line and asking "I never
// told it that". Nothing on the page could answer. This traces each spoken
// sentence of the finished script back to what the writer was given: a stored
// fact (by id), her own words for this video, the product, or the brand. A
// sentence that matches nothing is shown as "Twin's wording" so she can see
// exactly which lines rest on nothing she gave.
//
// ⚖️ DETERMINISTIC AND CHEAP: shared 3-word runs (stop words dropped), a shared
// stated quantity, or two shared distinctive words. No model, so the answer is
// the same every time and cannot be talked round.

import { statedQuantities } from './privacyGuard.ts'

export type LineSourceKind = 'fact' | 'her_words' | 'product' | 'brand'
export interface LineSourceInput { kind: LineSourceKind; label: string; text: string; id?: string }
export interface LineSourceHit { kind: LineSourceKind; label: string; id?: string }
export interface TracedLine { beat: number; sentence: string; from: LineSourceHit[] }

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'my', 'i', 'it', 'is', 'was', 'for', 'with', 'that', 'this', 'at', 'her', 'she', 'you', 'your', 'from', 'by', 'be', 'are', 'so', 'but', 'just', 'what', 'when', 'about', 'have', 'had', 'not', 'there', 'they', 'them', 'then', 'into', 'every', 'really', 'because'])
// "roasts" and "roast", "roasted" and "roasting" are the same word here.
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w)
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem)
function runs(ws: string[], n = 3): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '))
  return out
}
const SENTENCES = /(?<=[.!?])\s+/

/** Each spoken sentence, with every source it rests on (empty = Twin's own wording). */
export function traceLines(
  beats: ReadonlyArray<{ line?: unknown }>,
  sources: readonly LineSourceInput[],
): TracedLine[] {
  const prepared = sources.filter((s) => s.text.trim()).map((s) => {
    const ws = words(s.text)
    return { s, runs: runs(ws), distinct: new Set(ws.filter((w) => w.length >= 5)), qty: statedQuantities(s.text) }
  })
  const out: TracedLine[] = []
  beats.forEach((b, beat) => {
    const line = typeof b.line === 'string' ? b.line.trim() : ''
    if (!line) return
    for (const sentence of line.split(SENTENCES)) {
      const ws = words(sentence)
      const r = runs(ws)
      const distinct = ws.filter((w) => w.length >= 5)
      const qty = statedQuantities(sentence)
      const from: LineSourceHit[] = []
      for (const p of prepared) {
        const hit = [...r].some((x) => p.runs.has(x))
          || [...qty].some((q) => p.qty.has(q))
          || distinct.filter((w) => p.distinct.has(w)).length >= 2
        if (hit && !from.some((f) => f.kind === p.s.kind && f.label === p.s.label)) {
          from.push({ kind: p.s.kind, label: p.s.label, ...(p.s.id ? { id: p.s.id } : {}) })
        }
      }
      out.push({ beat, sentence, from: from.slice(0, 3) })
    }
  })
  return out
}

/**
 * A precise method nobody gave (audit 2026-09-29, the espresso run: tamping,
 * "honey stream" extraction, a pinch of cinnamon). The writer's rule against
 * invented technique was ignored twice; this is the deterministic backstop.
 * Only applied to a sentence that traces to nothing she supplied.
 */
const METHOD = /\b(\d+(?:\.\d+)?\s*(?:g|grams?|ml|oz|ounces?|°|degrees?|seconds?|secs?|minutes?|mins?|%)|grams?|milliliters?|degrees|temperature|ratio|dose|dosing|tamp\w*|grind(?:er|ing)?\s+(?:size|setting)|extraction|extract(?:ed|ing)?\s+for|pinch|teaspoons?|tablespoons?|tsp|tbsp|preheat\w*|dial(?:ed|ing)?\s+in|bloom\w*|steep\w*\s+for|brew\s+for|stream)\b/i
export function isInventedMethod(t: TracedLine): boolean {
  return t.from.length === 0 && METHOD.test(t.sentence)
}
