// "WHAT NUMBER DO YOU TRACK THE MOST?" MEANT NOTHING TO HER.
//
// ⚠️ REPORTED LIVE from a beauty creator. It is not a bad question — it is a
// question from another industry, asked of someone whose work has no dashboard.
// By the time she reaches it Twin holds her niche, her vocabulary and her own
// opinions, and it asks her to translate all of that into our vocabulary.
//
// ── WHY THIS IS A BUCKET TABLE AND NOT A LOOKUP ON `niche` ───────────────
//
// ⚠️⚠️ THE RAW `niche` FIELD CANNOT KEY ANYTHING. Measured 2026-09-09 across all
// 47 voices that have one: free-text prose, at most THREE sharing a value, and
// most of them unique compounds —
//
//   "3d animation explanation, funny dubbing, challenge narratives"
//   "ai tools, faceless youtube/tiktok automation, and online earning."
//
// A table keyed on that string would match almost nobody, which is the same
// shape `topicLibrary` found in the reference corpus: 634 distinct topics, 554
// of them singletons.
//
// ⚖️ COARSE BUCKETS DO REPEAT, AND THE COUNTS ARE WHY ONLY TWO ARE WRITTEN.
// Same measurement, bucketed:
//
//   business 19 · tech 13 · entertainment 4 · health 3 · other 3
//   beauty/fashion 2 · food 2 · creator 1
//
// Business and tech are 32 of 47 (68%). Everything below is one to four voices,
// and hand-writing four questions for a bucket of two is writing for almost
// nobody — so those buckets keep the generic bank, which is a real answer and
// not a gap. The beauty creator who reported this is one of the TWO, and saying
// that plainly is better than inventing a beauty table on a sample of two.
//
// ⚖️ AND NO CHIPS ARE GENERATED PER CREATOR. The owner's rule from the audience
// cards holds here: generating options throws away a better stored answer to ask
// a worse question. This substitutes WORDING for a bucket, from a list a human
// wrote and can argue with — the same standard `TOPIC_ALIASES` is held to.
import { CREATOR_QUESTIONS, type CreatorQuestion } from './creatorQuestions'

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

/**
 * ⚠️⚠️ THE ID IS UNCHANGED AND THAT IS NOT COSMETIC. `CreatorQuestion.id` carries
 * its own warning — "NEVER REUSE AN ID FOR A DIFFERENT QUESTION. A creator who
 * answered the old one would silently never see the new one." A niche variant is
 * the SAME question in her language, so it keeps the id and changes only what she
 * reads. Anyone who has already answered stays answered.
 *
 * ⚖️ ONLY THE QUESTIONS WHOSE GENERIC WORDING IS ACTUALLY ABSTRACT are
 * rewritten. Three of ten. "What is something you learned the expensive way?"
 * needs no translation for anybody.
 */
const OVERRIDES: Readonly<Record<NicheBucket, Readonly<Record<string, { ask: string; hint: string }>>>> = Object.freeze({
  business: Object.freeze({
    number_that_matters: {
      ask: 'What number do you watch that tells you the business is working?',
      hint: 'Margin, repeat rate, cost per lead — the figure and what it tells you.',
    },
    own_method: {
      ask: 'When a client gets a result with you, what did you actually do first?',
      hint: 'Your order of operations. Two or three steps beats a philosophy.',
    },
    first_thing_asked: {
      ask: 'When a founder comes to you stuck, what do you ask them first?',
      hint: 'The question that tells you what is really wrong.',
    },
  }),
  tech: Object.freeze({
    number_that_matters: {
      ask: 'What number do you check that tells you something is actually working?',
      hint: 'Latency, error rate, adoption — the figure and what it tells you.',
    },
    own_method: {
      ask: 'When you build this well, what do you do before writing any code?',
      hint: 'Your order of operations. Two or three steps beats a philosophy.',
    },
    first_thing_asked: {
      ask: 'When someone brings you a broken build, what do you check first?',
      hint: 'The check that rules out the most, fastest.',
    },
  }),
  // ⚖️ WRITTEN AS EMPTY ON PURPOSE, NOT OMITTED. An empty override says
  // "measured, and too few to write for"; a gap in the type would say nobody
  // had looked.
  //
  // ⚠️ `beauty_fashion` MATCHES ZERO OF THE 47 STORED NICHES, and that is worth
  // saying out loud because the report that prompted this work came from a
  // beauty creator. The only fashion-shaped niches in production are "Fashion
  // Tech / AI Virtual Try-On" and its variants — B2B software for e-commerce,
  // which buckets as business or tech and should. The bucket is kept because the
  // pattern is right and the corpus will grow; it is not kept because it serves
  // anybody today, and pretending otherwise would be the invented-taxonomy
  // failure `topicLibrary` refuses.
  entertainment: Object.freeze({}),
  health: Object.freeze({}),
  beauty_fashion: Object.freeze({}),
  food: Object.freeze({}),
  creator: Object.freeze({}),
})

