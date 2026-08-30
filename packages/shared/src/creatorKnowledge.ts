// WHAT THIS PERSON ACTUALLY KNOWS — the second memory, beside Creator DNA.
//
// ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────
//
// TwinAI's founding failure is "voice-accurate, content-empty": it captures HOW
// someone talks and almost nothing about WHAT they know, then hands them their
// own opinions back in their own phrasing. That is not an emergent property of
// the model. It is written into the schema — the DNA record carries ~15 fields
// describing delivery and about four short strings of substance, every one of
// which the extractor is explicitly licensed to GUESS when the captions are thin.
//
// Worse, the richest substance in the system is thrown away on purpose: the
// worker transcribes up to five of a creator's videos, uses them once for tone,
// and persists `audio_transcripts: 5` — a COUNT. Everything they said is gone.
//
// ── THE SPLIT ─────────────────────────────────────────────────────────────
//
//   Creator DNA        how I sound      tone, pacing, hooks, vocabulary
//   Creator Knowledge  what I know      THIS FILE
//   Audience Memory    what they ask    recurring questions, as summaries
//   Product DNA        what is true     `productEntity.ts`
//   Reference DNA      how it works     `referenceMechanism.ts`
//
// The reference gives the FORMAT. DNA gives the VOICE. Knowledge gives the
// SUBSTANCE. Handed "3 things I stopped buying after I turned 30", a system with
// only the first two invents three random products; one that also knows this
// creator thinks megapixels are oversold and battery matters more than camera
// gimmicks can write "3 phone features I stopped paying extra for".
//
// ── EXTRACT, THEN FORGET ──────────────────────────────────────────────────
//
// ⚖️ THE RAW TRANSCRIPT IS FUEL, NOT A RECORD. Knowledge is distilled from it and
// the source text expires; what persists is a short structured claim plus enough
// provenance to trace it. That is the whole reason this is a separate table
// rather than a `transcripts` column: a durable claim is what the writer needs,
// and durable raw speech is a liability nobody asked us to hold. `sourceExpiry`
// exists so that discipline is representable rather than a promise in a comment.
//
// The same rule governs audience material even more strictly. Comments are
// written by people who never signed up for anything here, so nothing in this
// module stores a comment — only a SUMMARY of what many of them asked, with a
// count, which is why `AudienceQuestion` has no author, no text and no id.
//
// ── NOTHING HERE MAY BE INVENTED ──────────────────────────────────────────
//
// The DNA extractor's instruction is "COMPLETENESS IS MANDATORY … a confident,
// specific inference is far more useful than a blank", and the generator's
// fallbacks say "NONE STORED. Infer 1-2 stances this creator would plausibly
// hold". That is how a guess becomes a quote in someone's mouth. So every item
// here carries `basis`, an empty knowledge base is a legal and honest state, and
// `writableClaims` refuses anything not directly stated. A creator can be
// contradicted by their own video; they cannot be contradicted by ours.

/** Where an item came from. Three-state on purpose: `inferred` is not a weaker
 *  `stated`, it is a DIFFERENT KIND of thing and may never be quoted back. */
/** WHICH PIPELINE produced this item — distinct from `basis`, which says how
 *  strongly it is attested, and from `kind`, which says what it is.
 *
 *  ⚠️ `basis` IS A LOSSY PROXY FOR THIS, AND RELYING ON IT WAS A LATENT BUG.
 *  Caption extraction is clamped to `demonstrated`, so `stated` implies speech
 *  TODAY — a coincidence of the current clamp, not a recorded fact. It breaks
 *  silently the moment another source is added or the clamp changes.
 *
 *  ⚖️ AND THE DEPLOYMENT QUESTION NEEDS THE REAL THING. "Do transcript-derived
 *  profiles ground creator-state claims at a higher rate than caption-only
 *  ones?" cannot be answered from a proxy that happens to correlate.
 *
 *    caption         a title/description. Proves a video was MADE, not what it
 *                    concluded — which is why it is clamped to coverage.
 *    transcript      spoken words. The ONLY source that can carry a stated
 *                    position, and therefore the only one that can ever license
 *                    an opinion or experience beat.
 *    user            the creator answered directly. The highest authority there
 *                    is, and the only source for facts nothing public reveals.
 *    previous_video  carried forward from an earlier generation of their own.
 */
