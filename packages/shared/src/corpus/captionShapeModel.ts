// THE FOUR SHAPES THE MISSES NAMED, AND THE MODEL READ THAT REACHES THEM.
//
// ⚠️ THIS IS STAGE 1B AS THE OWNER DEFINED IT, WHICH IS NOT WHAT THAT NAME
// MEANS IN `captionShape.ts`. That file reserves "stage 1b" for reading the
// spoken opening out of a TRANSCRIPT, and says so where it explains why
// `confession` and `stakes_first` are absent. The decision taken on 2026-09-14
// is a different thing wearing the same label: aim a model at the CAPTION's
// first clause. Both are real work; only the second is built here. The
// collision is named rather than resolved so neither gets done twice by
// accident, and nothing in this file claims to have read a transcript.
//
// ── WHY A MODEL AT ALL, MEASURED ─────────────────────────────────────────────
//
// ⚠️ REGEX EXTENSION IS EXHAUSTED, AND THAT IS A MEASUREMENT RATHER THAN A
// PREFERENCE. Ten hand-written candidate shapes reached ~20% (itself inflated by
// loose SQL proxies), and first-clause extraction under the PATTERN set gained
// 6 -> 8 over 400 real titles: +2. `captionShape.ts` reaches the same verdict
// from the other end -- "no reasonable regex set reaches them ... that is a
// model-read decision".
//
// ⚠️⚠️ AND A SQL PROXY OVERESTIMATED THAT GAIN BY 19x. Proxies suggested +388;
// the real classifier over the same 400 titles gave +2. So no number in this
// file is a prediction of yield. Yield is unmeasured until a model actually
// runs, and saying otherwise would repeat the error.
//
// ── THE FIRST CLAUSE, NOT THE CAPTION ────────────────────────────────────────
//
// ⚖️ THE OWNER'S FRAMING, AND IT IS THE RIGHT ONE: the first clause is the hook;
// the rest of a caption is CTA, credit and hashtags. Handing a model 18 words of
// which 12 are tags pushes it toward the wrong label. So the model sees one
// clause and nothing else.
//
// ── NULL IS THE MAJORITY ANSWER ──────────────────────────────────────────────
//
// ⚠️⚠️ THE SINGLE MOST IMPORTANT FACT ABOUT THIS MODULE. Measured 2026-09-14
// over the 4,112 `no_pattern_match` rows: after removing tag piles, non-latin
// script and byline titles, 2,491 remain -- and a hand-read of 70 of THOSE
// found ~54% still not a hook at all. More than half of what a model sees here
// is correctly NOTHING.
//
// ⚖️ SO THIS IS SCORED ON A POOL WHERE NULL WINS, and a classifier that labels
// 90% of it is broken rather than good. `model_found_no_shape` is a first-class
// answer and is never folded into any other silence.

import { CAPTION_SHAPES, captionBody, isLikelyEnglish, MIN_CLASSIFIABLE_CHARS } from './captionShape'
import type { Assessed } from '../assessed'

/**
 * The shapes only a model read can reach.
 *
 * ⚠️ KEPT SEPARATE FROM `CAPTION_SHAPES` ON PURPOSE. That list means "what the
 * pattern set can emit", and a reader asking "could a regex have produced this?"
 * must still be able to get a true answer. Merging the two would destroy that
 * distinction for no gain; the union below is what the database constrains.
 *
 * ⚖️ EACH HAS SEVERAL OBSERVED INSTANCES, AND A FIFTH WAS DROPPED.
 * `imperative_to_audience` ("Someone Needs to Copy This Business") appeared
 * twice in seventy and overlaps `direct_address`. Four buckets with real
 * instances beat five where one is a guess: hand a model a bucket that does not
 * fit and it force-fits, and a forced label is a lie with `inferred` on it.
 */
export const MODEL_ONLY_SHAPES = [
  // "A Plan Is Not a Strategy" · "Most people are not missing information"
  'flat_declarative_claim',
  // "Two lines that changed my mindset forever" · "Day 5 at Meta as an engineer"
  'personal_result',
  // "Hate when this happens" · "The Second You Walk Into a Room She Just Cleaned"
  'relatable_moment',
  // "On dating white people" · "Finding a Lifestyle of Health"
  'topic_announcement',
] as const
export type ModelOnlyShape = (typeof MODEL_ONLY_SHAPES)[number]

/** Every value the `caption_shape` column accepts. Mirrors 0213's CHECK. */
export const ALL_CAPTION_SHAPES = [...CAPTION_SHAPES, ...MODEL_ONLY_SHAPES] as const
export type AnyCaptionShape = (typeof ALL_CAPTION_SHAPES)[number]

