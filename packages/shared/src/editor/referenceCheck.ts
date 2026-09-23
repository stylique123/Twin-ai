// REFERENCE VALIDATION — Phase 11 item 10, "reject unusable links before they
// poison a script".
//
// §5's third missed case, in full: *"A bad reference link — 12 minutes, no
// speech, a slideshow, a song. Currently goes straight in and produces
// confident nonsense."*
//
// ── WHAT "POISONS A SCRIPT" ACTUALLY MEANS ────────────────────────────────
//
// A reference is READ (transcribed, structured) and the blueprint writer adapts
// its shape. When the reference is a 12-minute podcast, the shape it adapts is a
// 12-minute podcast's. When it is a song, the transcript is a handful of
// mis-heard lyrics and the writer adapts a structure that was never there. The
// output is confident in both cases, because nothing anywhere said the input was
// unusable — which is the defect, not the bad link.
//
// ── "NOT REPORTED" IS NOT "TOO SHORT" ─────────────────────────────────────
//
// This module follows `assessProbe`'s hard-won rule (validateSource.ts): a
// MISSING measurement gets its own verdict and never borrows a real one. That
// bug told a creator "your video is too short" about a perfectly good sixty
// second take, because a container without a duration read as zero.
//
// So there are three outcomes and never two:
//
//   usable    — measured, and within every bound
//   unusable  — measured, and outside one; the reason NAMES which
//   unknown   — not measured; the caller may proceed, and must not claim it checked
//
// `unknown` deliberately does not block. A reference this cannot measure is a
// reference this has no opinion about, and refusing on no evidence would be the
// same overreach in the other direction.
//
// ── WHAT THIS MAY AND MAY NOT SAY ─────────────────────────────────────────
//
// §7c's honesty line governs: Twin may say what it CHECKED, never what will
// PERFORM. So every verdict here is a statement about the reference's
// MEASURABLE properties — its length, whether anyone speaks in it, how densely.
// None of them is a judgement about whether it is a good video, and the reason
// codes are named so a UI cannot accidentally imply one.

/** Every threshold, in one object, so a caller can show what was applied and a
 *  future measurement can move it without hunting through branches. */
export interface ReferenceBounds {
  /** Above this, the reference's SHAPE is not a short-form video's shape. */
  maxDurationSec: number
  /** Below this there is not enough structure to adapt anything from. */
  minDurationSec: number
  /** Fewer spoken words than this and there is no script to learn from. */
  minWords: number
  /** Words per minute below this is a slideshow, a montage or a song — a video
   *  whose content is not what is being said. */
  minWordsPerMinute: number
}

/**
 * CHOSEN, NOT MEASURED — the same honest state the caption floors are in.
 *
 * 180s: three minutes is already long for a short-form reference, and the
 * failure §5 names is twelve.
 * 6s: below this there is no structure to adapt.
 * 20 words / 30 wpm: ordinary conversational speech runs 120-160 wpm. 30 is far
 * enough below that only a video whose content ISN'T speech falls under it —
 * which is precisely the slideshow-and-song case.
 *
 * They are deliberately loose. A false "unusable" costs the creator the
 * reference they chose; a false "usable" costs them a slightly worse script.
 * Those are not symmetric, so the bounds sit where only the clear cases fail.
 */
export const DEFAULT_REFERENCE_BOUNDS: ReferenceBounds = {
  maxDurationSec: 180,
  minDurationSec: 6,
  minWords: 20,
  minWordsPerMinute: 30,
}

export type ReferenceVerdict = 'usable' | 'unusable' | 'unknown'

export type ReferenceReason =
  | 'ok'
  | 'too_long'
  | 'too_short'
  | 'no_speech'
  | 'sparse_speech'
  | 'duration_unknown'
  | 'word_count_unknown'

export interface ReferenceAssessment {
  verdict: ReferenceVerdict
  reason: ReferenceReason
  /** The measurements the verdict was drawn from, so a caller can show the
   *  creator what was looked at instead of only the conclusion. */
  measured: { durationSec: number | null; wordCount: number | null; wordsPerMinute: number | null }
  bounds: ReferenceBounds
}

