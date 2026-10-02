// GENERATED FROM packages/shared/src/script/factPurpose.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * WHAT IS THIS FACT FOR? (owner 2026-10-02)
 *
 * Scoping (0265) answered WHO a fact is about. This answers WHAT IT IS FOR: the
 * objectives a fact may serve. The cart-operator mishap and the police story in
 * a sales script are one root cause: a fact chosen on WORDS, not PURPOSE.
 *
 * ⚖️ RULES FIRST, MODEL ONLY FOR WHAT THE RULES CANNOT PLACE. A price or a step
 * announces its own purpose; the free rule pass labels those, and the one-time
 * model pass only sees the genuinely ambiguous rest.
 *
 * ⚖️ UNLABELED MEANS INELIGIBLE (owner's call). A fact neither the rules nor the
 * model can place serves NOTHING until her own choices teach it, rather than
 * everything "just in case". The writer is structurally unable to read an
 * off-label fact; only one she switched on herself for this video passes.
 *
 * Deno and worker copies are GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.
 */

export const PURPOSE_GOALS = ['sell', 'educate', 'leads', 'conversations', 'personal_brand', 'authority', 'entertain', 'followers'] as const
export type PurposeGoal = (typeof PURPOSE_GOALS)[number]

export const PURPOSE_LABEL: Record<PurposeGoal, string> = {
  sell: 'selling it',
  educate: 'explaining what it does',
  leads: 'getting people to try it',
  conversations: 'answering what people ask',
  personal_brand: 'why you made it',
  authority: 'showing how you do it',
  entertain: 'something fun to watch',
  followers: 'growing your audience',
}

interface Rule { re: RegExp; serves: readonly PurposeGoal[] }

// Each rule names a purpose a fact's own wording announces. Order is irrelevant;
// every matching rule contributes.
const RULES: readonly Rule[] = [
  // Price, sizes, stock, shipping, ordering → selling, getting people to try.
  { re: /(\$|£|€)\s?\d|\b\d+\s?(oz|g|kg|lb|ml|bags?|packs?)\b|\b(price[ds]?|costs?|sizes?|variants?|in stock|sold out|restock\w*|ships?|shipping|order(s|ed|ing)?|pre-?order|discount|available|launch\w*|best ?seller|small batch(es)?)\b/i, serves: ['sell', 'leads'] },
  // What it is, what is in it, how it is made → explaining what it does.
  { re: /\b(made (with|from|of)|ingredients?|materials?|includes?|included|comes with|notes of|flavou?r|texture|handmade|hand-?poured|roasted|sourced|origin|how it('s| is) made|what it does|designed (to|for))\b/i, serves: ['educate', 'sell'] },
  // Method, steps, technique → showing how she does it, teaching.
  { re: /\b(steps?|method|technique|process|how (to|i)|i (always|never) |temperature|degrees|minutes|ratio|grind|dial(l)?ing|measure|tip:|trick|mistake people make|the key is)\b/i, serves: ['authority', 'educate'] },
  // The smallest step, hesitation, first week → getting people to try.
  { re: /\b(first step|start small|try it|sample|trial|free|beginner|hesitat\w*|first (week|order|time)|easy to start)\b/i, serves: ['leads'] },
  // Origin, the moment she decided, what was missing → why she made it.
  { re: /\b(started|began|founded|opened|decided|the day i|the moment|was missing|why i (made|started|built)|my first|grew up|years? ago|it all started|turning point)\b/i, serves: ['personal_brand', 'followers'] },
  // Questions people ask, confirmed comments → answering what people ask.
  { re: /^viewers (ask|request)\b|\b(people (keep )?ask\w*|asked me|question i get|dm(s|'?d)?|in the comments)\b/i, serves: ['conversations'] },
  // Credentials, years, results → showing how she does it.
  { re: /\b(\d+\s?years|certified|trained|licensed|award\w*|professional|expert|clients?|customers? (say|told)|reviews?|five stars?)\b/i, serves: ['authority', 'followers'] },
  // Mishaps, funny moments → something fun to watch.
  { re: /\b(funny|hilarious|laugh\w*|disaster|mishap|oops|accident\w*|went wrong|chaos|embarrass\w*|fail(ed|ure)?)\b/i, serves: ['entertain', 'followers'] },
  // Beliefs and positions → conversation and audience.
  { re: /\b(i (think|believe)|unpopular|most people|everyone (says|thinks)|the truth is|myth|overrated|backwards)\b/i, serves: ['conversations', 'followers', 'authority'] },
]

/** Kinds that carry a purpose by themselves. */
const KIND_SERVES: Partial<Record<string, readonly PurposeGoal[]>> = {
  product: ['sell', 'educate', 'leads'],
  opinion: ['conversations', 'followers'],
  framework: ['authority', 'educate'],
}

/**
 * Private matter is never material for selling, explaining or getting people to
 * try — whatever words it happens to contain. (Private rows are not even in the
 * writable view; this is the second lock.)
 */
const NEVER_COMMERCIAL = /\b(police|neighbou?r|court|lawsuit|divorce|depress\w*|anxiety|therap\w*|diagnos\w*|illness|hospital|pregnan\w*|miscarr\w*|debt|bankrupt\w*|evict\w*|complain\w*|code enforcement)\b/i

export interface PurposeLabel { serves: PurposeGoal[]; confident: boolean }

/** The free pass: what the fact's kind, source and own wording announce. */
export function purposeByRules(f: { kind?: unknown; text?: unknown; source?: unknown }): PurposeLabel {
  const text = String(f.text ?? '')
  const out = new Set<PurposeGoal>(KIND_SERVES[String(f.kind ?? '')] ?? [])
  if (String(f.source ?? '') === 'comment') out.add('conversations')
  for (const r of RULES) if (r.re.test(text)) for (const g of r.serves) out.add(g)
  if (NEVER_COMMERCIAL.test(text)) { out.delete('sell'); out.delete('leads'); out.delete('educate') }
  return { serves: PURPOSE_GOALS.filter((g) => out.has(g)), confident: out.size > 0 }
}

export const PURPOSE_MODEL_SYSTEM = [
  'Each item is one stored fact about a creator. Decide which kinds of video it is genuine material for.',
  `Kinds: ${PURPOSE_GOALS.map((g) => `${g} (${PURPOSE_LABEL[g]})`).join(', ')}.`,
  'Pick only kinds the fact would honestly serve. A personal hardship, a legal or neighbour dispute, health or family matters are NEVER material for sell, leads or educate.',
  'If the fact serves no kind clearly, return an empty list. confidence 0-1.',
].join('\n')

export const PURPOSE_MODEL_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { id: { type: 'STRING' }, serves: { type: 'ARRAY', items: { type: 'STRING' } }, confidence: { type: 'NUMBER' } },
    required: ['id', 'serves', 'confidence'],
  },
}

/** The model's answer for one fact, kept only when confident and never commercial for private matter. */
export function cleanModelPurpose(raw: { serves?: unknown; confidence?: unknown }, text: string): PurposeGoal[] {
  const conf = typeof raw.confidence === 'number' ? raw.confidence : 0
  if (conf < 0.6) return []
  const s = new Set((Array.isArray(raw.serves) ? raw.serves : []).map(String).filter((g): g is PurposeGoal => (PURPOSE_GOALS as readonly string[]).includes(g)))
  if (NEVER_COMMERCIAL.test(text)) { s.delete('sell'); s.delete('leads'); s.delete('educate') }
  return PURPOSE_GOALS.filter((g) => s.has(g))
}

/**
 * The objective a video's goal maps to. 'followers' and 'authority' are goals
 * of their own; everything else maps one to one.
 */
export function purposeOfGoal(goal: unknown): PurposeGoal | null {
  const g = String(goal ?? '').trim()
  return (PURPOSE_GOALS as readonly string[]).includes(g) ? g as PurposeGoal : null
}

/**
 * THE HARD RULE. A fact reaches the writer for this objective only when its
 * label serves it, or when she switched it on herself for this video. No label
 * (null), an empty label, or a label for another objective: not eligible.
 * The stored label wins; a row the worker has not labeled yet gets the rules'
 * answer now, so a fresh fact is not starved.
 */
const HER_OWN: ReadonlySet<string> = new Set(['asked', 'reply', 'comment'])

export function servesObjective(
  f: { id?: unknown; kind?: unknown; text?: unknown; source?: unknown; serves?: unknown },
  goal: PurposeGoal | null,
  herOn: ReadonlySet<string>,
): boolean {
  if (!goal) return true
  if (herOn.has(String(f.id ?? ''))) return true
  const stored = Array.isArray(f.serves) ? f.serves.map(String) : null
  // ⚠️ AUDIT 2026-10-02: an answer she typed minutes ago has no label until the
  // worker's next sweep, and the rules may not place it — so her own words
  // would vanish from the very script she typed them for. Her own unlabeled
  // words (asked / reply / comment) are eligible until labeled.
  if (stored === null && HER_OWN.has(String(f.source ?? ''))) return true
  const serves = stored ?? purposeByRules(f).serves
  return serves.includes(goal)
}
