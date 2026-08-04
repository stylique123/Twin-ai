// THE TRANSCRIPT IS THE EDITOR — the client half.
//
// §4.8: "Strike a sentence → the cut is removed. Fix a word → the caption
// changes. Click a zoom marker → it is gone. No timeline, no scrubbing, no
// waveform — because every renderer decision already derives from the
// transcript, editing the words IS editing the video."
//
// The CONTRACT for what a click may mean lives in the worker
// (worker/src/jobs/reviewOverlay.ts) and is enforced there, at the edge, on
// every overlay from every source. This module does not re-decide any of it. It
// exists to do two things the server cannot:
//
//   1. turn a word list into the SENTENCES a person can point at, and
//   2. build an overlay that is already in the shape the server accepts —
//      sorted, non-overlapping, deduplicated.
//
// (2) is not defensive duplication. The server REFUSES an overlapping range
// rather than merging it, deliberately: "a client bug that merges quietly is a
// client bug forever". A UI that can produce overlapping ranges therefore
// produces a submit button that fails, and the creator's only feedback is an
// error on work they already did. Normalising here means the refusal stays a
// real integrity check instead of a routine UI failure.
import { getClient } from '../api'

export interface ReviewRemoveRange {
  startWordIndex: number
  endWordIndex: number
}
export interface ReviewRespelling {
  wordIndex: number
  text: string
}
export interface ReviewOverlayV1 {
  schemaVersion: 1
  removeWordRanges: ReviewRemoveRange[]
  keepSelections: number[]
  respellWords: ReviewRespelling[]
  dropZoomAnchors: number[]
}

export const EMPTY_REVIEW_OVERLAY: ReviewOverlayV1 = {
  schemaVersion: 1,
  removeWordRanges: [],
  keepSelections: [],
  respellWords: [],
  dropZoomAnchors: [],
}

/** Mirrors the server's caps so a UI can stop a creator BEFORE the refusal. */
export const MAX_REMOVE_RANGES = 200
export const MAX_KEEP_SELECTIONS = 200
export const MAX_RESPELLINGS = 200
export const MAX_DROPPED_ZOOMS = 64
export const MAX_RESPELL_CHARS = 120

// ---- what the screen reads --------------------------------------------------

export interface ReviewWord {
  index: number
  text: string
  startMs: number
  endMs: number
}

/** One pointable unit. A "sentence" here is a RUN OF SPOKEN WORDS, never a
 *  grammatical claim: the transcript has no reliable punctuation, so the split
 *  is by terminal punctuation where it exists and by a real pause where it does
 *  not. Both are visible in the recording; neither is inferred meaning. */
export interface ReviewSentence {
  index: number
  startWordIndex: number
  endWordIndex: number
  startMs: number
  endMs: number
  words: ReviewWord[]
}

/** A cut the DIRECTOR proposed, expressed in the units the screen can show. */
export interface ReviewDirectorCut {
  selectionIndex: number
  startMs: number
  endMs: number
  wordIndices: number[]
  kind: string
}

export interface ReviewZoomMarker {
  anchorWordIndex: number
  intensity: string
  reasonCode: string
}

export interface ReviewBundle {
  projectId: string
  status: string
  words: ReviewWord[]
  sentences: ReviewSentence[]
  directorCuts: ReviewDirectorCut[]
  zooms: ReviewZoomMarker[]
  /** What the overlay's indices are checked against, server-side. Carried so a
   *  screen built against a stale transcript is caught before it submits. */
  spokenWordCount: number
}

/** The pause that ends a sentence when punctuation does not.
 *
 *  600 ms is CHOSEN, not measured, and is the kind of number this project has
 *  been wrong about before — so it is a parameter with its default in one place
 *  rather than a literal in a loop. It only affects where the UI draws a break;
 *  no cut, caption or timing derives from it. */
export const SENTENCE_GAP_MS = 600

