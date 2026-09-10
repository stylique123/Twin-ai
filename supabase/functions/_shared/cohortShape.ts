// THE DECIDING LAYER, MIRRORED — BECAUSE AN EDGE FUNCTION CANNOT IMPORT SHARED.
//
// ⚠️⚠️ THIS FILE IS A SECOND AUTHORITY FOR ONE RULE, which is the defect class
// this codebase keeps closing. It exists because there is no third option:
// `generate-blueprint/index.ts:1853` records that an edge function "cannot
// import @twinai/shared", and `worker/src/jobs/directorContract.ts:8` forbids
// the same from the worker. The rule has to run where the prompt is assembled.
//
// ⚖️ SO THE PARITY TEST IS NOT A NICE-TO-HAVE, IT IS THE BUILD.
// `packages/shared/src/__tests__/cohortShapeParity.test.ts` feeds BOTH
// implementations the same fixtures and requires identical output, AND requires
// this file to be its originals with only the import lines removed.
//
// ⚠️ THE NULL CASES ARE THE ONES THAT MATTER. `cohort.ts` states the reason: a
// hedged shape is still a shape in the model's context, and it will be used. A
// mirror that returns a weak shape where the original returns null is WORSE than
// no mirror — it puts an unearned recommendation into a paid generation.
//
// ⚠️ HOW THIS FILE IS MADE, AND THE RULE FOR CHANGING IT. It is the three corpus
// modules CONCATENATED WITH THEIR IMPORT LINES STRIPPED, plus the three
// declarations `facets.ts` imports from `nicheQuestions.ts`. Nothing is
// retyped, reordered or edited — an earlier draft cherry-picked declarations by
// name and mis-cut a doc comment containing a semicolon, which is exactly the
// hand-transcription risk a mirror must not carry. WHEN AN ORIGINAL CHANGES,
// RE-DERIVE THIS FILE THE SAME WAY. Never hand-edit it.
//
// SOURCES, in dependency order:
//   packages/shared/src/nicheQuestions.ts               NICHE_BUCKETS, NicheBucket, nicheBucket
//   packages/shared/src/corpus/relativePerformance.ts   lift against a creator's own median
//   packages/shared/src/corpus/facets.ts                the facet vector and its match
//
// ⚠️ FOUR DECLARATIONS FROM facets.ts ARE DELIBERATELY ABSENT: `facetsOf`,
// `knownFacets`, `customerOf`, `stageBandOf`. `cohort.ts` never calls them, and
// carrying them here made `check_symbol_readers` report the SHARED copies as
// having acquired production readers — they had not; this file merely contained
// their text. A mirror that drags in unused exports turns a debt register into a
// false all-clear, so the mirror carries only what the rule needs.
//   packages/shared/src/corpus/cohort.ts                the selector and shapeBlock



// ══ from packages/shared/src/nicheQuestions.ts ══════════════════════════

export const NICHE_BUCKETS = [
  'business', 'tech', 'entertainment', 'health', 'beauty_fashion', 'food', 'creator',
] as const

export type NicheBucket = (typeof NICHE_BUCKETS)[number]

/**
 * ⚠️ ORDER MATTERS AND COMMERCE COMES FIRST. "ai tools for founders and business
 * idea validation" is both, and reading it as tech loses the fact that the
 * audience is founders — which is what changes the question.
 *
 * ⚖️ A KEYWORD RULE IS A GUESS WRITTEN DOWN, so it is kept small, visible, and
 * beaten by measurement: every pattern below matched at least one real stored
 * niche on 2026-09-09.
 */
