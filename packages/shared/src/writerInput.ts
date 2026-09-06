// FIVE THINGS, AND THE ACCOUNT IS NOT ONE OF THEM.
//
// ⚠️ THE WRITER CURRENTLY RECEIVES WHATEVER THE CALLER HAPPENED TO LOAD. There
// is no contract saying what it may see, so every new field somebody adds to the
// profile becomes another paragraph in a prompt nobody is measuring — and a
// model given ninety-four fields does not weigh them, it picks.
//
// ⚖️ SO THE INPUT IS A CLOSED SET: how this person speaks, who the video is for,
// what this video should accomplish, WHAT IS ACTUALLY TRUE AND AVAILABLE TO SAY,
// and how the reference organises attention. Everything else — raw onboarding
// answers, the whole DNA blob, an undifferentiated product dump — is excluded
// BY CONSTRUCTION rather than by discipline, and a test reads the serialised
// payload back to prove it.
//
// ⚠️ THE FOURTH ONE IS THE WHOLE POINT. A generic script is rarely bad prose; it
// is prose with nothing specific inside it. `content` arrives already resolved —
// each hole filled, and each fill carrying WHERE IT CAME FROM — so the writer is
// arranging supplied material rather than inventing it. That is the difference
// this track exists to make.

import type { CreativeDecisionPlan } from './creativeDecisionPlan'
import type { StyleProfile } from './styleCompiler'
import type { CanonicalLevel } from './profileAssembler'
import type { AudienceSegment } from './creatorProfileQuestions'
import type { ContainerTemplate } from './containerTemplates'
import type { TemplateResolution } from './knowledgeResolver'

/**
 * How safe a piece of supplied content is to state, and in what voice.
 *
 * ⚠️ THE WRITER MUST NEVER TURN AN OPINION INTO A FACTUAL CLAIM, and it cannot
 * obey that rule without being told which is which. "Costs $29" and "is easier
 * than editing manually" are both true sentences to hand a model; only one may
 * be said as a fact.
 *
 * ⚖️ `forbidden` IS A CLASS RATHER THAN AN OMISSION, because content that was
 * considered and refused is different from content nobody had. Dropping it
 * silently invites the next stage to rediscover and use it.
 */
export const CONTENT_CLASSES = [
  'verified_fact', 'user_confirmed', 'creator_opinion',
  'researched_fact', 'safe_inference', 'forbidden',
] as const
export type ContentClass = (typeof CONTENT_CLASSES)[number]

/** ⚠️ WHAT MAY BE STATED FLATLY, AND WHAT MUST BE FRAMED AS A VIEW. Derived
 *  once, here, rather than by each reader interpreting the class name. */
const STATEABLE_AS_FACT: ReadonlySet<ContentClass> = new Set<ContentClass>([
  'verified_fact', 'user_confirmed', 'researched_fact',
])
export const mayStateAsFact = (c: ContentClass): boolean => STATEABLE_AS_FACT.has(c)

export interface WriterSlot {
  label: string
  /** What this beat is for — the template's own words. */
  purpose: string
  /** What goes here. Empty when the beat is the writer's to compose. */
  content: string
  classification: ContentClass
  /** Named so a validator can check a claim against the same source the writer
   *  was given, rather than against the model's memory. */
  attribution: string | null
}

/** How a resolution's source maps onto what may be SAID about it. */
const CLASS_FOR_SOURCE: Record<string, ContentClass> = {
  product_dna: 'user_confirmed',
  creator_knowledge: 'creator_opinion',
  research: 'researched_fact',
  needs_user: 'forbidden',
  unresolved: 'forbidden',
}

/**
 * Resolutions plus their text, as the slots a writer is handed.
 *
 * ⚖️ SPLIT OUT OF `buildWriterInput` BECAUSE IT ASKS FOR LESS. Assembling
 * slots needs the resolutions and their fills and nothing else — no style
 * profile, no audience, no template. `generate-blueprint` has its own inline
 * style shape and could never produce a `StyleProfile`, so a function that
 * demanded one would have been copied there rather than called, which is exactly
 * how six copies of the substance rules came to exist.
 */