const TERMINAL = /[.!?…]["')\]]*$/

/**
 * Group words into pointable sentences.
 *
 * EVERY WORD LANDS IN EXACTLY ONE SENTENCE, in order, with no word dropped and
 * none duplicated — the invariant the whole screen rests on, because a strike is
 * expressed as the sentence's own word-index range. A word that fell out of the
 * grouping would be unstrikeable and invisible; one that appeared twice would be
 * struck by pointing at either copy.
 */
export function groupIntoSentences(
  words: readonly ReviewWord[], gapMs = SENTENCE_GAP_MS,
): ReviewSentence[] {
  const out: ReviewSentence[] = []
  let current: ReviewWord[] = []
  const flush = (): void => {
    if (current.length === 0) return
    out.push({
      index: out.length,
      startWordIndex: current[0].index,
      endWordIndex: current[current.length - 1].index,
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
      words: current,
    })
    current = []
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    current.push(w)
    const next = words[i + 1]
    const endsSentence = TERMINAL.test(w.text)
      || (next !== undefined && next.startMs - w.endMs >= gapMs)
    if (endsSentence) flush()
  }
  flush()
  return out
}

// ---- building the overlay ---------------------------------------------------

/**
 * Turn a screen's state into an overlay the server will accept.
 *
 * ADJACENT AND OVERLAPPING RANGES ARE MERGED HERE. Striking two neighbouring
 * sentences produces two ranges that touch, and the server refuses a touching
 * pair as a client bug — correctly, because it cannot tell an intentional pair
 * from a double-submitted one. Merging is only ever a UI concern: the resulting
 * span covers exactly the same words either way.
 *
 * A RESPELLING OF A STRUCK WORD IS DROPPED, not carried. The word has no
 * caption, so the respelling has nothing to change; sending it would ask the
 * server to validate an edit that provably cannot take effect, and leave the
 * creator wondering which of their two edits won.
 */
export function buildReviewOverlay(state: {
  struckWordRanges?: ReadonlyArray<ReviewRemoveRange>
  restoredSelections?: readonly number[]
  respellings?: ReadonlyArray<ReviewRespelling>
  droppedZoomAnchors?: readonly number[]
}): ReviewOverlayV1 {
  const ranges = [...(state.struckWordRanges ?? [])]
    .filter((r) => Number.isInteger(r.startWordIndex) && Number.isInteger(r.endWordIndex)
      && r.startWordIndex >= 0 && r.endWordIndex >= r.startWordIndex)
    .sort((a, b) => a.startWordIndex - b.startWordIndex)
  const merged: ReviewRemoveRange[] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r.startWordIndex <= last.endWordIndex + 1) {
      last.endWordIndex = Math.max(last.endWordIndex, r.endWordIndex)
      continue
    }
    merged.push({ startWordIndex: r.startWordIndex, endWordIndex: r.endWordIndex })
  }

  const isStruck = (i: number): boolean =>
    merged.some((r) => i >= r.startWordIndex && i <= r.endWordIndex)

  const respellByIndex = new Map<number, string>()
  for (const r of state.respellings ?? []) {
    if (!Number.isInteger(r.wordIndex) || r.wordIndex < 0) continue
    const text = r.text.trim()
    // Empty is a DELETION, which is a strike, not a respelling — and whitespace
    // inside would split one spoken word into two caption words, which is
    // inventing speech through the one door the contract leaves ajar. Both are
    // dropped here and refused server-side regardless.
    if (text === '' || /\s/.test(text) || text.length > MAX_RESPELL_CHARS) continue
    if (isStruck(r.wordIndex)) continue
    respellByIndex.set(r.wordIndex, text)
  }

  const uniqueSorted = (v: readonly number[] | undefined): number[] =>
    [...new Set((v ?? []).filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b)

  return {
    schemaVersion: 1,
    removeWordRanges: merged,
    keepSelections: uniqueSorted(state.restoredSelections),
    respellWords: [...respellByIndex.entries()]
      .map(([wordIndex, text]) => ({ wordIndex, text }))
      .sort((a, b) => a.wordIndex - b.wordIndex),
    dropZoomAnchors: uniqueSorted(state.droppedZoomAnchors),
  }
}

export function isEmptyReviewOverlay(o: ReviewOverlayV1): boolean {
  return o.removeWordRanges.length === 0 && o.keepSelections.length === 0
    && o.respellWords.length === 0 && o.dropZoomAnchors.length === 0
}

/** Which server caps an overlay would breach, named so a screen can say which. */
export function reviewOverlayOverCaps(o: ReviewOverlayV1): string[] {
  const over: string[] = []
  if (o.removeWordRanges.length > MAX_REMOVE_RANGES) over.push('removeWordRanges')
  if (o.keepSelections.length > MAX_KEEP_SELECTIONS) over.push('keepSelections')
  if (o.respellWords.length > MAX_RESPELLINGS) over.push('respellWords')
  if (o.dropZoomAnchors.length > MAX_DROPPED_ZOOMS) over.push('dropZoomAnchors')
  return over
}

// ---- reads and the submit ---------------------------------------------------

interface SpeechComponentWord {
  text?: unknown
  startMs?: unknown
  endMs?: unknown
}

function readWords(result: unknown): ReviewWord[] {
  const raw = (result as { words?: unknown } | null)?.words
  if (!Array.isArray(raw)) return []
  const out: ReviewWord[] = []
  for (const w of raw as SpeechComponentWord[]) {
    // A word missing a time is not shown rather than shown at zero. `?? 0` here
    // would put it at the top of the transcript, where striking it would strike
    // whatever really is at the top.
    if (typeof w?.text !== 'string' || !Number.isInteger(w?.startMs) || !Number.isInteger(w?.endMs)) continue
    out.push({ index: out.length, text: w.text, startMs: w.startMs as number, endMs: w.endMs as number })
  }
  return out
}

