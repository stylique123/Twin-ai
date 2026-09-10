// WHAT KIND OF CREATOR IS THIS, WHEN A NICHE WORD CANNOT SAY.
//
// ⚠️⚠️ A SINGLE NICHE LABEL CANNOT WORK, AND THAT IS MEASURED, NOT ARGUED.
// 51 voices, `profile.niche` is free-text prose, and at most 3 share any value:
//   "3d animation explanation, funny dubbing, challenge narratives"
//   "ai tools, faceless youtube/tiktok automation, and online earning"
// There is no key that repeats, so there is nothing to group by.
//
// ⚠️ AND COARSE BUCKETS ARE TOO COARSE ALONE. `nicheBucket` puts a wedding
// photographer, a SaaS founder and a bakery in `business`. What works for one is
// wrong for the others.
//
// ⚖️ SO THE UNIT IS A VECTOR AND THE MATCH IS SCORED. A photographer and a
// physio share `service · consumer · in_person`, so what works for one is real
// evidence for the other DESPITE different domains. A SaaS founder shares almost
// nothing with either, despite all three being "business".
//
// ── WHAT IS ACTUALLY STORED, MEASURED 2026-09-09 OVER ALL 51 VOICES ─────────
//
// ⚠️ THE SPEC SAYS `sub_domain` IS "THE ONLY NEW WORK — one extraction pass over
// stored text". IT IS ALREADY STORED, on 46 of 51, as `profile.sub_niche`.
// Building the extraction pass would have re-derived a field that exists — the
// same rebuild-what-is-built defect that six other spec claims have produced.
//
//   niche       47/51        sub_niche   46/51        audience   45/51
//   followers   39/51        products    12 rows across 10 owners
//
// ⚠️⚠️ AND THAT LAST ROW BREAKS THE SPEC'S "six of seven are derivable now".
// `sells`, `delivery` and `price_band` all come from the products table, and
// TEN owners of fifty-one have a single product row. Those three facets are
// UNKNOWN for roughly 80% of creators, and a vector that pretended otherwise
// would score cohorts on fields nobody has.
//
// ⚖️ SO EVERY FACET IS NULLABLE AND null MEANS UNKNOWN, NEVER "no". The score
// counts what is KNOWN ON BOTH SIDES and reports that denominator, so a match on
// two of two facets cannot masquerade as a match on two of seven.

import { nicheBucket, type NicheBucket } from '../nicheQuestions'

export type Customer = 'consumer' | 'business'
export type StageBand = 'under_1k' | '1k_10k' | '10k_100k' | 'over_100k'

export interface FacetVector {
  /** Bucketed from `profile.niche`. Built in #792; not re-derived here. */
  domain: NicheBucket | null
  /** ⚠️ READ FROM `profile.sub_niche`, WHICH ALREADY EXISTS. Not extracted. */
  subDomain: string | null
  customer: Customer | null
  stageBand: StageBand | null
}

/** The facets this vector actually carries a value for. */
export function knownFacets(v: FacetVector): (keyof FacetVector)[] {
  return (Object.keys(v) as (keyof FacetVector)[]).filter((k) => v[k] !== null)
}

const BUSINESS_WORDS = /\b(founders?|entrepreneurs?|wantrepreneurs?|business owners?|brand owners?|startups?|ceos?|freelancers?|agencies|agency owners?|coaches|creators? looking to monetis|smes?|b2b)\b/i
const CONSUMER_WORDS = /\b(women|men|parents?|mothers?|students?|shoppers?|homeowners?|renters?|enthusiasts?|gen z|millennials?|everyday|beginners?|fans?|teens?|families)\b/i

/**
 * ⚠️⚠️ AMBIGUOUS MEANS null, NOT A COIN FLIP. Measured in the real data:
 * "Fashion e-commerce brand owners AND frequent online shoppers" is both, and it
 * is the single most common audience string in the corpus (4 of 45). Picking one
 * would silently place four voices in a cohort they only half belong to, and
 * nothing downstream could tell.
 *
 * ⚖️ AND "NEITHER" IS ALSO null. An audience naming no group this can read is
 * unknown, not consumer-by-default.
 */
export function customerOf(audience: unknown): Customer | null {
  if (typeof audience !== 'string' || audience.trim() === '') return null
  const b = BUSINESS_WORDS.test(audience)
  const c = CONSUMER_WORDS.test(audience)
  if (b === c) return null
  return b ? 'business' : 'consumer'
}

/**
 * ⚠️ BANDS, NEVER THE RAW COUNT. A cohort keyed on exact follower counts has one
 * member. And a band is what the evidence is actually about: what works at 800
 * followers is a different question from what works at 400,000.
 *
 * ⚠️ THE NULL CHECK PRECEDES THE COERCION. `Number(null)` is 0, which would file
 * every creator with no follower count into `under_1k` — a real cohort, silently
 * populated by absence. Absent is not zero.
 */
