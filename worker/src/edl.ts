// Edit Decision List — the structured record of every choice the auto-edit made
// (cuts, captions, emoji, b-roll, music, framing, audio target). autoEdit emits
// one alongside the rendered MP4 so a future manual editor can load it, let the
// creator adjust, and re-render deterministically through the SAME ffmpeg path.
//
// This is the seam that lets auto-edit and manual-edit share one renderer without
// overlapping: auto-edit produces an EDL; manual-edit produces a modified EDL;
// both render from the same code. Versioned so the editor can migrate old edits.

import type { EditPlan } from './director.js'

export interface EdlSegment {
  // A kept window from the ORIGINAL take (the complement of the cut silence/fillers).
  start: number
  end: number
  zoom?: boolean // 'high' energy jump-zoom punch on this segment
}

export interface EdlWord {
  w: string
  start: number
  end: number
}

export interface EdlEmoji {
  emoji: string
  start: number
  end: number
}

export interface EdlBroll {
  query: string
  start: number
  end: number
}

export interface EditDecisionList {
  version: 1
  energy: 'high' | 'calm'
  variation: number
  // Cut decisions: kept windows of the original take, in order. When no jump-cut
  // was applied this is a single full-length segment.
  segments: EdlSegment[]
  // Caption words (already timed against the CUT timeline) + the styling knobs.
  captions: {
    style: 'pop'
    variation: number
    words: EdlWord[]
  }
  emoji: EdlEmoji[]
  broll: EdlBroll | null
  music: boolean
  framing: { width: number; height: number }
  audio: { targetLufs: number }
  durationSec: number
  createdAt: string
  // The AI Edit Director's full plan (grounded multi-broll, emphasis, trims,
  // transitions, caption style). Carried so the timeline + Revideo renderer can
  // use the rich plan even though today's ffmpeg path applies a subset.
  plan?: EditPlan
}

export function buildEdl(parts: {
  energy: 'high' | 'calm'
  variation: number
  segments: EdlSegment[]
  words: EdlWord[]
  emoji: EdlEmoji[]
  broll: EdlBroll | null
  music: boolean
  durationSec: number
  plan?: EditPlan
}): EditDecisionList {
  return {
    version: 1,
    energy: parts.energy,
    variation: parts.variation,
    segments: parts.segments,
    captions: { style: 'pop', variation: parts.variation, words: parts.words },
    emoji: parts.emoji,
    broll: parts.broll,
    music: parts.music,
    framing: { width: 1080, height: 1920 },
    audio: { targetLufs: -14 },
    durationSec: parts.durationSec,
    createdAt: new Date().toISOString(),
    plan: parts.plan,
  }
}
