// SCRIPT TEMPLATES AS DATA (quality sprint, stage 2: T1, T3, T4).
//
// A template is a beat shape with named SLOTS. Each slot says which ledger
// origins may fill it and what evidence it needs; the logic in
// `scriptTemplates.ts` fills the slots from the invention-gate ledger, asks
// (Need Check format) for what is missing, and checks the finished script
// against the template. Nothing here is text a script may say: the question
// templates are questions to HER, never lines.
//
// ⚖️ TRIAL ONLY. The edge reads these only under `trialOn`; every other
// creator's generation never sees a template.
//
// Hook shapes are ids of `HOOK_MOVES` in scriptFamily.ts (the existing hook
// vocabulary), not a second list.

import type { ItemOrigin } from '../inventionGate.js'

export type BeatRole = 'hook' | 'promise' | 'build' | 'turn' | 'anchor' | 'offer' | 'close'
export type SlotClass = 'experience' | 'opinion' | 'fact' | 'offer'
export type SlotEvidence = 'first_party' | 'sourced' | 'live_urgency' | 'any'
export type DurationProfile = 'sprint' | 'standard' | 'deep'

export interface TemplateSlot {
  name: string
  required: boolean
  accepts: readonly ItemOrigin[]
  class: SlotClass
  evidence: SlotEvidence
  /** Question template id (QUESTION_TEMPLATES) used when the slot is asked. */
  ask: QuestionTemplateId
}

export interface TemplateBeat {
  role: BeatRole
  /** A repeated beat (e.g. list items): [min, max] copies, one slot item each. */
  count?: readonly [number, number]
  slots: readonly TemplateSlot[]
  /** The beat must end with a pull toward the next beat. */
  pull: boolean
  max_words: number
  show_move_hint: string
}

export interface ScriptTemplate {
  id: string
  name: string
  goals: readonly string[]
  /** Angle kinds (ideaQuestions ANGLE_KINDS) this template suits best. */
  angles: readonly string[]
  duration_profiles: readonly DurationProfile[]
  beats: readonly TemplateBeat[]
  promise: { kind: 'count' | 'reveal' | 'answer'; paid_at_beat: number }
  /** 2–4 HOOK_MOVES ids. */
  hook_shapes: readonly string[]
}

/** Word budgets per profile (a CHECK with a trim repair, not a prompt hint). */
export const DURATION_PROFILES: Record<DurationProfile, { words: number; seconds: number; software_seconds: number }> = {
  sprint: { words: 70, seconds: 30, software_seconds: 25 },
  standard: { words: 140, seconds: 60, software_seconds: 50 },
  deep: { words: 210, seconds: 90, software_seconds: 75 },
}

/** Need Check questions: one piece, ≤ 25 words, no presumed event, no new facts. */
export const QUESTION_TEMPLATES = {
  topic: { kind: 'detail', text: 'What one topic should this video teach, in a few words?' },
  list_item: { kind: 'detail', text: 'Name one point you would put on this list, in your own words.' },
  her_difference: { kind: 'detail', text: 'What do you do differently from most people on this, if anything?' },
  moment: { kind: 'story', text: 'Is there a moment you remember about this? Describe it in your own words, or skip.' },
  obstacle: { kind: 'story', text: 'Was there anything that got in your way here? Only if it really happened.' },
  turn: { kind: 'story', text: 'Did something change how you saw this? Tell it in your own words, or skip.' },
  offer: { kind: 'product_fact', text: 'What exactly are you offering here, and where do people get it?' },
  problem: { kind: 'audience_question', text: 'What problem do people bring to you about this? One real example is enough.' },
  causes: { kind: 'detail', text: 'What usually causes this problem, as you understand it?' },
  fix: { kind: 'detail', text: 'What is the fix you would tell someone, in your own words?' },
} as const
export type QuestionTemplateId = keyof typeof QUESTION_TEMPLATES

const HERS: readonly ItemOrigin[] = ['her_story', 'her_fact', 'her_answer']
const HER_STORY: readonly ItemOrigin[] = ['her_story', 'her_answer']
const SOURCED: readonly ItemOrigin[] = ['her_fact', 'her_answer', 'product_fact', 'outside_research']
const OFFER: readonly ItemOrigin[] = ['offer', 'product_fact', 'her_answer']

