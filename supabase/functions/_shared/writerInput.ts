// DERIVED FROM packages/shared/src/writerInput.ts — DO NOT EDIT THIS COPY.
//
// ⚠️ EDGE FUNCTIONS CANNOT IMPORT `packages/shared`, so the slot machinery is
// copied here and `scripts/ci/check_resolver_parity.mjs` holds the two together.
// Edit the SHARED file and re-derive; a change made only here is drift, and
// drift in these rules is silent — the prompt is simply graded by different
// rules than the ones every test in `packages/shared` proves.
//
// ⚖️ ONLY THE SLOT MACHINERY IS TAKEN, and that is a decision rather than an
// omission. `WriterInput`, `audienceRules` and `buildWriterInput` are built on
// `StyleProfile`, which `generate-blueprint` has never produced — it carries its
// own inline style shape. A copy that dragged those types along would be
// carrying code it never reads, which is precisely how a copy starts to drift.
// The guard compares this file to the shared one BETWEEN two markers for the
// same reason.

import type { TemplateResolution } from './knowledgeResolver.ts'

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
    const refs = [...new Set(r.evidence.map((e) => e.source))]
    out.set(r.label, { text: texts.join(' '), attribution: refs.join(', ') })
  }
  return out
}

