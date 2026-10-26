// GENERATED FROM packages/shared/src/script/beatPrompt.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE BEAT-LEVEL PROMPT BUILDER (plan §33 item 6). Pure: builds strings, calls
// nothing. The prompts are exercised live only when the AI returns; offline,
// the tests pin their shape. Behind BEAT_WRITER (default OFF).

import { BEAT_WORD_BUDGETS, type BeatId } from './beatBudgets.ts'
import type { BeatSlot } from './beatWriterMap.ts'

export interface BeatPromptInput {
  slot: BeatSlot
  angle: string
  topic: string
  /** Short voice notes from her voice card; optional. */
  voice?: string
  /** Lines already written for earlier beats, so this beat does not repeat them. */
  earlierLines?: readonly string[]
  /** Her offer, for the CTA beat only. */
  offer?: string
}

export interface BeatPrompt {
  beat: BeatId
  minWords: number
  maxWords: number
  system: string
  user: string
  /** Item ids this prompt is allowed to draw on. */
  itemIds: string[]
}

const PURPOSE: Readonly<Record<BeatId, string>> = Object.freeze({
  hook: 'Stop the scroll with one line that the rest of the video pays off. No claim the material below does not support.',
  problem: 'Name the problem or the reality the viewer lives with, in her words.',
  proof: 'Tell her own experience as proof: what happened, concretely. Her story only; never another person\'s.',
  method: 'Explain what she does or what the product does, using only the facts given.',
  cta: 'One call to action, at the end, that fits her offer and the platform.',
})

export function buildBeatPrompt(input: BeatPromptInput): BeatPrompt {
  const { slot } = input
  const budget = BEAT_WORD_BUDGETS[slot.beat]
  const system = [
    `You write ONE beat of a short video script in the creator's own voice: the ${budget.label} beat.`,
    `Write between ${budget.min} and ${budget.max} words. Spoken English, first person.`,
    'Use ONLY the material given. Never invent a story, a number, a result, a quote or a product fact.',
    'Do not repeat anything in the earlier lines.',
    'Return only the spoken words of this beat, no labels.',
  ].join('\n')
  const material = slot.items.length
    ? slot.items.map((i) => `- [${i.kind}] ${i.text}`).join('\n')
    : '- (none: write only from the angle; make no factual claim)'
  const parts = [
    `BEAT: ${slot.beat}`,
    `PURPOSE: ${PURPOSE[slot.beat]}`,
    `ANGLE: ${input.angle}`,
    `TOPIC: ${input.topic}`,
    `WORD BUDGET: ${budget.min}-${budget.max}`,
    `MATERIAL:\n${material}`,
  ]
  if (input.voice) parts.push(`VOICE: ${input.voice}`)
  if (slot.beat === 'cta' && input.offer) parts.push(`OFFER: ${input.offer}`)
  if (input.earlierLines && input.earlierLines.length) parts.push(`EARLIER LINES (do not repeat):\n${input.earlierLines.map((l) => `- ${l}`).join('\n')}`)
  return { beat: slot.beat, minWords: budget.min, maxWords: budget.max, system, user: parts.join('\n\n'), itemIds: slot.items.map((i) => i.id) }
}
