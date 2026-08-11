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