export const KNOWLEDGE_SOURCES = ['caption', 'transcript', 'user', 'previous_video'] as const
export type KnowledgeSource = (typeof KNOWLEDGE_SOURCES)[number]

export const KNOWLEDGE_BASIS = ['stated', 'demonstrated', 'inferred'] as const
export type KnowledgeBasis = (typeof KNOWLEDGE_BASIS)[number]

/** What kind of substance this is. Closed, so a new kind cannot appear
 *  downstream with nothing deciding whether it may be spoken. */
export const KNOWLEDGE_KINDS = [
  'fact',        // checkable, and true independently of them
  'opinion',     // a position they hold — theirs, and contestable
  'topic',       // something they return to
  'example',     // a concrete case they have used
  'experience',  // something they personally did
  'framework',   // a repeatable method they teach
  'claim',       // an assertion carrying a number or outcome
  'product',     // a product they have mentioned or worked with
  'covered',     // already made a video about it — do NOT repeat
] as const

/** ⚖️ `fact` AND `opinion` ARE SEPARATE KINDS, NOT SHADES OF ONE. "USB-C is
 *  reversible" survives being attributed to anybody; "megapixels are oversold"
 *  is a stance, and a script that states it flatly has put a position in
 *  someone's mouth as though it were measurement. Collapsing the two is how a
 *  creator ends up sounding more certain than they have ever been. */
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number]

export interface KnowledgeItem {
  kind: KnowledgeKind
  /** The substance itself, in one line. Short on purpose: this is a distillate,
   *  not a quotation, and a long one is a transcript wearing a disguise. */
  text: string
  basis: KnowledgeBasis
  /** ⚖️ OPTIONAL, AND `undefined` MEANS NOT RECORDED — never "caption". Rows
   *  written before the column existed have genuinely unknown provenance, and
   *  guessing it would corrupt the grounding-by-source metric it exists for. */
  source?: KnowledgeSource
  /** How sure the extractor was, 0-1. Distinct from `basis`: basis is HOW we
   *  know, confidence is HOW WELL.
   *
   *  ⚠️ CURRENTLY DEGENERATE, AND NOTHING MAY RANK ON IT UNTIL THAT CHANGES.
   *  Run against real speech the extractor returned 1.0 for all twelve items,
   *  including ones it had inferred across videos, despite its prompt saying in
   *  as many words not to round up to look decisive. A field that is always 1.0
   *  is not a measurement; it is a constant that LOOKS like one, which is worse
   *  than an absent field because a reader trusts it.
   *
   *  It is stored rather than dropped because the owner asked for it and because
   *  a self-report is still evidence about the extractor. It is deliberately NOT
   *  used by `rankedKnowledge`, which ranks on `timesSeen` and `basis` — two
   *  things counted from the transcripts rather than asserted about them. Wire
   *  this into a ranking only after a run shows it varying. */
  confidence: number
  /** How many separate videos this showed up in. A position held once is a
   *  remark; the same one across five videos is what they are known for. */
  timesSeen: number
  /** Which source it was distilled from — an id, never the text. Enough to
   *  trace, not enough to reconstitute. */
  sourceRef: string | null
  /** The video it came from, so a creator correcting an item can go and watch
   *  the thing we read it out of. Provenance a person can act on beats an
   *  opaque id. */
  sourceUrl: string | null
  /** When it was last seen in their output. A position from four years ago and
   *  one from last month are different facts about a person, and only a dated
   *  record can tell them apart or let a stale one decay. */
  lastObservedAt: string | null
  /** When the RAW source may no longer be kept. The item outlives it. Null means
   *  the source was never retained in the first place, which is the strongest
   *  state rather than a missing value. */
  sourceExpiry: string | null
  /**
   * WHAT THIS COST THEM, when they said so. Null is the ordinary case.
   *
   * ⚠️ MEASURED, AND THE REASON THIS FIELD EXISTS. Of 69 `stated` `experience`
   * rows live in production, exactly ONE carries any cost, loss or mistake
   * marker. That is not a fact about creators; it is a fact about the prompt,
   * which defined `experience` as "something they personally did" and was
   * faithfully obeyed — "Has googled himself.", "Currently works at Microsoft."
   * Nothing anywhere asked what a thing had taken from them, so nothing
   * recorded it, and the story step's "what did you learn the expensive way"
   * had no stored answer to offer back.
   *
   * ⚖️ A FIELD RATHER THAN A NEW `kind`. A costly lesson is still an
   * experience, and it must keep reaching every reader that already asks for
   * one — `KIND_RANK` puts `experience` top, and both `creatorState` and
   * `knowledgeResolver` gate personal beats on `kind === 'experience' &&
   * basis === 'stated'`. Re-filing the richest items under a new kind would
   * have quietly removed them from all three. This adds the missing half of
   * the sentence and moves nothing.
   */
  cost: string | null
  /**
   * THE BELIEF THEY NAMED AND ARGUED AGAINST, when they named one. Null is the
   * ordinary case.
   *
   * ⚠️ ALSO MEASURED: of 129 `stated` `opinion` rows, ZERO name a consensus and
   * contradict it. `opinion` was defined as "a position they hold, theirs and
   * contestable", which produces the assertion and drops the argument —
   * "Believes Pakistani chai is better than coffee". The half this stores is
   * the half that makes a stance worth putting on camera.
   *
   * ⚖️ AND IT IS NOT A LOOSER `text`. A comparison is not a consensus. "True
   * success is inner peace rather than accumulating wealth" ranks two things
   * the creator likes differently and names nobody who believes otherwise;
   * reading that as a fighting position is precisely the mis-slotting that
   * `storySuggestions` refuses to do from free text.
   */
  consensus: string | null
}

