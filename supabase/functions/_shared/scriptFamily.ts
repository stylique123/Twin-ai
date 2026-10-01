// GENERATED FROM packages/shared/src/script/scriptFamily.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * WHAT KIND OF VIDEO IS THIS, AND WHICH HOOKS FIT IT (owner brief 2026-10-01,
 * "What a Successful Script Actually Is, By Niche"; research in
 * docs/research/niche-scripts-2026-10-01.md).
 *
 * ⚠️ BEFORE THIS, EVERY CREATOR GOT ONE HOOK GENERATOR. A coffee roaster, a dog-
 * bandana seller and a postpartum coach all got "Stop doing X" / "Most people
 * think X". 87 real high-reach short-form videos say the families open
 * differently: a product seller opens on something to watch plus a verdict, a
 * coach on a counted list or a contrarian order, an educator on a question it
 * answers at once, a community creator on a first-person confession, an
 * entertainer inside the scene.
 *
 * ⚖️ THE FAMILY IS PER VIDEO, NOT PER CREATOR. The same woman sells on Monday
 * and teaches on Thursday. It is read from what she chose for THIS video.
 */

export const SCRIPT_FAMILIES = ['product', 'coach_expert', 'educator', 'community', 'entertainer'] as const
export type ScriptFamily = (typeof SCRIPT_FAMILIES)[number]

export const SCRIPT_FAMILY_LABEL: Record<ScriptFamily, string> = {
  product: 'Selling a product',
  coach_expert: 'Coach / expert',
  educator: 'Teaching',
  community: 'Community / story',
  entertainer: 'Entertainment',
}

const SERVICE_OFFER = /\b(coach\w*|course|program+e?|mentor\w*|consult\w*|1[:-]1|one[- ]on[- ]one|session|class|workshop|membership|service|cohort|call)\b/i

export interface FamilyInput {
  goal?: string | null
  focus?: string | null
  /** A product picked for this video. */
  hasProduct?: boolean
  /** Her offer text (product offer, or a service/course she sells). */
  offerText?: string | null
}

/** First match wins; order matters (see the plan, 4.3 A). */
export function scriptFamily(i: FamilyInput): ScriptFamily {
  const goal = String(i.goal ?? '').toLowerCase()
  const focus = String(i.focus ?? '').toLowerCase()
  const serviceOffer = SERVICE_OFFER.test(String(i.offerText ?? ''))
  if (goal === 'entertain') return 'entertainer'
  if (i.hasProduct && !serviceOffer && (goal === 'sell' || goal === 'leads' || goal === '')) return 'product'
  if (goal === 'authority' || goal === 'leads' || (focus === 'expertise' && serviceOffer)) return 'coach_expert'
  if (goal === 'sell') return serviceOffer ? 'coach_expert' : i.hasProduct ? 'product' : 'coach_expert'
  if (goal === 'educate' || focus === 'expertise') return 'educator'
  if (['community', 'conversations', 'personal_brand', 'inspire', 'followers'].includes(goal) || focus === 'story' || focus === 'experience') return 'community'
  return i.hasProduct ? 'product' : 'educator'
}

/** A hook MOVE: the shape a hook takes. Examples are verbatim from the research corpus. */
export interface HookMove { id: string; how: string; examples: readonly [string, string] }

export const HOOK_MOVES: Record<string, HookMove> = {
  reveal_verdict: { id: 'reveal_verdict', how: 'show the thing on screen and give your one-line verdict on it; the video shows why', examples: ["This might be the most unique bookmark I've ever seen.", "This is exactly what I'd want in a voice recorder."] },
  someone_result: { id: 'someone_result', how: "a real person's result with the thing (only one she gave you), the how withheld", examples: ['This woman came up with a genius business idea.', 'This 18 year old kid built an AI app and now makes 1.4 million dollars per month'] },
  buyer_callout: { id: 'buyer_callout', how: 'name the exact buyer and their situation, so the right viewer feels caught', examples: ["If this is the year you finally want to start sewing your own clothes but you have no idea where to start, you're in the right place.", 'Have you ever noticed that the closer someone gets to you, the more you want to pull away'] },
  counted_list: { id: 'counted_list', how: 'promise a count with stakes; the body delivers every item, numbered out loud', examples: ['Never, ever start a business before you understand these five things.', 'These are five service businesses that a 22-year-old could start with five grand and make 200 grand a year.'] },
  contrarian_order: { id: 'contrarian_order', how: 'reject the default advice in an order; the body justifies it', examples: ['Stop creating content, start creating culture.', "You don't get rich by working for someone else."] },
  insider_credential: { id: 'insider_credential', how: 'what someone in her real position knows that others will not say (only a credential she gave)', examples: ['10 tips HR will never tell you.', 'From my professional opinion, none of them are genuine pieces.'] },
  question_answered: { id: 'question_answered', how: 'the exact question the viewer has; the body answers it immediately', examples: ['What really happens if your timing belt snaps while you are driving?', 'How to make Chinese noodles like a pro?'] },
  mid_step: { id: 'mid_step', how: 'open already doing it, on the visual step, no preamble', examples: ['First, fill three balloons with wet concrete to create the planter legs.', 'Watch closely. Place a cord at the 4 cm mark.'] },
  confession: { id: 'confession', how: 'a first-person admission or turning point from her own life (only one she gave)', examples: ['At 13, I started a business that changed my life and I never expected this.', "I'm starting a business and I have no idea what I'm doing."] },
  shared_list: { id: 'shared_list', how: 'a numbered list, or a question, about something her people all recognise', examples: ['26 more things that I love about being single and living alone.', 'Do we all have the same mothers?'] },
  cold_open: { id: 'cold_open', how: 'start inside the scene, on a line of dialogue or a reaction', examples: ['Hey, um, who said you could have your phone?', 'John, go ahead and read that first line for me.'] },
  stakes_number: { id: 'stakes_number', how: 'a day count or amount as the whole hook, promising progress or a payoff', examples: ['Day 17 collecting copper until I can buy a car.', 'I literally bought every single item in five stores.'] },
}

