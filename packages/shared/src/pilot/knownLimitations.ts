// A LIMITATION NOBODY HAS WRITTEN DOWN BECOMES THE DESIGN.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// Deciding "not now, revisit later" is a reasonable call and a fragile one. The
// decision lives in a conversation, the conversation ends, and six weeks later
// the loose definition is simply what the field means -- not because anyone
// chose that, but because nobody wrote down that a choice was still open.
//
// ⚠️ SO A DEFERRAL IS A RECORD WITH A TRIGGER, NOT A COMMENT. Each entry says
// what is wrong, what was decided, and THE CONDITION UNDER WHICH IT MUST BE
// REVISITED. A test pins the open ones, so closing one is a deliberate edit
// somebody reviews rather than a thing that quietly stops being true.
//
// ⚖️ AND THE COST IS RECORDED HONESTLY. "Cheap to fix later" is the sentence
// that turns a deferral into a permanent state. If revisiting costs an analyzer
// version and a re-analysis, that belongs here, where the person deciding can
// see it.

export type LimitationStatus = 'OPEN' | 'RESOLVED'

export interface KnownLimitation {
  id: string
  /** What is actually wrong, in the terms a reader needs to judge it. */
  what: string
  /** What was decided, and why the obvious alternative was not taken. */
  decision: string
  /** The condition that must re-open this. Not a date -- a state of the world. */
  revisitWhen: string
  /** What revisiting actually costs. Understating this is how a deferral sticks. */
  cost: string
  status: LimitationStatus
}

export const KNOWN_LIMITATIONS: readonly KnownLimitation[] = Object.freeze([
  Object.freeze({
    id: 'TALKINGHEAD_LOOSER_THAN_INDUSTRY',
    what:
      "The visual pass asks 'Is someone speaking to camera?' (worker/src/visualPrompt.ts, "
      + 'FIELD_QUESTIONS) with no framing requirement. The industry definition of a '
      + "talking-head shot is stricter: the camera is positioned so only the speaker's head "
      + 'and shoulders are visible. A wide shot of someone addressing the camera from twenty '
      + "metres satisfies Twin's question and fails the industry one.",
    decision:
      'Keep the loose definition through the current visual pilot, and say so on the card: '
      + '"They do not have to be close up." Tightening the reviewer-facing sentence WITHOUT '
      + 'changing the question the model was asked would have the reviewer judging a stricter '
      + 'claim than the model answered, and every resulting label would record that gap as a '
      + 'MODEL error. That corrupts the measurement via a change that reads as an improvement. '
      + 'It was drafted, then rejected.',
    revisitWhen:
      'The first visual pilot run reaches LOCKED. Tightening mid-measurement is the expensive '
      + 'mistake; tightening between cohorts is cheap and comparability is already broken by '
      + 'the cohort change anyway.',
    cost:
      'An analyzer version bump. VISUAL_ANALYSIS_VERSION is stamped on every row as '
      + 'visualVersion AND feeds componentDigest(), so changing the question set without '
      + 'bumping makes old and new rows indistinguishable and yields the same digest for '
      + 'different content. Also: a shotType field added now is NOT retroactive -- references '
      + 'already analysed under visual-2 carry no shotType, and re-running frame analysis on a '
      + 'live pilot is not permitted. The payoff lands on the NEXT cohort.',
    status: 'OPEN',
  }),
  Object.freeze({
    id: 'PILOT_COHORT_IS_NOT_THE_PRODUCT_PATH',
    what:
      'The first visual pilot cohort was drawn from no_speech references ONLY. In practice that '
      + 'selects montage and B-roll -- aerial festival footage, cut sequences with no presenter -- '
      + 'and not the talking-head creator videos the product exists to remake. Two consequences '
      + 'were measured on run 7204de6f before any labelling: performance.talkingHead and '
      + 'performance.screenInteraction came back false on 8 of 8 references with NO VARIATION (16 '
      + 'claims that cannot discriminate anything), and because content_beats cannot appear in a '
      + 'no_speech draw, armComparison will report NOT RUN rather than a comparison. The owner met '
      + 'it directly at claim 13, asked whether "filming this would only need one location" about a '
      + 'drone montage, and said they did not know how to answer.',
    decision:
      'Label and complete this run anyway. Its labels are still evidence -- they measure how well '
      + 'the visual pass reads B-roll, which is a real question -- but they DO NOT measure the '
      + 'product path, and no report from this run may be read as if they did. The reviewer is told '
      + 'to answer "these frames cannot settle it" rather than guess when a montage genuinely '
      + 'cannot be judged from the cited frames; a forced guess is worse than a recorded '
      + 'non-answer, because it is indistinguishable from a real judgement afterwards.',
    revisitWhen:
      'The with-speech cohort is drawn (#475 ships the selection; the draw itself is the owner\'s '
      + 'Start button). That cohort is what measures the product path, and the two runs must be '
      + 'reported separately rather than pooled.',
    cost:
      'A fresh run: a new cohort, a new frame-analysis pass, and a second round of labelling. '
      + 'It cannot be recovered from run 7204de6f by re-analysis -- re-running frame analysis on a '
      + 'live pilot is not permitted, and re-drawing would discard the labels already given. '
      + 'Pooling the two cohorts to save a round would hide exactly the difference being measured.',
    status: 'OPEN',
  }),
])

export const openLimitations = (): readonly KnownLimitation[] =>
  KNOWN_LIMITATIONS.filter((l) => l.status === 'OPEN')

export const limitationById = (id: string): KnownLimitation | null =>
  KNOWN_LIMITATIONS.find((l) => l.id === id) ?? null