/**
 * ⚠️ BUMP WHEN THE TAXONOMY OR THE PROMPT CHANGES. Stored rows carry
 * `caption_shape_version`, and the backfill's UPDATE is guarded on it, so
 * raising this is what makes a re-run revisit rows already carrying a verdict.
 * A prompt change with no bump mixes two vocabularies in one table and there is
 * no query that separates them again.
 */
export const MODEL_SHAPE_VERSION = 3

/** Why a row was not sent to a model, or what came back instead of a shape. */
export type ModelRefusal =
  | 'not_a_hook'
  | 'model_found_no_shape'
  | 'model_unavailable'
  | 'model_reply_unreadable'

/**
 * ⚠️ CAPPED, BECAUSE THE CORPUS STORES SHAPES AND NEVER SENTENCES. A first
 * clause IS prose, so the clause itself is transient -- it goes into a prompt
 * and is never stored. What may be stored is a capped fragment, the same rule
 * and the same cap the pattern path already follows.
 */
export const MODEL_EVIDENCE_MAX = 48

/**
 * Sentence and clause terminators, in the order a caption actually uses them.
 *
 * ⚠️ `|` AND THE DASHES ARE HERE BECAUSE 491 ROWS ARE YOUTUBE-STYLE TITLES.
 * "How the food you eat affects your brain - Mia Nacamulli" is a real `how_to`
 * whose byline is not part of the hook, and "Beauty Secrets | Vogue" is a
 * channel, not a claim. Cutting at the separator keeps the hook and drops the
 * credit -- which is why these rows are CUT rather than refused.
 *
 * ⚖️ A QUESTION MARK IS KEPT WITH THE CLAUSE. It is the strongest shape signal a
 * caption carries, and a clause ending "...water?" means something different
 * from the same words without it.
 */
const CLAUSE_END = /[.!\n\r]|\s[|]\s|\s[—–]\s|\s-\s/

/**
 * The first clause of a caption, with tags, mentions and URLs already gone.
 *
 * ⚠️ TAGS COME OUT BEFORE THE CLAUSE IS CUT, NOT AFTER. A URL contains dots, so
 * cutting first would end the clause inside "https://example.com" and hand the
 * model "https://example" as a hook. `captionBody` is reused rather than
 * reimplemented so there is one definition of what a caption's words are.
 */
export function firstClause(raw: unknown): string {
  const body = captionBody(raw)
  if (body === '') return ''
  const m = body.match(CLAUSE_END)
  const cut = m === null || m.index === undefined ? body : body.slice(0, m.index)
  const kept = cut.trim()
  // Keep a trailing question mark, which the terminator search did not consume.
  const rest = body.slice(kept.length)
  const q = rest.startsWith('?') ? '?' : ''
  return (kept + q).trim()
}

/** A row worth spending a model call on, or the reason it is not. */
export type SpendVerdict =
  | { send: true; clause: string }
  | { send: false; reason: 'no_title' | 'empty_after_strip' | 'too_short' | 'not_english' | 'not_a_hook' }

/**
 * ⚠️ HIGH PRECISION ONLY. These fire on captions that are unambiguously not a
 * hook -- an instruction to the viewer, or a legal disclaimer. Nothing here
 * guesses at a "bare label" like "Portugal beautiful view", even though the
 * sample is full of them.
 *
 * ⚖️⚖️ BECAUSE THE PRE-FILTER IS FOR CERTAINTY, NOT FOR SAVINGS. A filter tuned
 * to cut spend removes borderline rows from the model's view, and if those rows
 * skew toward one shape then the yield that comes back is a biased sample
 * presented as a measurement -- the exact objection that put the `used`
 * classifier on hold. A bare label is cheap to ask about and the model can
 * answer `model_found_no_shape`, which is recorded. Guessing here is not.
 */
const NOT_A_HOOK: ReadonlyArray<RegExp> = [
  // CTA-only. Measured instances: "Check my profile", "click the link in my bio
  // to start your data analytics journey today", "Please watch until the end!",
  // "Give these a watch", "Link in bio".
  /^\s*(check (out )?my (profile|bio|page)|link in (my )?bio|click the link|please watch|give (these|this) a watch|follow for more|comment .{0,20}below)\b/i,
  // A legal or safety disclaimer. "This video is for educational and awareness
  // purposes only", "For education only", "please do not imitate".
  /\b(for (educational|education|entertainment)( and \w+)? purposes only|for education only|do not imitate|not medical advice)\b/i,
]

