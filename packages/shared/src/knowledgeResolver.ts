// RESOLVE THE SUBSTANCE BEFORE WRITING THE PROSE.
//
// ── THE RUN THIS EXISTS FOR ───────────────────────────────────────────────
//
// A phone reviewer, given a working structure, got back this:
//
//   "I bought the new [Phone Model], and while everyone's talking about the
//    camera and screen, there's something inside..."
//   "This [Specific Component/Design] is actually key to [Benefit]"
//   "Now compare that to [Previous Model/Competitor Phone]"
//
// Every structural check passed. The hook shape worked, the pacing worked, the
// comparison beat was in the right place, no claim was faked and nothing was
// sold. And the script is worthless, because the creator cannot film it.
//
// ⚖️ THE DEFECT IS ORDER, NOT PROMPTING. Writing happened before anyone asked
// where the facts in each slot were going to come from. A container that says
// "compare with a competitor" needs a resolved competitor BEFORE prose is
// written about it — otherwise the writer does the only thing left and describes
// the shape of the sentence it would write if it knew something.
//
// So this runs between Creator Knowledge and the writer, and answers, per
// container: what belongs here, where does it come from, how strong is that
// evidence, and if nothing resolves it — what do we do instead of guessing.
//
// ── THE EVIDENCE LADDER ───────────────────────────────────────────────────
//
// Not every sentence about a creator is equally safe to say in their voice, and
// treating one text like another is how a title becomes a quote.
//
//   coverage    They made a video about it. From titles and captions. Safe to
//               say they COVERED it; says nothing about what they concluded.
//   opinion     They said it. From speech. A position that may be voiced.
//   experience  They did it. First-person: bought it, used it for six months,
//               switched away from it, regretted it. The strongest, and the only
//               level that licenses "I" plus a personal history.
//
// A container needing personal experience cannot be filled from coverage, and a
// resolver that pretends otherwise produces the most expensive error this system
// can make: a first-person claim the creator never made.

import type { CreatorKnowledge, KnowledgeItem } from './creatorKnowledge'

export const EVIDENCE_LEVELS = ['coverage', 'opinion', 'experience'] as const
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number]

/**
 * Which rung an item sits on.
 *
 * ⚖️ DERIVED FROM `kind` AND `basis` TOGETHER, never from either alone. An
 * `opinion` marked `demonstrated` came from a title — the creator demonstrably
 * made the video, and nobody heard them state the position — so it is COVERAGE,
 * not opinion. Reading the kind alone would promote every headline into a stance.
 */
export function evidenceLevel(item: KnowledgeItem): EvidenceLevel {
  if (item.kind === 'experience' && item.basis === 'stated') return 'experience'
  if (item.basis === 'stated') return 'opinion'
  // `demonstrated` and `inferred` both land here: the video exists, the position
  // was never heard. `covered` and `product` are coverage by construction.
  return 'coverage'
}

/** What a container needs before prose about it can be written. */
export const SUBSTANCE_NEEDS = ['none', 'coverage', 'opinion', 'experience'] as const
export type SubstanceNeed = (typeof SUBSTANCE_NEEDS)[number]

/** How a container ended up. */
export const RESOLUTION_SOURCES = [
  'creator_knowledge', 'product_dna', 'research', 'needs_user', 'unresolved',
] as const
export type ResolutionSource = (typeof RESOLUTION_SOURCES)[number]

export interface Container {
  /** The beat this is, in the reference's own terms: "overlooked feature". */
  id: string
  /** What it is FOR — used to match knowledge to it. */
  about: string
  /** The weakest evidence that can honestly fill it. A comparison beat needs
   *  `coverage` (which competitor); "I used it for six months" needs
   *  `experience`, and nothing weaker will do. */
  needs: SubstanceNeed
}

export interface Resolution {
  container: Container
  source: ResolutionSource
  /** What fills it. Empty when nothing did. */
  evidence: KnowledgeItem[]
  /** ⚖️ WHAT TO DO INSTEAD OF GUESSING, when nothing resolved it. A container
   *  the writer cannot fill must NOT become a bracket handed to a creator. */
  fallback: Fallback | null
}

