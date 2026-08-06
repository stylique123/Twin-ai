// LEARNING-1, THE LINEAGE HALF — WHAT AN OUTCOME IS ATTRIBUTED *BY*.
//
// 0105 states the rule and enforces it: a `business_outcome` claim cannot be
// stored without an `attribution`, because "an unattributed sale next to a video
// is a coincidence with a timestamp". What it could not do is make that value
// EARNABLE. `attribution` is free text, its own comment names what it should
// hold — "a UTM, a promo code, a CRM id" — and nothing in the product minted
// any of the three. The rule was enforced against a value nobody could produce
// honestly, so the only way to satisfy it was to type a sentence.
//
// This module is the missing producer, and 0113 is where the identifiers live.
//
// ── THE ORDERING IS THE MECHANISM ─────────────────────────────────────────
//
// An attribution only means anything if it EXISTED BEFORE THE OUTCOME and was
// carried by the thing the audience touched. A code minted on Tuesday and
// printed in Tuesday's link cannot explain Monday's sale; a reference invented
// after the money arrived explains nothing at all. That is why the rows are
// immutable in the database and why nothing here offers to "correct" one — the
// correction would silently reassign every outcome recorded through it.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
//
// It does not decide anything. Nothing here ranks a format, adjusts a
// preference, or writes a claim: those are the CONSUMPTION half of LEARNING-1
// and they need sample-size gating, an undo, and a rule that brand truth never
// mutates automatically. This half only makes the evidence real, so that when
// the consuming half arrives it has something better than prose to read.
//
// It also does not shorten, redirect, or host a link. A redirector would make
// us the measurement authority and put an outage of ours between a creator and
// their audience. A UTM rides on the creator's own URL and fails, at worst, by
// being ignored.

/** How an outcome can be tied back to a post. Closed, and 0113 CHECKs it. */
export const ATTRIBUTION_KINDS = ['utm', 'promo_code', 'crm_ref'] as const
export type AttributionKind = (typeof ATTRIBUTION_KINDS)[number]

export interface PostAttribution {
  id: string
  postId: string
  kind: AttributionKind
  /** As the creator gave it — the exact string they put in the world. */
  value: string
}

/**
 * What each kind can actually measure, so a surface states it rather than
 * implying that all three are equivalent.
 *
 * They are not. A UTM can only ever observe a CLICK — it is a query parameter,
 * and a query parameter cannot see a purchase. Saying so at the point of use is
 * the difference between "3 sales from this video" and "3 sales from people who
 * arrived through this video's link", and the second one is the true sentence.
 */
export const ATTRIBUTION_MEASURES: Record<AttributionKind, string> = {
  utm: 'clicks that arrived through this link',
  promo_code: 'purchases where this code was entered',
  crm_ref: 'whatever the system holding this reference records',
}

/**
 * A UTM campaign value for one post.
 *
 * DERIVED FROM THE POST ID, not from the caption, the hook or the date. Those
 * are all editable, and a campaign value that changes when a creator fixes a
 * typo splits one video's measurements into two campaigns that no longer add up.
 * The id is the only thing about a post that is guaranteed stable, which is
 * exactly the property a measurement key needs.
 *
 * Lowercased and hyphen-free because analytics tools case-fold and split on
 * punctuation inconsistently — two spellings of one campaign is the same
 * split-in-two failure arriving through a different door.
 */
export function utmCampaignFor(postId: string): string {
  return `twinai-${postId.replace(/-/g, '').slice(0, 16).toLowerCase()}`
}

/**
 * The creator's own URL, carrying the campaign.
 *
 * Returns null rather than a mangled string when the URL cannot be parsed: a
 * broken link in a creator's bio costs them more than a missing measurement,
 * and there is no version of "half a URL" worth handing back.
 *
 * EXISTING PARAMETERS ARE PRESERVED and an existing `utm_campaign` is NOT
 * overwritten. A creator who already runs their own campaign tagging has a
 * measurement system we know nothing about; silently replacing their value
 * would break their reporting to improve ours.
 */
export function buildTrackedUrl(
  rawUrl: string,
  campaign: string,
  opts: { source?: string; medium?: string } = {},
): string | null {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  // Only http(s). A `javascript:` or `data:` URL parses fine and must never be
  // handed back as something to publish.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', campaign)
  // `source` is the PLATFORM the link is posted on, which is why it is passed
  // in rather than defaulted: the same video's link on TikTok and on YouTube
  // are different measurements, and defaulting to "twinai" would merge them.
  if (opts.source && !u.searchParams.has('utm_source')) u.searchParams.set('utm_source', opts.source)
  if (opts.medium && !u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', opts.medium)
  return u.toString()
}

/**
 * The comparison form of a value, matching 0113's generated `value_norm`.
 *
 * A creator types CREATOR10 on the checkout page and creator10 in the sheet they
 * paste back. Those are one code. This must stay identical to the SQL
 * (`upper(btrim(value))`) — a client that normalises differently would let a
 * duplicate through the UI and have the database reject it with a constraint
 * name nobody can act on.
 */
export function normalizeAttributionValue(value: string): string {
  return value.trim().toUpperCase()
}

export type AttributionRejection =
  | { rejected: 'empty' }
  | { rejected: 'too_long' }
  | { rejected: 'unknown_kind' }
  /** A code with a space in it is a code half the audience will mistype. */
  | { rejected: 'whitespace_inside' }

/**
 * Validate before writing, so the failure is a sentence rather than a Postgres
 * constraint name.
 *
 * The length bound is 0113's (1..200 after trimming). The whitespace rule is
 * NOT in the database and is deliberately client-side only: it is a usability
 * judgement about promo codes, not an integrity rule, and encoding a judgement
 * as a constraint makes it un-overridable by a creator who has a real reason.
 */
export function validateAttribution(
  raw: { kind: string; value: string },
): { kind: AttributionKind; value: string } | AttributionRejection {
  if (!(ATTRIBUTION_KINDS as readonly string[]).includes(raw.kind)) return { rejected: 'unknown_kind' }
  const value = (raw.value ?? '').trim()
  if (!value) return { rejected: 'empty' }
  if (value.length > 200) return { rejected: 'too_long' }
  if (raw.kind === 'promo_code' && /\s/.test(value)) return { rejected: 'whitespace_inside' }
  return { kind: raw.kind as AttributionKind, value }
}

/**
 * Whether a business claim drawn from these readings would rest on anything.
 *
 * The question `dna_claims`' CHECK constraint cannot ask: it can see that the
 * `attribution` text is non-empty, and cannot see whether that text corresponds
 * to an identifier that existed before the outcome. This can, and returns the
 * two facts a caller needs to say something true — whether ANY reading was
 * attributed, and by which kinds.
 *
 * It returns evidence, not a verdict. Deciding what may be claimed from it is
 * the consuming half's job, and that half owes a sample-size gate this function
 * has no business pre-empting.
 */
export function attributionEvidence(
  readings: readonly { metric: string; attributionId?: string | null }[],
  attributions: readonly PostAttribution[],
): { attributed: number; unattributed: number; kinds: AttributionKind[] } {
  const byId = new Map(attributions.map((a) => [a.id, a]))
  const kinds = new Set<AttributionKind>()
  let attributed = 0, unattributed = 0
  for (const r of readings) {
    const a = r.attributionId ? byId.get(r.attributionId) : undefined
    if (a) { attributed++; kinds.add(a.kind) } else unattributed++
  }
  return { attributed, unattributed, kinds: [...kinds].sort() }
}
