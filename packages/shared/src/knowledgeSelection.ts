// WHICH TEN THINGS THE WRITER SEES, OUT OF EVERYTHING THE CREATOR KNOWS.
//
// ── THE DEFECT, MEASURED ──────────────────────────────────────────────────
//
// A prompt can carry about ten knowledge items. The selector ranked them by
// LEXICAL OVERLAP with the video's topic and nothing else, then took the first
// ten. That is simple and explainable, which is why it was chosen, and it is
// safe only while a creator's store is small and hand-curated.
//
// An A/B on three creators — same references, same arms, only the knowledge
// differing — measured what happens when the store is realistic instead:
//
//                               hand-written    + 382 derived items
//     grounded in creator knowledge   63%              52%
//     generic beats                   20%              25%
//     product facts used               6                1
//
// MORE KNOWLEDGE MADE THE SCRIPTS WORSE. What reached the writer explains it:
//
//     hand-written  claim 22 · product 22 · opinion 18 · topic  8 · experience 4
//     merged        product 44 · topic 25 · claim 19 · opinion 17 · experience 3
//
// The small pack never filled the cap, so the writer saw every substantive item
// there was. The realistic store filled all ten slots on every case, and the
// thin items — "they made a video about Cursor" — won on keyword overlap and
// pushed the claims and experiences out. Product mentions doubled; experiences
// fell.
//
// ⚠️ AND EVERY REAL CREATOR'S STORE IS THE REALISTIC ONE. Knowledge accumulates
// across every scan; an established account holds hundreds of caption-derived
// `product` and `topic` rows. So an established creator crowds their own claims
// out of their own prompt, and the hand-curated test pack was hiding it.
//
// ── WHY RESERVATION, AND NOT "RANK BY DEPTH" ──────────────────────────────
//
// The obvious fix is to sort by substance first and overlap second. It was not
// taken, because it throws away the property that made this selector defensible:
// a video ABOUT a product should see that product. Depth-first ordering would
// hand a phone review a generic business claim ahead of the phone.
//
// ⚖️ SO RELEVANCE STILL CHOOSES WITHIN EACH GROUP, and the only thing reserved is
// that substance cannot reach ZERO. A floor, not a reordering.

/** The kinds that carry something a script can be built out of — a position, a
 *  method, a number, something they did.
 *
 *  ⚠️ `product` AND `topic` ARE DELIBERATELY ABSENT, and they are not junk. "They
 *  covered the Z Fold 8" is true, useful for choosing an angle, and exactly what
 *  a caption can prove. It just cannot carry a beat on its own: a script built
 *  from ten of them says a creator has mentioned ten things and asserts nothing.
 *  `covered` is excluded upstream — it steers choice and is never spoken. */
export const SUBSTANCE_KINDS: ReadonlySet<string> = new Set([
  'claim', 'experience', 'framework', 'opinion', 'fact', 'example',
])

/** How many of the slots substance may not be pushed out of.
 *
 *  ⚖️ SIX OF TEN, AND THE NUMBER IS AN OBSERVATION RATHER THAN A TASTE. The
 *  hand-written arm — the one that scored 63% — supplied 86 items across 12
 *  cases, of which 56 were substance kinds: 65%. This floor keeps a full store
 *  from falling below the mix that was measured working, while leaving four
 *  slots for whatever the video is actually about.
 *
 *  It is a FLOOR, not a quota: with fewer than six substance items available,
 *  the remainder goes back to the general pool rather than sitting empty. */
export const SUBSTANCE_FLOOR = 6

/** A measured value: a number wearing a unit, a multiplier or a currency.
 *
 *  ⚠️ A BARE INTEGER IS NOT A FIGURE. "3 ways to do X" is a count and asserts
 *  nothing about an outcome; "3x" and "$40k" are the measurements a numbers
 *  channel is built on. The same line the count contract draws. */
const FIGURE = new RegExp(
  '\\d[\\d,.]*\\s*(?:x\\b|×|%|k\\b|m\\b|bn\\b|hours?|hrs?|minutes?|mins?|days?|weeks?|months?'
  + '|years?|dollars?|pounds?|euros?|subscribers?|followers?|customers?|users?|views?|clients?)'
  + '|[$£€]\\s?\\d[\\d,.]*',
  'i')

/** Does this item carry a measurement the creator could actually say?
 *
 *  ⚖️ SUBSTANCE KINDS ONLY, AND THAT NARROWING IS THE WHOLE FINDING. Counting
 *  figures across every kind says ten creators have numbers; counting only the
 *  kinds that can carry a beat says almost none do. A figure sitting in a
 *  `topic` row — "top 10 dropshipping products" — is not a number the creator
 *  can assert, and treating it as one is how a shortage looks like a supply. */
export function carriesFigure(item: { kind?: string; text?: string }): boolean {
  return SUBSTANCE_KINDS.has(String(item?.kind)) && FIGURE.test(String(item?.text ?? ''))
}

