// WHAT WE ACTUALLY HAVE DECIDES, AND THE DISAGREEMENT IS RECORDED.
//
// ⚠️ STORED transcript_chars IS NOT EVIDENCE ABOUT THE TRANSCRIPT WE WOULD GET.
// The #66 eval proved it at cost: a reference stored as 133 characters came back
// as 5, and one stored as "substantial" (>=400) also fell under the floor. 7 of
// 40 stratified references were selected on stored metadata, paid for a
// download, and produced no data point.
//
// ⚖️ SO STORED CHARS BECOME A HINT and the durable cached transcript becomes the
// TRUTH. The hint is still useful — it is how you decide what to look at first —
// but nothing may be ROUTED on a number nobody re-checked.
//
// ⚠️ AND THE NORMALISATION IS SHARED, NOT RE-DECLARED. If this module trimmed
// differently from the code that actually gates the model call, the recorded
// decision would describe a threshold nobody applies. That is the same mistake
// as measuring a copy of the prompt.

/** ⚠️ THE ONE NORMALISATION, exported so the eligibility test and the recorded
 *  decision cannot drift apart. Mirrors what assessReference has always done
 *  before its floor check. */
export const normalizeTranscript = (text: string | null | undefined): string => (text ?? '').trim()

/** Below this there is no speech worth extracting structure from. Mirrors
 *  assessReference's MIN_TRANSCRIPT_CHARS; passed explicitly into decisions so a
 *  later change cannot silently reinterpret rows written under the old floor. */
export const SPEECH_FLOOR_CHARS = 120

export type RoutingDecision = 'speech_extraction' | 'visual_route'

export interface RoutingMeasurement {
  url: string
  /** ⚖️ THREE SEPARATE AXES. `platform` is what the media IS, `downloadRoute` is
   *  how Twin FETCHED it, `source` is how the TEXT was produced. `local_whisper`
   *  spans every platform, so a merged bucket could not tell a Whisper problem
   *  from a TikTok problem. */
  platform: string | null
  downloadRoute: string | null
  source: string | null
  /** What the old metadata claimed. `null` is "no stored count", which is not
   *  the same fact as a stored zero. */
  storedChars: number | null
  actualChars: number
  deltaChars: number | null
  /** actual/stored. `null` when stored is null OR zero — a ratio against zero is
   *  not infinite drift, it is an undefined question. */
  ratio: number | null
  routingDecision: RoutingDecision
  thresholdChars: number
}

/**
 * Decide from the transcript in hand, and describe the disagreement with what
 * was remembered.
 *
 * ⚠️ PURE. It performs no IO and reads no clock, so the decision can be tested
 * against every awkward pair — absent stored count, stored zero, stored far
 * above actual — without a database.
 */
export function decideRouting(args: {
  url: string
  transcriptText: string | null | undefined
  storedChars: number | null | undefined
  platform?: string | null
  downloadRoute?: string | null
  source?: string | null
  thresholdChars?: number
}): RoutingMeasurement {
  const threshold = args.thresholdChars ?? SPEECH_FLOOR_CHARS
  const actualChars = normalizeTranscript(args.transcriptText).length
  const stored = typeof args.storedChars === 'number' ? args.storedChars : null

  return {
    url: args.url,
    platform: args.platform ?? null,
    downloadRoute: args.downloadRoute ?? null,
    source: args.source ?? null,
    storedChars: stored,
    actualChars,
    deltaChars: stored === null ? null : actualChars - stored,
    // ⚖️ ZERO IS NOT A DENOMINATOR. Reporting Infinity here would put a value in
    // a numeric column that every later aggregate would have to special-case,
    // and "we had nothing and now have something" is already said by the delta.
    ratio: stored === null || stored === 0 ? null : actualChars / stored,
    // ⚠️ THE DECISION FOLLOWS THE MEASUREMENT, and the database constraint
    // asserts the same thing independently. Two places agreeing is the point:
    // a routing decision that disagreed with its own evidence would be a row
    // that justifies nothing.
    routingDecision: actualChars >= threshold ? 'speech_extraction' : 'visual_route',
    thresholdChars: threshold,
  }
}

/** ⚖️ `visual_route` IS A DESTINATION, NOT A BIN. The #66 attrition and the 332
 *  known no-speech references are a population the frames pass (#56) can still
 *  read. Naming this `skipped` would have kept them a graveyard. */
export const goesToFrames = (m: RoutingMeasurement): boolean => m.routingDecision === 'visual_route'