/** Ordered: the first moves are the ones that led in the real examples. */
export const FAMILY_MOVES: Record<ScriptFamily, readonly string[]> = {
  product: ['reveal_verdict', 'someone_result', 'buyer_callout', 'counted_list', 'mid_step'],
  coach_expert: ['counted_list', 'contrarian_order', 'insider_credential', 'question_answered', 'buyer_callout'],
  educator: ['question_answered', 'mid_step', 'counted_list', 'insider_credential', 'contrarian_order'],
  community: ['confession', 'shared_list', 'buyer_callout', 'contrarian_order', 'question_answered'],
  entertainer: ['cold_open', 'stakes_number', 'shared_list', 'confession', 'question_answered'],
}

export const MIN_DISTINCT_MOVES = 3

/** The writer's hook brief for this family. */
export function renderFamilyHookRule(family: ScriptFamily): string {
  const moves = FAMILY_MOVES[family].map((id) => HOOK_MOVES[id]!)
  return [
    `THIS VIDEO'S FAMILY: ${SCRIPT_FAMILY_LABEL[family].toUpperCase()}. Real high-reach videos of this kind open with these moves (best first):`,
    ...moves.map((m) => `  - ${m.id}: ${m.how}. Real: "${m.examples[0]}" / "${m.examples[1]}"`),
    `- Draw the 5 hooks from AT LEAST ${MIN_DISTINCT_MOVES} DIFFERENT moves above, the strongest first. Use her words, never the examples' words — they show the SHAPE only.`,
    `- hook_moves: one move id per hook, same order as hook_options.`,
    OPEN_GAP_RULE,
    `- hook_promise: one line — what the recommended hook (hook_options[0]) opens that the video must close (the count it promised, the question it asked, the result it teased).`,
    `- SHAPE FOR THIS FAMILY: ${FAMILY_SHAPE[family]}`,
    `- WORDS GO TO THE BODY: real videos of every kind skip the warm-up. Setup is optional and at most ~15% of the words; the ask is at most ~15%; the body carries the rest.`,
    `- PAY THE PROMISE OFF BEFORE THE ASK: a line before the call to action must deliver hook_promise in full — every counted item, the answer to the question, the result shown. A script that never closes its hook loses the viewer before the ask lands.`,
  ].join('\n')
}

/** The beat shape real videos of each family follow (research 4.2). */
export const FAMILY_SHAPE: Record<ScriptFamily, string> = {
  product: 'hook (reveal or verdict) → SHOW it doing its job (most of the video) → the one specific reason it is worth it → where to get it.',
  coach_expert: 'hook (counted list, contrarian order or credential) → the points, numbered out loud, exactly as many as promised → a one-line recap of the lesson or a soft offer.',
  educator: 'hook (the question) → answer it straight away → the steps or the why → a one-line recap.',
  community: 'hook (first-person confession or belief) → the story → what it meant to her → invite replies from people who feel the same; no hard sell.',
  entertainer: 'cold open inside the scene → escalation → punchline. No call to action unless she chose one.',
}

/** Universal: 59–78% of real hooks in every family keep the question open. */
export const OPEN_GAP_RULE = [
  '- OPEN, NEVER CLOSED: a hook raises the question and WITHHOLDS the answer; the video answers it.',
  '  Closed (the answer is in the hook, so there is nothing left to watch for): "A postpartum belly band will not heal your deep core."',
  '  Open (same fact, the answer held back): "Why your belly band is not fixing your core."',
].join('\n')

export function normalizeHookMoves(raw: unknown, hookCount: number, family: ScriptFamily): string[] {
  const list = Array.isArray(raw) ? raw : []
  const allowed = new Set(FAMILY_MOVES[family])
  return Array.from({ length: hookCount }, (_, i) => {
    const v = String(list[i] ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
    return allowed.has(v) ? v : HOOK_MOVES[v] ? v : 'other'
  })
}

export interface HookSetAudit { family: ScriptFamily; moves: string[]; distinctMoves: number; inFamily: number }

export function auditHookSet(moves: readonly string[], family: ScriptFamily): HookSetAudit {
  const allowed = new Set(FAMILY_MOVES[family])
  return {
    family,
    moves: [...moves],
    distinctMoves: new Set(moves.filter((m) => m !== 'other')).size,
    inFamily: moves.filter((m) => allowed.has(m)).length,
  }
}