/** What an audience keeps asking, as a summary and a count. Never a comment,
 *  never an author. "Many people are confused about battery health" is the
 *  whole shape — anything more specific is someone else's words. */
export interface AudienceQuestion {
  summary: string
  asked: number
}

export interface CreatorKnowledge {
  items: KnowledgeItem[]
  audience: AudienceQuestion[]
}

export function emptyKnowledge(): CreatorKnowledge {
  return { items: [], audience: [] }
}

const MAX_TEXT = 240

function line(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t === '' ? null : t.slice(0, MAX_TEXT)
}

/** Confidence in [0,1]. ⚖️ An unreadable or absent value is 0.5, never 1: a
 *  missing confidence means nobody said how sure they were, and reading that as
 *  certainty is the same error as defaulting `basis` to `stated`. */
function unit(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

function count(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** Read one item defensively. Returns null rather than a half-item: a claim
 *  with no text and a basis of "stated" is worse than nothing, because it reads
 *  as verified. */
export function readKnowledgeItem(raw: unknown): KnowledgeItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = raw as Record<string, unknown>
  const text = line(src.text)
  if (!text) return null
  const kind = KNOWLEDGE_KINDS.find((k) => k === src.kind)
  if (!kind) return null
  // ⚖️ AN UNSTATED BASIS IS `inferred`, NEVER `stated`. Silence about where
  // something came from must degrade to the weakest reading, or the default
  // quietly promotes every guess into a fact — the exact move that produced
  // "voice-accurate, content-empty".
  const basis = KNOWLEDGE_BASIS.find((b) => b === src.basis) ?? 'inferred'
  return {
    kind,
    text,
    basis,
    confidence: unit(src.confidence),
    timesSeen: count(src.timesSeen ?? src.times_seen),
    sourceRef: line(src.sourceRef ?? src.source_ref),
    sourceUrl: line(src.sourceUrl ?? src.source_url),
    lastObservedAt: line(src.lastObservedAt ?? src.last_observed_at),
    sourceExpiry: line(src.sourceExpiry ?? src.source_expiry),
    // ⚖️ ABSENT READS AS NULL, NEVER AS THE EMPTY STRING. "Recorded as costing
    // nothing" and "nobody asked what it cost" are different states, and only
    // null can say the second one. `line` already collapses "" to null.
    cost: line(src.cost),
    consensus: line(src.consensus),
  }
}

export function readKnowledge(raw: unknown): CreatorKnowledge {
  const out = emptyKnowledge()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.items)) {
    out.items = src.items.map(readKnowledgeItem).filter((i): i is KnowledgeItem => i !== null)
  }
  if (Array.isArray(src.audience)) {
    out.audience = src.audience
      .map((a) => {
        const summary = line((a as Record<string, unknown> | null)?.summary)
        return summary ? { summary, asked: count((a as Record<string, unknown>).asked) } : null
      })
      .filter((a): a is AudienceQuestion => a !== null)
  }
  return out
}