/** T1 Authority listicle. promise: a count, paid by the build beats. */
export const T1: ScriptTemplate = {
  id: 't1_authority_listicle',
  name: 'Authority listicle',
  goals: ['authority', 'educate', 'leads', 'followers'],
  angles: ['teach_list', 'contrarian_claim'],
  duration_profiles: ['sprint', 'standard', 'deep'],
  promise: { kind: 'count', paid_at_beat: 2 },
  hook_shapes: ['counted_list', 'contrarian_order', 'insider_credential', 'question_answered'],
  beats: [
    { role: 'hook', slots: [{ name: 'topic', required: true, accepts: [...HERS, 'outside_research'], class: 'fact', evidence: 'any', ask: 'topic' }], pull: true, max_words: 18, show_move_hint: 'straight to camera, the count on screen' },
    { role: 'promise', slots: [{ name: 'twist', required: false, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'her_difference' }], pull: true, max_words: 20, show_move_hint: 'straight to camera' },
    { role: 'build', count: [3, 5], slots: [{ name: 'items', required: true, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'list_item' }], pull: true, max_words: 35, show_move_hint: 'number each item out loud; show it if it can be shown' },
    { role: 'anchor', slots: [
      { name: 'her_difference', required: true, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'her_difference' },
      { name: 'anchor_story', required: false, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'moment' },
    ], pull: false, max_words: 35, show_move_hint: 'straight to camera, her own take' },
    { role: 'close', slots: [], pull: false, max_words: 15, show_move_hint: 'one-line recap or the save ask' },
  ],
}

/** T3 Journey then offer. Every story slot is first-party only. */
export const T3: ScriptTemplate = {
  id: 't3_journey_offer',
  name: 'Journey then offer',
  goals: ['sell', 'launch', 'personal_brand', 'inspire', 'community', 'conversations'],
  angles: ['feeling_story', 'result_first'],
  duration_profiles: ['standard', 'deep'],
  promise: { kind: 'reveal', paid_at_beat: 3 },
  hook_shapes: ['confession', 'cold_open', 'stakes_number', 'buyer_callout'],
  beats: [
    { role: 'hook', slots: [{ name: 'moment', required: true, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'moment' }], pull: true, max_words: 18, show_move_hint: 'open inside the moment' },
    { role: 'build', slots: [{ name: 'obstacle', required: true, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'obstacle' }], pull: true, max_words: 35, show_move_hint: 'straight to camera' },
    { role: 'turn', slots: [
      { name: 'turn', required: true, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'turn' },
      { name: 'numbers', required: false, accepts: ['her_fact', 'her_answer', 'product_fact'], class: 'fact', evidence: 'first_party', ask: 'turn' },
    ], pull: true, max_words: 35, show_move_hint: 'the thing that changed, shown if it can be' },
    { role: 'offer', slots: [{ name: 'offer', required: true, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 30, show_move_hint: 'the product in hand or on screen' },
    { role: 'close', slots: [], pull: false, max_words: 15, show_move_hint: 'where to get it' },
  ],
}

/** T4 Problem-led tutorial. */
export const T4: ScriptTemplate = {
  id: 't4_problem_tutorial',
  name: 'Problem-led tutorial',
  goals: ['educate', 'sell', 'leads', 'authority'],
  angles: ['problem_question', 'curiosity'],
  duration_profiles: ['sprint', 'standard', 'deep'],
  promise: { kind: 'answer', paid_at_beat: 3 },
  hook_shapes: ['buyer_callout', 'question_answered', 'mid_step', 'contrarian_order'],
  beats: [
    { role: 'hook', slots: [{ name: 'problem', required: true, accepts: [...HERS, 'audience_question', 'outside_research'], class: 'fact', evidence: 'any', ask: 'problem' }], pull: true, max_words: 18, show_move_hint: 'name the problem the viewer has' },
    { role: 'build', slots: [{ name: 'causes', required: true, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'causes' }], pull: true, max_words: 35, show_move_hint: 'straight to camera' },
    { role: 'turn', slots: [{ name: 'fix', required: true, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'fix' }], pull: true, max_words: 40, show_move_hint: 'show the fix being done' },
    { role: 'anchor', slots: [{ name: 'proof', required: false, accepts: HERS, class: 'experience', evidence: 'first_party', ask: 'moment' }], pull: false, max_words: 25, show_move_hint: 'the result, shown' },
    { role: 'offer', slots: [{ name: 'offer', required: false, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 25, show_move_hint: 'the product, if one was picked' },
  ],
}

export const SCRIPT_TEMPLATES: readonly ScriptTemplate[] = [T1, T3, T4]