/**
 * The three honest answers to an unresolvable container — and there is no fourth.
 *
 * ⚖️ "Write it anyway with a placeholder" is deliberately not one of them. That
 * is the current behaviour and it is what produces a bracketed corpse presented
 * as a finished script.
 */
export type Fallback =
  /** External facts could fill this — it does not depend on the creator. */
  | { kind: 'research'; query: string }
  /** Rewrite the beat so it needs no creator-specific fact. Strictly weaker, and
   *  honest: "one thing most people miss about foldables" instead of "when I
   *  bought mine". */
  | { kind: 'generalise'; framing: string }
  /** Only the creator can answer, so ask ONE question rather than invent. */
  | { kind: 'ask'; question: string }

const STOP = new Set(['this', 'that', 'with', 'from', 'they', 'them', 'what', 'when',
  'have', 'about', 'video', 'thing', 'things', 'your', 'their', 'more', 'than'])

function terms(s: string): Set<string> {
  return new Set(String(s).toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w)))
}

/** Rank of a level, for "is this strong enough". */
const RANK: Record<EvidenceLevel, number> = { coverage: 0, opinion: 1, experience: 2 }
const NEED_RANK: Record<Exclude<SubstanceNeed, 'none'>, number> = { coverage: 0, opinion: 1, experience: 2 }

/**
 * Resolve one container against what the creator actually knows.
 *
 * ⚖️ EVIDENCE MUST BE STRONG ENOUGH, NOT MERELY RELEVANT. A container needing
 * `experience` is not filled by three coverage items about the same product —
 * that is precisely how "I bought it and after six months…" gets written about a
 * phone the creator only ever listed in a title.
 */
export function resolveContainer(
  container: Container,
  knowledge: CreatorKnowledge,
  opts: { productKnown?: boolean; researchable?: boolean } = {},
): Resolution {
  if (container.needs === 'none') {
    return { container, source: 'creator_knowledge', evidence: [], fallback: null }
  }
  const want = NEED_RANK[container.needs]
  const wanted = terms(container.about)
  const matches = knowledge.items
    .filter((i) => i.basis !== 'inferred')
    .filter((i) => RANK[evidenceLevel(i)] >= want)
    .map((i) => ({ i, hit: [...terms(i.text)].filter((w) => wanted.has(w)).length }))
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit || b.i.timesSeen - a.i.timesSeen)
    .map((x) => x.i)

  if (matches.length > 0) {
    return { container, source: 'creator_knowledge', evidence: matches.slice(0, 3), fallback: null }
  }
  if (opts.productKnown && /product|feature|price|spec/i.test(container.about)) {
    return { container, source: 'product_dna', evidence: [], fallback: null }
  }
  // ⚖️ ORDER OF LAST RESORTS. Research first where the fact is not personal —
  // an external fact costs a lookup and nothing else. Then generalise, which is
  // free and honest but weaker. Asking is last because it costs the creator
  // their attention, and it is reserved for what only they can answer.
  if (container.needs !== 'experience' && opts.researchable) {
    return { container, source: 'research', evidence: [], fallback: { kind: 'research', query: container.about } }
  }
  if (container.needs !== 'experience') {
    return {
      container, source: 'unresolved', evidence: [],
      fallback: { kind: 'generalise', framing: `Write this beat WITHOUT a creator-specific fact: speak about ${container.about} in general terms rather than as something they personally did or own.` },
    }
  }
  return {
    container, source: 'needs_user', evidence: [],
    fallback: { kind: 'ask', question: `To write this beat honestly we need one thing only you know: ${container.about}. What is your own experience here?` },
  }
}

export function resolveAll(
  containers: readonly Container[],
  knowledge: CreatorKnowledge,
  opts: { productKnown?: boolean; researchable?: boolean } = {},
): Resolution[] {
  return containers.map((c) => resolveContainer(c, knowledge, opts))
}

/**
 * The numbers worth tracking — "fewer placeholders" was the wrong target.
 *
 * A placeholder count says how often the failure was VISIBLE. These say how much
 * of the video is actually backed by something, and by what.
 */
export interface ResolutionStats {
  total: number
  resolved: number
  fromCreator: number
  fromProduct: number
  fromResearch: number
  needsUser: number
  unresolved: number
  /** The share a creator could film today without answering anything. */
  resolvedShare: number
}

