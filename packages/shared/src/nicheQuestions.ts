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
/**
 * THE OPENING THREE, WORDED FOR WHAT SHE SELLS.
 *
 * ⚠⚠ THE OPENING THREE HAD NO NICHE WORDING AT ALL, AND THAT WAS THE WHOLE
 * COMPLAINT. `OVERRIDES` covers number_that_matters / own_method /
 * first_thing_asked; `OPENING_THREE` is expensive_lesson / best_result /
 * contrarian. A DISJOINT SET. So every creator saw the same three sentences no
 * matter what she does, and "what does almost everyone in your NICHE believe"
 * was asked of people whose niche we had not read yet.
 *
 * ⚠️ AND THE KEY IS `sells`, NOT NICHE. A coach has clients who arrive stuck; a
 * chef has clients who are tired at 6pm; a template seller has buyers who click
 * a link. Inside one niche those are different jobs, and a question that assumes
 * the wrong one cannot be answered honestly — which is how a digital-product
 * seller came to be asked what she says when a founder comes to her stuck.
 *
 * ⚠️ FOUR VARIANTS, NOT SEVEN, AND THE MISSING ONES ARE MISSING FOR A REASON.
 * `SELLS_KINDS` is service | physical | digital because that is what
 * `sellsKindOf` can DERIVE from the products table. A local service (chef,
 * cleaner) and a remote one (coach, agency) genuinely want different words, but
 * nothing recorded anywhere says which a creator is — there is no in-person
 * signal — so inventing the split would mean guessing, and a guess here asks
 * somebody about a relationship they do not have. Membership and software
 * already arrive as `digital` through `TYPE_SELLS`. `null` covers both "sells
 * nothing" and a MIXED library, where choosing one kind would be a coin-flip
 * printed as a question about her work.
 *
 * ⚖️ SO `service` TAKES THE WORDING THAT IS TRUE OF BOTH. "What do people
 * assume about hiring someone like you that is wrong" reads correctly for a chef
 * and for a consultant; "when a client comes to you stuck" does not, and it is
 * the sentence that misfired in the first place.
 */
const OPENING_BY_SELLS: Readonly<Record<
  SellsKind | 'none',
  Readonly<Record<string, { ask: string; hint: string }>>
>> = Object.freeze({
  service: Object.freeze({
    expensive_lesson: {
      ask: 'What did a job cost you more than you charged?',
      hint: 'The hours, the travel, the materials — and what you price differently now.',
    },
    best_result: {
      ask: 'What did a client tell you that you still repeat?',
      hint: 'Their words, not the outcome you would write on a website.',
    },
    contrarian: {
      ask: 'What do people assume about hiring someone like you that is wrong?',
      hint: 'What they think they are buying, and what they are actually buying.',
    },
  }),
  physical: Object.freeze({
    expensive_lesson: {
      ask: 'What did you buy too much of, or price too low?',
      hint: 'Stock, packaging, a machine — and what you do now.',
    },
    best_result: {
      ask: 'What is the best thing a customer did after receiving one?',
      hint: 'A message, a photo, a reorder — with the number if you have it.',
    },
    contrarian: {
      ask: 'What do people assume about how it is made, or what it costs?',
      hint: 'Name the assumption, then what is actually true.',
    },
  }),
  digital: Object.freeze({
    expensive_lesson: {
      ask: 'What did you build that nobody used, and what did you learn?',
      hint: 'The thing you were sure of, and what the buyers did instead.',
    },
    best_result: {
      ask: 'What did a buyer do with it that you did not expect?',
      hint: 'What they made, changed or kept doing — with the number if you have it.',
    },
    contrarian: {
      ask: 'What do buyers expect to find inside that is not there — or the reverse?',
      hint: 'The thing they ask for, and why you left it out.',
    },
  }),
  none: Object.freeze({
    expensive_lesson: {
      ask: 'What did you get wrong publicly, and what changed after?',
      hint: 'What you said, what happened, and what you do differently now.',
    },
    best_result: {
      ask: 'Which video or post outperformed everything — and what was different about it?',
      hint: 'The numbers if you have them, and what you think made it land.',
    },
    contrarian: {
      ask: 'What does everyone in your corner of the internet repeat that you think is wrong?',
      hint: 'Name what they say, then what you say instead.',
    },
  }),
})

/**
 * ⚠⚠ UNDER 1,000 FOLLOWERS THE RESULT QUESTION HAS NO ANSWER, AND ASKING FOR A
 * NUMBER SHE DOES NOT HAVE READS AS AN ACCUSATION. It replaces `best_result`
 * only, and only at that band — the other two are answerable at any size.
 */
const UNDER_1K_BEST_RESULT = Object.freeze({
  ask: 'What is the best thing that has happened because of something you posted?',
  hint: 'A message, a reply, someone showing up — whatever actually happened.',
})


/**
 * What she sells, including the case where the honest answer is "nothing".
 *
 * ⚠⚠ `sellsKindOf` RETURNS null FOR TWO DIFFERENT FACTS and that is right for
 * what it does: an EMPTY library and a MIXED one both mean "no single kind".
 * But they are opposite situations for a question. A creator with no products is
 * a commentator and can be asked what she got wrong publicly; a creator with a
 * service AND a candle line has two kinds of buyer and must be asked neither
 * one's question. Only a caller holding the list can tell them apart, so this
 * makes the distinction here rather than guessing downstream.
 *
 * ⚖️ AND "NO OWNED PRODUCTS" IS NOT "NO ROWS". A library of affiliate rows is
 * somebody else's product; she still sells nothing of her own.
 */
export function sellsFacetOf(
  products: ReadonlyArray<{ type?: unknown; relationship?: unknown }> | null | undefined,
): SellsKind | 'none' | null {
  if (!Array.isArray(products)) return null
  const owned = products.filter((p) => {
    const rel = typeof p?.relationship === 'string' ? p.relationship : ''
    return rel === 'OWN_PRODUCT' || rel === 'OWN_SERVICE'
  })
  if (owned.length === 0) return 'none'
  return sellsKindOf(owned)
}

/**
 * The opening three, worded for this creator.
 *
 * ⚠️ THE ID NEVER CHANGES, ONLY THE WORDS. `CreatorQuestion.id` is what
 * "already answered" and "already skipped" are keyed on, so a creator who
 * answered `contrarian` must never meet it again wearing new wording.
 *
 * ⚖️ AND AN UNKNOWN `sells` FALLS BACK TO THE PLAIN BANK RATHER THAN TO
 * `none`. "Sells nothing" is a FACT about a creator, not a synonym for "we could
 * not tell" — a mixed library and a pure commentator are different people, and
 * the commentator's wording asked of a chef is worse than the generic.
 */
export function openingQuestionsFor(
  bank: readonly CreatorQuestion[],
  sells: SellsKind | 'none' | null,
  stageBand: string | null = null,
): readonly CreatorQuestion[] {
  const table = sells === null ? null : OPENING_BY_SELLS[sells]
  if (table === null) return bank
  return bank.map((q) => {
    const o = table[q.id]
    if (!o) return q
    if (q.id === 'best_result' && stageBand === 'under_1k') {
      return { ...q, ask: UNDER_1K_BEST_RESULT.ask, hint: UNDER_1K_BEST_RESULT.hint }
    }
    return { ...q, ask: o.ask, hint: o.hint }
  })
}

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
