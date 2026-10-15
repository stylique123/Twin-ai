// GENERATED FROM packages/shared/src/script/templates/templateData.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// SCRIPT TEMPLATES AS DATA (quality sprint, stage 2: T1, T3, T4; A8: T2, T5–T13).
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

import type { ItemOrigin } from './inventionGate.ts'

export type BeatRole = 'hook' | 'promise' | 'build' | 'turn' | 'anchor' | 'offer' | 'close'
export type SlotClass = 'experience' | 'opinion' | 'fact' | 'offer'
/**
 * `live_urgency`: an urgency item that is live (confirmed, sourced, not expired).
 * `dated`: an outside moment/research item or live urgency whose own text carries
 * a date. Neither is ever ASKED: a missing one makes the template ineligible, so a
 * date or a scarcity claim is never invented from an answer.
 */
export type SlotEvidence = 'first_party' | 'sourced' | 'live_urgency' | 'dated' | 'any'
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
  myth: { kind: 'detail', text: 'What is one common belief in your field you disagree with, if any?' },
  stance: { kind: 'detail', text: 'What do you believe instead, and what is your reason or source?' },
  tip: { kind: 'detail', text: 'What is one tip you would give on this, in your own words?' },
  steps: { kind: 'detail', text: 'What are the real steps you go through for this, in order?' },
  imperfection: { kind: 'story', text: 'Is there a part of this that is messy or imperfect? Only if it is real, or skip.' },
  expectation: { kind: 'story', text: 'What did you expect this to be like, and what was it actually like? Or skip.' },
  before: { kind: 'detail', text: 'What did it look like before? Only what really was, in your own words.' },
  after: { kind: 'detail', text: 'What did it look like after, and how long did it take? Only what really happened.' },
  kinds: { kind: 'detail', text: 'What are the main kinds or types of this people choose between?' },
  picks: { kind: 'detail', text: 'Which kind do you pick yourself, and for whom?' },
  take: { kind: 'detail', text: 'What is your own opinion on this news, in a sentence or two?' },
  audience_q: { kind: 'audience_question', text: 'What is one real question people ask you about this?' },
  answer: { kind: 'detail', text: 'How do you answer that question, in your own words?' },
  example: { kind: 'detail', text: 'Is there one real example that shows your answer? Or skip.' },
  why_special: { kind: 'product_fact', text: 'What makes this drop different from what you usually offer?' },
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

const DATED: readonly ItemOrigin[] = ['outside_moment', 'outside_research', 'urgency']
const QUESTION: readonly ItemOrigin[] = ['audience_question', 'her_answer']