export function resolutionStats(rs: readonly Resolution[]): ResolutionStats {
  const n = (s: ResolutionSource) => rs.filter((r) => r.source === s).length
  const fromCreator = n('creator_knowledge')
  const fromProduct = n('product_dna')
  const fromResearch = n('research')
  const resolved = fromCreator + fromProduct
  return {
    total: rs.length,
    resolved,
    fromCreator,
    fromProduct,
    fromResearch,
    needsUser: n('needs_user'),
    unresolved: n('unresolved'),
    resolvedShare: rs.length === 0 ? 0 : resolved / rs.length,
  }
}

/**
 * The resolutions as prompt text, so the writer receives DECISIONS rather than
 * re-deriving them — the same argument the compatibility gate makes.
 *
 * ⚖️ AN UNRESOLVED CONTAINER IS NAMED, WITH ITS FALLBACK, so the writer cannot
 * quietly bracket it. That is the whole point: the bracket is what happens when
 * nobody decided what to do about not knowing.
 */
export function resolutionPromptLine(rs: readonly Resolution[]): string {
  if (rs.length === 0) return ''
  const lines = rs.map((r) => {
    if (r.evidence.length > 0) {
      return `  * ${r.container.id}: use ${r.evidence.map((e) => `"${e.text}"`).join('; ')}`
    }
    if (r.source === 'product_dna') return `  * ${r.container.id}: fill from the product details above.`
    if (r.fallback?.kind === 'research') return `  * ${r.container.id}: state only what is generally known; do not attribute it to this creator.`
    if (r.fallback?.kind === 'generalise') return `  * ${r.container.id}: ${r.fallback.framing}`
    if (r.fallback?.kind === 'ask') return `  * ${r.container.id}: DO NOT WRITE THIS BEAT as personal experience. Nothing on record says they did this.`
    return `  * ${r.container.id}: unresolved.`
  })
  return '\n- WHERE EACH BEAT\'S SUBSTANCE COMES FROM, decided before you write. A beat'
    + ' whose source is named must use THAT and not something you prefer; a beat with'
    + ' no source must take the instruction given rather than a bracket. NEVER write a'
    + ' placeholder like [Phone Model] or "the new XYZ" — if you are reaching for one,'
    + ' the instruction for that beat tells you what to do instead.\n'
    + lines.join('\n')
}

// ── THE DECLARATION, AND WHY IT IS CHECKED ────────────────────────────────
//
// Resolving BEFORE writing is the right order and it costs a second model call:
// the containers come from the reference read, which happens in the same request
// as the writing. So the affordable version inverts it — the writer DECLARES,
// per beat, where that beat's substance came from, and the declaration is then
// verified against what it was actually given.
//
// ⚖️ A DECLARATION NOBODY CHECKS IS A COMMENT. The whole value is that
// `substance: creator_knowledge` is falsifiable: if the beat cites something the
// prompt never contained, the model did not use creator knowledge, it wrote a
// plausible sentence and labelled it. That is the same failure as a guess
// wearing a `stated` basis, one layer up, and it is decidable — so it is decided
// here rather than trusted.

export interface DeclaredBeat {
  section?: unknown
  line?: unknown
  /** What the writer says filled this beat. */
  substance?: unknown
  /** What it says it used — matched against the knowledge actually supplied. */
  substance_evidence?: unknown
}

export type SubstanceIssueCode =
  /** Claimed creator knowledge that was never in the prompt. */
  | 'unsupported_creator_claim'
  /** Claimed a source but named nothing to check. */
  | 'undeclared_evidence'
  /** A first-person personal history with no experience-level evidence. */
  | 'unearned_first_person'
  /** Claimed `product_dna` when the prompt carried no product facts AT ALL.
   *  Not "the citation is weak" — the declared source does not exist. */
  | 'impossible_product_claim'
  /** Claimed `product_dna` citing something the supplied facts do not contain. */
  | 'unsupported_product_claim'
  /** Declared no source, or one that is not among the five. Unaccounted for,
   *  not necessarily wrong — see the note at the check. */
  | 'undeclared_substance'

/** The five sources a beat may declare. Anything else is unaccounted for. */
export const SUBSTANCE_SOURCES: ReadonlySet<string> =
  new Set(['creator_knowledge', 'product_dna', 'general', 'needs_user', 'none'])

