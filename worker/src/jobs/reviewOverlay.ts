// THE TRANSCRIPT IS THE EDITOR — the part of it that is not a screen.
//
// §4.8: "Strike a sentence → the cut is removed. Fix a word → the caption
// changes. Click a zoom marker → it is gone. No timeline, no scrubbing, no
// waveform — because every renderer decision already derives from the
// transcript, editing the words IS editing the video."
//
// A screen cannot be the first thing built here, because the hard question is
// not what the creator clicks. It is WHAT A CLICK IS ALLOWED TO MEAN, and that
// has to hold whether the click comes from the review screen, a future API, or
// a support tool operating on someone's behalf.
//
// ── THE DECISION IS IMMUTABLE, SO THIS IS A SEPARATE LAYER ─────────────────
//
// `edit_director_decisions` is append-only and hash-pinned: the record of what
// the MODEL chose is evidence, and evidence that can be edited afterwards is
// not evidence. So a creator's edits are never written back onto the decision.
// They are their own record, and `applyReviewOverlay` COMPOSES the two into the
// decision the compiler consumes.
//
// That composition is pure and deterministic, which is what lets a re-render be
// explained: given the pinned decision and the pinned overlay, the resulting
// plan is reproducible byte-for-byte, and "why is this cut here" always has an
// answer that names either the model or the person.
//
// ── WHAT AN EDIT MAY DO, AND THE ONE THING IT MAY NOT ─────────────────────
//
// It may REMOVE and it may CORRECT. It may not INVENT.
//
//   strike a sentence   -> more removal      (removeWordRanges)
//   restore a cut       -> less removal      (keepSelections)
//   fix a word          -> different LETTERS  (respellWords)
//   drop a zoom         -> fewer zooms       (dropZoomAnchors)
//
// Nothing here can add a word that was never spoken, move a word in time, or
// introduce a caption with no source. That is the same bound `A18h` asserts of
// the caption pipeline and the same one script re-spelling already lives under:
// the creator owns the WORDS' SPELLING and what SURVIVES, never what was said
// or when. An edit surface that could invent speech would let a support tool
// put words in a creator's mouth, and the resulting video would be indefensible
// precisely because it looked exactly like every other video.
//
// ── EMPTY IS BYTE-IDENTICAL, AND THAT IS THE SAFETY PROPERTY ──────────────
//
// An overlay with no edits must compose to the decision it was given, with the
// same bytes. Until a creator touches something, review changes nothing — so
// this can land ahead of the screen without altering a single render, and the
// test that proves it is the load-bearing one in the suite.

import { DirectorDecisionError, type DirectorDecision } from './directorContract.js'
import { canonicalJson, sha256Hex } from './editorManifest.js'

/** Bounds. Deliberately small: a review is edits, and a "review" that rewrites everything is a re-record. */
export const MAX_REMOVE_RANGES = 200
export const MAX_KEEP_SELECTIONS = 200
export const MAX_RESPELLINGS = 200
export const MAX_DROPPED_ZOOMS = 64
export const MAX_RESPELL_CHARS = 120

export interface ReviewRemoveRange {
  /** Inclusive spoken-word indices. A range is a STRUCK SENTENCE expressed in the only units the transcript has. */
  startWordIndex: number
  endWordIndex: number
}

export interface ReviewRespelling {
  wordIndex: number
  /** The letters the caption should show. Never a different word — see `assertRespellingIsSpellingOnly`. */
  text: string
}

export interface ReviewOverlayV1 {
  schemaVersion: 1
  removeWordRanges: ReviewRemoveRange[]
  /** Director selection indices the creator RESTORED. */
  keepSelections: number[]
  respellWords: ReviewRespelling[]
  /** `anchorWordIndex` values whose zoom the creator dismissed. */
  dropZoomAnchors: number[]
}

export const EMPTY_OVERLAY: ReviewOverlayV1 = {
  schemaVersion: 1,
  removeWordRanges: [],
  keepSelections: [],
  respellWords: [],
  dropZoomAnchors: [],
}

function bad(message: string, code = 'review_overlay_invalid'): never {
  throw new DirectorDecisionError(`review overlay: ${message}`, code)
}

const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

/**
 * Validate an overlay against the recording it claims to edit.
 *
 * FAILS CLOSED ON EVERY UNKNOWN. An index past the end of the transcript, a
 * duplicate, an inverted range, a respelling of a word that does not exist —
 * all rejected rather than ignored. Silently dropping an edit the creator made
 * is worse than refusing it: they watch the video, see their change missing,
 * and learn the review screen is advisory.
 */