const BUCKET_PATTERNS: ReadonlyArray<{ bucket: NicheBucket; test: RegExp }> = [
  { bucket: 'business', test: /\b(entrepreneur\w*|business\w*|startups?|founders?|scal\w+|hustles?|wealth|sales|b2b|saas|marketing|real estate|investing|property|resale|e-?commerce)\b/i },
  { bucket: 'tech', test: /\b(ai|artificial intelligence|tech\w*|coding|software|develop\w*|android|ios|apps?)\b/i },
  { bucket: 'beauty_fashion', test: /\b(beauty|skincare|fashion|makeup|style|grooming)\b/i },
  { bucket: 'food', test: /\b(food|bak\w+|cook\w*|recipes?|kitchen|micro-?bakery)\b/i },
  { bucket: 'health', test: /\b(fitness|health\w*|physio\w*|training|wellness|rehab)\b/i },
  { bucket: 'creator', test: /\b(content creation|creators?|youtube|tiktok|short-?form)\b/i },
  { bucket: 'entertainment', test: /\b(entertainment|humou?r|comedy|challenges?|dubbing|music|skits?)\b/i },
]

/** The bucket a stored niche falls in, or null when nothing matches. */
export function nicheBucket(niche: unknown): NicheBucket | null {
  const t = typeof niche === 'string' ? niche.trim() : ''
  if (t === '') return null
  return BUCKET_PATTERNS.find((b) => b.test.test(t))?.bucket ?? null
}

// ══ from packages/shared/src/corpus/relativePerformance.ts ══════════════════════════
// A VIEW COUNT IS NOT A SIGNAL. A MULTIPLE OF THAT CREATOR'S OWN MEDIAN IS.
//
// ⚠️⚠️ 50,000 VIEWS FROM A 2,000-FOLLOWER ACCOUNT IS A FAR STRONGER SIGNAL THAN
// 500,000 FROM A 5-MILLION ONE. Absolute reach ranks by audience size, so a
// corpus sorted on it surfaces the biggest accounts and teaches a creator with
// 1,500 followers nothing about her own next video.
//
// ⚖️ AND THE CORPUS CAN ANSWER THIS TODAY. Measured 2026-09-09: `reach` is
// populated on ALL 16,044 gallery_items across 3,877 creators, and it is
// genuinely PER-VIDEO — Linus Tech Tips carries 34 distinct values across 154
// cards, @topcomedey 95 across 115. This was checked before anything was built,
// because if `reach` had been a per-creator follower count every video of a
// creator would share one value and a median would be meaningless.
//
// ── THREE THINGS THE REAL DATA DICTATED ─────────────────────────────────────
//
// ⚠️⚠️ "0" IS UNKNOWN, NOT ZERO VIEWS. 945 rows carry reach "0", and 940 of them
// belong to the creator literally named "@" — a scrape that captured nothing.
// Treating those as zero-view videos would drag every median they touch toward
// zero and make ordinary videos look like breakout hits. Absent is not zero.
//
// ⚠️ `likes` IS "0" ON EVERY ROW SAMPLED and is not used here at all. A field
// that is uniformly zero is not a weak signal, it is an absent one.
//
// ⚠️ THE VALUES ARE ABBREVIATED STRINGS — "1.2M", "965.6K", "77.8M". They sort
// alphabetically, so "11.3M" < "9.8M" in SQL. Any ranking done on the raw column
// is silently wrong.

/**
 * Parse a scraped reach string into a number.
 *
 * ⚠️ RETURNS null FOR "0" AND FOR ANYTHING UNPARSEABLE. Every caller must handle
 * null as "we do not know", never as a quantity.
 */
export function parseReach(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/,/g, '')
  if (t === '') return null
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i)
  if (m === null) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase()] ?? 1
  const value = n * mult
  // ⚠️ ZERO IS THE UNKNOWN MARKER IN THIS CORPUS, not a measurement.
  return value > 0 ? value : null
}

/**
 * ⚠️ THE MEDIAN, NEVER THE MEAN. One 18-million-view outlier moves a mean
 * enormously and a median barely at all — and the whole point of a baseline is
 * that it describes the creator's ordinary video, not their best one.
 */
