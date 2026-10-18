// GENERATED FROM packages/shared/src/script/storyFirst.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// STORY FIRST: A STORY ON FILE THAT MATCHES THE REQUEST IS TOLD VERBATIM.
//
// Owner, panel-current-5 (fictional panel): "my first kiln load" and "the AI
// that misquoted my own newsletter" each had a matching story on file, and the
// writer invented events instead. One was withheld before the writer saw it
// (the off-topic gate, see `gateStories` `askedText`); the other reached the
// writer as "keep her wording" advice and came back retold with new events.
//
// ⚖️ TRIAL ONLY, behind the STORY_FIRST kill switch at the edge. Pure, no I/O.
//   1. `askedStory`: the story her request names (her note), or null.
//   2. `checkStoryInScript`: are the story's key facts in the script, and is
//      the story there word for word?
//   3. `enforceStoryFirst`: when it is not there verbatim, her story replaces
//      the beat that retells it, and other sentences that retell it (2+ of its
//      key facts) are dropped, so it is told once and nothing is added to it.
//
// Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs).

import { contentTerms, isAskedStory, storyTopicMatch, STORY_KINDS } from './storyRotation.ts'

export interface StoryRow { id?: unknown; kind?: unknown; text?: unknown; evidence?: unknown }

/** The story-kind row her request (note) names, best match first; null when none does. */
export function askedStory<T extends StoryRow>(rows: readonly T[], requestText: string | null | undefined): T | null {
  const topic = contentTerms(requestText ?? '')
  if (topic.size === 0) return null
  let best: T | null = null
  let bestShared = 0
  for (const r of rows) {
    if (!STORY_KINDS.has(String(r?.kind ?? ''))) continue
    const own = contentTerms(`${String(r.text ?? '')} ${String(r.evidence ?? '')}`)
    if (!isAskedStory(own, topic)) continue
    const m = storyTopicMatch(own, topic)
    if (m.shared > bestShared) { best = r; bestShared = m.shared }
  }
  return best
}

// Words that carry no fact of the story ("because", "came", "every").
const NOT_A_FACT: ReadonlySet<string> = new Set(['because', 'came', 'went', 'ever', 'never', 'some', 'there', 'here', 'after', 'before', 'which', 'would', 'could', 'should', 'being', 'been'])

/** The story's key facts: its content words (length > 3, plural folded), filler out. */
export function storyKeyFacts(text: string): string[] {
  return [...contentTerms(text)].filter((w) => !NOT_A_FACT.has(w))
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export interface StoryCheck { verbatim: boolean; found: number; total: number; missing: string[] }

/** Key facts of the story present in the script, and whether the story is there word for word. */
export function checkStoryInScript(story: string, lines: readonly string[]): StoryCheck {
  const all = lines.join(' ')
  const have = contentTerms(all)
  const facts = storyKeyFacts(story)
  const missing = facts.filter((f) => !have.has(f))
  const n = norm(story)
  return { verbatim: n.length > 0 && ` ${norm(all)} `.includes(` ${n} `), found: facts.length - missing.length, total: facts.length, missing }
}

const sentences = (t: string): string[] => (t.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? []).map((x) => x.trim()).filter(Boolean)

export interface StoryFirstRecord {
  /** The writer's own script already told it word for word. */
  verbatim_as_written: boolean
  /** After the repair: the story is in the script word for word. */
  verbatim: boolean
  repaired: boolean
  key_facts_found: number
  key_facts_total: number
  dropped_retellings: number
}

/**
 * Hold the script to her story: verbatim, once. Beats keep their order and
 * other fields; only `line` changes. A beat emptied by dropping a retelling is
 * removed. The hook is never cut.
 */
export function enforceStoryFirst<B extends { line?: unknown }>(script: readonly B[], story: string): { script: B[]; record: StoryFirstRecord } {
  const told = String(story ?? '').trim()
  const lineOf = (b: B) => String(b?.line ?? '')
  const before = checkStoryInScript(told, script.map(lineOf))
  if (!told || script.length === 0) {
    return { script: [...script], record: { verbatim_as_written: before.verbatim, verbatim: before.verbatim, repaired: false, key_facts_found: before.found, key_facts_total: before.total, dropped_retellings: 0 } }
  }
  const facts = new Set(storyKeyFacts(told))
  const overlap = (t: string) => { let n = 0; for (const w of contentTerms(t)) if (facts.has(w)) n++; return n }
  let out = script.map((b) => ({ ...b }))
  let dropped = 0
  let repaired = false
  if (!before.verbatim) {
    // The beat that tells the story: most key facts, never the hook when there is a body.
    const from = out.length > 2 ? 1 : 0
    let at = from
    for (let i = from; i < out.length; i++) if (overlap(lineOf(out[i]!)) > overlap(lineOf(out[at]!))) at = i
    if (out.length > 2 && at === out.length - 1 && overlap(lineOf(out[at]!)) === 0) at = from
    out[at] = { ...out[at]!, line: told }
    repaired = true
    // Told once: sentences elsewhere that retell it (2+ of its key facts) go.
    out = out.map((b, i) => {
      if (i === at || i === 0) return b
      const ss = sentences(lineOf(b))
      const keep = ss.filter((x) => overlap(x) < 2)
      if (keep.length === ss.length) return b
      dropped += ss.length - keep.length
      return { ...b, line: keep.join(' ') }
    }).filter((b) => lineOf(b).trim() !== '')
  }
  const after = checkStoryInScript(told, out.map(lineOf))
  return { script: out, record: { verbatim_as_written: before.verbatim, verbatim: after.verbatim, repaired, key_facts_found: after.found, key_facts_total: after.total, dropped_retellings: dropped } }
}

/**
 * THE NAMED STORY SURVIVES THE FILTERS (panel-6 #14, #22; trial). Her note
 * named a story on file, but the purpose / ask filters upstream of the story
 * gate held it, and the material floor only restores when NOTHING is left.
 * When the kept rows hold no story her request names, the best-matching
 * eligible story from the full candidate set is put back first. `eligible`
 * carries the same guards as the floor (stated, her own, not sensitive, not
 * excluded, not on hold). Pure.
 */
export function restoreAskedStory<R extends StoryRow>(
  kept: readonly R[],
  candidates: readonly R[],
  requestText: string | null | undefined,
  eligible: (r: R) => boolean,
): { rows: R[]; restored: R | null } {
  if (askedStory(kept, requestText)) return { rows: [...kept], restored: null }
  const s = askedStory(candidates.filter(eligible), requestText)
  if (!s) return { rows: [...kept], restored: null }
  return { rows: [s, ...kept.filter((k) => k !== s)], restored: s }
}