// ── AND INSIDE A BUCKET, WHAT SHE SELLS CHANGES THE QUESTION AGAIN ────────
//
// ⚠️ REPORTED LIVE, AND THE BUCKET WAS RIGHT WHILE THE QUESTION WAS WRONG. A
// creator selling Canva templates on Etsy buckets as `business` — her niche is
// "Social Media Marketing" — and was asked "When a founder comes to you stuck,
// what do you ask them first?". She has BUYERS, NOT CLIENTS. Nobody comes to her
// stuck. The question cannot be answered honestly, so "Not this one" is the only
// true response, and a question a creator can only decline is a question that
// taught us nothing.
//
// ⚠️ IT IS THE SAME LIMIT AS THE BEAUTY REPORT, ONE LEVEL DOWN. Buckets fixed
// "health vs business"; inside `business` a coach, an agency and a product
// seller are different jobs. A coach has clients who arrive stuck. A product
// seller has buyers who click a link.
//
// ⚖️ AND THIS KEY IS BETTER THAN `niche`, WHICH IS THE REASON IT IS WORTH
// BUILDING. `niche` is free-text prose that needed a regex table to bucket at
// all — 47 voices, at most three sharing a value. `product_entities.type` is a
// CLOSED ENUM the creator picked herself behind an attestation. No guessing, no
// keyword rule, nothing to drift.
//
// ⚖️ AND IT CLEARS THIS FILE'S OWN BAR, MEASURED 2026-09-12 over owned products:
//
//   service 5 owners · physical 4 · digital 1 · saas 1 · other 1
//
// Every variant written below serves at least one real creator, and two serve
// four or five — better than `beauty_fashion`, which is kept while matching
// nobody. Only `first_thing_asked` varies, because it is the only one whose
// generic wording ASSUMES A RELATIONSHIP rather than merely being abstract.
export const SELLS_KINDS = ['service', 'physical', 'digital'] as const
export type SellsKind = (typeof SELLS_KINDS)[number]

/** What a product's type means for how its buyers reach her.
 *
 *  ⚠️ UNMAPPED IS `null`, NEVER A GUESS. `MARKETPLACE`, `COMMUNITY` and `OTHER`
 *  are deliberately absent: a marketplace's "buyer" may be either side of it, a
 *  community is ongoing access that resembles a service without being one, and
 *  `OTHER` is by definition unclassified. `productQuestions` already refuses to
 *  invent a taxonomy for exactly these; guessing here would contradict it and
 *  hand somebody a question about a relationship they do not have — which is
 *  the defect this whole block exists to fix. They fall back and that is right. */
const TYPE_SELLS: Readonly<Record<string, SellsKind>> = Object.freeze({
  SERVICE: 'service',
  PHYSICAL_PRODUCT: 'physical',
  DIGITAL_PRODUCT: 'digital',
  COURSE: 'digital',
  // ⚖️ SOFTWARE IS SOMETHING YOU OPEN AND FIND THINGS INSIDE, so it takes the
  // digital wording: "what do buyers expect to find inside that isn't there"
  // reads correctly for a SaaS whose feature list is misread, which is the same
  // shape as a template pack whose contents are.
  SAAS: 'digital',
  APP: 'digital',
})