/** T2 Contrarian myth-bust. promise: the truth, paid at the turn. */
export const T2: ScriptTemplate = {
  id: 't2_contrarian_myth',
  name: 'Contrarian myth-bust',
  goals: ['authority', 'educate', 'followers'],
  angles: ['contrarian_claim', 'curiosity'],
  duration_profiles: ['standard'],
  promise: { kind: 'reveal', paid_at_beat: 2 },
  hook_shapes: ['contrarian_order', 'insider_credential', 'question_answered'],
  beats: [
    { role: 'hook', slots: [{ name: 'myth', required: true, accepts: [...HERS, 'audience_question', 'outside_research'], class: 'opinion', evidence: 'any', ask: 'myth' }], pull: true, max_words: 18, show_move_hint: 'straight to camera, the belief on screen' },
    { role: 'build', slots: [], pull: true, max_words: 30, show_move_hint: 'why people believe it, fairly' },
    { role: 'turn', slots: [
      { name: 'stance', required: true, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'stance' },
      { name: 'reason', required: true, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'stance' },
    ], pull: true, max_words: 40, show_move_hint: 'her stance and the reason, shown if it can be' },
    { role: 'anchor', slots: [{ name: 'her_experience', required: false, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'moment' }], pull: true, max_words: 30, show_move_hint: 'her real struggle with it' },
    { role: 'offer', slots: [{ name: 'offer', required: false, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 20, show_move_hint: 'the bridge to one real place' },
    { role: 'close', slots: [], pull: false, max_words: 15, show_move_hint: 'a question to the viewer' },
  ],
}

/** T5 Timely hook. The date is never asked: no dated item on file, no template. */
export const T5: ScriptTemplate = {
  id: 't5_timely_hook',
  name: 'Timely hook',
  goals: ['followers', 'educate', 'sell', 'leads'],
  angles: ['curiosity', 'teach_list'],
  duration_profiles: ['sprint'],
  promise: { kind: 'count', paid_at_beat: 1 },
  hook_shapes: ['stakes_number', 'counted_list', 'question_answered'],
  beats: [
    { role: 'hook', slots: [{ name: 'verified_date', required: true, accepts: DATED, class: 'fact', evidence: 'dated', ask: 'topic' }], pull: true, max_words: 18, show_move_hint: 'the date on screen' },
    { role: 'build', count: [1, 3], slots: [{ name: 'tip', required: true, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'tip' }], pull: true, max_words: 25, show_move_hint: 'one tip per beat, numbered if more than one' },
    { role: 'offer', slots: [{ name: 'offer', required: false, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 20, show_move_hint: 'the bridge to one real place' },
    { role: 'close', slots: [], pull: false, max_words: 12, show_move_hint: 'a question to the viewer' },
  ],
}

/** T6 Behind the scenes: the step nobody sees. */
export const T6: ScriptTemplate = {
  id: 't6_behind_scenes',
  name: 'Behind the scenes',
  goals: ['personal_brand', 'sell', 'community', 'authority'],
  angles: ['result_first', 'curiosity'],
  duration_profiles: ['standard'],
  promise: { kind: 'reveal', paid_at_beat: 2 },
  hook_shapes: ['mid_step', 'insider_credential', 'confession'],
  beats: [
    { role: 'hook', slots: [], pull: true, max_words: 18, show_move_hint: 'open mid-process, no preamble' },
    { role: 'build', slots: [{ name: 'real_steps', required: true, accepts: HERS, class: 'experience', evidence: 'first_party', ask: 'steps' }], pull: true, max_words: 40, show_move_hint: 'show the real process' },
    { role: 'turn', slots: [{ name: 'imperfection', required: true, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'imperfection' }], pull: true, max_words: 30, show_move_hint: 'the honest imperfection, shown' },
    { role: 'anchor', slots: [{ name: 'why_it_matters', required: false, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'her_difference' }], pull: true, max_words: 25, show_move_hint: 'straight to camera' },
    { role: 'offer', slots: [{ name: 'offer', required: false, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 20, show_move_hint: 'the finished thing, one real place' },
    { role: 'close', slots: [], pull: false, max_words: 12, show_move_hint: 'a question to the viewer' },
  ],
}

/** T7 Expectation versus reality. Every detail is hers. */
export const T7: ScriptTemplate = {
  id: 't7_expectation_reality',
  name: 'Expectation versus reality',
  goals: ['personal_brand', 'community', 'inspire', 'followers'],
  angles: ['feeling_story', 'contrarian_claim'],
  duration_profiles: ['standard'],
  promise: { kind: 'reveal', paid_at_beat: 2 },
  hook_shapes: ['confession', 'contrarian_order', 'cold_open'],
  beats: [
    { role: 'hook', slots: [{ name: 'expectation', required: true, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'expectation' }], pull: true, max_words: 18, show_move_hint: 'I thought… instead…' },
    { role: 'build', slots: [{ name: 'real_details', required: true, accepts: HERS, class: 'experience', evidence: 'first_party', ask: 'expectation' }], pull: true, max_words: 40, show_move_hint: 'show the real details' },
    { role: 'turn', slots: [{ name: 'larger_truth', required: false, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'turn' }], pull: true, max_words: 30, show_move_hint: 'straight to camera' },
    { role: 'close', slots: [], pull: false, max_words: 15, show_move_hint: 'an invitation, as a question' },
  ],
}

/** T8 Before and after. Both states are real or the template is not used. */
export const T8: ScriptTemplate = {
  id: 't8_before_after',
  name: 'Before and after',
  goals: ['sell', 'leads', 'authority', 'inspire'],
  angles: ['result_first', 'feeling_story'],
  duration_profiles: ['deep'],
  promise: { kind: 'reveal', paid_at_beat: 1 },
  hook_shapes: ['someone_result', 'stakes_number', 'reveal_verdict'],
  beats: [
    { role: 'hook', slots: [{ name: 'before', required: true, accepts: [...HERS, 'product_fact'], class: 'experience', evidence: 'first_party', ask: 'before' }], pull: true, max_words: 18, show_move_hint: 'the real before, shown' },
    { role: 'turn', slots: [{ name: 'after', required: true, accepts: [...HERS, 'product_fact'], class: 'experience', evidence: 'first_party', ask: 'after' }], pull: true, max_words: 30, show_move_hint: 'the real after, shown' },
    { role: 'build', slots: [{ name: 'what_changed', required: false, accepts: SOURCED, class: 'fact', evidence: 'first_party', ask: 'turn' }], pull: true, max_words: 45, show_move_hint: 'what changed, step by step' },
    { role: 'anchor', slots: [{ name: 'how_long', required: false, accepts: HERS, class: 'fact', evidence: 'first_party', ask: 'after' }], pull: true, max_words: 25, show_move_hint: 'how long it took' },
    { role: 'offer', slots: [{ name: 'proof', required: false, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 25, show_move_hint: 'the proof, one real place' },
    { role: 'close', slots: [], pull: false, max_words: 12, show_move_hint: 'a question to the viewer' },
  ],
}

/** T9 Kinds and picks: kinds of X, which fits you. */
export const T9: ScriptTemplate = {
  id: 't9_kinds_picks',
  name: 'Kinds and picks',
  goals: ['sell', 'educate', 'leads'],
  angles: ['teach_list', 'problem_question'],
  duration_profiles: ['standard'],
  promise: { kind: 'count', paid_at_beat: 1 },
  hook_shapes: ['counted_list', 'buyer_callout', 'reveal_verdict'],
  beats: [
    { role: 'hook', slots: [], pull: true, max_words: 18, show_move_hint: 'the kinds side by side, the count on screen' },
    { role: 'build', count: [2, 4], slots: [{ name: 'kinds', required: true, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'kinds' }], pull: true, max_words: 30, show_move_hint: 'one kind per beat, numbered' },
    { role: 'turn', slots: [{ name: 'how_to_choose', required: false, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'her_difference' }], pull: true, max_words: 25, show_move_hint: 'how to choose' },
    { role: 'anchor', slots: [{ name: 'her_picks', required: true, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'picks' }], pull: true, max_words: 30, show_move_hint: 'her picks, in hand' },
    { role: 'offer', slots: [{ name: 'offer', required: false, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 20, show_move_hint: 'one real place' },
    { role: 'close', slots: [], pull: false, max_words: 12, show_move_hint: 'a question: which fits you' },
  ],
}

/** T10 Commentary: what is new plus her take. The news item is dated and sourced, never asked. */
export const T10: ScriptTemplate = {
  id: 't10_commentary',
  name: 'Commentary',
  goals: ['authority', 'followers', 'educate'],
  angles: ['contrarian_claim', 'curiosity'],
  duration_profiles: ['deep'],
  promise: { kind: 'answer', paid_at_beat: 2 },
  hook_shapes: ['insider_credential', 'question_answered', 'contrarian_order'],
  beats: [
    { role: 'hook', slots: [{ name: 'news_item', required: true, accepts: DATED, class: 'fact', evidence: 'dated', ask: 'topic' }], pull: true, max_words: 18, show_move_hint: 'the news on screen with its source and date' },
    { role: 'build', slots: [{ name: 'what_it_means', required: false, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'causes' }], pull: true, max_words: 45, show_move_hint: 'what it means' },
    { role: 'turn', slots: [{ name: 'her_take', required: true, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'take' }], pull: true, max_words: 45, show_move_hint: 'her take, said as her opinion' },
    { role: 'anchor', slots: [{ name: 'what_to_do', required: false, accepts: SOURCED, class: 'fact', evidence: 'sourced', ask: 'tip' }], pull: false, max_words: 35, show_move_hint: 'what to do now' },
    { role: 'close', slots: [], pull: false, max_words: 15, show_move_hint: 'a question to the viewer' },
  ],
}

/** T11 Audience question. */
export const T11: ScriptTemplate = {
  id: 't11_audience_question',
  name: 'Audience question',
  goals: ['educate', 'community', 'leads', 'sell', 'conversations'],
  angles: ['problem_question'],
  duration_profiles: ['sprint'],
  promise: { kind: 'answer', paid_at_beat: 1 },
  hook_shapes: ['question_answered', 'buyer_callout', 'shared_list'],
  beats: [
    { role: 'hook', slots: [{ name: 'question', required: true, accepts: QUESTION, class: 'fact', evidence: 'any', ask: 'audience_q' }], pull: true, max_words: 18, show_move_hint: 'the real question on screen' },
    { role: 'turn', slots: [{ name: 'her_answer', required: true, accepts: HERS, class: 'opinion', evidence: 'first_party', ask: 'answer' }], pull: true, max_words: 30, show_move_hint: 'straight to camera' },
    { role: 'anchor', slots: [{ name: 'example', required: false, accepts: HERS, class: 'experience', evidence: 'first_party', ask: 'example' }], pull: true, max_words: 20, show_move_hint: 'the example, shown' },
    { role: 'offer', slots: [{ name: 'offer', required: false, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: false, max_words: 15, show_move_hint: 'one real place' },
  ],
}

/** T12 Entertain moment. The moment is real or the template is not used. */
export const T12: ScriptTemplate = {
  id: 't12_entertain_moment',
  name: 'Entertain moment',
  goals: ['followers', 'entertain', 'community', 'personal_brand'],
  angles: ['feeling_story'],
  duration_profiles: ['sprint', 'standard'],
  promise: { kind: 'reveal', paid_at_beat: 2 },
  hook_shapes: ['cold_open', 'confession', 'stakes_number'],
  beats: [
    { role: 'hook', slots: [], pull: true, max_words: 15, show_move_hint: 'cold open at the turn' },
    { role: 'build', slots: [{ name: 'moment', required: true, accepts: HER_STORY, class: 'experience', evidence: 'first_party', ask: 'moment' }], pull: true, max_words: 40, show_move_hint: 'play the moment' },
    { role: 'turn', slots: [], pull: true, max_words: 20, show_move_hint: 'the payoff' },
    { role: 'close', slots: [], pull: false, max_words: 10, show_move_hint: 'the tag' },
  ],
}

/** T13 Limited drop. Honest FOMO gate: no live urgency item, no template (never asked). */
export const T13: ScriptTemplate = {
  id: 't13_limited_drop',
  name: 'Limited drop',
  goals: ['sell', 'launch'],
  angles: ['result_first'],
  duration_profiles: ['sprint'],
  promise: { kind: 'reveal', paid_at_beat: 2 },
  hook_shapes: ['stakes_number', 'reveal_verdict', 'buyer_callout'],
  beats: [
    { role: 'hook', slots: [{ name: 'offer', required: true, accepts: OFFER, class: 'offer', evidence: 'first_party', ask: 'offer' }], pull: true, max_words: 18, show_move_hint: 'what drops, in hand' },
    { role: 'build', slots: [{ name: 'why_special', required: false, accepts: [...HERS, 'product_fact'], class: 'fact', evidence: 'first_party', ask: 'why_special' }], pull: true, max_words: 25, show_move_hint: 'why it is special, shown' },
    { role: 'turn', slots: [{ name: 'urgency', required: true, accepts: ['urgency'], class: 'fact', evidence: 'live_urgency', ask: 'offer' }], pull: true, max_words: 20, show_move_hint: 'the real limit and date on screen' },
    { role: 'close', slots: [], pull: false, max_words: 12, show_move_hint: 'where to get it' },
  ],
}

export const SCRIPT_TEMPLATES: readonly ScriptTemplate[] = [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13]