/**
 * The items a script may SPEAK as this creator's own position.
 *
 * ⚖️ `inferred` is excluded, and that exclusion is the point of the module. An
 * inferred belief is our guess about someone, and putting it in their mouth is
 * indistinguishable — to them, to their audience — from them having said it.
 * Inferred items may still STEER a script; they may not be voiced by it.
 */
export function writableClaims(k: CreatorKnowledge): KnowledgeItem[] {
  return k.items.filter((i) => i.basis !== 'inferred' && i.kind !== 'covered')
}

/**
 * HOW CURRENT IS THIS, in words a prompt can use.
 *
 * ⚠️ `lastObservedAt` was stored by the extractor and READ BY NOTHING. In a niche
 * that moves — phones, AI tools, platform payouts — a position from three years
 * ago and one from last month are different facts about a person, and handing
 * both to the writer flat is how a script confidently names last generation's
 * thing. Recency is not a tiebreak here; it is part of whether a specific is
 * safe to say out loud.
 *
 * ⚖️ Unknown is its own answer and never "old". An item with no date was seen at
 * a time nobody recorded, and guessing it stale would quietly bury real
 * substance — the same reason an absent `basis` reads as `inferred` rather than
 * as false.
 */
export type Freshness = 'recent' | 'established' | 'ageing' | 'undated'

export function freshness(item: KnowledgeItem, now: Date): Freshness {
  if (!item.lastObservedAt) return 'undated'
  const t = Date.parse(item.lastObservedAt)
  if (Number.isNaN(t)) return 'undated'
  const months = (now.getTime() - t) / (1000 * 60 * 60 * 24 * 30.44)
  if (months <= 6) return 'recent'
  if (months <= 18) return 'established'
  return 'ageing'
}

/**
 * The lessons that carry a price, and the stances that name their opposition.
 *
 * ⚖️ NAMED READERS, AND THE REASON THE TWO FIELDS ARE ALLOWED TO EXIST. This
 * repo does not ship a column with nothing reading it. `storySuggestions` uses
 * both to prefill the two story slots that were previously unfillable, and
 * `knowledgePromptLine` below renders both into the writer's briefing so the
 * missing half reaches the script and not just the form.
 *
 * ⚖️ `writableClaims` FIRST, SO `inferred` NEVER QUALIFIES. A cost we guessed at
 * is a debt we invented for somebody.
 */
export function costlyLessons(k: CreatorKnowledge): KnowledgeItem[] {
  return writableClaims(k).filter((i) => i.cost !== null)
}

export function contrarianStances(k: CreatorKnowledge): KnowledgeItem[] {
  return writableClaims(k).filter((i) => i.consensus !== null)
}

/** What they have already made a video about. The writer needs this to avoid
 *  handing a creator their own last upload back. */
export function alreadyCovered(k: CreatorKnowledge): KnowledgeItem[] {
  return k.items.filter((i) => i.kind === 'covered')
}