export interface SubstanceIssue {
  code: SubstanceIssueCode
  beat: number
  detail: string
}

/** First-person personal history — "I bought", "I used it for", "I switched".
 *  ⚖️ Narrow on purpose: "I think" and "I'd say" are opinion, not history, and
 *  condemning them would fail every honest talking-head script. */
const FIRST_PERSON_HISTORY =
  /\bI(?:'ve| have)?\s+(?:bought|owned|used|switched|returned|tested|kept|ran)\b|\bmy own\b|\bwhen I (?:got|bought|switched)\b/i

/** ⚠️ THE PROMPT SHOWS EACH ITEM AS `* (product) cardboard PC`, so the writer
 *  cites it back WITH THE KIND PREFIX. Left in, the literal word "product" or
 *  "topic" joins the term set and pushes a two-word citation to a two-term
 *  match it can never make: `(product) cardboard PC` shares only "cardboard"
 *  with the item it correctly came from, and was reported as a fabrication.
 *
 *  MEASURED: 18 of 18 flagged claims across a 60-run matrix were this, and
 *  every one of them cited real supplied knowledge. A check that cries wolf
 *  teaches people to ignore it, which is worse than not having it. */
const KIND_PREFIX = /^\s*\((?:fact|opinion|topic|example|experience|framework|claim|product|covered)\)\s*/i

/** Loose containment: the beat need not quote verbatim, only overlap enough that
 *  the claim traces back to something real. */
/** ⚖️ A BEAT MAY REST ON MORE THAN ONE ITEM, and the writer cites them the way
 *  a person would: "ChatGPT, AI ads for dropshipping". Measured against the
 *  whole citation those are two items' worth of terms, and no SINGLE stored
 *  item can match enough of them — three correctly-sourced beats were reported
 *  as fabrications for exactly this.
 *
 *  So each comma-separated part is traced independently and ANY part
 *  supporting the beat is enough. That is the question this check actually
 *  asks — "does this beat rest on something real" — and not "is every phrase
 *  in the citation perfect". Citing one real item and one invented one is a
 *  weaker failure than inventing the whole beat, and is not what this exists
 *  to catch. */
function tracesToText(cited: string, supplied: readonly string[]): boolean {
  const parts = cited.split(/[,;]/).map((x) => x.replace(KIND_PREFIX, '').trim()).filter(Boolean)
  return (parts.length ? parts : [cited]).some((part) => {
    const c = terms(part)
    if (c.size === 0) return false
    return supplied.some((text) => {
      const t = terms(text)
      return [...c].filter((w) => t.has(w)).length >= Math.min(2, c.size)
    })
  })
}

/** ⚖️ ONE TRACING RULE, TWO SOURCES. Product facts are strings and knowledge
 *  items are objects, and giving them separate matchers would let the same
 *  citation pass one check and fail the other for no reason a reader could
 *  defend. */
function tracesTo(cited: string, supplied: readonly KnowledgeItem[]): boolean {
  return tracesToText(cited, supplied.map((i) => i.text))
}

/**
 * Check what the writer CLAIMED against what it was GIVEN.
 *
 * Empty for an honest plan, which is the normal case. `supplied` must be exactly
 * the knowledge the prompt carried — checking against a fuller set would excuse
 * the fabrication this exists to catch.
 */
export function substanceIssues(
  beats: readonly DeclaredBeat[] | null | undefined,
  supplied: readonly KnowledgeItem[],
  /**
   * The PRODUCT FACTS the prompt carried, if it is known what they were.
   *
   * ⚠️ THE HOLE THIS CLOSES, MEASURED. This function checked citations for
   * `creator_knowledge` and accepted `product_dna` on the model's word. Across
   * 112 runs for 8 creators with NO product DNA supplied, 70 beats declared
   * `product_dna` anyway — 9.9% of every beat written — citing invented facts:
   *
   *     "The product provides a dedicated, clean, and effective charging spot."
   *
   * And it GREW by half (46 → 70) in the run that tightened the CTA and claim
   * rules. Tightening a checked path pushes the same pressure onto the
   * unchecked one, so an unchecked declared source is not a gap, it is a drain.
   *
   * ⚖️ THREE STATES, NOT TWO. `undefined` means the caller does not know what
   * the prompt carried and no product check runs — silence is not evidence.
   * `[]` means the caller KNOWS the prompt carried none, which makes every
   * `product_dna` declaration impossible rather than merely unsupported. A
   * caller that cannot tell these apart must pass `undefined`.
   */
  productFacts?: readonly string[] | null,
): SubstanceIssue[] {
  if (!Array.isArray(beats)) return []
  const out: SubstanceIssue[] = []
  beats.forEach((b, i) => {
    const source = typeof b.substance === 'string' ? b.substance : ''
    const cited = typeof b.substance_evidence === 'string' ? b.substance_evidence.trim() : ''
    const line = typeof b.line === 'string' ? b.line : ''

    // ⚠️ AN OMITTED DECLARATION IS THE CHEAPEST WAY OUT OF EVERY CHECK BELOW.
    // Both branches key on `source` matching a known value, so a beat with no
    // `substance` at all matches neither and is waved through without its
    // citation ever being read. It is a required field in the response schema
    // and it still happened: 1 beat in 705 across the last matrix —
    //
    //     "Or if you're into productivity, don't feel locked into the Surface
    //      Pro or Surface Laptop 7."   (ryan / OBS:R_TILBURY_RAT)
    //
    // — so "the schema requires it" is a statement about the request, not about
    // what comes back. 0 in the two other 112-case runs; the rate is low and
    // the bypass is total, which is exactly the shape that stays invisible.
    //
    // ⚖️ NAMED, NOT ESCALATED. This says the beat is UNACCOUNTED FOR, not that
    // it is wrong — the line above is innocuous, and rewriting it into a
    // question would charge an honest script for the writer's omission. The
    // expensive claims are still caught on the line itself: `FIRST_PERSON_HISTORY`
    // below and `entitlementFailures` both run regardless of what was declared.
    if (!SUBSTANCE_SOURCES.has(source)) {
      out.push({ code: 'undeclared_substance', beat: i,
        detail: source === ''
          ? 'Beat declares no substance at all, so neither citation check can run on it.'
          : `Beat declares substance "${source.slice(0, 40)}", which is not one of the five sources.` })
    }

    if (source === 'creator_knowledge') {
      if (cited === '') {
        out.push({ code: 'undeclared_evidence', beat: i,
          detail: 'Beat claims creator knowledge and names nothing it used.' })
      } else if (!tracesTo(cited, supplied)) {
        out.push({ code: 'unsupported_creator_claim', beat: i,
          detail: `Beat cites "${cited.slice(0, 80)}", which is not in the knowledge this prompt carried.` })
      }
    }

    // THE SAME QUESTION, ASKED OF THE OTHER DECLARED SOURCE.
    //
    // ⚖️ Only when the caller SAID what it carried. `undefined` skips this
    // entirely; it does not default to "nothing was supplied", because that
    // would turn every caller who has not been updated into a false alarm
    // factory — the exact behaviour that made the citation check untrustworthy.
    if (source === 'product_dna' && productFacts != null) {
      if (productFacts.length === 0) {
        out.push({ code: 'impossible_product_claim', beat: i,
          detail: 'Beat claims product facts, and the prompt carried none. There is no such source to have used.' })
      } else if (cited === '') {
        out.push({ code: 'undeclared_evidence', beat: i,
          detail: 'Beat claims product facts and names nothing it used.' })
      } else if (!tracesToText(cited, productFacts)) {
        out.push({ code: 'unsupported_product_claim', beat: i,
          detail: `Beat cites "${cited.slice(0, 80)}", which is not among the product facts this prompt carried.` })
      }
    }

    // ⚖️ THE MOST EXPENSIVE ERROR, CHECKED SEPARATELY. A personal history is a
    // claim about the creator's life, and no source other than experience-level
    // evidence can license it — not research, not a title, not a rephrasing.
    if (FIRST_PERSON_HISTORY.test(line)) {
      const licensed = supplied.some((k) => evidenceLevel(k) === 'experience'
        && (cited === '' ? true : tracesTo(cited, [k])))
      if (!licensed) {
        out.push({ code: 'unearned_first_person', beat: i,
          detail: 'Beat speaks a personal history, and nothing on record says the creator did it.' })
      }
    }
  })
  return out
}
