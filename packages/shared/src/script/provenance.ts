// PROVENANCE, IDS ONLY (brief item 1.4).
//
// For each generated script: which knowledge items fed it, and per sentence
// which (at most two) items it most plausibly came from. The output carries
// ids, indexes and a boolean — NEVER text — so it is safe to log.
//
// Attribution is content-word overlap: stop words removed (the shared
// STOPWORDS list in hookContract), words stemmed (scriptIntegrity's stem).
// overlap = shared / min(|sentence words|, |item words|), and at least two
// shared words are required so one common word never attributes a sentence.

import { STOPWORDS } from './hookContract.js'
import { stem } from './scriptIntegrity.js'

export interface ProvenanceItem { id?: unknown; text?: unknown }

export interface ProvenanceInput {
  facts?: readonly ProvenanceItem[] | null
  notes?: unknown
  lessons?: readonly ProvenanceItem[] | null
  stories?: readonly ProvenanceItem[] | null
  sentences?: readonly unknown[] | null
}

export interface Provenance {
  fact_ids: string[]
  lesson_ids: string[]
  story_ids: string[]
  note_present: boolean
  sentences: Array<{ i: number; item_ids: string[] }>
}

export const PROVENANCE_MIN_OVERLAP = 0.6
export const PROVENANCE_MAX_ITEMS = 2

export function provenanceWords(text: unknown): Set<string> {
  const out = new Set<string>()
  for (const w of String(text ?? '').toLowerCase().split(/[^a-z0-9']+/)) {
    const lw = w.replace(/'s?$/, '').replace(/'/g, '')
    if (lw.length < 3 || STOPWORDS.has(lw)) continue
    out.add(stem(lw))
  }
  return out
}

function idsOf(items: readonly ProvenanceItem[] | null | undefined): string[] {
  const out: string[] = []
  for (const it of items ?? []) {
    const id = String(it?.id ?? '').trim()
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

export function buildProvenance(input: ProvenanceInput): Provenance {
  const facts = input.facts ?? []
  const lessons = input.lessons ?? []
  const stories = input.stories ?? []
  const pool = [...facts, ...lessons, ...stories]
    .map((it) => ({ id: String(it?.id ?? '').trim(), words: provenanceWords(it?.text) }))
    .filter((it) => it.id !== '' && it.words.size > 0)
  const sentences = (input.sentences ?? []).map((s, i) => {
    const sw = provenanceWords(s)
    const scored: Array<{ id: string; score: number }> = []
    if (sw.size > 0) {
      for (const it of pool) {
        let shared = 0
        for (const w of sw) if (it.words.has(w)) shared++
        if (shared < 2) continue
        const score = shared / Math.min(sw.size, it.words.size)
        if (score >= PROVENANCE_MIN_OVERLAP && !scored.some((x) => x.id === it.id)) scored.push({ id: it.id, score })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return { i, item_ids: scored.slice(0, PROVENANCE_MAX_ITEMS).map((x) => x.id) }
  })
  return {
    fact_ids: idsOf(facts),
    lesson_ids: idsOf(lessons),
    story_ids: idsOf(stories),
    note_present: String(input.notes ?? '').trim() !== '',
    sentences,
  }
}
