// ONE FIXED QUESTION PER OBJECTIVE MEANT NOTHING NEW EVER ARRIVED.
//
// ⚠️ THE OWNER'S TEST REPORT: every objective asked the SAME sentence every
// time. Once she had answered "What was missing that made you build it?" there
// was nothing new to say, so the writer fell back on stored material and one
// story was reused across nine scripts. The fix is not a better sentence — it
// is more than one sentence.
//
// ⚖️ A POOL PER OBJECTIVE, SAME INTENT, DIFFERENT ANGLE. Each pool is 4–6
// questions that all serve the objective (a launch still needs urgency, an
// origin still needs the absence), but each one reaches a different memory.
// The first entry of every pool is the original `OBJECTIVE_QUESTIONS` wording,
// so a creator who has never answered anything sees exactly what she saw before.
//
// ⚖️ ROTATION IS PER CREATOR + PRODUCT + OBJECTIVE. Answers persist to
// `creator_knowledge` (source 'asked') with a `source_ref` built by
// `objectiveSourceRef`, which carries the question id — so "which of these has
// she already answered, for this product" is a read of rows that already exist.
// No new column: `source_ref` and `question_id` (0216) are both already there.

import type { VideoGoal } from './videoIntent.js'
import { OBJECTIVE_QUESTIONS, type OfferForm } from './productObjectiveQuestion.js'

export interface PooledQuestion {
  /** Stable id: `<goal>.<slug>`. Stored in `source_ref`, so never rename one. */
  readonly id: string
  readonly question: string
  /** Wording for someone selling work rather than a thing, where it differs. */
  readonly whenPerformed?: string
}

const q = (id: string, question: string, whenPerformed?: string): PooledQuestion =>
  Object.freeze(whenPerformed ? { id, question, whenPerformed } : { id, question })

const first = (goal: VideoGoal, slug: string): PooledQuestion => {
  const o = OBJECTIVE_QUESTIONS[goal]!
  return q(`${goal}.${slug}`, o.question, o.whenPerformed)
}

export const OBJECTIVE_QUESTION_POOLS: Readonly<Record<VideoGoal, readonly PooledQuestion[]>> = Object.freeze({
  // Launch it — urgency, from a different door each time.
  sell: Object.freeze([
    first('sell', 'why_now'),
    q('sell.almost_stopped', 'What almost stopped you from launching this?'),
    q('sell.first_reaction', 'What surprised you about how people reacted to it?'),
    q('sell.changed_since', 'What changed between the first version and this one?',
      'What changed between how you first did this and how you do it now?'),
    q('sell.who_first', 'Who did you picture using it the day it came out?',
      'Who did you picture booking you first?'),
  ]),
  // Explain what it does — the misunderstanding, approached differently.
  educate: Object.freeze([
    first('educate', 'misunderstood'),
    q('educate.first_time', 'What do people usually get wrong the first time they use it?',
      'What do people usually get wrong the first time they work with you?'),
    // Owner rejected 'who is it wrong for' (asks her to name a weakness) — 2026-09-24.
    q('educate.surprise_use', 'What is something it does that surprises people when they first see it?',
      'What is something about how you work that surprises people when they first see it?'),
    q('educate.small_detail', 'What small detail makes the biggest difference to how well it works?',
      'What small detail makes the biggest difference to how well it goes?'),
    q('educate.show_proof', 'What is one thing you could show on camera that proves how it works?',
      'What is one thing you could show on camera that proves how you do it?'),
  ]),
  // Get people to try it — the doorstep, and what stands in front of it.
  leads: Object.freeze([
    first('leads', 'first_step'),
    q('leads.hesitation', 'What makes people hesitate right before they try it?',
      'What makes people hesitate right before they book?'),
    q('leads.first_week', 'What happens in someone’s first week with it?',
      'What happens in someone’s first week working with you?'),
    q('leads.skeptic', 'Tell me about someone who was skeptical and tried it anyway.',
      'Tell me about someone who was skeptical and booked anyway.'),
    q('leads.easy_yes', 'What would make trying it an easy yes for a stranger?',
      'What would make booking you an easy yes for a stranger?'),
  ]),
  // Answer what people keep asking — the real question, from new sides.
  conversations: Object.freeze([
    first('conversations', 'keep_getting'),
    q('conversations.dm_this_week', 'What did someone message you about it this week?'),
    q('conversations.wish_asked', 'What do you wish people asked you about it instead?',
      'What do you wish people asked you about your work instead?'),
    q('conversations.awkward', 'What is the question you find hardest to answer honestly?'),
    q('conversations.before_buying', 'What do people ask right before they buy?',
      'What do people ask right before they book?'),
  ]),
  // Say why I made it — the origin, from different moments.
  personal_brand: Object.freeze([
    first('personal_brand', 'what_missing'),
    q('personal_brand.moment', 'What was the exact moment you decided to make it?',
      'What was the exact moment you decided to start doing this?'),
    q('personal_brand.almost_quit', 'When did you almost give up on it, and what kept you going?'),
    q('personal_brand.first_customer', 'What do you remember about your first customer?',
      'What do you remember about your first client?'),
    q('personal_brand.personal_why', 'Why does this one matter to you more than anything else you make?',
      'Why does this part of your work matter to you more than the rest?'),
  ]),
  followers: Object.freeze([
    first('followers', 'outsiders_wrong'),
    q('followers.surprising_fact', 'What is the most surprising thing about your world that outsiders never see?'),
    q('followers.hot_take', 'What do you believe about your field that most people in it would argue with?'),
    q('followers.one_tip', 'What is one thing a total stranger could use from your world today?'),
  ]),
  authority: Object.freeze([
    first('authority', 'years_to_learn'),
    q('authority.mistake', 'What mistake did you make early that you now see others making?'),
    q('authority.spot_fast', 'What can you spot in seconds that a beginner would miss?'),
    q('authority.changed_mind', 'What did you used to believe about this that you no longer do?'),
  ]),
  entertain: Object.freeze([
    first('entertain', 'worst_funniest'),
    q('entertain.weirdest_request', 'What is the weirdest request you have ever had?'),
    q('entertain.behind_scenes', 'What goes wrong behind the scenes that nobody sees?'),
    q('entertain.expectation', 'What do people expect it to be like versus what it is actually like?'),
  ]),
})

