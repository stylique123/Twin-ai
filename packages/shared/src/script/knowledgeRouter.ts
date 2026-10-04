// THE KNOWLEDGE ROUTER — which source feeds which part of the video, for every
// mode, goal, angle, focus and outcome (owner brief 2026-10-04: "a whole system
// — when to use which part, how to attach each part to each, how to make a
// complete story out of every combination"). Design: docs/design/knowledge-
// orchestration.md.
//
// ⚖️ ONE GRID, SETTINGS MOVE IT. The arc row (from goal and angle, arcShape)
// picks a column of source preferences per role; mode, angle, focus and outcome
// re-order it; what is actually on file decides the pick. The settings never
// replace the grid, so every combination is built the same way.
//
// ⚖️ RULE ZERO PER SLOT. Each role lists only sources allowed to do that job:
// an audience question may open a video, never prove a claim. A required role
// with nothing of hers is a GAP — asked, or dropped — never invented.

import { arcFor, type ArcRow } from './arcShape.js'

export const SOURCE_IDS = [
  'her_story', 'her_claim', 'her_answers', 'her_viewers', 'product', 'brand',
  'niche_objection', 'niche_proof',
  'reddit_question', 'reddit_complaint', 'reddit_buying', 'reddit_debate', 'reddit_phrase',
  'research', 'moment',
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export const ROLES = ['hook', 'setup', 'proof', 'turn', 'payoff', 'close'] as const
export type Role = (typeof ROLES)[number]

/** Sources that are HERS: the only ones that may be stated as a fact about her or her product. */
export const HER_SOURCES: ReadonlySet<SourceId> = new Set(['her_story', 'her_claim', 'her_answers', 'product', 'brand'])

/** How each source may be used in a line, in the writer's words. */
export const SOURCE_USE: Record<SourceId, string> = {
  her_story: 'her own story or example, told as hers',
  her_claim: 'her own opinion, method or claim, at the strength she said it',
  her_answers: 'what she told us for this video, in her words',
  her_viewers: 'a question her own viewers asked her ("you keep asking me…")',
  product: 'an exact fact about the product, shown on camera where it can be',
  brand: 'a confirmed fact about her brand',
  niche_objection: 'the doubt her audience has, which she answers',
  niche_proof: 'what creators in her niche SHOW at this point (a shot idea, never a claim)',
  reddit_question: 'a question people in her niche keep asking ("people keep asking…")',
  reddit_complaint: 'a frustration people in her niche share, in their terms',
  reddit_buying: 'a "what should I buy" ask people in her niche make',
  reddit_debate: 'a point people in her niche argue about, she takes a side',
  reddit_phrase: 'words her audience actually uses (wording only)',
  research: 'public news, a launch or a date in her niche (only if it fits)',
  moment: 'something the world is talking about today (only if it fits)',
}

// THE GRID (doc §3): per row, per role, sources in preference order.
const GRID: Record<ArcRow, Record<Role, SourceId[]>> = {
  sell: {
    hook: ['reddit_buying', 'niche_objection', 'reddit_question', 'her_viewers', 'her_story'],
    setup: ['reddit_complaint', 'niche_objection', 'her_story'],
    proof: ['product', 'her_story', 'her_answers'],
    turn: ['niche_objection', 'her_claim'],
    payoff: ['product', 'her_story'],
    close: ['product', 'brand'],
  },
  teach: {
    hook: ['reddit_question', 'her_viewers', 'her_claim', 'research'],
    setup: ['reddit_complaint', 'reddit_question'],
    proof: ['her_claim', 'her_story', 'product'],
    turn: ['her_claim'],
    payoff: ['her_claim', 'her_story'],
    close: ['her_claim'],
  },
  story: {
    hook: ['her_story', 'reddit_complaint'],
    setup: ['her_story', 'her_answers'],
    proof: ['her_story', 'her_answers'],
    turn: ['her_claim', 'her_story'],
    payoff: ['product', 'her_claim', 'her_story'],
    close: ['brand', 'her_claim'],
  },
  answer: {
    hook: ['her_viewers', 'reddit_question', 'reddit_debate'],
    setup: ['reddit_question', 'reddit_complaint'],
    proof: ['her_claim', 'her_story', 'product'],
    turn: ['reddit_debate', 'her_claim'],
    payoff: ['her_claim', 'her_answers'],
    close: ['reddit_debate', 'her_viewers', 'reddit_question'],
  },
  entertain: {
    hook: ['reddit_debate', 'reddit_phrase', 'moment', 'her_story'],
    setup: ['reddit_phrase', 'her_story'],
    proof: ['her_story', 'her_answers'],
    turn: ['her_story'],
    payoff: ['her_story', 'her_claim'],
    close: ['her_story'],
  },
}

// Roles whose material must be HERS, per row (doc §5): with none, it is a gap.
const REQUIRED_HERS: Record<ArcRow, Role[]> = {
  sell: ['proof'], teach: ['proof'], story: ['proof'], answer: ['payoff'], entertain: ['proof'],
}

// Angle → the hook's preferred sources (doc §4), ahead of the row's own.
const ANGLE_HOOK: Record<string, SourceId[]> = {
  contrarian_claim: ['reddit_debate', 'her_claim'],
  problem_question: ['her_viewers', 'reddit_question'],
  result_first: ['her_story', 'product'],
  feeling_story: ['her_story'],
  teach_list: ['reddit_question', 'her_claim'],
  curiosity: ['research', 'moment', 'her_claim'],
}

// Focus → the proof role's preferred sources.
const FOCUS_PROOF: Record<string, SourceId[]> = {
  expertise: ['her_claim'],
  experience: ['her_story'],
  story: ['her_story'],
  opinion: ['her_claim', 'reddit_debate'],
  review: ['product', 'reddit_buying'],
  product: ['product'],
}

// Outcome → the close's preferred sources and its job.
const OUTCOME_CLOSE: Record<string, { sources: SourceId[]; job: string }> = {
  comment: { sources: ['reddit_debate', 'her_viewers', 'reddit_question'], job: 'end on a question viewers will answer in the comments' },
  share: { sources: ['reddit_phrase', 'her_story'], job: 'end on the line people send to a friend' },
  follow: { sources: ['her_claim', 'her_story'], job: 'end on why to follow her for the next one' },
  learn: { sources: ['her_claim'], job: 'end on the one takeaway to save' },
  convert: { sources: ['product'], job: 'end on her offer, plainly' },
  check_out_offer: { sources: ['product', 'brand'], job: 'end on where to see the offer' },
  change_mind: { sources: ['reddit_debate', 'her_claim'], job: 'end on the side she took, restated' },
  remember_me: { sources: ['brand', 'her_claim'], job: 'end on her sign-off line' },
  feel_inspired: { sources: ['her_story'], job: 'end on the feeling, not a pitch' },
}

/** Where the brain shapes a role without supplying its content. */
const SHAPE_NOTES: Partial<Record<Role, string>> = {
  hook: 'niche hook patterns and her own best hooks set the SHAPE of the hook',
  proof: 'niche proof shots set what to SHOW',
}

export type Mode = 'idea' | 'product' | 'reference' | 'brand'

export interface RouteInput {
  mode: Mode
  goal?: string | null
  angle?: string | null
  focus?: string | null
  outcome?: string | null
  /** How much of each source is on file for this video (count of usable items). */
  available: Partial<Record<SourceId, number>>
  /** Test-account trial switches (owner 2026-10-04: trial first, then everyone). */
  trial?: boolean
}

export interface Slot {
  role: Role
  /** The source that fills this role, or null when nothing allowed is on file. */
  source: SourceId | null
  /** The next allowed sources, in order. */
  backups: SourceId[]
  /** Required to be hers and nothing of hers is on file. */
  gap: boolean
  /** An extra job for this role from the outcome or mode. */
  job?: string
}

export interface Route { row: ArcRow; slots: Slot[]; hookSources: SourceId[]; gaps: Role[] }

function uniq<T>(xs: readonly T[]): T[] { return [...new Set(xs)] }

/** The preference list for one role after mode, angle, focus and outcome move the grid. */
export function preferenceFor(role: Role, row: ArcRow, input: Omit<RouteInput, 'available'>): SourceId[] {
  let list = [...GRID[row][role]]
  if (role === 'hook' && input.angle && ANGLE_HOOK[input.angle]) list = [...ANGLE_HOOK[input.angle], ...list]
  if (role === 'proof' && input.focus && FOCUS_PROOF[input.focus]) list = [...FOCUS_PROOF[input.focus], ...list]
  if (role === 'close' && input.outcome && OUTCOME_CLOSE[input.outcome]) list = [...OUTCOME_CLOSE[input.outcome].sources, ...list]
  // Idea mode: her paragraph is the spine — it opens the video and carries the
  // proof; the other parts still draw on their own material (batch part-10:
  // routing it first everywhere filled five of six parts from one paragraph).
  if (input.mode === 'idea' && (role === 'hook' || role === 'proof')) list = ['her_answers', ...list]
  // ⚠️ BATCH PART-14 (trial): "my morning routine at the roastery" got "Today
  // I am announcing a new single-origin lot" as its payoff — the story row put
  // the product first. In idea mode a video that is not selling keeps the
  // product out of proof and payoff; her own story and claims carry them.
  if (input.trial && input.mode === 'idea' && row !== 'sell' && (role === 'proof' || role === 'payoff')) list = list.filter((s) => s !== 'product')
  // Brand mode: the brand stands where the product would.
  if (input.mode === 'brand') list = list.map((s) => (s === 'product' ? 'brand' : s))
  // Product mode: the product must carry proof or payoff (doc §4).
  if (input.mode === 'product' && (role === 'proof' || role === 'payoff') && !list.includes('product')) list = [...list, 'product']
  // An audience or world source may never be proof or payoff of a claim.
  if (role === 'proof' || role === 'payoff') list = list.filter((s) => HER_SOURCES.has(s) || s === 'niche_proof')
  return uniq(list).filter((s) => s !== 'niche_proof' || role === 'proof')
}

export function routeKnowledge(input: RouteInput): Route {
  const row = arcFor(input.goal ?? '', input.angle ?? '').row
  const has = (s: SourceId) => (input.available[s] ?? 0) > 0
  // ⚖️ ONE SOURCE NEVER CARRIES THE WHOLE VIDEO: a source already used twice
  // goes to the back of the line when another allowed source has material.
  const used = new Map<SourceId, number>()
  const slots: Slot[] = ROLES.map((role) => {
    const prefs = preferenceFor(role, row, input)
    const allowed = prefs.filter((s) => s !== 'niche_proof' && has(s))
    const usable = [...allowed.filter((s) => (used.get(s) ?? 0) < 2), ...allowed.filter((s) => (used.get(s) ?? 0) >= 2)]
    const source = usable[0] ?? null
    if (source) used.set(source, (used.get(source) ?? 0) + 1)
    const mustBeHers = REQUIRED_HERS[row].includes(role) || (input.mode === 'product' && role === 'proof')
    const gap = mustBeHers && !usable.some((s) => HER_SOURCES.has(s))
    const job = role === 'close' && input.outcome ? OUTCOME_CLOSE[input.outcome]?.job : undefined
    return { role, source, backups: usable.slice(1, 3), gap, ...(job ? { job } : {}) }
  })
  // Three hook options from three different sources (doc §6).
  const hookSources = uniq(preferenceFor('hook', row, input).filter(has)).slice(0, 3)
  return { row, slots, hookSources, gaps: slots.filter((s) => s.gap).map((s) => s.role) }
}

/** The plan the writer reads: one line per role, naming the source and how it may be used. */
export function renderRoute(route: Route): string {
  const lines = route.slots.map((s) => {
    const shape = SHAPE_NOTES[s.role] ? ` (${SHAPE_NOTES[s.role]})` : ''
    if (!s.source) return `- ${s.role.toUpperCase()}: nothing on file for this part${s.gap ? ' — keep it short and true, never invent it' : ''}${shape}.`
    const backups = s.backups.length ? ` If that does not fit, use ${s.backups.map((b) => SOURCE_USE[b]).join(', or ')}.` : ''
    return `- ${s.role.toUpperCase()}: build it from ${SOURCE_USE[s.source]}.${backups}${s.job ? ` Its job: ${s.job}.` : ''}${shape}`
  })
  const hooks = route.hookSources.length > 1
    ? `\nThe hook options each start from a DIFFERENT one of: ${route.hookSources.map((h) => SOURCE_USE[h]).join('; ')}.`
    : ''
  return [
    `THE MATERIAL BOARD (${route.row} video) — every part of this video is built from the material named for it, so nothing is generic and the whole thing is one story from hook to close.`,
    ...lines,
    'Only what is HERS (her stories, claims, answers, product, brand) may be stated as true about her. Audience and world material is what people say or what is happening; she responds to it in her own words.',
  ].join('\n') + hooks
}