export interface ReferenceFacts {
  /** Seconds. `null` when the transcript carries none — NOT zero. */
  durationSec?: number | null
  /** Spoken words the transcriber produced. `null` when unknown — NOT zero:
   *  "we did not count" and "nobody spoke" are different facts, and only one of
   *  them is about the video. */
  wordCount?: number | null
}

const realNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * Assess a reference from what the transcriber already produced.
 *
 * PURE, and takes facts rather than a transcript row, so the same rule can be
 * applied by the client before it spends a recreation, by an edge function
 * before it writes a script, and by a test without a database.
 *
 * ORDER MATTERS, and it is deliberate: the UNKNOWNS are decided first. A
 * reference with no duration and no words is `duration_unknown`, not
 * `no_speech` — reporting the absence of a measurement as a fact about the
 * video is the exact defect `assessProbe` was fixed for.
 */
export function assessReference(
  facts: ReferenceFacts, bounds: ReferenceBounds = DEFAULT_REFERENCE_BOUNDS,
): ReferenceAssessment {
  const durationSec = realNumber(facts.durationSec) ? facts.durationSec : null
  const wordCount = realNumber(facts.wordCount) && Number.isInteger(facts.wordCount)
    ? facts.wordCount : null
  const wordsPerMinute = durationSec !== null && durationSec > 0 && wordCount !== null
    ? Math.round((wordCount * 60) / durationSec)
    : null
  const measured = { durationSec, wordCount, wordsPerMinute }
  const out = (verdict: ReferenceVerdict, reason: ReferenceReason): ReferenceAssessment =>
    ({ verdict, reason, measured, bounds })

  // ── the unknowns, FIRST ──────────────────────────────────────────────────
  if (durationSec === null) return out('unknown', 'duration_unknown')
  if (wordCount === null) return out('unknown', 'word_count_unknown')

  // ── then the measured refusals ───────────────────────────────────────────
  // Length before speech: a 12-minute video is the wrong shape to adapt however
  // well-spoken it is, and saying "too long" is more useful than "sparse".
  if (durationSec > bounds.maxDurationSec) return out('unusable', 'too_long')
  if (durationSec < bounds.minDurationSec) return out('unusable', 'too_short')
  // NO speech at all is its own reason. "Nobody speaks in this" and "they speak
  // rarely" send the creator to different replacements.
  if (wordCount === 0) return out('unusable', 'no_speech')
  if (wordCount < bounds.minWords) return out('unusable', 'sparse_speech')
  if (wordsPerMinute !== null && wordsPerMinute < bounds.minWordsPerMinute) {
    return out('unusable', 'sparse_speech')
  }
  return out('usable', 'ok')
}

/**
 * What to tell the creator. One line per reason, and NONE of them is a
 * judgement about the video's quality.
 *
 * §7c: Twin may say what it CHECKED, never what will PERFORM. "This is 12
 * minutes long, so its structure is not one we can adapt" is a statement about
 * a measurement. "This is a bad reference" is a claim about a video nobody
 * measured, and it is also insulting to whoever made it.
 */
export const REFERENCE_REASON_TEXT: Record<ReferenceReason, string> = {
  ok: 'We read this one.',
  too_long: 'This one is long — its structure is a different shape from a short video, so we would be adapting the wrong thing.',
  too_short: 'This one is too brief for us to see any structure in it.',
  // ⚠️ "NOBODY SPEAKS IN THIS ONE" WAS A CLAIM ABOUT THEIR VIDEO, MADE FROM
  // OUR FAILED READ — and this file's own header forbids exactly that two
  // paragraphs above. `wordCount === 0` cannot tell a silent video apart from a
  // transcript that came back empty, and MEASURED, it is almost always the
  // second: across 1,188 `assess_reference` jobs, 154 finished with an error
  // set, and only SIX were genuine no-speech. The other 148 were fetch, auth or
  // extractor failures — 119 of them TikTok.
  //
  // ⚖️ SO IT SAYS WHAT WE DID, NOT WHAT THEY MADE. A creator told "nobody
  // speaks in this one" about a video of themselves talking learns that Twin is
  // wrong about things it can see; the same creator told "we did not find any
  // speech" learns that a read failed, which is true and which a retry can fix.
  // That is the difference between a refusal a retry disproves and one it does
  // not.
  no_speech: 'We did not find any speech in this one, so there is no script for us to follow.',
  sparse_speech: 'We found very little speech in this one — we would be guessing at the structure.',
  duration_unknown: 'We could not measure how long this one is.',
  word_count_unknown: 'We could not read the speech in this one.',
}

