// SAY BACK WHAT THEY TOLD YOU, AND ONLY THAT.
//
// ⚠️ MEASURED ON THE ONBOARDING AUDIT: 0 stated, 34 guessed. Twin holds real
// answers from signup — who they want to reach, how much those people already
// know, what they want content to do — and the creator never once sees them
// again. So a script arrives and reads as though it were written for nobody in
// particular, and the person has no way to tell whether it missed because the
// writer is weak or because it never knew.
//
// ⚖️ WAVE 5.2: RECOGNITION BEFORE THE SCRIPT. Before anything is written, the
// screen says what it already knows, and cites where it came from: "you told me
// this at signup". That sentence is a promise about provenance, which is why
// this module exists rather than a line of JSX — the rule has to be enforceable.
//
// ⚠️ THE ONE RULE: NOTHING UNANSWERED MAY APPEAR HERE, EVER. An inference is not
// a thing they told us, and citing a guess as their own words is worse than
// staying quiet: it teaches them that the product's claims about them cannot be
// trusted, on the one screen built to earn the opposite. A null field produces
// nothing. There is no fallback, no default and no "probably".
//
// ⚖️ AND A CHIP LABEL IS NOT A SENTENCE CLAUSE. The onboarding screen's labels
// ("Founders / business owners") are answers to pick from; these are clauses in
// a sentence said back to a person ("founders and business owners"). Reusing the
// chip strings would produce "You make videos for Founders / business owners" —
// which is the shape of a form, not of recognition. The two are different
// artefacts on purpose; what is pinned is that EVERY enum value has a clause,
// so a new option can never render as a blank.

import type { BriefGoal } from './preScriptBrief'
import type {
  CreatorProfileAnswers, AudienceSegment, AudienceKnowledge,
} from './creatorProfileQuestions'

/** Where a stated fact came from. One value today; named rather than implied so
 *  a second source (the scan) cannot later be cited as something they said. */
export type RecognitionSource = 'signup'

export interface RecognitionLine {
  /** A whole sentence, ready to render. */
  text: string
  source: RecognitionSource
}

const AUDIENCE_CLAUSE: Record<AudienceSegment, string> = {
  consumers: 'everyday people',
  founders: 'founders and business owners',
  professionals: 'professionals in your field',
  creators: 'other creators',
  companies: 'companies and teams',
  students: 'people who are learning',
  enthusiasts: 'hobbyists and enthusiasts',
  mixed: 'a mix of people',
}

const KNOWLEDGE_CLAUSE: Record<AudienceKnowledge, string> = {
  beginners: 'who are mostly beginners',
  basics: 'who already know the basics',
  experienced: 'who are mostly experienced',
  mixed: 'at a mix of levels',
}

const GOAL_CLAUSE: Record<BriefGoal, string> = {
  followers: 'reach more people',
  authority: 'build trust in what you know',
  educate: 'teach people something',
  leads: 'bring in leads or clients',
  sell: 'sell what you offer',
  entertain: 'entertain people',
  personal_brand: 'build your name',
}

/** ⚖️ TWO IS THE CAP, AND IT IS A JUDGEMENT. One line reads as a courtesy; two
 *  reads as attention; four reads as a dossier being recited at somebody who
 *  came here to make a video. */
export const MAX_RECOGNITION_LINES = 2

const clause = <K extends string>(map: Record<K, string>, key: unknown): string | null =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key)
    ? map[key as K]
    : null

/**
 * The sentences Twin is entitled to say back, in priority order.
 *
 * ⚠️ ORDER IS BY HOW MUCH THE ANSWER CHANGES A SCRIPT, not by the order the
 * questions were asked. Who the video is for decides register, examples and
 * depth; what it is for decides the ending. Everything else is quieter than
 * both and is deliberately not cited — a recognition line that says something
 * inconsequential spends the creator's trust on nothing.
 */
export function recognitionLines(
  answers: CreatorProfileAnswers | null | undefined,
  max: number = MAX_RECOGNITION_LINES,
): RecognitionLine[] {
  const a = answers ?? {}
  const out: RecognitionLine[] = []

  const who = clause(AUDIENCE_CLAUSE, a.audience)
  if (who) {
    // ⚖️ THE KNOWLEDGE HALF IS AN EXTENSION, NEVER A LINE OF ITS OWN. "Mostly
    // beginners" without saying beginners at WHAT is not recognition, it is a
    // fragment of a form.
    const depth = clause(KNOWLEDGE_CLAUSE, a.audienceKnowledge)
    out.push({ text: `You make videos for ${who}${depth ? ` ${depth}` : ''}.`, source: 'signup' })
  }

  const goals = Array.isArray(a.contentGoals)
    ? a.contentGoals.map((g) => clause(GOAL_CLAUSE, g)).filter((c): c is string => c !== null)
    : []
  if (goals.length > 0) {
    out.push({ text: `You want your content to ${goals.join(' and ')}.`, source: 'signup' })
  }

  // ⚠️ A NEGATIVE OR SILLY CAP IS A CALLER BUG, and the safe reading of one is
  // "say nothing" rather than "say everything".
  if (!Number.isFinite(max) || max <= 0) return []
  return out.slice(0, Math.floor(max))
}

/** What the screen prints above the lines. Kept here so the citation and the
 *  rule that licenses it cannot drift apart. */
export const RECOGNITION_CITATION = 'You told me this at signup'