export function validateReviewOverlay(raw: unknown, spokenWordCount: number): ReviewOverlayV1 {
  if (!raw || typeof raw !== 'object') bad('not an object')
  const o = raw as Record<string, unknown>
  if (o.schemaVersion !== 1) bad(`unsupported schemaVersion ${String(o.schemaVersion)}`)

  const arr = (v: unknown, name: string, max: number): unknown[] => {
    if (!Array.isArray(v)) bad(`${name} is not an array`)
    if ((v as unknown[]).length > max) bad(`${name} has ${(v as unknown[]).length} entries, over the ${max} cap`)
    return v as unknown[]
  }

  const removeWordRanges: ReviewRemoveRange[] = []
  for (const [i, r] of arr(o.removeWordRanges, 'removeWordRanges', MAX_REMOVE_RANGES).entries()) {
    const e = r as Record<string, unknown>
    if (!isIndex(e?.startWordIndex) || !isIndex(e?.endWordIndex)) bad(`removeWordRanges[${i}] has non-index bounds`)
    const start = e.startWordIndex as number, end = e.endWordIndex as number
    if (end < start) bad(`removeWordRanges[${i}] ends (${end}) before it starts (${start})`)
    if (end >= spokenWordCount) bad(`removeWordRanges[${i}] ends at ${end}, past the last spoken word ${spokenWordCount - 1}`)
    removeWordRanges.push({ startWordIndex: start, endWordIndex: end })
  }
  // Sorted and non-overlapping, so composition is order-independent and the
  // record reads the same way twice. Two ranges covering the same words are a
  // client bug, and a client bug that merges quietly is a client bug forever.
  removeWordRanges.sort((a, b) => a.startWordIndex - b.startWordIndex)
  for (let i = 1; i < removeWordRanges.length; i++) {
    if (removeWordRanges[i].startWordIndex <= removeWordRanges[i - 1].endWordIndex) {
      bad(`removeWordRanges overlap at index ${i}`)
    }
  }

  const keepSelections = arr(o.keepSelections, 'keepSelections', MAX_KEEP_SELECTIONS).map((v, i) => {
    if (!isIndex(v)) bad(`keepSelections[${i}] is not an index`)
    return v as number
  })
  if (new Set(keepSelections).size !== keepSelections.length) bad('keepSelections contains duplicates')

  const respellWords: ReviewRespelling[] = []
  for (const [i, r] of arr(o.respellWords, 'respellWords', MAX_RESPELLINGS).entries()) {
    const e = r as Record<string, unknown>
    if (!isIndex(e?.wordIndex)) bad(`respellWords[${i}] has a non-index wordIndex`)
    if ((e.wordIndex as number) >= spokenWordCount) {
      bad(`respellWords[${i}] targets word ${String(e.wordIndex)}, past the last spoken word ${spokenWordCount - 1}`)
    }
    if (typeof e.text !== 'string') bad(`respellWords[${i}].text is not a string`)
    const text = e.text as string
    if (text.length === 0) bad(`respellWords[${i}].text is empty — deleting a word is a removal, not a respelling`)
    if (text.length > MAX_RESPELL_CHARS) bad(`respellWords[${i}].text is ${text.length} chars, over ${MAX_RESPELL_CHARS}`)
    // ONE WORD, ALWAYS. Whitespace would let a "spelling fix" split one spoken
    // word into two caption words, which is inventing speech through the one
    // door left open.
    if (/\s/.test(text)) bad(`respellWords[${i}].text contains whitespace — a respelling is one word`)
    respellWords.push({ wordIndex: e.wordIndex as number, text })
  }
  const respellIdx = respellWords.map((r) => r.wordIndex)
  if (new Set(respellIdx).size !== respellIdx.length) bad('respellWords targets the same word twice')
  respellWords.sort((a, b) => a.wordIndex - b.wordIndex)

  const dropZoomAnchors = arr(o.dropZoomAnchors, 'dropZoomAnchors', MAX_DROPPED_ZOOMS).map((v, i) => {
    if (!isIndex(v)) bad(`dropZoomAnchors[${i}] is not an index`)
    return v as number
  })
  if (new Set(dropZoomAnchors).size !== dropZoomAnchors.length) bad('dropZoomAnchors contains duplicates')

  return {
    schemaVersion: 1,
    removeWordRanges,
    keepSelections: [...keepSelections].sort((a, b) => a - b),
    respellWords,
    dropZoomAnchors: [...dropZoomAnchors].sort((a, b) => a - b),
  }
}

