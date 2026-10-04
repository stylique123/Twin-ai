// GENERATED FROM packages/shared/src/script/ctaAllocation.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// HER CTAs, EACH IN ITS PLACE (owner 2026-10-04: "extract two, three of their
// CTAs, which they normally use — which one for product, which one for this —
// and allocate them in the right places").
//
// The voice scan already keeps 2-3 CTAs she actually says (`recurring_ctas`),
// but the writer saw them as one flat list and the close-fixer read only the
// typed `defaultCta` — which on the test account held a price list. Here each
// of her CTAs gets a JOB (shop, lead, follow, comment, save), and each video
// goal takes the CTA whose job fits it. Her words, never Twin's: nothing is
// generated, a goal with no fitting CTA of hers gets none.

export type CtaJob = 'shop' | 'lead' | 'follow' | 'comment' | 'save' | 'other'

const JOB_PATTERNS: Array<[CtaJob, RegExp]> = [
  ['lead', /\b(book|call|dm|message me|send me|email|apply|consult|work with me|sign up|join (?:my|the) (?:list|waitlist|newsletter)|free guide|download)\b/i],
  ['shop', /\b(shop|buy|order|grab (?:a|your|one)|link (?:in|to)|in my bio|my (?:site|website|store|shop)|check(?:ed)? out my|use code|discount|free shipping|restock)\b/i],
  ['comment', /\b(comment|tell me|let me know|drop (?:a|your)|in the comments)\b|\?\s*$/i],
  ['follow', /\b(follow|subscribe|stick around|stay tuned|part (?:two|2)|next (?:one|video)|more of this)\b/i],
  ['save', /\b(save (?:this|it)|bookmark|share (?:this|it)|send this)\b/i],
]

/** The job a CTA of hers does. */
export function ctaJob(text: string): CtaJob {
  for (const [job, re] of JOB_PATTERNS) if (re.test(text)) return job
  return 'other'
}

/**
 * Could this be read out as her ask? Not a price list or a product spec (the
 * test account's CTA field held "12oz bag — $18 / 5lb bulk bag — $65 …").
 * Typed wording is trusted otherwise ("Try Twin free" is a real ask).
 */
export function looksLikeCta(text: unknown): boolean {
  const t = String(text ?? '').trim()
  if (t.length < 4 || t.length > 240) return false
  if ((t.match(/[$£€]\s?\d/g) ?? []).length >= 2 || t.split('\n').length > 2) return false
  return /[a-z]{3}/i.test(t)
}

/** A recurring CTA counts only when it names an action (the scan can mis-file a sentence). */
function isAsk(text: unknown): boolean {
  return looksLikeCta(text) && ctaJob(String(text)) !== 'other'
}

/** Which jobs each goal wants, best first. */
const WANTS: Record<string, CtaJob[]> = {
  sell: ['shop', 'lead'],
  convert: ['shop', 'lead'],
  check_out_offer: ['shop', 'lead'],
  launch: ['shop', 'lead'],
  leads: ['lead', 'shop'],
  conversations: ['comment'],
  comment: ['comment'],
  followers: ['follow', 'save'],
  follow: ['follow', 'save'],
  personal_brand: ['follow', 'comment'],
  entertain: ['follow', 'comment', 'save'],
  share: ['save', 'follow'],
  educate: ['save', 'follow'],
  learn: ['save', 'follow'],
  authority: ['follow', 'save'],
}

export interface CtaPick { text: string; job: CtaJob }

/**
 * Her CTA for this video: the typed one when it is a real ask that fits the
 * goal, else the first of her recurring CTAs whose job the goal wants. Null
 * when none of hers fits — the writer then closes under the goal's own rule.
 */
export function pickHerCta(
  goal: unknown,
  opts: { typed?: unknown; recurring?: readonly unknown[] | null },
): CtaPick | null {
  const wants = WANTS[String(goal ?? '').toLowerCase()] ?? []
  if (!wants.length) return null
  const typed = looksLikeCta(opts.typed) ? String(opts.typed).trim() : ''
  // Her typed CTA is the commercial one unless its words say otherwise.
  const typedJob: CtaJob | null = typed ? (ctaJob(typed) === 'other' ? 'shop' : ctaJob(typed)) : null
  const pool: CtaPick[] = [
    ...(typed && typedJob ? [{ text: typed, job: typedJob }] : []),
    ...(opts.recurring ?? []).filter(isAsk).map((c) => ({ text: String(c).trim(), job: ctaJob(String(c)) })),
  ]
  for (const job of wants) {
    const hit = pool.find((c) => c.job === job)
    if (hit) return { text: hit.text, job }
  }
  return null
}
