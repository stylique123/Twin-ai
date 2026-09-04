// FOUR WAYS IN, AND ONLY ONE OF THEM WAS EVER LIT.
//
// ⚠️ THE SCREEN ASKS FOR A LINK AND SILENTLY ACCEPTS ANYTHING. `V2Create` reads
// `/^https?:\/\//` and routes a URL to `reference_url` and everything else to
// `reference_note` — two genuinely different builds, chosen by a regex the
// creator never sees. The heading says "Paste a reference you wish you'd made"
// and the placeholder says "Paste a video link…", so a creator who has an idea
// and no reference is looking at a screen that appears to have nothing for
// them. The second door has existed since the note path shipped; it has never
// been advertised.
//
// ── WHY A DOOR IS A DECLARED THING AND NOT A DERIVED ONE ──────────────────
//
// ⚖️ AN INFERENCE CAN BE WRONG AND STILL BE INVISIBLE. Routing on the shape of
// the text means the product can never tell "they wanted an idea build" from
// "they pasted something that did not look like a URL". Recording the door as
// a decision makes the two separable, which is the whole reason this exists —
// see `screenCaptureConversion.ts` for the same principle stated first.
//
// ⚠️⚠️ AND PRODUCT IS NEVER, EVER INFERRED FROM TEXT. This is the one rule in
// here with teeth. Typing "my collagen serum" must not put the creator into a
// build that treats them as the seller: a product build inherits claim
// entitlement, disclosure and evidence requirements (`claimEntitlement.ts`,
// `productEvidence.ts`), and a wrong guess there is a legal exposure rather
// than a cosmetic mis-route. Owning a thing is a fact about the creator, held
// in the Product Library, and the only safe way to learn it is for them to
// pick it. `readEntryDoor` cannot return 'product' unless it was chosen, and a
// test deletes the guard to prove the guard is what stops it.

/** The four ways a creator can start. Ordered as they are offered on screen. */
export type EntryDoor =
  /** They have a video they wish they'd made. → reference_url */
  | 'reference'
  /** They have a thought and no reference. → reference_note */
  | 'idea'
  /** They want to talk about something they sell. → the Product Library. */
  | 'product'
  /** They have nothing yet. → the Gallery, and back with a reference. */
  | 'browse'

/** How this door was arrived at. The distinction the old regex could not draw. */
export type DoorSource =
  /** The creator picked it. */
  | 'chosen'
  /** Nobody picked; the screen opened on it, or their text moved it. */
  | 'preselected'

export interface DoorReading {
  door: EntryDoor
  source: DoorSource
}

/** The doors a creator may be preselected into. The other two are decisions
 *  about the creator's own circumstances and can only ever be stated. */
const INFERABLE: readonly EntryDoor[] = Object.freeze(['reference', 'idea'])

const DOORS: readonly EntryDoor[] = Object.freeze(['reference', 'idea', 'product', 'browse'])

/** Whether a string is a link we would treat as a reference.
 *
 *  ⚠️ THE SAME TEST `V2Create` ALREADY USED, deliberately unchanged. Widening
 *  it (bare domains, "tiktok.com/..." with no scheme) would silently re-route
 *  builds that are working today, and this change is about naming the doors,
 *  not about moving them. */
export function looksLikeLink(text: string): boolean {
  return /^https?:\/\//i.test(text.trim())
}

/**
 * Which door this entry is going through.
 *
 * ⚠️ A CHOICE ALWAYS BEATS THE TEXT, IN BOTH DIRECTIONS. A creator who picked
 * "I have an idea" and then pasted a link gets an idea build — they said so.
 * The reverse (picked reference, typed prose) is left alone too: the screen
 * shows them which door they are in, and overriding a stated choice because the
 * text looked wrong is exactly the invisible re-route this replaces.
 *
 * ⚠️ AND `chosen` IS VALIDATED, NOT TRUSTED. It arrives from navigation state
 * and query strings, so an unknown value must fall back to inference rather
 * than becoming a fifth door nothing downstream handles.
 */