/**
 * Everything the review screen shows, read from the SAME rows the compiler
 * consumes: the pinned speech component and the recorded decision.
 *
 * THE INDICES MUST BE THE COMPILER'S. `readWords` walks the component's own
 * `words` array in order and numbers from zero, which is exactly what
 * `readComponentWords` does worker-side — so a word's index means the same
 * thing on the screen, in the overlay, and in the plan. Any filtering that
 * dropped a word here while the compiler kept it would silently shift every
 * later index, and a strike would land on the wrong sentence.
 */
export async function getReviewBundle(projectId: string): Promise<ReviewBundle | null> {
  const client = getClient()
  const { data: project, error: projectError } = await client
    .from('edit_projects').select('id, status, source_asset_id').eq('id', projectId).maybeSingle()
  if (projectError) throw new Error(projectError.message)
  if (!project) return null

  const [{ data: speechRow, error: speechError }, { data: decisionRow, error: decisionError }] =
    await Promise.all([
      client.from('media_analyses').select('result')
        .eq('source_asset_id', (project as { source_asset_id: string }).source_asset_id)
        .eq('component', 'speech').is('component_digest', null).maybeSingle(),
      client.from('edit_director_decisions').select('decision')
        .eq('edit_project_id', projectId).maybeSingle(),
    ])
  if (speechError) throw new Error(speechError.message)
  if (decisionError) throw new Error(decisionError.message)

  const result = (speechRow as { result?: unknown } | null)?.result ?? null
  const words = readWords(result)
  const candidates = Array.isArray((result as { candidates?: unknown } | null)?.candidates)
    ? ((result as { candidates: unknown[] }).candidates)
    : []
  const decision = (decisionRow as { decision?: Record<string, unknown> } | null)?.decision ?? null

  const selections = Array.isArray(decision?.selections) ? decision!.selections as unknown[] : []
  const directorCuts: ReviewDirectorCut[] = []
  selections.forEach((s, selectionIndex) => {
    // The decision records the candidate INDEX; the span and the words come
    // from the candidate itself. Reading the spans off the decision would use
    // its centisecond re-resolution record, which is not the authority on where
    // anything is (see editorCompileInput.ts).
    const idx = (s as { index?: unknown })?.index
    const c = typeof idx === 'number' ? candidates[idx] as Record<string, unknown> | undefined : undefined
    if (!c) return
    if (!Number.isInteger(c.startMs) || !Number.isInteger(c.endMs)) return
    directorCuts.push({
      selectionIndex,
      startMs: c.startMs as number,
      endMs: c.endMs as number,
      wordIndices: Array.isArray(c.wordIndices) ? (c.wordIndices as number[]).filter(Number.isInteger) : [],
      kind: typeof c.kind === 'string' ? c.kind : 'silence',
    })
  })

  const zoomRaw = Array.isArray(decision?.zoomRequests) ? decision!.zoomRequests as unknown[] : []
  const zooms: ReviewZoomMarker[] = zoomRaw.flatMap((z) => {
    const a = (z as { anchorWordIndex?: unknown })?.anchorWordIndex
    if (!Number.isInteger(a)) return []
    return [{
      anchorWordIndex: a as number,
      intensity: String((z as { intensity?: unknown }).intensity ?? 'subtle'),
      reasonCode: String((z as { reasonCode?: unknown }).reasonCode ?? 'emphasis_word'),
    }]
  })

  return {
    projectId,
    status: String((project as { status: string }).status),
    words,
    sentences: groupIntoSentences(words),
    directorCuts,
    zooms,
    spokenWordCount: words.length,
  }
}

/** Stable refusals `editor_submit_review` raises, so a screen can say what
 *  happened instead of showing a Postgres string. */
export type SubmitEditReviewRejection =
  | 'review_forbidden'
  | 'review_wrong_stage'
  | 'review_already_submitted'
  | 'review_not_ready'
  | 'review_cancelled'
  | 'review_overlay_invalid'
  | 'unknown'

export function classifySubmitEditReviewError(message: string): SubmitEditReviewRejection {
  const known: SubmitEditReviewRejection[] = ['review_forbidden', 'review_wrong_stage',
    'review_already_submitted', 'review_not_ready', 'review_cancelled', 'review_overlay_invalid']
  return known.find((k) => message.includes(k)) ?? 'unknown'
}

export class SubmitEditReviewError extends Error {
  readonly code: SubmitEditReviewRejection
  constructor(message: string) {
    super(message)
    this.name = 'SubmitEditReviewError'
    this.code = classifySubmitEditReviewError(message)
  }
}

/**
 * Submit the review and release the project into compiling.
 *
 * ONE CALL, because the overlay, the release and the resume job are one
 * transaction server-side (0102). A client that stored the overlay and then
 * asked to continue could leave a project holding an edit nothing will read.
 */
export async function submitEditReview(
  projectId: string, overlay: ReviewOverlayV1, spokenWordCount: number,
): Promise<void> {
  const { error } = await getClient().rpc('editor_submit_review', {
    p_project: projectId,
    p_overlay: overlay,
    p_spoken_word_count: spokenWordCount,
  })
  if (error) throw new SubmitEditReviewError(error.message)
}