export function stageBandOf(followers: unknown): StageBand | null {
  if (followers === null || followers === undefined || followers === '') return null
  const n = typeof followers === 'number' ? followers : Number(followers)
  if (!Number.isFinite(n) || n < 0) return null
  if (n < 1_000) return 'under_1k'
  if (n < 10_000) return '1k_10k'
  if (n < 100_000) return '10k_100k'
  return 'over_100k'
}

export function facetsOf(profile: unknown, stats: unknown): FacetVector {
  const p = (profile && typeof profile === 'object' ? profile : {}) as Record<string, unknown>
  const s = (stats && typeof stats === 'object' ? stats : {}) as Record<string, unknown>
  const subRaw = p.sub_niche
  return {
    domain: nicheBucket(p.niche),
    subDomain: typeof subRaw === 'string' && subRaw.trim() !== '' ? subRaw.trim() : null,
    customer: customerOf(p.audience),
    stageBand: stageBandOf(s.followers ?? s.follower_count),
  }
}

export interface FacetMatch {
  /** Facets that agree. */
  agreed: number
  /** ⚠️ FACETS KNOWN ON BOTH SIDES — the only honest denominator. */
  comparable: number
  /** agreed / comparable, or null when nothing was comparable. */
  score: number | null
}

/**
 * ⚠️⚠️ NEVER REQUIRE ALL FOUR. The fallback ladder in the spec exists because an
 * exact sub-domain match is the strongest signal and almost always yields too
 * few rows. Scoring lets a cohort form on what is shared and STATE what that was.
 *
 * ⚖️ AND UNKNOWN NEVER COUNTS AS AGREEMENT. Two creators who both have no
 * follower count do not thereby share a stage band — they share an absence. That
 * is why `comparable` counts only facets present on BOTH sides; a naive
 * implementation scoring null === null at 1.0 would rank the emptiest profiles
 * as the best matches, which is precisely backwards.
 */
export function facetMatch(a: FacetVector, b: FacetVector): FacetMatch {
  const keys = Object.keys(a) as (keyof FacetVector)[]
  let agreed = 0
  let comparable = 0
  for (const k of keys) {
    const av = a[k]
    const bv = b[k]
    if (av === null || bv === null) continue
    comparable++
    if (k === 'subDomain') {
      if (String(av).trim().toLowerCase() === String(bv).trim().toLowerCase()) agreed++
      continue
    }
    if (av === bv) agreed++
  }
  return { agreed, comparable, score: comparable === 0 ? null : agreed / comparable }
}

const CUSTOMER_WORD: Readonly<Record<Customer, string>> = Object.freeze({
  consumer: 'selling to consumers',
  business: 'selling to businesses',
})
const STAGE_WORD: Readonly<Record<StageBand, string>> = Object.freeze({
  under_1k: 'under 1k followers',
  '1k_10k': 'under 10k followers',
  '10k_100k': '10k–100k followers',
  over_100k: 'over 100k followers',
})

/**
 * The cohort declaring its own basis, in the creator's language.
 *
 * ⚠️⚠️ THE SENTENCE IS THE EVIDENCE'S CONFIDENCE. "From 340 videos by service
 * businesses selling to consumers, under 10k followers" lets a model weigh the
 * evidence because it can see what it rests on. A bare shape with no basis
 * cannot be weighed at all — and this is the same principle as every measured
 * result this month: a property of the INPUT beats an instruction.
 *
 * ⚖️ AND IT NAMES ONLY WHAT IS KNOWN. A cohort with no facets returns a sentence
 * that says so rather than implying a match nobody made.
 */
export function describeCohort(v: FacetVector, videos: number): string {
  const parts: string[] = []
  if (v.subDomain !== null) parts.push(v.subDomain)
  else if (v.domain !== null) parts.push(v.domain.replace(/_/g, ' '))
  if (v.customer !== null) parts.push(CUSTOMER_WORD[v.customer])
  if (v.stageBand !== null) parts.push(STAGE_WORD[v.stageBand])
  const n = `${videos} ${videos === 1 ? 'video' : 'videos'}`
  if (parts.length === 0) return `From ${n}, with nothing known about who made them.`
  return `From ${n} by ${parts.join(', ')}.`
}

/**
 * ⚠️⚠️ A SHAPE NEEDS n ≥ 20 IN THE COHORT BEFORE IT MAY BE RECOMMENDED, and
 * this is separate from the separation test. A 6σ gap on n=4 is still four
 * videos. Both must pass; neither substitutes for the other.
 *
 * ⚖️ MEASURED PRECEDENT FOR WHY: `entry_impressions` holds 45 rows across 4
 * owners, two of whom are nearly all of it, and a reader built on it would tune
 * the product for two people. The stakes floor fires on 3.2% at n=3 and cannot
 * be calibrated in either direction. Silence is the default.
 */
export const MIN_COHORT = 20

export function cohortMayRecommend(cohortSize: number): boolean {
  return cohortSize >= MIN_COHORT
}