/**
 * The overlay's digest — what the plan cites as `identity.reviewOverlaySha256`.
 *
 * TAKEN OVER THE VALIDATED FORM, never the raw one. Validation sorts every list
 * and drops nothing, so two clients that sent the same edits in a different
 * order produce the same digest and therefore the same plan identity — which is
 * the property that makes a re-compile provably reproducible rather than
 * accidentally so. Hashing the raw request would make the identity depend on
 * the order a UI happened to build an array in.
 *
 * `canonicalJson` is the codebase's ONE canonicalization, imported rather than
 * re-implemented, for the same reason the plan hash imports it.
 */
export function reviewOverlaySha256(overlay: ReviewOverlayV1): string {
  return sha256Hex(canonicalJson(overlay))
}

/** True when the overlay asks for nothing — the state every project is in until someone edits. */
export function isEmptyOverlay(o: ReviewOverlayV1): boolean {
  return o.removeWordRanges.length === 0 && o.keepSelections.length === 0
    && o.respellWords.length === 0 && o.dropZoomAnchors.length === 0
}

/**
 * Compose a validated overlay with the Director's decision.
 *
 * RETURNS THE SAME OBJECT when the overlay is empty. Not a copy — the identity
 * check is what makes "review changes nothing until it is used" provable rather
 * than asserted, and it makes the byte-identical test impossible to satisfy by
 * accident.
 *
 * ── WHICH FIELDS LAND HERE, AND WHICH CANNOT ──────────────────────────────
 *
 * Applied here, because the decision has a place for them:
 *   keepSelections      -> drops entries from `selections`
 *   dropZoomAnchors     -> drops entries from `zoomRequests`
 *   removeWordRanges    -> only its CONSEQUENCES: an emphasis on a struck word
 *                          is dropped, and a hook anchored on a struck word
 *                          falls back to keeping the real opening
 *
 * NOT applied here, and this is a limit of the decision's vocabulary rather
 * than an oversight:
 *   removeWordRanges (the removal itself)  The decision expresses removals as
 *     INDICES INTO THE DIRECTOR'S CANDIDATE LIST. A creator striking an
 *     arbitrary sentence is not choosing a candidate — there may be no
 *     candidate covering those words at all. Expressing it would mean either
 *     inventing a candidate (a decision the model never made, recorded as
 *     though it had) or widening `selections` to mean two different things.
 *     Both are worse than carrying it to the compile stage, which already
 *     works in spans and already enforces minKeptSegmentMs, maxRemovals and
 *     the cut-density ceiling against them.
 *   respellWords  Caption LETTERS, which the compiler owns — it already merges
 *     the script's spelling at the recording's time, and this is the same
 *     mechanism with the creator as the source instead of the script.
 *
 * Both are validated HERE regardless, so the bound is enforced at the edge even
 * though the effect lands later. A structure that is checked where it is
 * consumed rather than where it arrives is a structure that gets consumed
 * somewhere new, unchecked.
 */
export function applyReviewOverlay(
  decision: DirectorDecision, overlay: ReviewOverlayV1,
): DirectorDecision {
  if (isEmptyOverlay(overlay)) return decision

  // RESTORED SELECTIONS ARE DROPPED, not marked. The compiler reads
  // `selections` as the list of spans to remove, so "the creator put this back"
  // is expressed by the span no longer being in the list — the same shape the
  // Director's own output has, so nothing downstream learns a second vocabulary.
  const kept = new Set(overlay.keepSelections)
  const selections = decision.selections.filter((_, i) => !kept.has(i))

  const droppedZooms = new Set(overlay.dropZoomAnchors)
  const zoomRequests = decision.zoomRequests.filter((z) => !droppedZooms.has(z.anchorWordIndex))

  // An emphasis on a word the creator struck is meaningless, and leaving it
  // would emphasise whatever word slid into that index after the cut.
  const struck = (i: number) =>
    overlay.removeWordRanges.some((r) => i >= r.startWordIndex && i <= r.endWordIndex)
  const emphasisWordIndices = decision.emphasisWordIndices.filter((i) => !struck(i))

  // The hook opens on a spoken word. If the creator struck that word, the hook
  // has no anchor — fall back to keeping the real opening rather than opening
  // on a word that is no longer there.
  const hookStruck = decision.hookStartWordIndex !== null && struck(decision.hookStartWordIndex)

  return {
    ...decision,
    selections,
    zoomRequests,
    emphasisWordIndices,
    hookTreatment: hookStruck ? 'keep' : decision.hookTreatment,
    hookStartWordIndex: hookStruck ? null : decision.hookStartWordIndex,
  }
}
