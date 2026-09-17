// SHE ANSWERED THE QUESTION AND THEN COMPETED WITH A CAPTION FOR THE SLOT.
//
// ⚠️ THE DEFECT, AND IT IS THE CHEAPEST WASTE IN THE PRODUCT. A creator is asked
// three questions during onboarding, and two more while the scan runs. Each
// answer is stored as `source = 'asked'` — the only material in the whole store
// she typed herself, in her own words, knowing it would be used. It then enters
// the same pool as 374 caption-derived rows and is ranked by LEXICAL OVERLAP with
// the video's topic. An answer about what she spent money on shares no words with
// a video about rebinding a Bible, so it scores zero and loses its slot to "she
// made a video about leather".
//
// Measured: 21 `asked` rows exist, 21 of them are substance (100%, against 17%
// for captions), they average 166 characters (against 59), and 14 of them carry a
// first-person episode. It is the highest-yield material in the system by every
// measure taken, and it was competing on the one axis it is worst at.
//
// ⚖️ A RESERVATION, NOT A PROMOTION — the same shape as `SUBSTANCE_FLOOR` and
// `FIRST_PERSON_FLOOR`, and for the same reason. Asked rows do not jump ahead of
// relevance for the whole prompt; a bounded number of slots is simply not
// available for a caption row to take. A video about a product still gets the
// product in the slots that remain.
//
// ⚠️ AND IT IS BOUNDED, BECAUSE THE OPPOSITE FAILURE IS REAL. A creator who has
// answered ten questions must not get a prompt made of ten answers and nothing
// about the video she asked for. Four of ten leaves six for the topic.

/** What the reservation needs to know about an item. */
export interface AskedItem {
  kind?: string
  source?: string | null
}

/** How many of the ten slots may be held for answers she typed.
 *
 *  ⚖️ FOUR, AND THE NUMBER IS AN OBSERVATION. The median voice holds 10 knowledge
 *  items of which 0-2 are answers; four is above what almost any creator can
 *  currently fill, so today this reserves "all of them" for nearly everybody
 *  while still refusing to let a heavily-answered store crowd out the video's own
 *  subject. It is a CEILING on the reservation, never a quota to fill. */
export const ASKED_RESERVED_MAX = 4

/** Did the creator type this herself, in answer to a question we asked?
 *
 *  ⚠️ `source`, NOT `basis`. A typed answer is `stated`, and so is a claim
 *  transcribed from a video — `basis` says how strongly it is attested, and only
 *  `source` says who put it there. 0189 made 'asked' an allowed source for
 *  exactly this distinction. */
export function wasAsked(item: AskedItem): boolean {
  return String(item?.source ?? '') === 'asked'
}

/**
 * Split a ranked pool into the answers that hold slots and everything else.
 *
 * ⚠️ ORDER INSIDE EACH SIDE IS PRESERVED EXACTLY. The caller has already ranked
 * by relevance and rotated the ties; this is a stable partition, so WHICH answer
 * is reserved is still the caller's decision — including the rotation, so a
 * creator with six answers does not get the same four in every script.
 *
 * ⚖️ AND THE UNRESERVED ANSWERS STAY IN THE POOL. Being passed over for the
 * reservation must not remove an answer from the running; that would make a fifth
 * answer worth less than a caption, which is the opposite of the point.
 */
export function reserveAsked<T extends AskedItem>(
  ranked: readonly T[],
  cap: number,
  reservedMax: number = ASKED_RESERVED_MAX,
): { reserved: T[]; pool: T[] } {
  if (cap <= 0) return { reserved: [], pool: [] }
  const room = Math.max(0, Math.min(reservedMax, cap))
  const reserved: T[] = []
  const pool: T[] = []
  for (const item of ranked) {
    if (wasAsked(item) && reserved.length < room) reserved.push(item)
    else pool.push(item)
  }
  return { reserved, pool }
}