/**
 * The subset worth sending for THIS video.
 *
 * ⚖️ NEVER DUMP THE WHOLE STORE. Knowledge accumulates across every scan, so an
 * established creator will hold far more than a prompt can carry, and pasting
 * all of it does not make the script better — it buries the three items that
 * matter under forty that do not, and spends the budget that the reference read
 * and the creator's DNA need. A prompt is a briefing, not an archive.
 *
 * Relevance is lexical overlap with what this video is ABOUT (the reference and
 * the creator's note), tie-broken by how established the item is. Deliberately
 * simple and deliberately explainable: a creator asking "why did it say that"
 * gets an answer, which an embedding score would not give them.
 *
 * ⚖️ ALWAYS RETURNS SOMETHING when knowledge exists. A video whose topic matches
 * nothing stored still belongs to a person with positions, and falling back to
 * their best-established items is better than sending none — the failure this
 * whole module exists to end is a script with no substance at all.
 */
export function selectRelevantKnowledge(
  k: CreatorKnowledge,
  about: string | null | undefined,
  limit = 10,
): KnowledgeItem[] {
  const pool = rankedKnowledge(k)
  if (pool.length === 0) return []
  const terms = new Set(
    String(about ?? '').toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)))
  if (terms.size === 0) return pool.slice(0, limit)
  const scored = pool.map((item) => {
    const words = item.text.toLowerCase().split(/[^a-z0-9]+/)
    const overlap = words.filter((w) => terms.has(w)).length
    return { item, overlap }
  })
  const hits = scored.filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map((s) => s.item)
  // Top up from the best-established items so a niche topic never starves.
  const out = [...hits]
  for (const item of pool) {
    if (out.length >= limit) break
    if (!out.includes(item)) out.push(item)
  }
  return out.slice(0, limit)
}

/** Words too common to signal relevance. Short list on purpose — a long one
 *  starts making editorial decisions nobody reviewed. */
const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'they', 'them', 'their', 'what', 'when',
  'have', 'here', 'your', 'about', 'video', 'thing', 'things', 'stopped',
  'after', 'turned', 'more', 'than', 'into', 'been', 'were', 'will',
])

/** Ranked by how established a position is — repeated first, then directly
 *  stated over merely demonstrated. What someone is KNOWN for should reach a
 *  bounded prompt before a one-off remark does. */
/** ⚠️ TIMES-SEEN FIRST RANKED THE WEAKEST MATERIAL HIGHEST, and it took reading
 *  real scripts to see it. Topics recur across every caption a creator posts, so
 *  they accumulate `timesSeen` — "mobile phone tricks and tips" was stored with
 *  12 — while a thing the creator DID is said once and carries 1. Sorting by
 *  frequency before kind therefore put subject headings above lived experience,
 *  which is the opposite of what the writer needs.
 *
 *  ⚖️ MEASURED, NOT ASSUMED. Across 32 generated scripts, only 50% of supplied
 *  items were cited at all, and the split by kind was damning:
 *
 *      framework  88% used      experience  37% used
 *      opinion    68% used      topic        (dropped once speech existed)
 *
 *  Experiences were the LEAST used and the most valuable — every line creator
 *  panels praised was one. "I sold a black Birkin bag for £13,500 in roughly 40
 *  seconds by posting a single Instagram story" is a video; "growing a
 *  founder-led business" is a folder name.
 *
 *  So kind leads the sort now. `timesSeen` still breaks ties WITHIN a kind,
 *  where it means what it was always meant to mean: a belief the creator keeps
 *  returning to is more durable than one they mentioned once. */
