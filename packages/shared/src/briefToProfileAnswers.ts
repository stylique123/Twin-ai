// THE BRIEF IS STORED LOOSE. THE PROFILE IS TYPED. THIS IS WHERE THEY MEET.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `BriefAnswers` types its enum-ish fields as `string | null` on purpose: §8a
// requires every "Other" to carry free text, so `audience` genuinely holds
// values that are not audience segments. `CreatorProfileAnswers` types the same
// fields as unions, because everything downstream switches on them.
//
// ⚠️ THE OBVIOUS SHORTCUT IS A CAST, AND A CAST IS THE BUG THIS REPO HAS
// SHIPPED BEFORE. `'DENIED' as PersonalUse` compiled, passed `npm run build`,
// and wrote a value the database's own CHECK constraint rejected. A cast here
// would let the free text a creator typed into "Other" arrive downstream
// wearing the type of an answer nobody gave.
//
// ⚖️ SO AN UNRECOGNISED VALUE BECOMES null, WHICH IS THE LITERAL TRUTH. It is
// not "consumers", it is not "mixed", and it is not a segment at all -- it is a
// sentence somebody typed. Every reader already treats null as unanswered and
// skips, so the creator gets today's behaviour rather than a wrong one.

import {
  AUDIENCE_SEGMENTS, AUDIENCE_KNOWLEDGE, DESIRED_FORMATS,
  type CreatorProfileAnswers,
} from './creatorProfileQuestions'
import { BRIEF_GOALS, type BriefAnswers } from './preScriptBrief'

/** Keep a value only if the union actually contains it. */
const oneOf = <T extends string>(
  allowed: readonly T[], v: string | null | undefined,
): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null)

/** ⚖️ FILTERED, NOT REJECTED. One unrecognised entry in a list must not discard
 *  the recognised ones beside it -- a creator who picked two real formats and
 *  something we no longer offer chose two real formats. */
const manyOf = <T extends string>(
  allowed: readonly T[], v: readonly string[] | null | undefined,
): readonly T[] | null => {
  if (!Array.isArray(v)) return null
  const kept = v.filter((x): x is T => (allowed as readonly string[]).includes(x))
  // ⚠️ AN EMPTY RESULT IS null, NOT []. Everywhere else in this codebase `[]`
  // and absent are the same fact, and profileAssembler already reads `[]` as
  // unanswered; returning null says the same thing in one voice.
  return kept.length > 0 ? kept : null
}

/**
 * Narrow a stored brief into the answers the profile assembler accepts.
 *
 * ⚠️ THIS ADDS NOTHING AND INFERS NOTHING. Every field either survives
 * recognition or becomes null. It is not the place to derive a segment from a
 * niche or a format from what they already post -- that is precisely the
 * observed-versus-wanted confusion `desiredFormats` was added to end.
 */
export function briefToProfileAnswers(brief: BriefAnswers | null | undefined): CreatorProfileAnswers {
  const b = brief ?? {}
  return {
    audience: oneOf(AUDIENCE_SEGMENTS, b.audience),
    audienceKnowledge: oneOf(AUDIENCE_KNOWLEDGE, b.audienceKnowledge),
    desiredFormats: manyOf(DESIRED_FORMATS, b.desiredFormats),
    contentGoals: manyOf(BRIEF_GOALS, b.contentGoals),
    // ⚠️ NOT TRIMMED TO MAX_CONTENT_GOALS HERE. The assembler already enforces
    // the cap, and a second place enforcing it is a second place to get it
    // wrong -- the drift this repo keeps finding between a rule and its copy.
  }
}