export function readEntryDoor(input: {
  text?: string | null
  chosen?: string | null
}): DoorReading {
  const chosen = typeof input.chosen === 'string' ? input.chosen.trim() : ''
  if ((DOORS as readonly string[]).includes(chosen)) {
    return { door: chosen as EntryDoor, source: 'chosen' }
  }

  // ⚠️ NOTHING BELOW THIS LINE MAY RETURN 'product' OR 'browse'. Both are facts
  // about the creator — what they own, and that they have nothing yet — and
  // neither is legible in a sentence they typed.
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  const door: EntryDoor = looksLikeLink(text) ? 'reference' : 'idea'
  // ⚠️ NOT DEAD CODE, AND IT WAS MUTATED TO PROVE IT. Rewriting the line above
  // to infer 'product' from the word "my" leaves every test PASSING, because
  // this clamp catches it and returns 'idea'. Deleting this clamp as well is
  // what makes the product test fail. The line above states the rule; this is
  // what enforces it when someone edits the line above.
  if (!INFERABLE.includes(door)) return { door: 'idea', source: 'preselected' }
  return { door, source: 'preselected' }
}

/** What actually gets sent for a build, given the door.
 *
 *  ⚖️ THE ROUTING LIVES WITH THE DOOR RATHER THAN IN THE SCREEN. It was two
 *  ternaries on one line in `V2Create`, which is why nothing could test it. */
export function buildFieldsForDoor(door: EntryDoor, text: string): {
  reference_url: string
  reference_note: string
} {
  const t = text.trim()
  // ⚠️ A LINK TYPED INTO THE IDEA DOOR STAYS A NOTE. The creator chose the door;
  // silently promoting their text to a reference would spend the read budget on
  // a video they never asked us to watch.
  if (door === 'reference' && looksLikeLink(t)) return { reference_url: t, reference_note: '' }
  if (door === 'reference') {
    // Chose reference, typed something that is not a link. The screen refuses
    // this before it gets here; returning it as a note rather than as an empty
    // url means a bug upstream degrades to a working idea build, never to a
    // build with no subject at all.
    return { reference_url: '', reference_note: t }
  }
  return { reference_url: '', reference_note: t }
}

/** One row per entry, for the question the screen cannot currently answer:
 *  which door do creators actually take, and did they know the others were
 *  there? */
export interface EntryImpression {
  door: EntryDoor
  source: DoorSource
  /** Every door ON SCREEN at the moment of entry, including the one taken.
   *
   *  ⚠️ THE HALF THAT MAKES THE OTHER HALF READABLE. "80% take the reference
   *  door" means one thing if all four were visible and something else entirely
   *  if the other three were behind a toggle. A door count without the offer it
   *  was made against is a preference nobody expressed. */
  offered: EntryDoor[]
  /** Whether they had typed anything yet. Separates "opened on idea and typed"
   *  from "opened on idea and left". */
  hadText: boolean
}

/**
 * Build the impression, with the door list normalised.
 *
 * ⚠️ THE TAKEN DOOR IS FORCED INTO `offered`, because a door you went through
 * was on screen by definition, and a caller that forgets to list it would
 * otherwise write a row saying a creator took a door that was not being
 * offered. Dedup + fixed order make two rows for the same screen comparable
 * without the reader knowing how the caller happened to spell its array.
 */
export function entryImpression(input: {
  door: EntryDoor
  source: DoorSource
  offered?: readonly EntryDoor[]
  text?: string | null
}): EntryImpression {
  const seen = new Set<EntryDoor>(
    (input.offered ?? []).filter((d): d is EntryDoor => (DOORS as readonly string[]).includes(d)),
  )
  seen.add(input.door)
  return {
    door: input.door,
    source: input.source,
    offered: DOORS.filter((d) => seen.has(d)),
    hadText: typeof input.text === 'string' && input.text.trim() !== '',
  }
}

/** Every door, for a screen that means to offer all of them. */
export const ALL_DOORS: readonly EntryDoor[] = DOORS