export function worthAModelRead(raw: unknown): SpendVerdict {
  if (typeof raw !== 'string' || raw.trim() === '') return { send: false, reason: 'no_title' }
  const clause = firstClause(raw)
  if (clause === '') return { send: false, reason: 'empty_after_strip' }
  // ⚠️ THE SAME SPLIT THE PATTERN PATH PAID FOR. `isLikelyEnglish` folds "too
  // short to judge" into its false, which is correct as a gate and a FALSE FACT
  // as an explanation -- it once recorded a 10-character English caption as
  // `not_english`. Length is asked first, separately.
  if (clause.length < MIN_CLASSIFIABLE_CHARS) return { send: false, reason: 'too_short' }
  if (!isLikelyEnglish(clause)) return { send: false, reason: 'not_english' }
  for (const re of NOT_A_HOOK) if (re.test(clause)) return { send: false, reason: 'not_a_hook' }
  return { send: true, clause }
}

/**
 * ⚠️ THE PROMPT NAMES NULL FIRST AND NAMES IT AS CORRECT. A list of twelve
 * labels with "or none" appended reads as twelve options and one excuse; the
 * measured truth is that most of this pool has no shape, and the instruction has
 * to say so in those words or the model will find something.
 *
 * ⚖️ AND IT ASKS FOR A FRAGMENT IT ALREADY HAS. The quote is what makes a label
 * checkable after the fact -- a verdict with no evidence cannot be audited, and
 * the fragment is capped on the way in so it can never become a stored sentence.
 */
export function buildClassifyPrompt(clauses: ReadonlyArray<string>): string {
  const lines = clauses.map((c, i) => `${i + 1}. ${c}`).join('\n')
  return [
    'You are labelling the SHAPE of the first clause of a social video caption.',
    '',
    'MOST OF THESE HAVE NO SHAPE. They are bare labels, credits, or descriptions',
    'of a scene. Answering "none" is the correct answer more often than any label,',
    'and it is never a failure. Do not reach for the closest label.',
    '',
    'Answer with a label ONLY when the clause plainly is one of these:',
    ...ALL_CAPTION_SHAPES.map((s) => `  ${s}`),
    '',
    'flat_declarative_claim - states a verdict as fact ("A Plan Is Not a Strategy")',
    'personal_result - the speaker\'s own outcome or experience ("Day 5 at Meta")',
    'relatable_moment - a shared small experience ("Hate when this happens")',
    'topic_announcement - names the subject, promises nothing ("On dating white people")',
    '',
    'Reply with one line per numbered item, exactly:',
    '  <number>|<label or none>|<short quote from the clause, or ->',
    '',
    lines,
  ].join('\n')
}

/** One parsed line of a model reply. */
export type ModelVerdict =
  | { shape: AnyCaptionShape; evidence: string }
  | { refusal: 'model_found_no_shape' }
  | { refusal: 'model_reply_unreadable' }

const SHAPES: ReadonlySet<string> = new Set(ALL_CAPTION_SHAPES)

/**
 * ⚠️ AN UNRECOGNISED LABEL IS UNREADABLE, NEVER "NO SHAPE". A model that invents
 * `question_hook` has not told us the clause has no shape -- it has told us the
 * prompt or the parser is wrong, which is OUR bug and needs a different fix from
 * an outage. Folding it into `model_found_no_shape` would hide a prompt defect
 * inside a number that looks like honest silence.
 */
export function parseVerdictLine(line: unknown): ModelVerdict {
  if (typeof line !== 'string') return { refusal: 'model_reply_unreadable' }
  const parts = line.split('|')
  if (parts.length < 2) return { refusal: 'model_reply_unreadable' }
  const label = (parts[1] ?? '').trim().toLowerCase()
  if (label === '' ) return { refusal: 'model_reply_unreadable' }
  if (label === 'none') return { refusal: 'model_found_no_shape' }
  if (!SHAPES.has(label)) return { refusal: 'model_reply_unreadable' }
  const quote = (parts[2] ?? '').trim()
  return {
    shape: label as AnyCaptionShape,
    evidence: (quote === '-' ? '' : quote).slice(0, MODEL_EVIDENCE_MAX),
  }
}

/**
 * The same read, wrapped so no downstream reader can promote it.
 *
 * ⚖️ `inferred`, ALWAYS, AND 0213 ENFORCES IT WITH A CHECK. A model reading a
 * caption is still guessing at a hook it has not heard. There is no path here
 * that produces `observed`.
 */
export function assessedModelShape(
  verdict: ModelVerdict,
  at: string,
): Assessed<AnyCaptionShape> | null {
  if (!('shape' in verdict)) return null
  const where = verdict.evidence === '' ? '' : ` reads "${verdict.evidence}"`
  return {
    basis: 'inferred',
    value: verdict.shape,
    evidence: `caption first clause${where}`.slice(0, 120),
    assessedAt: at,
  }
}