export function medianOf(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/**
 * ⚠️⚠️ A BASELINE NEEDS ENOUGH VIDEOS TO BE A BASELINE. With three videos, the
 * median IS one of them, and every card is then measured against a number it
 * helped set. Five is the floor at which a median starts describing a habit
 * rather than an accident.
 *
 * ⚖️ THIS IS DELIBERATELY LOWER THAN `MIN_COHORT` (20) AND MEASURES SOMETHING
 * ELSE. This floor asks "does this creator have a stable normal?"; the cohort
 * floor asks "have enough different creators done this for it to be a pattern?".
 * Conflating them would either throw away most of the corpus or recommend from
 * a handful of videos.
 */
export const MIN_VIDEOS_FOR_BASELINE = 5

export interface RelativeRead {
  /** Multiple of that creator's own median. 4.2 means 4.2× their normal. */
  lift: number
  /** How many of that creator's videos the median rests on. */
  basedOn: number
}

/**
 * How this video did against its OWN creator's normal.
 *
 * ⚠️ RETURNS null RATHER THAN 1.0 WHEN IT CANNOT TELL. A default of "average"
 * would flood every ranking with cards that were never measured, and they would
 * outrank genuinely below-average videos that were.
 */
export function relativePerformance(
  cardReach: unknown,
  creatorReaches: readonly unknown[],
): RelativeRead | null {
  const value = parseReach(cardReach)
  if (value === null) return null
  const known = creatorReaches.map(parseReach).filter((v): v is number => v !== null)
  if (known.length < MIN_VIDEOS_FOR_BASELINE) return null
  const median = medianOf(known)
  if (median === null || median <= 0) return null
  return { lift: value / median, basedOn: known.length }
}

/**
 * ⚠️⚠️ ONE VIDEO MUST NOT CARRY A SHAPE. The physio's LEGO parody did 543,300
 * against a ~5,000 median — a 108× lift that teaches nothing about his clinical
 * content, and would dominate any ranking it entered.
 *
 * ⚖️ CAPPED, NOT DISCARDED. Throwing the row away loses the fact that the shape
 * worked at all; capping keeps it as one strong vote instead of a hundred. The
 * cap is stated here rather than chosen per call site, so no ranking can quietly
 * opt out of it.
 */
export const MAX_SINGLE_CARD_LIFT = 10

export function cappedLift(lift: number): number {
  if (!Number.isFinite(lift) || lift <= 0) return 0
  return Math.min(lift, MAX_SINGLE_CARD_LIFT)
}

/**
 * The median lift of a set of cards — the unit a shape is ranked by.
 *
 * ⚖️ MEDIAN OF CAPPED LIFTS, which is two defences against the same failure. The
 * cap stops one card carrying the shape; the median stops a handful of capped
 * cards doing it between them.
 */
export function medianLift(lifts: readonly number[]): number | null {
  return medianOf(lifts.map(cappedLift))
}

// ══ from packages/shared/src/corpus/facets.ts ══════════════════════════
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

const BUSINESS_WORDS = /\b(founders?|entrepreneurs?|wantrepreneurs?|business owners?|brand owners?|startups?|ceos?|freelancers?|agencies|agency owners?|coaches|creators? looking to monetis|smes?|b2b)\b/i
const CONSUMER_WORDS = /\b(women|men|parents?|mothers?|students?|shoppers?|homeowners?|renters?|enthusiasts?|gen z|millennials?|everyday|beginners?|fans?|teens?|families)\b/i

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

// ══ from packages/shared/src/corpus/cohort.ts ══════════════════════════
// WHICH VIDEOS COUNT AS EVIDENCE FOR HER — AND WHEN THE ANSWER IS NOTHING.
//
// ⚠️ THIS IS AN INTERNAL SELECTOR, NOT A RECOMMENDATION FEED. Its entire output
// is: which evidence goes into this prompt, and what that evidence proves. The
// creator never sees a ranking. She sees a better script, and one line saying
// why — only where the classification CHANGED what Twin chose.
//
// ⚖️ AND ITS MOST COMMON CORRECT ANSWER IS NOTHING. Measured on the live
// corpus, one goal in seven separates (`entertainment` at 6.36 SE); `authority`
// reads 0.94 and MOVED AWAY from decisive as the corpus grew. So the shape
// block is absent far more often than it is present — not weakened, absent.
//
// ── THE FALLBACK LADDER, AND WHY IT IS A LADDER ─────────────────────────────
//
// ⚠️ AN EXACT SUB-DOMAIN MATCH IS THE STRONGEST SIGNAL AND ALMOST ALWAYS YIELDS
// TOO FEW ROWS. Measured: 46 of 51 voices carry a `sub_niche`, and 634 distinct
// topic labels across the corpus with 554 of them singletons. Requiring an
// exact match would return nothing for nearly everyone.
//
// ⚖️ SO IT DESCENDS, AND EACH RUNG STATES WHICH RUNG IT IS. A cohort assembled
// on `domain` alone is real evidence and much weaker than one assembled on four
// facets; a caller that cannot tell them apart will weigh them the same.


/** How the cohort was assembled. Strongest first. */
export type CohortRung = 'sub_domain' | 'facets' | 'domain' | 'none'

/** ⚠️ HOW MANY FACETS MUST AGREE FOR THE `facets` RUNG. Three of four, and the
 *  fourth may be unknown rather than wrong — a photographer and a physio agree
 *  on `service · consumer · in_person` and differ on domain, which is exactly
 *  the case the vector exists to admit. */
export const FACET_AGREEMENT = 3

export interface CohortCard {
  /** The card's own facets, as its creator's. */
  facets: FacetVector
  /** Raw reach string as stored. */
  reach: unknown
  /** Every reach by the SAME creator, for the baseline. */
  creatorReaches: readonly unknown[]
  /** Caption-derived shape, or null when unclassified. */
  shape: string | null
}

export interface ShapeEvidence {
  shape: string
  /** Cards in this cohort carrying this shape. */
  n: number
  /** Median of capped lifts — the ranking unit. */
  medianLift: number
}

export interface CohortRead {
  rung: CohortRung
  /** The sentence the cohort says about itself. */
  basis: string
  /** How many cards were selected. */
  size: number
  /** ⚠️ EMPTY WHENEVER THE COHORT MAY NOT RECOMMEND. Not weakened. Empty. */
  shapes: ShapeEvidence[]
  /** True only when the cohort is large enough AND a shape leads decisively. */
  decisive: boolean
}

/**
 * ⚠️ A CARD WITH NO MEASURABLE LIFT IS NOT EVIDENCE ABOUT PERFORMANCE. It stays
 * out of the shape tally entirely rather than entering with a default — a
 * default of "average" floods the ranking with cards nobody measured, and they
 * would outrank genuinely below-average cards that WERE measured.
 */
function liftsByShape(cards: readonly CohortCard[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const c of cards) {
    if (c.shape === null || c.shape === '') continue
    const rel: RelativeRead | null = relativePerformance(c.reach, c.creatorReaches)
    if (rel === null) continue
    const arr = out.get(c.shape)
    if (arr === undefined) out.set(c.shape, [rel.lift])
    else arr.push(rel.lift)
  }
  return out
}

/**
 * ⚠️⚠️ THE SEPARATION RULE, THE SAME ONE THE GOAL/CONTAINER RANKING USES: a lead
 * counts only when the gap exceeds twice the sampling noise on a count,
 * `2 * sqrt(a + b)`. Restated here on cohort COUNTS rather than corpus counts,
 * because the question is different — but the bar is not, and it is set here
 * rather than discovered so it cannot be nudged until a favoured shape wins.
 *
 * ⚖️ THAT SENTENCE DELIBERATELY DOES NOT NAME THE OTHER MODULE.
 * check_symbol_readers greps source and does not strip comments, so naming a
 * symbol here reports it as having acquired a production reader — it did
 * exactly that on this file's first draft, and demanded a registry entry be
 * deleted for a function nothing calls. The guard fix is up separately.
 */
function separates(a: number, b: number): boolean {
  if (a <= 0) return false
  return (a - b) / Math.sqrt(a + b) > 2
}

/**
 * Assemble the strongest cohort available, and say which rung it came from.
 *
 * ⚖️ EVERY RUNG IS TRIED IN ORDER AND THE FIRST ONE THAT CLEARS `MIN_COHORT`
 * WINS. Descending only on size, never on preference — a `domain` cohort is
 * never chosen while a `facets` cohort of 20+ exists.
 */
/**
 * ⚠️ NAMED `selectEvidenceCohort`, NOT `selectCohort`. That name is already
 * taken by the pilot — `supabase/functions/_shared/pilotCore.ts` exports a
 * `selectCohort(rows, size, which)` that picks a review cohort, and
 * pilot-start and pilotDb both call it. Different module, so tsc raised
 * nothing, but check_symbol_readers greps by NAME across production sources
 * and reported this function as already having a reader.
 *
 * ⚖️ RENAMED RATHER THAN REGISTERED AROUND. Two unrelated `selectCohort`s in
 * one repository is a hazard for the next reader as much as for the guard, and
 * the same collision class already cost a rename once this month
 * (`questionsFor` against preScriptBrief's).
 */
export function selectEvidenceCohort(
  her: FacetVector,
  cards: readonly CohortCard[],
): CohortRead {
  const bySubDomain = her.subDomain === null ? [] : cards.filter((c) =>
    c.facets.subDomain !== null
    && c.facets.subDomain.trim().toLowerCase() === her.subDomain!.trim().toLowerCase())

  const byFacets = cards.filter((c) => {
    const m = facetMatch(her, c.facets)
    return m.agreed >= FACET_AGREEMENT
  })

  const byDomain = her.domain === null ? [] : cards.filter((c) => c.facets.domain === her.domain)

  const rungs: ReadonlyArray<[CohortRung, readonly CohortCard[]]> = [
    ['sub_domain', bySubDomain],
    ['facets', byFacets],
    ['domain', byDomain],
  ]

  for (const [rung, selected] of rungs) {
    if (!cohortMayRecommend(selected.length)) continue
    const lifts = liftsByShape(selected)
    const shapes: ShapeEvidence[] = []
    for (const [shape, xs] of lifts) {
      const ml = medianLift(xs)
      if (ml === null) continue
      shapes.push({ shape, n: xs.length, medianLift: ml })
    }
    // ⚖️ ORDERED BY n, NOT BY LIFT. A shape with the highest median lift on
    // three cards is an anecdote; the separation test below is about COUNTS,
    // and ordering by lift would put the anecdote first and invite reading it
    // as the answer.
    shapes.sort((a, b) => b.n - a.n || b.medianLift - a.medianLift || a.shape.localeCompare(b.shape))
    const decisive = shapes.length > 0
      && separates(shapes[0].n, shapes[1]?.n ?? 0)
    return {
      rung,
      basis: describeCohort(her, selected.length),
      size: selected.length,
      // ⚠️ SHAPES ARE RETURNED EVEN WHEN NOT DECISIVE, so a caller can say "we
      // looked and it was a tie" — but `decisive` is the ONLY thing that
      // licenses acting, and `shapeBlock` below returns null without it.
      shapes,
      decisive,
    }
  }

  // ⚖️ NOTHING IS AN ANSWER, AND IT STILL STATES ITS BASIS.
  return { rung: 'none', basis: describeCohort(her, 0), size: 0, shapes: [], decisive: false }
}

/**
 * How far above a creator's own median a shape must sit before it is worth
 * naming.
 *
 * ⚠️⚠️ THE GATE THIS FILE WAS MISSING, AND THE MEASUREMENT THAT FOUND IT.
 * Simulated against the whole production corpus on 2026-09-10, with 2,116
 * classified cards, `shapeBlock` returned a block for four of seven niche
 * buckets — and every one of them carried `medianLift` of exactly 1.0000:
 *
 *     business         how_to          n=297   lift 1.0000
 *     tech             how_to          n=169   lift 1.0000
 *     food             number_promise  n= 50   lift 1.0000
 *     beauty_fashion   number_promise  n= 48   lift 1.0000
 *
 * Every gate before this one counts cards. None of them asked whether the
 * shape did better than the creator's ordinary video, so a shape sitting
 * exactly at the median was about to be put in front of the model as evidence
 * of what works. `shapeBlock`'s own header says why that is worse than
 * silence: a hedged shape is still a shape in the model's context, and it
 * will be used.
 *
 * ⚠️ EXACTLY 1.0000 AT n=297 IS ARITHMETIC, NOT MEASUREMENT. Real per-video
 * reach does not divide to 1.000; it divides to 0.97 and 1.03. You get exactly
 * one when you divide a constant by its own median — and that is what
 * `gallery_items.reach` is. Measured: 40.6% of a creator's cards share one
 * identical value, and the modal value is unique to the creator in 61.4% of
 * cases (440 distinct modal values across 717 creators; the most-shared,
 * `1.1M`, is held by 21). A global placeholder would be shared by hundreds.
 * So `reach` is AUDIENCE SIZE, not views.
 *
 * ⚖️ WHICH MEANS THIS NUMBER IS NOT CALIBRATED, AND SAYING SO IS THE POINT.
 * There is no real lift distribution to fit a threshold to, because the column
 * the lift is computed from is not a per-video metric. 1.2 is chosen to
 * exclude the measured degenerate case with margin — nothing more. It is NOT
 * a claim that 20% is the level at which a shape becomes worth following.
 *
 * WHAT WOULD CALIBRATE IT: a per-video view count on `gallery_items`. With
 * that, the threshold should be re-cut from the observed distribution of
 * per-shape median lifts, and this comment replaced with that measurement.
 * Until then the lift layer is `built, awaiting sample`, and this gate is what
 * stops it asserting anything in the meantime.
 */
export const MIN_MEDIAN_LIFT = 1.2

export interface ShapeBlock {
  shape: string
  n: number
  /**
   * ⚠️ THE PROMPT MUST SAY THE NUMBER, NOT JUST THE SHAPE. "how_to" is an
   * instruction; "how_to, 4.2x this creator's median across 297 cards" is
   * evidence a reader can weigh and disagree with. A consumer that renders the
   * shape and drops this field turns the second back into the first.
   */
  medianLift: number
  basis: string
  rung: CohortRung
}

/**
 * What the prompt's SHAPE block should contain, or null.
 *
 * ⚠️⚠️ null MEANS THE BLOCK IS ABSENT FROM THE PROMPT ENTIRELY — not a weakened
 * recommendation, not a hedge, not "we could not determine a shape". Absent.
 * A hedged shape is still a shape in the model's context, and it will be used.
 *
 * ⚖️ AND THE CREATOR SEES NOTHING IN THAT CASE. Silence is not a failure state
 * to report.
 */
export function shapeBlock(read: CohortRead): ShapeBlock | null {
  if (!read.decisive) return null
  if (read.shapes.length === 0) return null
  if (!cohortMayRecommend(read.size)) return null
  const top = read.shapes[0]
  // ⚠️ AND THE LEADING SHAPE ITSELF MUST CLEAR THE FLOOR. A cohort of 340 can
  // still carry a shape on 4 cards; the cohort size is not the shape's n.
  if (top.n < MIN_COHORT) return null
  // ⚠️⚠️ AND IT MUST ACTUALLY OUTPERFORM. Every gate above this line counts
  // cards; none of them asks whether the shape did any better than the
  // creator's own ordinary video. A shape at 1.00× is by definition average,
  // and naming it is a recommendation with nothing behind it.
  if (top.medianLift < MIN_MEDIAN_LIFT) return null
  return {
    shape: top.shape, n: top.n, medianLift: top.medianLift,
    basis: read.basis, rung: read.rung,
  }
}