/** Where an item was learned. `transcript` means the creator SAID it.
 *
 *  ⚠️ MEASURED ON PRODUCTION KNOWLEDGE AND ON THE SCRIPTS IT PRODUCES. The two
 *  sources are not two flavours of the same thing:
 *
 *      caption-derived : 374 items, 13% substance, ZERO experiences,  2 with figures
 *      transcript      : 178 items, 78% substance,   50 experiences, 23 with figures
 *
 *  ⚖️ AND MIXING THEM IS WORSE THAN EITHER. Same eight creators, same reference,
 *  changing only the store:
 *
 *      hand pack                      61% grounded · 25% generic
 *      production, all sources        58% grounded · 23% generic
 *      production, TRANSCRIPT ONLY    73% grounded ·  8% generic
 *
 *  Generic beats fell by two thirds. Caption rows do not merely add nothing —
 *  they win slots on keyword overlap and push out the material that can carry a
 *  beat, which is why the realistic store scored BELOW the hand-curated one.
 *
 *  ⚠️ 'asked' BELONGS HERE, AND IT IS NOT A TRANSCRIPT. Everything else in this
 *  set is a model recovering a position from evidence; an answered question is
 *  the creator stating one, with no extraction step to lose it. If spoken
 *  material earns the substance reservation because it can carry a belief, an
 *  answer earns it for the same reason and more directly.
 *
 *  ⚖️ IT DOES NOT OUTRANK TRANSCRIPT WITHIN THE RESERVATION, BECAUSE NOTHING
 *  HERE DOES. This set decides WHICH pool fills the floor first; which item
 *  inside that pool is still relevance's call, exactly as it was when the set
 *  had one member. Ordering answers above transcripts would be a second,
 *  unmeasured judgement smuggled in beside a measured one. */
export const SPOKEN_SOURCES: ReadonlySet<string> = new Set(['transcript', 'asked'])

/** Did the creator actually say this, rather than caption it? */
export function wasSpoken(item: { source?: string | null }): boolean {
  return SPOKEN_SOURCES.has(String(item?.source ?? ''))
}

export interface SelectableItem {
  kind: string
  text: string
  basis?: string | null
  /** `transcript` | `caption` | null. Null means unrecorded, NOT caption — items
   *  stored before 0122 have no source and must not be demoted for it. */
  source?: string | null
}

/**
 * Choose what the writer sees.
 *
 * `score` is supplied by the caller — this module does not decide what relevance
 * means, it decides that relevance alone must not starve the prompt of
 * substance. Ordering WITHIN each group is still whatever the caller ranked by.
 *
 * Returns at most `cap` items, in one list, substance-first only insofar as the
 * floor requires. Never returns duplicates, and never fewer items than the old
 * behaviour would have.
 */
/** The kinds that are a FIRST-PERSON EPISODE — something the creator did, not
 *  something they know.
 *
 *  ⚠️ `experience` ONLY, AND `example` IS DELIBERATELY OUT. An example can be a
 *  worked case about anyone; an experience is the creator's own. Widening this
 *  to feel more generous would let a third-party example satisfy a reservation
 *  that exists to guarantee the creator appears in their own script. */
const FIRST_PERSON_KINDS: ReadonlySet<string> = new Set(['experience'])

/** How many of the reserved substance slots are held for a first-person episode
 *  when the store has one.
 *
 *  ⚠️ ONE, NOT MORE. The floor guarantees the creator appears; it must not turn
 *  every script into a memoir. A store with six episodes still gets six if
 *  relevance ranks them that way — this only stops the count reaching ZERO while
 *  episodes sit unread in the store. */
export const FIRST_PERSON_FLOOR = 1

/** Is this item a first-person episode? */
export function isFirstPerson(item: { kind?: string }): boolean {
  return FIRST_PERSON_KINDS.has(String(item?.kind))
}

