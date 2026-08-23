// A REVIEWER WHO CAN SPOT THE CONTROLS HAS BEEN TOLD THE ANSWER.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// #57 asks whether Twin's automatic cuts sound bad. That number is worthless on
// its own: a person told "these are the cuts" will find something wrong with a
// share of them whatever the audio does. Controls -- positions where NO cut
// happened -- measure that floor, and the bad-cut rate is only interpretable as
// the difference between the two populations.
//
// ⚠️ THE FLOOR ONLY MEASURES ANYTHING IF THE CONTROLS ARE INDISTINGUISHABLE.
// `reviewItems` in scripts/cut-review.mjs returns every real cut and THEN every
// control, and relies on a comment asking callers to shuffle. That is not a
// guarantee. A reviewer who notices the run of real cuts ends partway through
// has learned which items are the baseline, and the baseline stops being one.
// This module makes the ordering a property with tests behind it instead of a
// note somebody has to remember.
//
// ⚖️ AND THE ORDER MUST BE STABLE. A reviewer who reloads mid-session and gets a
// different order is labelling a different packet, and "item 7" in the event log
// stops naming anything. The order is derived from the packet's own seed, so the
// same packet always presents the same way on any device.

/** One thing a person is asked to listen to. `isControl` is CARRIED, never shown. */
export interface CutReviewItem {
  render_id: string
  startMs: number
  endMs: number
  atMs: number
  offsetInClipMs: number
  isControl: boolean
}

/** What the reviewer sees. Note what is absent: there is no `isControl`. */
export type PresentedCutItem = Omit<CutReviewItem, 'isControl'> & { position: number }

/**
 * A deterministic 0..1 from a string, with no crypto import so this runs
 * unchanged in the browser. FNV-1a, then a mix -- adequate for shuffling a
 * review packet, and deliberately NOT used for anything security-bearing.
 */
function hash01(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // Mix so that near-identical seeds ("...:8" vs "...:9") do not sort adjacently.
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 0x100000000
}

/**
 * Order the items so a reviewer cannot tell a real cut from a control.
 *
 * ⚠️ SORTS BY A KEYED HASH, NOT BY A SHUFFLE OVER INDEX. Shuffling the array as
 * given would still be a permutation OF a cuts-then-controls list; if the hash
 * were seeded by index alone, every packet of the same size would interleave the
 * same way and the pattern would be learnable across renders. The key includes
 * the item's own position in time, so the ordering differs per packet.
 *
 * ⚠️ AND IT IS TOTAL. Two items with an equal hash fall back to `atMs`, so the
 * result never depends on the input array's incoming order -- otherwise the
 * cuts-first bias could survive a tie.
 */
export function presentationOrder(items: CutReviewItem[], seed: string): CutReviewItem[] {
  return [...(items ?? [])]
    .map((item) => ({ item, k: hash01(`${seed}:${item.render_id}:${item.atMs}`) }))
    .sort((a, b) => (a.k - b.k) || (a.item.atMs - b.item.atMs))
    .map(({ item }) => item)
}

/**
 * Strip what the reviewer must not see.
 *
 * ⚠️ THIS IS THE ONLY THING THE PAGE MAY RENDER FROM. Handing a component the
 * full item and trusting it not to read `isControl` is the same class of mistake
 * as the ordering comment above: a guarantee that depends on nobody making a
 * change later. Deleting the field means a leak is a type error.
 */
export function presentToReviewer(items: CutReviewItem[], seed: string): PresentedCutItem[] {
  return presentationOrder(items, seed).map((item, i) => {
    // Destructured out rather than deleted, so the omission is visible here.
    const { isControl: _withheld, ...rest } = item
    return { ...rest, position: i + 1 }
  })
}

/**
 * THE ONE QUESTION, IN PLAIN ENGLISH.
 *
 * The hard UX rule applies to the owner labelling too: a first-time reader must
 * understand every choice in under two seconds. "Artefact", "transient" and
 * "splice" are all words that would have to be explained.
 *
 * ⚠️ "I can't tell" IS A REAL ANSWER, NOT A SKIP. A cut that is genuinely
 * ambiguous is evidence about the editing; dropping those would compute a rate
 * over only the clips that were obvious, and a denominator that excludes the
 * hard cases is not a pass.
 */
export const CUT_ANSWERS = Object.freeze({
  FINE: 'Sounded fine',
  WRONG: 'Sounded wrong',
  UNSURE: "I can't tell",
} as const)

export type CutAnswer = keyof typeof CUT_ANSWERS

export const CUT_QUESTION = 'Did the audio sound wrong anywhere in that clip?'

export const CUT_ANSWER_KEYS: Readonly<Record<string, CutAnswer>> = Object.freeze({
  '1': 'FINE', '2': 'WRONG', '3': 'UNSURE',
})
