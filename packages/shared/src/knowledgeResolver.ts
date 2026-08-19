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
// ⚖️ Imports DOWN into a module with no imports of its own, which is what makes
// one shared rule possible without a cycle. See the note at `claimStrength.ts`.
import { claimStrength } from './claimStrength'
import type { ContainerTemplate, TemplateBeat } from './containerTemplates'
import type { ContentSlotKind } from './referenceContentProfile'
import type { FillableEntity } from './slotFill'

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
/**
 * The narrowest thing these rules actually read.
 *
 * ⚠️ THE FIVE HAND-INLINED COPIES IN `generate-blueprint` EXIST BECAUSE OF THIS
 * TYPE'S ABSENCE. The edge function holds `{ kind, text, basis }` — that is all
 * a prompt's knowledge block carries — and could not satisfy `KnowledgeItem`,
 * which additionally demands `confidence`. So the rules were copied by hand
 * instead of imported, five times, each held to this file by its own ad-hoc
 * parity test.
 *
 * ⚖️ AND NOTHING WAS LOST BY NARROWING, because nothing was being read. Checked
 * rather than assumed: across `evidenceLevel`, `groundingDepth`,
 * `substanceIssues` and `creatorDepth`, the only fields touched are `kind`,
 * `basis` and `text`. `confidence` is untouched — which is just as well, since
 * it is currently 1.0 on every row and nothing may rank on it.
 *
 * ⚠️ `KnowledgeItem` REMAINS ASSIGNABLE, so every existing caller is unaffected.
 * This widens what the rules ACCEPT without widening what they BELIEVE.
 */
export type SubstanceItem = Pick<KnowledgeItem, 'kind' | 'text' | 'basis'>