/** What this creator sells, from the products she has registered.
 *
 *  ⚠️ OWNED ONLY. An affiliate or sponsored row says what she TALKS ABOUT, not
 *  what her own buyers come to her for, and keying her own-expertise question on
 *  somebody else's product is how she gets asked about a relationship she does
 *  not have.
 *
 *  ⚖️ AND A MIXED LIBRARY ANSWERS `null` RATHER THAN PICKING. A creator who
 *  sells both a service and a physical product genuinely has both kinds of
 *  buyer; choosing one would be a coin-flip printed as a question about her
 *  work. The generic bucket wording already serves her, and it is honest. */
export function sellsKindOf(
  products: ReadonlyArray<{ type?: unknown; relationship?: unknown }> | null | undefined,
): SellsKind | null {
  if (!Array.isArray(products) || products.length === 0) return null
  const kinds = new Set<SellsKind>()
  for (const p of products) {
    const rel = typeof p?.relationship === 'string' ? p.relationship : ''
    if (rel !== 'OWN_PRODUCT' && rel !== 'OWN_SERVICE') continue
    // ⚖️ THE RELATIONSHIP WINS FOR A SERVICE. `OWN_SERVICE` is a service
    // whatever the type column happens to hold.
    if (rel === 'OWN_SERVICE') { kinds.add('service'); continue }
    const k = TYPE_SELLS[typeof p?.type === 'string' ? p.type : '']
    if (k) kinds.add(k)
  }
  return kinds.size === 1 ? [...kinds][0]! : null
}

/** The one question whose generic wording assumes a relationship she may not
 *  have. Same id, same intent — surfacing her real expertise — worded for what
 *  she actually does. */
const SELLS_OVERRIDES: Readonly<Record<SellsKind, { ask: string; hint: string }>> = Object.freeze({
  // ⚖️ UNCHANGED FOR A SERVICE, DELIBERATELY. The reported question was correct
  // for coaches and consultants; it was only ever wrong for the people it was
  // never written for.
  service: {
    ask: 'When someone comes to you stuck, what do you ask them first?',
    hint: 'The question that tells you what is really wrong.',
  },
  physical: {
    ask: 'What do people assume about it before they open it?',
    hint: 'What they expect, and what they actually find.',
  },
  digital: {
    ask: 'What do buyers expect to find inside that is not there — or the reverse?',
    hint: 'The thing people think they are getting, and the thing they miss.',
  },
})

/**
 * The question bank in this creator's language, or the generic one.
 *
 * ⚠️ NAMED `creatorQuestionsFor`, NOT `questionsFor`, BECAUSE THAT NAME IS
 * TAKEN. `preScriptBrief` already exports a `questionsFor` returning
 * `BriefQuestion[]` — a different bank for a different screen. tsc caught the
 * collision; two names for one word is how a caller comes to import the wrong
 * one and get a type error at best.
 *
 * ⚠️ FALLING BACK IS A REAL ANSWER. 15 of 47 voices land in a bucket with no
 * overrides and 0 land in no bucket at all — they get the bank that has always
 * been there, which is not a degraded state.
 */
export function creatorQuestionsFor(
  niche: unknown,
  bank: readonly CreatorQuestion[] = CREATOR_QUESTIONS,
  sells: SellsKind | null = null,
): readonly CreatorQuestion[] {
  const bucket = nicheBucket(niche)
  const overrides = bucket === null ? {} : OVERRIDES[bucket]
  const sold = sells === null ? null : SELLS_OVERRIDES[sells]
  if (Object.keys(overrides).length === 0 && sold === null) return bank
  return bank.map((q) => {
    // ⚠️ `sells` OUTRANKS THE BUCKET, AND ONLY FOR THIS ONE QUESTION. The bucket
    // says what her WORLD is; `sells` says what her RELATIONSHIP to her audience
    // is, and that is the half `first_thing_asked` gets wrong. A business-bucket
    // template seller must not be asked the coach's question just because
    // "marketing" matched first.
    if (q.id === 'first_thing_asked' && sold) return { ...q, ask: sold.ask, hint: sold.hint }
    const o = overrides[q.id]
    return o ? { ...q, ask: o.ask, hint: o.hint } : q
  })
}