export function buildSlots(
  resolutions: readonly TemplateResolution[],
  filled: ReadonlyMap<string, { text: string; attribution: string | null }>,
): readonly WriterSlot[] {
  return resolutions.map((r) => {
    const supplied = filled.get(r.label) ?? null
    return {
      label: r.label,
      purpose: r.container.about,
      content: supplied?.text ?? '',
      classification: CLASS_FOR_SOURCE[r.source] ?? 'forbidden',
      attribution: supplied?.attribution ?? null,
    }
  })
}

/**
 * ⚠️ ONE UNFILLED SLOT IS ENOUGH TO STOP. A writer handed four of five holes
 * fills the fifth — that is what a model does — and the result is a confident
 * sentence about something nobody supplied.
 */
export function slotsReady(slots: readonly WriterSlot[]): boolean {
  return !slots.some((s) => s.classification === 'forbidden' || s.content.trim() === '')
}
/** What an entity can actually contribute to a beat it was assigned. */
export interface EntitySay {
  /** The sentence(s) the creator has already confirmed about it. */
  text: string
  /** Its name — so a validator can check a claim against the same record. */
  attribution: string
}

/**
 * Turn resolutions into the text each beat is actually filled with.
 *
 * ⚠️ THIS IS THE STEP THAT WAS MISSING, and its absence is why
 * `all_slots_filled` and `no_unsupported_claim` have been reporting `not_run`
 * at the edge. A resolution says a beat CAN be filled and by what; it does not
 * say what the beat then SAYS. Without that sentence there is nothing for the
 * two checks to read, and passing them an empty content list would have
 * reported "0 slots empty, no opinion asserted" — two confident passes on
 * questions nobody asked.
 *
 * ⚖️ AN ASSIGNED ENTITY WITH NOTHING TO SAY FILLS NOTHING. `resolveTemplate`
 * assigns a product to a beat because the creator holds one, which settles
 * WHICH product — not what is true about it. If the record carries no confirmed
 * text, this returns no entry, `buildWriterInput` returns null, and the writer
 * is not called. That is the same refusal the evidence ladder already makes,
 * applied to the one source that could otherwise smuggle a name in as content.
 *
 * ⚖️ AND A MISSING ENTRY IS NEVER AN EMPTY STRING. Absence has to survive to
 * `buildWriterInput`, which is the single place that decides an input is
 * unready; a blank fill here would be a filled slot everywhere downstream.
 */
export function filledFrom(
  resolutions: readonly TemplateResolution[],
  entitySay: ReadonlyMap<string, EntitySay>,
): Map<string, { text: string; attribution: string | null }> {
  const out = new Map<string, { text: string; attribution: string | null }>()
  for (const r of resolutions) {
    if (r.entityId !== null) {
      const say = entitySay.get(r.entityId)
      if (say && say.text.trim() !== '') {
        out.set(r.label, { text: say.text.trim(), attribution: say.attribution })
      }
      continue
    }
    // ⚖️ THE EVIDENCE IS THE CONTENT. These are the creator's own recorded
    // items, already ranked and already strong enough for this beat's need —
    // re-deriving a sentence from them here would be a second, unmeasured
    // opinion about what they mean.
    const texts = r.evidence.map((e) => e.text.trim()).filter((t) => t !== '')
    if (texts.length === 0) continue
    // ⚖️ WHERE IT CAME FROM, NOT MERELY THAT IT DID. `source` is a closed union
    // — caption, transcript, user, previous_video — so a validator checking a
    // claim can tell a confirmed answer from a line lifted off a caption.
    //
    // ⚠️ AN UNKNOWN SOURCE USED TO BECOME A BLANK ATTRIBUTION, SILENTLY.
    //  `source` is optional on a `KnowledgeItem` — `readKnowledgeItem` returns
    //  `undefined` for any value outside the union — and `[undefined].join(', ')`
    //  is the EMPTY STRING, not the word "undefined". So a row whose provenance
    //  the reader could not name arrived as `attribution: ''`, which is present
    //  and falsy and reads to a validator as "attributed to nothing" rather than
    //  as "we do not know". Dropping the unknowns and falling back to `null`
    //  keeps the two apart: `null` is the value the field already uses for
    //  "nothing to attribute", and every consumer already handles it.
    const refs = [...new Set(r.evidence.map((e) => e.source))]
      .filter((x): x is NonNullable<typeof x> => x !== undefined && x !== null)
    out.set(r.label, {
      text: texts.join(' '),
      attribution: refs.length > 0 ? refs.join(', ') : null,
    })
  }
  return out
}

