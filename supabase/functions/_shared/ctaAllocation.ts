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
  return looksLikeCta(text) && ctaJob(String(text)) !== 'other' && !isHedgedCta(text)
}

/** Owner 2026-10-05 (blind set 2 #2): "if you're just here for the beans"
 *  reads as an apology for the video. A recurring CTA hedged this way is not
 *  reused as the close. */
export function isHedgedCta(text: unknown): boolean {
  return /\bif you(?:'re| are)\s+(?:just|only)\s+here for\b/i.test(String(text ?? ''))
}

const OFFER_STOP = new Set(['with', 'your', 'that', 'this', 'from', 'call', 'will', 'help', 'plan', 'what', 'into'])
function offerWords(t: unknown): string[] {
  return [...new Set((String(t ?? '').toLowerCase().match(/[a-z0-9$][a-z0-9$-]{2,}/g) ?? []).filter((w) => !OFFER_STOP.has(w)))]
}

/**
 * Owner 2026-10-05 (blind set 2 #13, #15): a call's CTA said "let us build
 * your setup" and "pick the right coffee cart launch call" — neither is what
 * the call is. A selling close describes the offer: it names the offer AND
 * carries at least two of its own words (price, length, what is covered).
 */
export function closeDescribesOffer(line: unknown, name: unknown, offer: unknown): boolean {
  const l = String(line ?? '').toLowerCase()
  const n = String(name ?? '').trim().toLowerCase()
  if (!n || !l.includes(n)) return false
  const own = offerWords(offer).filter((w) => !n.includes(w))
  if (own.length < 2) return true
  return own.filter((w) => l.includes(w)).length >= 2
}

/** An offer written as one spoken sentence, not a price list (blind set 3 #1, #3). */
export function offerIsSpeakable(offer: unknown): boolean {
  const o = String(offer ?? '').trim()
  return o.length > 0 && o.length <= 220 && !/\n/.test(o) && !/\s[—–-]\s*\$\d/.test(o) && !/\bIncludes:/i.test(o)
}

/** The close rewritten from her offer, in her ask's place. */
export function offerClose(name: string, offer: string, how: string): string {
  const o = offer.trim().replace(/[.\s]+$/, '')
  return `${name}: ${o.charAt(0).toLowerCase()}${o.slice(1)}. ${how.trim()}`
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
const TOPIC_STOP = new Set('if your you are the and for with this that just here dream around stick follow more like love would absolutely link bio site website check out find'.split(' '))
const topicWords = (t: string) => (t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !TOPIC_STOP.has(w))

/**
 * ⚠️ BATCH PART-14 (2026-10-04): "If starting a coffee cart is your dream,
 * stick around" closed a video about roasting. A CTA that names its own
 * subject ("if X is your dream") fits only a video about that subject.
 */
export function ctaFitsTopic(cta: string, topic: string): boolean {
  const m = cta.match(/\bif\s+(.{4,80}?)\s+(?:is|are)\s+your\b/i) ?? cta.match(/\bif you(?:'re| are)?\s+(?:into|planning|thinking about|starting)\s+(.{4,60})/i)
  if (!m || !topic.trim()) return true
  const want = new Set(topicWords(topic))
  return topicWords(m[1]!).some((w) => want.has(w) || [...want].some((t) => t.startsWith(w.slice(0, 5)) || w.startsWith(t.slice(0, 5))))
}

export function pickHerCta(
  goal: unknown,
  opts: { typed?: unknown; recurring?: readonly unknown[] | null; topic?: string },
): CtaPick | null {
  const wants = WANTS[String(goal ?? '').toLowerCase()] ?? []
  if (!wants.length) return null
  const typed = looksLikeCta(opts.typed) ? String(opts.typed).trim() : ''
  // Her typed CTA is the commercial one unless its words say otherwise.
  const typedJob: CtaJob | null = typed ? (ctaJob(typed) === 'other' ? 'shop' : ctaJob(typed)) : null
  const pool: CtaPick[] = [
    ...(typed && typedJob ? [{ text: typed, job: typedJob }] : []),
    ...(opts.recurring ?? []).filter(isAsk).filter((c) => ctaFitsTopic(String(c), opts.topic ?? '')).map((c) => ({ text: String(c).trim(), job: ctaJob(String(c)) })),
  ]
  for (const job of wants) {
    const hit = pool.find((c) => c.job === job)
    if (hit) return { text: hit.text, job }
  }
  return null
}