export function objectivePool(objective: string | null | undefined): readonly PooledQuestion[] {
  const key = typeof objective === 'string' ? objective.trim() : ''
  return (OBJECTIVE_QUESTION_POOLS as Record<string, readonly PooledQuestion[] | undefined>)[key] ?? []
}

/** Find a pooled question by id, across every objective. */
export function pooledQuestionById(id: string | null | undefined): PooledQuestion | null {
  if (typeof id !== 'string' || id === '') return null
  for (const pool of Object.values(OBJECTIVE_QUESTION_POOLS)) {
    const hit = pool.find((p) => p.id === id)
    if (hit) return hit
  }
  return null
}

export function pooledWording(p: PooledQuestion, offerForm?: OfferForm | null): string {
  return offerForm === 'performed' && p.whenPerformed ? p.whenPerformed : p.question
}

// ── THE source_ref THAT CARRIES THE QUESTION ID ─────────────────────────────
//
// `asked:objective:<productKey>:<questionId>`. `asked:` keeps `storySuggestions`'
// `isAlreadyAsked` refusing to offer the answer back as a suggestion, exactly as
// for every other answered question. `productKey` is the entity id, or 'none'.
export const OBJECTIVE_SOURCE_REF_PREFIX = 'asked:objective:'
export const OBJECTIVE_QUESTION_ID_PATTERN = /^[a-z_]{2,40}\.[a-z_]{2,40}$/

export function objectiveProductKey(productId: string | null | undefined): string {
  const k = typeof productId === 'string' ? productId.trim() : ''
  return /^[A-Za-z0-9:_-]{1,80}$/.test(k) ? k : 'none'
}

export function objectiveSourceRef(productId: string | null | undefined, questionId: string): string {
  return `${OBJECTIVE_SOURCE_REF_PREFIX}${objectiveProductKey(productId)}:${questionId}`
}

export function parseObjectiveSourceRef(ref: unknown): { productKey: string; questionId: string } | null {
  if (typeof ref !== 'string' || !ref.startsWith(OBJECTIVE_SOURCE_REF_PREFIX)) return null
  const rest = ref.slice(OBJECTIVE_SOURCE_REF_PREFIX.length)
  const i = rest.lastIndexOf(':')
  if (i <= 0) return null
  const questionId = rest.slice(i + 1)
  if (!OBJECTIVE_QUESTION_ID_PATTERN.test(questionId)) return null
  return { productKey: rest.slice(0, i), questionId }
}

export interface AnsweredObjectiveQuestion { questionId: string; at: string | null }

/** Rows from `creator_knowledge` → the answered questions for THIS product. */
export function answeredForProduct(
  rows: ReadonlyArray<{ source_ref?: unknown; last_observed_at?: unknown; created_at?: unknown }>,
  productId: string | null | undefined,
): AnsweredObjectiveQuestion[] {
  const key = objectiveProductKey(productId)
  const out: AnsweredObjectiveQuestion[] = []
  for (const r of rows) {
    const p = parseObjectiveSourceRef(r?.source_ref)
    if (!p || p.productKey !== key) continue
    const at = typeof r.last_observed_at === 'string' ? r.last_observed_at
      : typeof r.created_at === 'string' ? r.created_at : null
    out.push({ questionId: p.questionId, at })
  }
  return out
}

/**
 * The next question to put in front of her.
 *
 * ⚖️ FIRST UNANSWERED, IN POOL ORDER. Only when every question has an answer
 * does it cycle — to the one answered LEAST recently (its most recent answer is
 * the oldest), so a question she answered last week comes back before the one
 * she answered yesterday. Ties and unparseable dates fall back to pool order.
 */
export function nextObjectiveQuestion(
  objective: string | null | undefined,
  answered: readonly AnsweredObjectiveQuestion[],
): PooledQuestion | null {
  const pool = objectivePool(objective)
  if (pool.length === 0) return null
  const latest = new Map<string, number>()
  for (const a of answered) {
    const t = a.at == null ? Number.NaN : Date.parse(a.at)
    const v = Number.isFinite(t) ? t : 0
    latest.set(a.questionId, Math.max(latest.get(a.questionId) ?? -Infinity, v))
  }
  const unanswered = pool.find((p) => !latest.has(p.id))
  if (unanswered) return unanswered
  let best = pool[0]
  for (const p of pool) if ((latest.get(p.id) ?? 0) < (latest.get(best.id) ?? 0)) best = p
  return best
}