/**
 * May the blueprint writer USE this reference's transcript?
 *
 * `unknown` returns TRUE. A reference this could not measure is one it has no
 * opinion about, and withholding on no evidence would be the same overreach as
 * accepting on none — in the direction that silently discards the creator's own
 * choice. The caller still gets the verdict, so it can say what it checked.
 */
export function mayUseReference(assessment: ReferenceAssessment): boolean {
  return assessment.verdict !== 'unusable'
}

// ── ONE RULE FOR "LOW SPEECH", ONE SENTENCE, ONE OVERRIDE ─────────────────
//
// ⚠️ ITEM 24: THE SAME TIKTOK, TWO ATTEMPTS, TWO DIFFERENT ANSWERS. Local
// whisper on a music-led clip returns a handful of words on one run and nothing
// on the next. A handful reached `assessReference` as `sparse_speech` ("we found
// very little speech"); nothing threw `empty transcript`, the job FAILED, and
// the screen said "it may be private, deleted, or from an account that blocks
// us" — a different class, a false cause, and no way to go ahead. YouTube's
// "no captions we can read" and Instagram's "no speech we can read" took that
// same failed-job path. And "Use it anyway" existed only on the early visual
// check, so whether it was offered depended on which poll saw which answer.
//
// ⚖️ SO THE CLASS IS DECIDED BY ONE PURE FUNCTION over what the job returned,
// and every low-speech signal — zero words, too few words, too slow, or a
// reader that said there was no speech/captions/transcript — is ONE class with
// ONE sentence, and it is ALWAYS overridable. Length refusals are never
// overridable: a twelve-minute video is the wrong shape however it is read.
export type ReferenceReadClass =
  | 'usable'
  | 'low_speech'
  | 'too_long'
  | 'too_short'
  /** The job itself failed for a reason that is not about speech. */
  | 'unreadable'
  /** Finished with no transcript and no reason. */
  | 'empty'

export const LOW_SPEECH_TEXT =
  'We found little or no speech in this one, so there is not much script for us to follow. '
  + 'You can use it anyway — Twin keeps its shape and writes the words from your own material — or pick another.'

/** Every reader message that means "read fine, nothing (much) was said". */
const NO_SPEECH_ERROR = /no speech|has no speech|no captions|no_captions|empty transcript|no_speech/i

export function isNoSpeechReadError(error: string | null | undefined): boolean {
  return typeof error === 'string' && NO_SPEECH_ERROR.test(error)
}

export interface ReferenceReadInput {
  status: string | null | undefined
  error?: string | null
  transcriptId?: string | null
  durationSec?: number | null
  words?: number | null
}

export interface ReferenceReadVerdict {
  cls: ReferenceReadClass
  /** Null for `usable`, `unreadable` and `empty` — those keep their own copy. */
  message: string | null
  /** The one override rule: offered for low speech, and only for low speech. */
  overrideAllowed: boolean
}

export function classifyReferenceRead(input: ReferenceReadInput): ReferenceReadVerdict {
  const low: ReferenceReadVerdict = { cls: 'low_speech', message: LOW_SPEECH_TEXT, overrideAllowed: true }
  // A reader that said "no speech" is low speech whatever the job status.
  if (isNoSpeechReadError(input.error)) return low
  if (input.status === 'failed') return { cls: 'unreadable', message: null, overrideAllowed: false }
  if (input.status !== 'done') return { cls: 'unreadable', message: null, overrideAllowed: false }
  if (!input.transcriptId) return { cls: 'empty', message: null, overrideAllowed: false }
  const check = assessReference({ durationSec: input.durationSec ?? null, wordCount: input.words ?? null })
  if (check.reason === 'no_speech' || check.reason === 'sparse_speech') return low
  if (check.reason === 'too_long' || check.reason === 'too_short') {
    return { cls: check.reason, message: REFERENCE_REASON_TEXT[check.reason], overrideAllowed: false }
  }
  return { cls: 'usable', message: null, overrideAllowed: false }
}
