// THE STORY QUESTION ENGINE, CORE (Create flow spec v4, Part 7).
//
// A question is built from the picked angle's one missing piece, anchored in
// something she actually said, and checked in code before anyone sees it.
// Stories climb a ladder (setup → complication → turn → resolution → meaning
// → detail) so questions deepen instead of repeating. This module is pure:
// the model only words a question; these rules pick the target, supply the
// deterministic fallback and refuse anything that would invite fiction.

import { findNovelDetails } from './novelDetail.js'

export type LadderLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type AngleKind = 'moment' | 'myth' | 'show' | 'answer' | 'offer' | 'stand' | 'behind' | 'beforeafter'

export const LADDER: Record<LadderLevel, { beat: string; gets: string }> = {
  0: { beat: 'no_story', gets: 'a moment, if one exists' },
  1: { beat: 'setup', gets: 'where and when, what she was trying to do' },
  2: { beat: 'complication', gets: 'what went wrong or surprised her' },
  3: { beat: 'turn', gets: 'what she did or decided' },
  4: { beat: 'resolution', gets: 'how it ended' },
  5: { beat: 'meaning', gets: 'what changed afterward' },
  6: { beat: 'detail', gets: 'a quote, object or number she already mentioned' },
}

/** Most valuable missing beat first: turn, resolution, complication, setup, meaning. */
const LADDER_PRIORITY: LadderLevel[] = [3, 4, 2, 1, 5]

export interface StoryState { storyId: string; anchor: string; have: LadderLevel[] }

/** The next beat to ask about, or null when the story is complete (1–5 all known). */
export function nextBeat(story: StoryState): LadderLevel | null {
  if (!story.anchor.trim()) return 0
  for (const l of LADDER_PRIORITY) if (!story.have.includes(l)) {
    // Resolution is asked only once the turn is known.
    if (l === 4 && !story.have.includes(3)) continue
    return l
  }
  return null
}

const snip = (t: string, max = 8): string => {
  const words = t.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').split(' ')
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ')}…`
}

/** Deterministic, anchored fallback for a ladder beat (spec 7.4). Never invents. */
export function ladderTemplate(level: LadderLevel, anchor: string, topic: string): string {
  const a = snip(anchor)
  switch (level) {
    case 0: return `Has ${topic} ever come up in real life for you? If so, what happened?`
    case 1: return `You said "${a}". Where were you when that happened?`
    case 2: return `You said "${a}". When did you first notice something was off, and what did you see?`
    case 3: return `After "${a}", what did you do next?`
    case 4: return 'How did that end up?'
    case 5: return 'Is there anything you do differently now because of that? If so, what?'
    case 6: return `You mentioned "${a}". What exactly was said?`
  }
}

/** Non-story angle templates (spec 7.4 lower table). */
export function angleTemplate(kind: AngleKind, slot: string, topic: string): string | null {
  if (kind === 'myth') return slot === 'truth' ? `What's actually true about ${topic}?` : `What do people assume about ${topic}?`
  if (kind === 'answer') return `What's the question you hear most about ${topic}? If you hear one, what do you tell people?`
  if (kind === 'offer') return 'Is anything different this time (size, price, roast), or exactly as before?'
  if (kind === 'stand') return `What do you think about ${topic} that most people don't?`
  if (kind === 'behind') return `What's one step in your ${topic} people never see?`
  if (kind === 'beforeafter') return `Has ${topic} ever changed for you? If so, what changed?`
  return null
}

export interface QuestionCheck { ok: boolean; reasons: string[] }

const HYPOTHETICAL = /\b(?:imagine|what if|suppose|pretend|let'?s say|would you rather)\b/i
const PRESUMES = /\b(?:when you (?:almost|nearly|lost|failed|cried|panicked)|how did it feel when|what was the hardest|how scared|how embarrassed)\b/i
const SAFE_FRAME = /\b(?:if so|did you|has .{0,40} ever|is there|was there|have you ever)\b/i
const SENSITIVE = /\b(?:health|illness|diagnos\w*|divorce|debt|money troubles|court|police|arrest\w*|grief|death|pregnan\w*|depress\w*)\b/i
const STOP = new Set('what when where your that this with have about from they them there then into just very more most some does were said told ever been'.split(' '))
const words = (t: string): Set<string> => new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)))

/** Meaning-ish duplicate: two questions sharing most of their content words. */
export function isDuplicateQuestion(q: string, asked: readonly string[]): boolean {
  const a = words(q)
  if (!a.size) return false
  return asked.some((p) => {
    const b = words(p)
    let shared = 0
    for (const w of a) if (b.has(w)) shared++
    return shared / Math.min(a.size, Math.max(1, b.size)) >= 0.6
  })
}

/**
 * Every question must (spec 7.5): be anchored in her words or topic, ask for
 * one piece, be 25 words or fewer, not presume, add nothing new, use no
 * hypotheticals, not raise a sensitive topic she did not raise, not repeat.
 */
export function validateLadderQuestion(q: string, ctx: { herWords: string; topic: string; asked: readonly string[]; confirmedEvent?: boolean; followUp?: boolean }): QuestionCheck {
  const reasons: string[] = []
  const text = q.trim()
  if (text.split(/\s+/).length > 25) reasons.push('too_long')
  // The spec's own patterns end "…? If so, what happened?": a guarded follow-up, still one piece.
  if ((text.replace(/\?\s*If (?:so|you (?:do|hear one)),[^?]*\?\s*$/i, '?').match(/\?/g) ?? []).length !== 1) reasons.push('not_one_question')
  if (HYPOTHETICAL.test(text)) reasons.push('hypothetical')
  if (!ctx.confirmedEvent && PRESUMES.test(text) && !SAFE_FRAME.test(text)) reasons.push('presumes')
  const material = `${ctx.herWords}\n${ctx.topic}`
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
  const anchored = quoted.length > 0
    ? quoted.every((s) => material.toLowerCase().includes(s.replace(/…$/, '').toLowerCase().slice(0, 40)))
    : [...words(text)].some((w) => words(material).has(w))
  // Resolution and meaning follow a story already anchored in the same card.
  if (!anchored && !ctx.followUp) reasons.push('not_anchored')
  if (findNovelDetails([text.replace(/"[^"]*"/g, '')], material).length) reasons.push('adds_detail')
  if (SENSITIVE.test(text) && !SENSITIVE.test(material)) reasons.push('sensitive_not_hers')
  if (isDuplicateQuestion(text, ctx.asked)) reasons.push('duplicate')
  return { ok: reasons.length === 0, reasons }
}