export interface WriterAudience {
  segment: AudienceSegment | null
  level: CanonicalLevel | null
  /** ⚠️ WHAT THEY ALREADY KNOW, AS BEHAVIOUR RATHER THAN A LABEL. "Audience:
   *  expert" near the top of a long prompt changes nothing; "skip the
   *  introduction, use the domain's own vocabulary" changes sentences. */
  rules: readonly string[]
}

/** The five things, and nothing else. */
export interface WriterInput {
  creatorStyle: StyleProfile
  audience: WriterAudience
  decisionPlan: CreativeDecisionPlan
  content: readonly WriterSlot[]
  referenceStructure: {
    container: ContainerTemplate['container']
    beats: readonly { role: string; label: string; purpose: string }[]
  }
}

/**
 * Audience level, compiled into behaviour.
 *
 * ⚖️ THREE PRACTICAL MODES AND A FOURTH FOR SILENCE. `mixed` is what an unasked
 * creator gets, and it is not a blend of the other three — it is the instruction
 * to explain enough for a newcomer without boring somebody who knows.
 */
export function audienceRules(level: CanonicalLevel | null): readonly string[] {
  switch (level) {
    case 'beginner':
      return [
        'Explain any term the first time it appears.',
        'Give the context before the point that needs it.',
        'Use a concrete example for every abstract claim.',
        'Never use unexplained jargon.',
      ]
    case 'expert':
      return [
        'Skip introductory explanation entirely.',
        'Use the domain’s own vocabulary without defining it.',
        'Spend the time on nuance, trade-offs and the unobvious.',
        'Assume the standard advice is already known.',
      ]
    case 'intermediate':
      return [
        'Assume the basics and move at pace.',
        'Explain only what is genuinely unusual.',
        'Prefer one worked example over general description.',
      ]
    default:
      return [
        'Explain enough for a newcomer without slowing down somebody who knows.',
        'Define a term only where its meaning changes the point.',
      ]
  }
}

/**
 * Assemble the writer's input, and refuse to assemble it from an unready plan.
 *
 * ⚠️ RETURNS `null` WHEN A SLOT IS STILL OWED SOMETHING. The writer is never
 * called on an unresolved container — that refusal is the point of the whole
 * order, and the cheapest moment to discover a video cannot be made is before
 * anybody is charged for it.
 */
export function buildWriterInput(args: {
  style: StyleProfile
  plan: CreativeDecisionPlan
  segment: AudienceSegment | null
  template: ContainerTemplate
  resolutions: readonly TemplateResolution[]
  /** What each resolved slot actually says, by label. A slot with an entry and
   *  a fillable source is ready; one without is not. */
  filled: ReadonlyMap<string, { text: string; attribution: string | null }>
}): WriterInput | null {
  const { style, plan, segment, template, resolutions, filled } = args

  const slots = buildSlots(resolutions, filled)
  if (!slotsReady(slots)) return null

  return {
    creatorStyle: style,
    audience: { segment, level: plan.audienceLevel, rules: audienceRules(plan.audienceLevel) },
    decisionPlan: plan,
    content: slots,
    referenceStructure: {
      container: template.container,
      beats: template.beats.map((b) => ({ role: b.role, label: b.label, purpose: b.purpose })),
    },
  }
}
