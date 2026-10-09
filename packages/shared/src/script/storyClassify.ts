/**
 * PLAN 2.3 — A MODEL READS EACH TRANSCRIPT FOR A COMPLETE STORY.
 *
 * The regex rule (`isCompleteStory`, passages.ts) scored 0 of 5 on a creator's
 * real spoken videos and 2 of 5 at best after widening (precision 0.5): spoken
 * stories date themselves as "the other day", not "last summer". So the model
 * labels the three beats and the rule stays only as a cheap prefilter.
 *
 * Pure: builds the prompt and schema, reads the answer back, scores against a
 * hand key. The model call itself lives in the caller.
 */

export interface StoryLabel {
  id: string
  /** A specific moment that happened to her (time, place or event). */
  anchor: boolean
  /** Something went wrong, changed or surprised her after it. */
  turn: boolean
  /** How it ended, or what it meant to her, in her words. */
  resolution: boolean
  /** All three beats present, in that order. */
  complete: boolean
}

export const STORY_CLASSIFY_SYSTEM = [
  'You read short-video transcripts by one creator and decide whether each one contains a STORY she lived.',
  'A complete story has three beats, in order:',
  '1. anchor: a specific moment that happened to her (when, where, or an event), spoken any way ("the other day", "today", "two years ago", "I just got off the phone").',
  '2. turn: something went wrong, changed, or surprised her after it.',
  '3. resolution: how it ended or what it meant to her, in her own words.',
  'Not a story: product descriptions, tips or advice to the viewer, song lyrics, greetings, a feeling with no event, or a situation that has not ended or been reflected on.',
  'A partial story (a real moment missing a beat) is NOT complete. Judge only what is said; never assume a beat.',
].join('\n')

export const STORY_CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          anchor: { type: 'boolean' },
          turn: { type: 'boolean' },
          resolution: { type: 'boolean' },
        },
        required: ['id', 'anchor', 'turn', 'resolution'],
      },
    },
  },
  required: ['labels'],
} as const

export function buildStoryClassifyPrompt(items: ReadonlyArray<{ id: string; text: string }>): string {
  return items.map((t) => `### ${t.id}\n${t.text.replace(/\s+/g, ' ').trim().slice(0, 6000)}`).join('\n\n')
}

/** Read the model's answer; unknown ids are dropped, missing ids default to not-a-story. */
export function parseStoryLabels(raw: unknown, ids: readonly string[]): StoryLabel[] {
  const rows = (raw as { labels?: unknown })?.labels
  const byId = new Map<string, StoryLabel>()
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const o = r as Record<string, unknown>
      const id = typeof o?.id === 'string' ? o.id.trim() : ''
      if (!ids.includes(id)) continue
      const anchor = o.anchor === true, turn = o.turn === true, resolution = o.resolution === true
      byId.set(id, { id, anchor, turn, resolution, complete: anchor && turn && resolution })
    }
  }
  return ids.map((id) => byId.get(id) ?? { id, anchor: false, turn: false, resolution: false, complete: false })
}

export interface StoryScore { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number }

/** Precision and recall of `complete` against a hand key of complete-story ids. */
export function scoreStoryLabels(labels: readonly StoryLabel[], completeIds: ReadonlySet<string>): StoryScore {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const l of labels) {
    const truth = completeIds.has(l.id)
    if (l.complete && truth) tp++
    else if (l.complete) fp++
    else if (truth) fn++
    else tn++
  }
  return { tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0 }
}