export function evidenceLevel(item: SubstanceItem): EvidenceLevel {
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
  /** What it is FOR — in the template's own words. Used to RANK candidates, and
   *  deliberately no longer to reject them; see `resolveContainer`. */
  about: string
  /** ⚠️ WHAT KIND OF MATERIAL CAN PERFORM THIS JOB. The template defines a
   *  narrative role; the creator's knowledge defines content. This is the
   *  bridge, and it is expressed in metadata both sides already carry rather
   *  than in words they would have to share. Absent means any kind that is
   *  strong enough will do. */
  accepts?: ReadonlySet<string>
  /** ⚠️ A BEAT THAT LICENSES "I" CANNOT BE FILLED BY SOMETHING MERELY OBSERVED.
   *  Strength alone does not capture this: an item can rank as `experience` and
   *  still be a thing we watched rather than a thing they told us. */
  requiresStated?: boolean
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
  opts: {
    productKnown?: boolean
    researchable?: boolean
    /** Item texts already spent on an earlier beat of the same template. */
    exclude?: ReadonlySet<string>
    /** How many items may fill this one beat. Defaults to 3; a template passes
     *  1 so material is spread across beats rather than pooled in the first. */
    maxEvidence?: number
  } = {},
): Resolution {
  if (container.needs === 'none') {
    return { container, source: 'creator_knowledge', evidence: [], fallback: null }
  }
  const want = NEED_RANK[container.needs]
  const wanted = terms(container.about)
  // ⚠️ LEXICAL OVERLAP RANKS; IT NO LONGER REJECTS. Measured over production —
  // 19 creators x 14 templates, 836 beats — the old filter discarded 661 items
  // that were strong enough to use. Fill was 12.6% and NOT ONE template of 266
  // came out fully resolved, so `slotsReady` was false everywhere and
  // `validateScript` could never run. Replacing it with the semantic test below
  // took fill to 64.2% and fully-resolved templates to 40.6%.
  //
  // ⚖️ BECAUSE IT WAS COMPARING THE WRONG TWO THINGS. `about` is a template's
  // generic structural prose — "the strongest item, saved for last" — and the
  // creator's knowledge is domain-specific. "The strongest item" is not supposed
  // to resemble "raise prices before increasing ad spend": one is a ROLE IN A
  // STRUCTURE, the other is content that could occupy that role. Absence of
  // shared nouns says almost nothing about fit; presence of them still says
  // something, which is the profile of a tiebreak rather than a gate.
  //
  // ⚖️ AND THE RELEVANCE TEST ALREADY HAPPENED UPSTREAM. Callers pass knowledge
  // already ranked against what the video is about, so this was a second,
  // near-random topic filter over an already-filtered set.
  const matches = knowledge.items
    .filter((i) => i.basis !== 'inferred')
    .filter((i) => RANK[evidenceLevel(i)] >= want)
    // The semantic requirement, which is what the lexical test was failing to do.
    .filter((i) => container.accepts === undefined || container.accepts.has(i.kind))
    .filter((i) => !container.requiresStated || i.basis === 'stated')
    // ⚠️ NOTHING IS SAID TWICE. Without this every beat in a template resolves to
    // the same strongest item and the script repeats one sentence in five
    // different costumes.
    .filter((i) => !opts.exclude?.has(i.text))
    .map((i) => ({ i, hit: [...terms(i.text)].filter((w) => wanted.has(w)).length }))
    .sort((a, b) => b.hit - a.hit || b.i.timesSeen - a.i.timesSeen)
    .map((x) => x.i)

  if (matches.length > 0) {
    // ⚖️ HOW MUCH MATERIAL ONE BEAT MAY SPEND. Three is right for a container
    // resolved on its own — more supporting evidence is strictly better. Inside
    // a template it is wrong: with ten ranked items and five hungry beats, the
    // first two beats eat the pool and the rest report a shortfall that the
    // creator's knowledge could have covered. Measured, that was the difference
    // between 45.2% and 64.2% fill. `resolveTemplate` passes 1.
    return { container, source: 'creator_knowledge', evidence: matches.slice(0, opts.maxEvidence ?? 3), fallback: null }
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

// ── A TEMPLATE'S HOLES, RESOLVED AGAINST A LIBRARY ────────────────────────
//
// ⚠️ THIS RESOLVER COULD SAY "product_dna" AND NOT WHICH PRODUCT. `productKnown`
// is a boolean and the match is a regex over the beat's description, which is
// enough to route a beat and not enough to fill it: "3 AI tools every founder
// needs" resolved three times to `product_dna` and left the writer to pick three
// tools — which it does by inventing them, or by naming the same one three times.
//
// ⚖️ SO THE ASSIGNMENT IS ONE ENTITY TO ONE SLOT, and it is the same arithmetic
// `slotFill` does for the gallery card. Two different answers to "can this
// product fill this hole" is how a card promises what a script cannot deliver,
// so the rules are deliberately identical — narrowest slot first, archived and
// NONE-relationship entities excluded.

/** ⚠️ IDENTICAL TO `slotFill`'s SET, ON PURPOSE. A reference recommending three
 *  apps cannot be filled by three candles. */
const TOOL_TYPES: ReadonlySet<string> = new Set(['SAAS', 'APP', 'MARKETPLACE', 'DIGITAL_PRODUCT'])

/** What a template beat needs, expressed as this module's evidence ladder.
 *
 *  ⚖️ `personal_experience` MAPS TO `experience` AND NOTHING WEAKER. That is the
 *  rung that licenses "I" plus a personal history, and filling it from coverage
 *  is the most expensive error this system can make. */
/**
 * WHICH KINDS OF MATERIAL CAN PERFORM EACH NARRATIVE JOB.
 *
 * ⚠️ THIS IS THE HALF `NEED_FOR_KIND` THROWS AWAY. That map answers "how strong
 * must the evidence be" and collapses six slot kinds into three ranks —
 * `product`, `current_fact` and `example` all become `coverage` and are then
 * indistinguishable. Strength was never the whole requirement: a beat asking for
 * a worked example and a beat asking for a live fact want different MATERIAL,
 * not differently-strong material.
 *
 * ⚖️ EXPRESSED IN METADATA BOTH SIDES ALREADY CARRY, so it costs no model call
 * and stays auditable. The template says what job a beat performs; the item's
 * `kind` says what it is; this decides which can do which. That is the
 * abstraction the lexical test was standing in for and failing at.
 */
const SLOT_ACCEPTS: Record<ContentSlotKind, ReadonlySet<string>> = {
  // ⚖️ ONLY A LIVED THING FILLS A LIVED BEAT, and `requiresStated` below adds
  // that it must be something they TOLD us, not something we watched.
  personal_experience: new Set(['experience']),
  claim: new Set(['claim', 'opinion', 'framework']),
  example: new Set(['example', 'experience', 'product']),
  current_fact: new Set(['fact', 'topic']),
  product: new Set(['product']),
  tool_or_software: new Set(['product']),
}

/** Beats that license first-person, where observation is not enough. */
const SLOT_REQUIRES_STATED: ReadonlySet<ContentSlotKind> = new Set(['personal_experience'])

const NEED_FOR_KIND: Record<ContentSlotKind, Exclude<SubstanceNeed, 'none'>> = {
  product: 'coverage',
  tool_or_software: 'coverage',
  personal_experience: 'experience',
  current_fact: 'coverage',
  claim: 'opinion',
  example: 'coverage',
}

/**
 * WHICH MECHANISM DECIDED THIS SLOT.
 *
 * ⚠️ NOT A RESTATEMENT OF `source`. `source` is the CATEGORY of material
 * (`product_dna`, `creator_knowledge`, …); this is the ROUTE by which the slot
 * arrived at it. A `product_dna` slot filled by assigning an entity the creator
 * owns and one filled from the evidence ladder are the same category and
 * different decisions, and an audit that cannot tell them apart cannot answer
 * "why does this beat say this".
 *
 * ⚖️ IT IS DERIVABLE TODAY — `entityId !== null` implies assignment — and it is
 * still stated. The same reason `fieldsObserved` is read off the visual profile
 * rather than recounted: a consumer that re-derives a decision is a second
 * implementation free to disagree with the first.
 */
export const RESOLVED_BY = ['entity_assignment', 'evidence_ladder', 'unresolved'] as const
export type ResolvedBy = (typeof RESOLVED_BY)[number]

export interface SlotProvenance {
  by: ResolvedBy
  /** ⚠️ THE CONCRETE THINGS, NOT A COUNT. An entity id, or the exact knowledge
   *  texts that carried the slot. A number here would be a claim nobody can
   *  check; these are what a person can go and look at. */
  from: readonly string[]
}

export interface TemplateResolution extends Resolution {
  /** The template beat this answers. */
  label: string
  /** The entity assigned to it, when the slot takes one and one was free. */
  entityId: string | null
  /** How this slot came to be decided — see `SlotProvenance`. */
  provenance: SlotProvenance
}

export interface ResolveTemplateOptions {
  /** The creator's live library — the same records the gallery card matched. */
  entities?: readonly FillableEntity[]
  researchable?: boolean
}

/**
 * Resolve every hole in a container template.
 *
 * ⚠️ NOTHING UNRESOLVED REACHES THE WRITER, and the cheapest moment to discover
 * a video cannot be made is before anybody is charged for it. Beats that take a
 * product are assigned an actual entity; the rest fall through to the evidence
 * ladder, which already knows what to do when nothing fills them.
 */
export function resolveTemplate(
  template: ContainerTemplate,
  knowledge: CreatorKnowledge,
  opts: ResolveTemplateOptions = {},
): TemplateResolution[] {
  const entities = opts.entities ?? []
  const needing = template.beats.filter(
    (b): b is TemplateBeat & { needs: ContentSlotKind } => b.needs !== null)

  // ⚖️ NARROWEST FIRST. A tool slot can only take a tool; a product slot takes
  // anything usable. Filling the permissive one first can spend the only SaaS on
  // it and report a shortfall while a complete assignment existed.
  const byNarrowness = [...needing].sort((a, b) =>
    (a.needs === 'tool_or_software' ? 0 : 1) - (b.needs === 'tool_or_software' ? 0 : 1))
  const taken = new Set<string>()
  const assigned = new Map<string, string>()
  for (const beat of byNarrowness) {
    if (beat.needs !== 'product' && beat.needs !== 'tool_or_software') continue
    const match = entities.find((e) =>
      !taken.has(e.id)
      && e.archivedAt === null && e.relationship !== 'NONE'
      && (beat.needs === 'product' || TOOL_TYPES.has(e.type)))
    if (match) { taken.add(match.id); assigned.set(beat.label, match.id) }
  }

  // ⚠️ NARROWEST NEED FIRST, AND FOR THE SAME REASON THE ENTITY PASS SORTS. An
  // experience beat can only be filled by experience-level material; a claim
  // beat will happily take it. Resolving in template order lets the permissive
  // beat spend the creator's only lived item and leaves the beat that REQUIRED
  // one unresolved, reporting a shortfall while a complete assignment existed.
  const byNeed = [...needing].sort((a, b) =>
    NEED_RANK[NEED_FOR_KIND[b.needs]] - NEED_RANK[NEED_FOR_KIND[a.needs]])
  // ⚠️ NOTHING IS SAID TWICE ACROSS A TEMPLATE. Resolved per beat in isolation,
  // every beat picks the same strongest item and the script says one thing five
  // times in different costumes.
  const spent = new Set<string>()
  const resolved = new Map<string, Resolution>()
  for (const beat of byNeed) {
    if (assigned.has(beat.label)) continue
    const r = resolveContainer({
      id: beat.label,
      about: beat.purpose,
      needs: NEED_FOR_KIND[beat.needs],
      accepts: SLOT_ACCEPTS[beat.needs],
      requiresStated: SLOT_REQUIRES_STATED.has(beat.needs),
    }, knowledge, {
      productKnown: false, researchable: opts.researchable, exclude: spent, maxEvidence: 1,
    })
    for (const e of r.evidence) spent.add(e.text)
    resolved.set(beat.label, r)
  }

  // ⚖️ EMITTED IN TEMPLATE ORDER, not resolution order. The order beats are
  // RESOLVED in is an allocation detail; the order they are WRITTEN in is what
  // keeps somebody watching, and a caller reading this list is reading a script.
  return needing.map((beat) => {
    const entityId = assigned.get(beat.label) ?? null
    const container: Container = {
      id: beat.label,
      about: beat.purpose,
      needs: NEED_FOR_KIND[beat.needs],
    }
    // ⚠️ AN ASSIGNED ENTITY IS A RESOLVED SLOT, FULL STOP. The creator holds it
    // and Twin knows which one it is, so there is nothing left to look up and
    // nothing to ask them.
    if (entityId !== null) {
      return {
        container, source: 'product_dna', evidence: [], fallback: null,
        label: beat.label, entityId,
        provenance: { by: 'entity_assignment', from: [entityId] },
      }
    }
    const r = resolved.get(beat.label)
      ?? resolveContainer(container, knowledge, { productKnown: false, researchable: opts.researchable })
    // ⚖️ `unresolved` IS THE HONEST WORD FOR A SLOT NOTHING FILLED, and it is
    // kept distinct from a slot the ladder filled weakly. `fallback` already
    // says what to do instead; this says that nothing was found.
    const by: ResolvedBy = r.evidence.length > 0 ? 'evidence_ladder' : 'unresolved'
    return {
      ...r, label: beat.label, entityId: null,
      provenance: { by, from: r.evidence.map((e) => e.text) },
    }
  })
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

/** First-person personal history — ONE detector, the measured one.
 *
 * ⚠️ THIS WAS A SECOND COPY, AND IT WAS TEN TIMES BLINDER. It read:
 *
 *     /\bI(?:'ve| have)?\s+(?:bought|owned|used|switched|returned|tested|
 *       kept|ran)\b|\bmy own\b|\bwhen I (?:got|bought|switched)\b/i
 *
 * — the narrow verb list that `claimStrength` replaced with a structural rule
 * after measuring it against real speech. Over the last matrix the stale copy
 * saw 2 history beats where `claimStrength` saw 22 (1 vs 27 on the replicate,
 * 11 vs 52 before the claim rules). The check whose own comment calls it "THE
 * MOST EXPENSIVE ERROR, CHECKED SEPARATELY" ran at about a tenth of its
 * sensitivity, so the per-beat traceability question was simply never asked of
 * 20 of 22 history beats.
 *
 * ⚖️ ITS "NARROW ON PURPOSE" RATIONALE WAS SUPERSEDED, NOT OVERRULED. The
 * comment justified the narrowness by saying "I think" and "I'd say" are
 * opinion rather than history — which is true, and which `claimStrength`
 * already handles by returning `position` for them. The reason survived; the
 * implementation that served it did not.
 *
 * ⚖️ AND THE POLICY LANDED FIRST, DELIBERATELY. Firing 10x more often is a
 * product decision, so `traceability.ts` froze the risk tiers in a separate
 * change before this one — otherwise this refactor would have been the policy.
 * This check remains REPORT-ONLY either way; enforcement runs through
 * `entitlementFailures`, which has always used the measured rule.
 */
const isFirstPersonHistory = (line: string): boolean => claimStrength(line) === 'history'

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
function tracesTo(cited: string, supplied: readonly SubstanceItem[]): boolean {
  return tracesToText(cited, supplied.map((i) => i.text))
}

/** The kinds that name a SUBJECT rather than assert anything.
 *
 *  ⚖️ NOT A WORD-COUNT HEURISTIC. `topic` is documented as "something they
 *  return to" and `product` as "a product they have mentioned" — both are, by
 *  their own definition, things rather than claims. `covered` joins them: "how
 *  nuclear fusion actually works" names a video's subject, and its whole
 *  purpose downstream is to say DO NOT REPEAT THIS, not to license a sentence. */
const SUBJECT_KINDS: ReadonlySet<string> = new Set(['topic', 'product', 'covered'])

/** How deep a citation's grounding goes: did it reach something the creator
 *  SAID, or only the name of something they talk about?
 *
 * ⚠️ WHY THIS IS MEASURED SEPARATELY FROM WHETHER IT TRACES. Reading the 265
 * `creator_knowledge` beats in the last matrix, 28% cite a bare subject —
 * "3D printing", "Unihertz", "hidden iPhone features". Every layer handles
 * those correctly: `tracesTo` passes them because the subject really is the
 * creator's, and `evidenceLevel` maps a topic to `coverage`, which licenses
 * exactly the discussion-strength claims those lines make. Only ONE of the 75
 * dressed an invented specific as creator knowledge. Nothing here is a leak.
 *
 * ⚖️ THE DEFECT IS IN WHAT GETS COUNTED, NOT IN WHAT SHIPS. `beat_substance`
 * reports the share of beats a creator can actually film — "the number this
 * whole layer exists to move" — and it counts a beat resting on the word
 * "3D printing" the same as one resting on "my prints used to be brittle until
 * I raised the infill". A metric that cannot tell those apart cannot show this
 * product solving its founding defect, which is content-emptiness, not
 * voice-inaccuracy. So this splits the number; it blocks nothing and changes
 * no threshold. Choosing to ACT on the split is a separate, owner-level call.
 */
export type GroundingDepth = 'proposition' | 'subject' | 'none'

export function groundingDepth(
  cited: string,
  supplied: readonly SubstanceItem[],
): GroundingDepth {
  if (!tracesTo(cited, supplied)) return 'none'
  // ⚖️ ANY propositional hit wins. `tracesTo` already accepts a citation that
  // reaches one real item among several, so asking for a stricter agreement
  // here would report two different answers about the same citation.
  const reached = supplied.filter((k) => tracesTo(cited, [k]))
  return reached.some((k) => !SUBJECT_KINDS.has(k.kind)) ? 'proposition' : 'subject'
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
  supplied: readonly SubstanceItem[],
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
    // expensive claims are still caught on the line itself: `isFirstPersonHistory`
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
    if (isFirstPersonHistory(line)) {
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

/** Kinds that carry the creator's own thinking rather than a subject heading.
 *  The complement of SUBJECT_KINDS, named separately because "not a subject" is
 *  a weaker statement than "a position, a method, or something they did". */
const PROPOSITIONAL_KINDS: ReadonlySet<string> = new Set([
  'opinion', 'experience', 'framework', 'claim', 'example', 'fact',
])

/**
 * How much substantive material Twin holds about THIS CREATOR overall.
 *
 * ⚠️ THE INPUT `routeSubstance` HAS ALWAYS TAKEN AND NOBODY EVER COMPUTED.
 * `RoutingContext.depth` is creator-level — "is this person a sufficient source"
 * — and the only depth function that existed, `groundingDepth`, answers a
 * different question about ONE CITATION. Without this, the routing function
 * could not be called at all, which is a large part of why it never was.
 *
 * ⚖️ DEPTH IS NOT GROUNDING, and keeping them apart is the whole point of the
 * two-mechanism split. This says how good a source the creator is in general;
 * grounding says whether one particular assertion traces to something they said.
 * A creator with deep knowledge may still not be entitled to a specific claim.
 *
 * ── THE THRESHOLDS ARE A STARTING POSITION, NOT A FINDING ──────────────────
 *
 * 3 is chosen, not measured — nothing has run this yet. It is written down here
 * rather than buried so the first shadow run can move it with evidence. What is
 * NOT arbitrary is the shape: `stated` is the only basis that can carry a
 * position, because caption extraction is clamped to `demonstrated` and a title
 * proves a video was made rather than what it concluded. So a caption-only
 * profile can never reach `high` — which is the correct reading of cohort 1,
 * where every creator was caption-only and 0 of 57 creator-state claims grounded.
 */
export function creatorDepth(supplied: readonly SubstanceItem[]): 'high' | 'medium' | 'low' {
  const propositional = supplied.filter((k) => PROPOSITIONAL_KINDS.has(k.kind))
  const stated = propositional.filter((k) => k.basis === 'stated')
  if (stated.length >= 3) return 'high'
  if (propositional.length >= 3 || stated.length >= 1) return 'medium'
  return 'low'
}

/** A beat whose line only tells the viewer how far through they are.
 *
 * ⚠️ A PROMPT RULE WAS TRIED FIRST AND MEASURABLY FAILED. After adding "NEVER
 * WRITE A PROGRESS CHECK" and naming the phrases, a regeneration of the same 16
 * scripts halved them — 6 to 3 — and the three survivors were the exact strings
 * the instruction forbids, verbatim. The empty-beat share did not fall at all.
 *
 * ⚖️ AND THIS REPO ALREADY KNEW: a contract check beats a prompt rule where the
 * defect is decidable. This one is trivially decidable — the phrases are a small
 * closed set — so it belongs in code, not in an instruction the model may or may
 * not honour.
 *
 * ⚠️ IT MUST ALSO CARRY NO SUBSTANCE, and that second condition is not optional.
 * "Still with me? Because the next one cost me £4,000" is a re-hook doing real
 * work; the phrase alone is not the defect. Condemning the phrase wherever it
 * appears would delete good beats to fix bad ones, which is how a guard earns
 * its way into being disabled.
 *
 * ⚖️ REPORTED, NOT REWRITTEN — for now, and deliberately. Creator panels called
 * these "dead weight neither creator would say", so deleting them is probably
 * right; but every enforcement shipped without measurement today has had to be
 * walked back, and a count is what tells us how often the case is clean. */
const PROGRESS_CHECK =
  /\b(?:still with me|still here|you'?re (?:still )?(?:with me|watching)|halfway (?:there|through|done)|ready for the (?:last|next|final)|are you (?:still )?(?:there|watching)|if you'?re still watching)\b/i

export function isProgressCheck(line: string, substance?: string | null): boolean {
  if (!PROGRESS_CHECK.test(String(line ?? ''))) return false
  // `none` and an absent declaration both mean the beat carries nothing.
  const s = String(substance ?? 'none').trim().toLowerCase()
  return s === 'none' || s === ''
}
