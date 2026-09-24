// THE LIBRARIAN — "this goes there".
//
// A read video yields a few notes (its topic, its hook, its argument, its proof,
// the objection it answers, how it closes). Each note is either a new idea or a
// new SIGHTING of an idea the library already holds. Merging sightings is the
// whole point: a hook seen in forty videos with their summed views is evidence;
// forty near-identical rows are noise that biases every count (the lesson of
// 0200, where duplicates doubled the weight of whatever was duplicated).
//
// Pure: which notes a read produces, how they link, and the merge decision.

import type { CorpusRead } from './reader.js'

export type NoteKind = 'topic' | 'hook' | 'angle' | 'proof' | 'objection' | 'cta'
export type Relation = 'opened_with' | 'argued_by' | 'proved_by' | 'answers' | 'closes_with' | 'related'

export interface NoteDraft {
  kind: NoteKind
  bucket: string | null
  sub_niche: string | null
  mode: string | null
  goal: string | null
  key: string
  title: string
  body: string | null
}

/** At or above: the same idea, merge. Between: a new note LINKED as related. */
export const MERGE_AT = 0.9
export const RELATED_AT = 0.8
/** How many source ids a note keeps; times_seen keeps the full count. */
export const MAX_SOURCES = 25

export function noteKey(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s[\]]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
}

/** The notes one read contributes, topic first (the others link from it). */
export function notesFromRead(r: CorpusRead): NoteDraft[] {
  if (!r.readable || !r.topic) return []
  const base = { bucket: r.bucket, sub_niche: r.sub_niche, mode: r.mode, goal: r.goal }
  const out: NoteDraft[] = []
  const add = (kind: NoteKind, title: string | null | undefined, body: string | null = null) => {
    if (!title) return
    const key = noteKey(title)
    if (key.length < 3) return
    out.push({ ...base, kind, key, title, body })
  }
  add('topic', r.topic, r.why_it_works)
  add('hook', r.hook_pattern, r.hook_type)
  const s = r.structure
  if (s && (s.before_ask || s.ask)) {
    add('angle', [s.before_ask, s.ask, s.after_ask].filter(Boolean).join(' → '), r.why_it_works)
  }
  add('proof', r.persuasion?.proof)
  add('objection', r.persuasion?.objection)
  add('cta', r.persuasion?.cta)
  return out
}

const RELATION_FROM_TOPIC: Record<Exclude<NoteKind, 'topic'>, Relation> = {
  hook: 'opened_with', angle: 'argued_by', proof: 'proved_by', objection: 'answers', cta: 'closes_with',
}
export function relationFor(kind: NoteKind): Relation | null {
  return kind === 'topic' ? null : RELATION_FROM_TOPIC[kind]
}

export type Placement =
  | { action: 'merge'; into: string }
  | { action: 'new'; relatedTo: string | null }

/** Decide from the nearest existing notes (same kind + sub-niche). */
export function place(nearest: readonly { id: string; similarity: number }[]): Placement {
  const best = [...nearest].sort((a, b) => b.similarity - a.similarity)[0]
  if (!best || !Number.isFinite(best.similarity)) return { action: 'new', relatedTo: null }
  if (best.similarity >= MERGE_AT) return { action: 'merge', into: best.id }
  if (best.similarity >= RELATED_AT) return { action: 'new', relatedTo: best.id }
  return { action: 'new', relatedTo: null }
}

/** Text that is embedded for a note: kind + where it lives + what it says. */
export function embedText(n: NoteDraft): string {
  return `${n.kind} | ${n.sub_niche ?? n.bucket ?? ''} | ${n.title}${n.body ? ` — ${n.body}` : ''}`
}