const KIND_RANK: Record<string, number> = {
  experience: 6, example: 5, framework: 4, opinion: 3, claim: 2, fact: 2,
  // ⚠️ `product` SAT DOWN HERE ON AN ASSUMPTION, AND PRODUCTION DISPROVED IT.
  // The comment this replaces said `product`/`topic` "name a thing without
  // saying anything about it". That is true of `topic` and false of `product`.
  // Across the 552 rows live at the time of writing, `product` is sharply
  // BIMODAL — 26 rows of three words or fewer ("Codex", "Siri App"), 36 rows
  // over ten words that are complete propositions ("Early is an iOS alarm clock
  // app that requires users to do push-ups to turn it off, priced at $29.99 a
  // year"), and just 2 rows anywhere in between. `topic` has no such gap: it is
  // a smooth hump from 4 to 10 words, heading-shaped the whole way through.
  //
  // So a propositional product row asserts a fact ABOUT a thing and belongs
  // with `claim`/`fact`. It is not an experience — the creator need not have
  // lived it — and it is not a heading. Ranking it as one buried 36 rows of the
  // most concrete, most checkable substance in the table beneath subject
  // folders, which is the exact "voice-accurate, content-empty" defect.
  product: 2, topic: 0,
}

/** A name with nothing said about it: "Codex", "Siri App", "Samsung Z Fold 8".
 *
 *  ⚖️ THIS IS A PROPERTY OF THE TEXT, NOT OF THE KIND — which is the whole
 *  point. The old ranking asked "what kind is this?" and got headings and
 *  propositions filed under one label. Asking "does this text predicate
 *  anything?" is decidable from the row itself, so it cannot be wrong about a
 *  kind the extractor happens to choose differently next month. Same reason
 *  `isProgressCheck` is a contract check rather than a line in the prompt: where
 *  the defect is decidable, decide it.
 *
 *  ⚠️ WORD COUNT, NOT A VERB LIST. The first attempt matched a hand-written list
 *  of verbs and scored `framework` at 3 propositions out of 14 despite an
 *  average of 18.8 words — the list simply missed past tenses and modals. A rule
 *  that misgrades the best material is worse than no rule. Length is a cruder
 *  signal but an honest one, and the measured bimodality means it lands in a gap
 *  rather than on a judgement call.
 *
 *  ⚖️ AND THE BLAST RADIUS WAS CHECKED BEFORE THE RULE WAS WRITTEN. In
 *  production, `experience`, `framework`, `example` and `fact` have ZERO rows at
 *  or under three words. This can only ever demote products, topics, and a
 *  handful of stub claims — it cannot reach the material panels praised. */
export function isBareLabel(text: string): boolean {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length <= 3
}

export function rankedKnowledge(k: CreatorKnowledge): KnowledgeItem[] {
  const weight = (i: KnowledgeItem) => (i.basis === 'stated' ? 2 : i.basis === 'demonstrated' ? 1 : 0)
  const kind = (i: KnowledgeItem) => KIND_RANK[i.kind] ?? 0
  // ⚖️ BARE LABELS SORT LAST, AHEAD OF BASIS, AND THAT ORDER IS DELIBERATE.
  // `basis` grades how well attested a PROPOSITION is. A text that predicates
  // nothing is not a weakly-attested claim; it is not a claim at all, so there
  // is nothing for `basis` to grade — the same reason this file treats
  // `inferred` as a different kind of thing rather than a fainter `stated`.
  // Without this leading key a bare product name read off speech would still
  // outrank a full proposition read off a caption, because basis would decide
  // it first and the demotion below would never be consulted.
  const bare = (i: KnowledgeItem) => (isBareLabel(i.text) ? 1 : 0)
  // ⚠️ BASIS STILL LEADS THE PROPOSITIONS, AND A FAILING TEST IS WHY. A first
  // version put kind first and promoted a DEMONSTRATED experience ("has reviewed
  // several foldables", read off captions) above a STATED opinion the creator
  // said out loud. Kind orders material of equal evidential strength; it can
  // never outrank the evidence itself, or a caption inference starts outranking
  // speech.
  return [...writableClaims(k)]
    .sort((a, b) =>
      bare(a) - bare(b)
      || weight(b) - weight(a)
      || kind(b) - kind(a)
      || b.timesSeen - a.timesSeen)
}

/** Is a raw source past the date we said we would stop holding it? Callers do
 *  the deleting; this module only makes the question answerable. */
