// ONE FIELD WAS DOING FOUR JOBS, AND A PERSON WAS STANDING IN A ROOM READING IT.
//
// §5c, extended by §5d. `WHERE TO BE / BACKGROUND` is the field the creator
// reads while holding a phone, and it was being filled with everything:
//
//   "Real footage of a dusty, outdated living room being framed out into
//    separate bedrooms"                                    ← b-roll, not a place
//   "Footage of a beautifully staged communal living room, then cutting back to
//    the creator in the kitchen"                           ← an EDIT instruction
//   "Same brightly lit kitchen, ensuring the #00E5FF cyan lights are visible"
//                                                          ← the brand palette
//   "White wall, black shirt"                              ← a shirt is WARDROBE
//
// A creator was being told to BE INSIDE FOOTAGE THAT DOES NOT EXIST. Four layers
// collapsed into one string, with four different owners and four different
// failure modes.
//
// ── THE PALETTE MUST BE STRUCTURALLY UNREACHABLE, NOT DISCOURAGED ─────────
//
// §5d settles an argument §5c left open. The leak no longer looks like an
// accident — it EXPLAINS ITSELF:
//
//   "wearing a plain black t-shirt to emphasize the brand colors
//    (#000000 and #FFFFFF)"
//
// The model has inferred that connecting wardrobe to brand colour is what the
// field is FOR, and reasons its way there confidently. You cannot tune away
// confident correctness. So the palette is not "discouraged in the prompt" — it
// is REMOVED from `location` and `wardrobe` by `stripPalette`, after generation,
// where no amount of reasoning can put it back.
//
// ── WHAT HAPPENS TO THE 87 STRINGS ALREADY STORED ────────────────────────
//
// ⚖️ DECIDED, and unlike the `promotes` question this one has a real population:
// production holds 39 generations carrying 87 non-empty `background` strings.
//
// THEY ARE NOT BACKFILLED. A stored string cannot be split without inventing
// which half was the location, and inventing it is the exact failure the split
// exists to end — "be in real footage of a dusty living room" would become a
// LOCATION, which is how the creator got told to stand inside b-roll in the
// first place. A migration that guesses would bake the defect into the data and
// call it corrected.
//
// So legacy beats keep their single string, READ AS WHAT IT IS: `legacyCombined`
// carries it, `location` stays null, and every consumer that wants a location
// must ask for one and get nothing rather than get a paragraph. The recorder
// keeps displaying it exactly as it does today — no regression for the 39 — and
// the Edit Plan, which must never be handed a place to stand, sees `location:
// null` and correctly concludes it has no location for that beat.
//
// The palette strip applies to legacy strings too, because a hex code in an
// instruction a person carries out with their hands is always wrong, whenever it
// was written.

/** A hex colour, `#abc` or `#aabbcc`. Shared with `sceneConsistency.ts`'s rule
 *  and deliberately identical: the same thing is wrong in both places, and two
 *  regexes for one fact drift. */
const HEX = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi

/**
 * THE FOUR LAYERS, each with its own owner and its own failure mode.
 *
 * Every field is nullable and null means "not specified", never "none required".
 * A director plan that says nothing about wardrobe has not said "wear anything";
 * it has not been asked.
 */
export interface ShotDirection {
  /**
   * WHERE THE CREATOR PHYSICALLY STANDS. Achievable direction only.
   *
   * Never assumed inventory ("the walnut chair beside your lamp"), never
   * footage, never a hex colour. "Clean neutral wall, facing the brightest
   * window" works in any room at any hour; "a brightly lit fully renovated
   * kitchen" assumes a house.
   */
  location: string | null
  /**
   * FOOTAGE TO SUPPLY, and gated on whether this creator can actually produce
   * it. Ungated it is §5a's finding 4 with a new name — a renovation timelapse
   * handed to someone with a phone, an animated flatlining line graph handed to
   * a solo founder.
   */
  brollRequest: string | null
  /**
   * CUTAWAY AND RETURN TIMING, consumed by the Edit Plan and NEVER rendered as
   * a place to stand. This is the layer whose leak produced "be in real footage
   * of a dusty living room being framed out".
   */
  editorIntent: string | null
  /**
   * WHAT THE CREATOR WEARS. §5d's fourth layer, found in "White wall, black
   * shirt" — a shirt is not a background and not a location.
   *
   * Palette-free by construction, for the reason in the header: this is the
   * field the model rationalised its way into using as a brand-colour slot.
   */
  wardrobe: string | null
  /**
   * A PRE-SPLIT `background` STRING, PRESERVED AS ONE.
   *
   * Present only for beats generated before the split. Never parsed into the
   * fields above — see the header. A consumer may DISPLAY it (the recorder
   * does, unchanged) but must not read it as a location.
   */
  legacyCombined: string | null
}

export function emptyShotDirection(): ShotDirection {
  return {
    location: null, brollRequest: null, editorIntent: null,
    wardrobe: null, legacyCombined: null,
  }
}