export function selectSpeakable<T extends SelectableItem>(
  ranked: readonly T[],
  cap: number,
  floor: number = SUBSTANCE_FLOOR,
): T[] {
  if (cap <= 0) return []
  // ⚠️ THE INPUT IS ALREADY IN RELEVANCE ORDER. Re-sorting here would silently
  // replace the caller's notion of relevance with this module's, which is the
  // thing the reservation exists NOT to do.
  const substance = ranked.filter((i) => SUBSTANCE_KINDS.has(i.kind))

  // ⚠️ SPOKEN MATERIAL FILLS THE RESERVATION FIRST. This is a stable partition,
  // not a sort: relevance order is preserved WITHIN each group, so the caller's
  // notion of relevance still decides which experience — it just cannot be a
  // caption row that takes the slot from every experience.
  //
  // ⚖️ AND IT ONLY REORDERS THE RESERVED SLOTS. The remaining four are untouched
  // and open to everything, so a video about a product still gets the product.
  // Measured: transcript-only stores scored 73% grounded / 8% generic against
  // 58% / 23% for the same stores with caption rows mixed in.
  const spoken = substance.filter(wasSpoken)
  const rest = substance.filter((i) => !wasSpoken(i))
  const bySpokenFirst = [...spoken, ...rest]
  const floorSlots = Math.min(floor, cap)

  // ── ONE SLOT HELD FOR A FIRST-PERSON EPISODE ────────────────────────────
  //
  // ⚠️ MEASURED, 2026-09-05. `creator_knowledge` holds 104 `experience` rows
  // across 23 voices, so extraction works. A physiotherapist with TWO of them
  // received three complete scripts containing ZERO first-person episodes —
  // his substance floor was satisfied entirely by claims, facts, frameworks and
  // opinions, which are all `SUBSTANCE_KINDS` and all rank ahead of two lone
  // episodes in a store where 26 of 50 items are caption-derived coverage.
  //
  // ⚖️ SO THE GAP WAS SELECTION, NOT COLLECTION, and the fix belongs HERE. The
  // diagnosis matters: the same symptom would have justified building a
  // recordings-capture pipeline, which would not have moved this creator at all
  // because his episodes were already stored.
  //
  // ⚖️ AND IT IS A SELECTION PREFERENCE, NOT A PROMPT INSTRUCTION. Telling the
  // writer to "include a personal story" was measured INERT; changing what
  // reaches it won 17-7. A floor changes the input, which is the half that
  // moves.
  //
  // ⚠️ IT RESERVES, IT DOES NOT INJECT. When the store holds no episode this is
  // a no-op and the selection is byte-identical to before — a creator with
  // nothing to tell is never handed an empty slot to fill, which is how a floor
  // becomes an invitation to invent one.
  // ⚖️ IT TAKES THE LAST RESERVED SLOT, NOT THE FIRST. An earlier draft put the
  // episode at the head of the reservation and the scenario suite caught it:
  // three different intents — teach, story, sell — all began with the same
  // `experience`, collapsing a distinction the compiler exists to produce. A
  // selling video should not be made to OPEN on a personal story merely because
  // one was guaranteed. Guaranteeing presence and dictating the lead are
  // different powers, and only the first one belongs to a floor.
  const keepSubstance = bySpokenFirst.slice(0, floorSlots)
  if (floorSlots > 0 && !keepSubstance.some(isFirstPerson)) {
    const episode = bySpokenFirst.find(isFirstPerson)
    // ⚠️ ONLY WHEN ONE EXISTS AND NONE GOT IN. With no episode in the store this
    // is a no-op and the selection is byte-identical to before — a creator with
    // nothing to tell is never handed an empty slot, which is how a floor turns
    // into an invitation to invent one.
    if (episode) keepSubstance[floorSlots - 1] = episode
  }
  const taken = new Set<T>(keepSubstance)
  const out = [...keepSubstance]

  // ⚖️ THE REMAINING SLOTS ARE OPEN TO EVERYTHING, in the caller's order. A video
  // about a product still gets the product, and a creator with more than six
  // strong items still gets the seventh — the floor guarantees a minimum, it
  // does not impose a maximum.
  for (const item of ranked) {
    if (out.length >= cap) break
    if (taken.has(item)) continue
    out.push(item)
    taken.add(item)
  }
  return out
}

/** How the selection came out, for the log line that will say whether this
 *  worked on real stores rather than on the three creators it was tuned against.
 *
 *  ⚠️ A FIX SHIPPED WITHOUT A COUNTER IS A FIX NOBODY CAN CONFIRM. The defect it
 *  addresses was invisible for months precisely because nothing recorded the MIX
 *  of what reached the writer — only that ten things did. */
export function selectionShape(
  chosen: readonly SelectableItem[],
  available: readonly SelectableItem[],
): {
  chosen: number; available: number; substance: number; thin: number; starved: boolean
  figures: number; availableFigures: number
} {
  const substance = chosen.filter((i) => SUBSTANCE_KINDS.has(i.kind)).length
  const availableSubstance = available.filter((i) => SUBSTANCE_KINDS.has(i.kind)).length
  return {
    chosen: chosen.length,
    available: available.length,
    substance,
    thin: chosen.length - substance,
    // ⚠️ BOTH HALVES, BECAUSE THE INTERESTING ANSWER IS THE DENOMINATOR. The gap
    // this was built to test — "numbers vanish for the channels built on
    // numbers" — assumed selection was dropping them. On every corpus available
    // it is not: `figures` equals `availableFigures` on the curated pack, and
    // BOTH are zero on caption-derived stores. Recording only what got through
    // would keep that indistinguishable from a selector that discards them.
    figures: chosen.filter(carriesFigure).length,
    availableFigures: available.filter(carriesFigure).length,
    // ⚠️ THE CONDITION THE A/B CAUGHT: substance existed in the store and did not
    // make it into the prompt. True here means the floor is set too low or the
    // cap too tight — not that the creator has nothing to say.
    starved: substance < Math.min(SUBSTANCE_FLOOR, availableSubstance),
  }
}