export function sourceExpired(item: KnowledgeItem, now: Date): boolean {
  if (!item.sourceExpiry) return true // never retained — nothing to expire
  const t = Date.parse(item.sourceExpiry)
  return Number.isNaN(t) ? false : t <= now.getTime()
}

/**
 * Knowledge as prompt text.
 *
 * ⚖️ EMPTY IS A LEGAL ANSWER AND RETURNS THE EMPTY STRING. It must NOT emit
 * "none stored, infer some" — that instruction is how the generator currently
 * manufactures opinions, and re-creating it here would rebuild the defect this
 * file exists to remove. A creator we know nothing about gets a script with no
 * borrowed substance, which is honest, rather than one with invented substance,
 * which is not.
 */
export function knowledgePromptLine(
  k: CreatorKnowledge,
  limit = 12,
  about?: string | null,
  now: Date = new Date(),
): string {
  const claims = about === undefined
    ? rankedKnowledge(k).slice(0, limit)
    : selectRelevantKnowledge(k, about, limit)
  const covered = alreadyCovered(k)
  if (claims.length === 0 && covered.length === 0) return ''
  const parts: string[] = []
  if (claims.length) {
    parts.push(
      '\nWHAT THIS CREATOR ACTUALLY KNOWS AND HAS SAID — real substance, not style.'
      + ' Build the video out of THIS. These are their own positions and examples,'
      + ' so you may put them in their mouth; anything you add that is not here is'
      + ' yours, and they did not say it.'
      + ' NAME THE SPECIFIC THING. Their audience already knows the general shape of'
      + ' their opinion; what earns the watch is the actual model, tool, number or'
      + ' case below. "3 phone features I stopped paying extra for" is a title, not a'
      + ' script — say WHICH features and on WHAT. Never soften a named thing into a'
      + ' category to sound tidier.'
      + ' The tag after each item is how recently they were heard saying it:'
      + ' [recent] is safe to state flatly, [ageing] should be framed as something'
      + ' they have said rather than something that is true today, and [undated]'
      + ' means nobody recorded when — treat it as ageing.\n'
      // ⚖️ THE COST AND THE CONSENSUS ARE RENDERED WITH THE ITEM, NOT AS A
      // SEPARATE LIST. They are halves of one sentence: a lesson away from its
      // price reads as biography, and a stance away from what it argues with
      // reads as an assertion. Splitting them here would hand the writer back
      // the same two fragments this whole change exists to rejoin.
      + claims.map((c) => {
        const cost = c.cost ? ` — cost them: ${c.cost}` : ''
        const against = c.consensus ? ` — argued against: ${c.consensus}` : ''
        return `  * (${c.kind}) [${freshness(c, now)}] ${c.text}${cost}${against}`
      }).join('\n'))
  }
  if (covered.length) {
    parts.push(
      '\nALREADY COVERED — they have made a video about each of these. Do NOT hand'
      + ' them their own upload back; go at the topic from an angle they have not used.'
      + ' THIS LIST IS NEVER SPOKEN. It steers what you choose, and it must not appear'
      + ' in any line: a script that says "we\'ve had a video on this" is narrating our'
      + ' notes to the audience, and it asserts something about their back catalogue'
      + ' that nobody checked the phrasing of. Use it to pick a DIFFERENT angle, then'
      + ' write as though the earlier video were simply not the subject.\n'
      + covered.map((c) => `  * ${c.text}`).join('\n'))
  }
  if (k.audience.length) {
    parts.push(
      '\nWHAT THEIR AUDIENCE KEEPS ASKING — summarised, never quoted. A video that'
      + ' answers one of these is wanted before it is made. THIS LIST IS NEVER SPOKEN'
      + ' EITHER. Answer the question; do not announce that it was asked. A line like'
      + ' "one my audience asks about a lot" narrates our notes to the room and'
      + ' asserts something about their comment section that nobody verified.\n'
      + k.audience.map((a) => `  * ${a.summary} (asked ~${a.asked}x)`).join('\n'))
  }
  return parts.join('\n')
}