/**
 * Remove every hex colour, and the phrase that was reaching for it.
 *
 * NOT A REJECTION — a strip. Refusing the whole field would throw away
 * "Stark white wall" to get rid of "#000000", leaving the creator with less
 * direction than before; the useful half is kept and the unreachable half
 * removed.
 *
 * The trailing-clause sweep matters as much as the hex itself. Deleting the code
 * out of "to emphasize the brand colors (#000000 and #FFFFFF)" leaves "to
 * emphasize the brand colors ()", which still instructs the creator to do the
 * impossible thing and now looks like a bug as well.
 */
export function stripPalette(value: string | null | undefined): string | null {
  if (!value) return null
  let out = value.replace(HEX, '')
  // A parenthetical that existed only to hold colours.
  out = out.replace(/\(\s*(?:and|,|&|\s)*\s*\)/g, '')
  // "to emphasize the brand colors", "matching the brand palette" — the clause
  // whose only referent was the palette. Bounded to a clause so it cannot eat a
  // sentence that merely mentions colour in passing.
  out = out.replace(
    /[,;]?\s*(?:to\s+)?(?:emphasi[sz]e|match|reflect|highlight|reinforce)(?:\s+\w+){0,2}\s+brand\s+(?:colou?rs?|palette)\b[^.;,]*/gi,
    '',
  )
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim()
  // A field left as punctuation is a field with nothing in it.
  out = out.replace(/^[\s,;.\-–—]+|[\s,;\-–—]+$/g, '').trim()
  return out === '' ? null : out
}

/** Does this text carry a hex colour? Used by tests and by callers that want to
 *  assert the boundary held rather than trust that it did. */
export function hasPalette(value: string | null | undefined): boolean {
  if (!value) return false
  HEX.lastIndex = 0
  return HEX.test(value)
}

/** What a beat looks like coming out of the blueprint, old or new. */
export interface RawBeatDirection {
  /** The pre-split field. Present on every beat generated before the split. */
  background?: string | null
  location?: string | null
  broll_request?: string | null
  brollRequest?: string | null
  editor_intent?: string | null
  editorIntent?: string | null
  wardrobe?: string | null
}

/**
 * Read a beat's direction, whichever era produced it.
 *
 * ⚖️ A LEGACY `background` NEVER BECOMES A `location`. That single assignment
 * would be the whole defect, re-introduced by the code meant to remove it: the
 * strings in production include "Real footage of a dusty living room being
 * framed out into separate bedrooms", and calling that a location is exactly how
 * a creator was told to stand inside footage.
 *
 * It goes to `legacyCombined`, and `location` stays null. A consumer that needs
 * a place to stand asks for one and correctly gets nothing.
 */
export function readShotDirection(raw: RawBeatDirection | null | undefined): ShotDirection {
  const out = emptyShotDirection()
  if (!raw) return out
  const t = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null

  // The palette is unreachable from both physical-instruction fields.
  out.location = stripPalette(t(raw.location))
  out.wardrobe = stripPalette(t(raw.wardrobe))
  // B-roll and edit intent are not things a person performs with their hands, so
  // a colour reference there is a legitimate art-direction note.
  out.brollRequest = t(raw.broll_request ?? raw.brollRequest)
  out.editorIntent = t(raw.editor_intent ?? raw.editorIntent)

  const legacy = t(raw.background)
  // Only when the new fields are absent. A beat carrying both is a new beat that
  // also emitted the old key, and the split fields are the authority.
  if (legacy && !out.location && !out.wardrobe && !out.brollRequest && !out.editorIntent) {
    // Stripped even though it is legacy: a hex code in an instruction a person
    // carries out with their hands is always wrong, whenever it was written.
    out.legacyCombined = stripPalette(legacy)
  }
  return out
}

/**
 * WHAT THE CREATOR READS WHILE STANDING IN THE ROOM.
 *
 * `location` when there is one. The legacy string when that is all there is —
 * shown rather than withheld, because the 39 generations already in production
 * must not lose their direction to a refactor.
 *
 * NEVER `brollRequest` and never `editorIntent`. Those are the two that produced
 * "be inside footage that does not exist", and no fallback chain may reach them.
 */
export function placeToStand(d: ShotDirection): string | null {
  return d.location ?? d.legacyCombined ?? null
}

/**
 * MAY THIS B-ROLL BE ASKED FOR AT ALL?
 *
 * §5a finding 4 and §5d's line graph. A request the creator cannot produce is
 * not a stretch goal; it is a beat that silently will not exist, discovered
 * during the edit.
 *
 * `canProduce` is the creator's own capability answer. UNKNOWN is a refusal
 * here, the same direction `showability` refuses: this decides whether a beat
 * DEPENDS on footage that may never arrive.
 */
export function brollAllowed(
  d: ShotDirection,
  canProduce: boolean | null | undefined,
): boolean {
  if (!d.brollRequest) return false
  return canProduce === true
}
