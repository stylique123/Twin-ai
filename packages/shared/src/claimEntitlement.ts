// DO WE HAVE THE RIGHT TO SAY THIS, IN THIS WAY, FOR THIS CREATOR?
//
// ⚠️ THE DEFECT THIS EXISTS FOR, MEASURED. A generated line read:
//
//     "those high-end, wired earbuds I used to swear by"
//
// cited to the stored item "wired vs wireless earbuds". The citation is REAL —
// the creator did cover that topic — so `substanceIssues` passed it. But what
// the evidence supports is "he made a video about this", and what the line says
// is "he owned these and loved them". Same entity, a claim two levels stronger.
//
// So TRACEABILITY AND ENTITLEMENT ARE DIFFERENT QUESTIONS:
//
//   traceability  did this come from real knowledge?          (substanceIssues)
//   entitlement   does that knowledge justify saying it THIS WAY?   (here)
//
// Nathan's line: traceability PASS, entitlement FAIL. Checking only the first
// is how eleven fabricated personal histories shipped past a green matrix.
//
// ⚖️ AND IT IS NOT A GUARD THAT ONLY COMPLAINS. Detection without blocking is a
// smoke alarm wired to a dashboard. Every verdict here carries a `reframe` —
// the same sentence rewritten down to the strength the evidence actually
// supports — so the caller can repair rather than discard. A beat deleted is a
// hole in the video; a beat reframed is still a video.
import { EVIDENCE_LEVELS, evidenceLevel, type EvidenceLevel } from './knowledgeResolver'
import type { KnowledgeItem } from './creatorKnowledge'

/** How strong a claim the SENTENCE makes about the creator. */
export const CLAIM_STRENGTHS = [
  /** "Let's talk about X." Naming a subject. Anyone may do this. */
  'discussion',
  /** "X is overrated." A position held. Needs to have been heard saying it. */
  'position',
  /** "I bought X and stopped." A life event. Needs to be on record. */
  'history',
] as const
export type ClaimStrength = (typeof CLAIM_STRENGTHS)[number]

/** The evidence level each claim strength requires. Deliberately 1:1 with the
 *  ladder — a stronger sentence needs a stronger source, with no exceptions and
 *  no "usually". */
export const REQUIRED_FOR: Record<ClaimStrength, EvidenceLevel> = {
  discussion: 'coverage',
  position: 'opinion',
  history: 'experience',
}

const RANK: Record<EvidenceLevel, number> = { coverage: 0, opinion: 1, experience: 2 }

// ⚠️ MEASURED AGAINST REAL SPEECH, AFTER BEING WRONG ABOUT IT.
//
// These patterns shipped tested only against sentences I wrote — in the shapes
// they already matched. Run against the first real transcripts pulled for these
// creators they scored 31 of 32 first-person sentences as `discussion`, and in
// production that verdict is what lets a beat speak on coverage-only evidence.
// Over 1,436 generated beats, 118 of the 145 first-person ones were waved
// through, including a fabricated history — "My 3D prints used to be so
// brittle, but then I started doing this one thing".
//
// The fixture is now 37 VERBATIM lines from real transcripts and real
// generations, hand-labelled with reasons, in
// `__tests__/fixtures/realSpeech.ts`. A pattern change that does not move that
// file is not evidence of anything.

/** First-person LIFE EVENTS. Widened from a fixed verb list to ordinary past
 *  narration, because that is how people actually recount doing something. */
const HISTORY =
  /\bI(?:'ve| have)\s+(?:ever\s+)?(?:seen|tried|been|done|bought|owned|used|switched|returned|tested|kept|ran|stopped|found)\b|\bI used to\b|\bused to be\b|\bmy own\b|\bwhen I (?:got|bought|switched|tried)\b|\bI\s+(?:just |recently |just recently |finally |already |once )*(?:bought|owned|used|switched|returned|tested|tried|quit|regret(?:ted)?|swore by|woke|took|got|made|went|saw|thought|began|started|meant|expected|paid|built|broke|fixed|ordered|kept|ran|stopped|found|had to|told you)\b|\bI (?:did|didn'?t|couldn'?t|wasn'?t|never) \w+/i

/** ⚖️ A POSITION IS NOT A HISTORY, and collapsing them would fail every honest
 *  talking-head script. "I think foldables are overrated" asserts a belief; "I
 *  bought a foldable and returned it" asserts an event. The first needs to have
 *  been heard; the second needs to have happened. */
//  ⚠️ THE ADVERB SLOT IS LOAD-BEARING. The first version matched `I think` and
//  missed "I STILL think wired sounds better" — which then fell through to
//  `discussion` and was waved past on coverage-only evidence. A stated position
//  that reads as mere discussion is the same escalation this file exists to
//  stop, running in the other direction.
const POSITION =
  /\bI (?:still |really |honestly |personally |genuinely |always |usually |kinda |kind of )*(?:think|reckon|believe|say|feel|would argue|like|love|hate|prefer|recommend|swear by|rely on)\b|\bI(?:'m| am) (?:so |really |honestly |not |kinda )*(?:shocked|glad|terrified|surprised|impressed|disappointed|excited|worried|sold|convinced|obsessed|a fan)\b|\bI(?:'d| would)? never\b|\bI'?d\b|\bin my (?:opinion|view|experience)\b|\b(?:is|are) (?:overrated|underrated|a scam|worth it|not worth it|the best|the worst)\b|\bhonestly,? |\bI'?m not going to lie\b|\bno-?brainer\b/i

/** ⚖️ NARRATION COMMITS THE CREATOR TO NOTHING. "I'm going to show you three
 *  things" describes the video, not the person, and escalating it would block
 *  the opening line of most scripts in the corpus — a worse failure than the
 *  gap being closed. Checked AFTER history, so "I told you guys I'd give away
 *  three PCs" stays the promise it is. */
const NARRATION =
  /\bI(?:'m| am)?\s*(?:'ll |will |going to |gonna |about to )\w+|\bI'll\b|\bI(?:'m| am) (?:talking|showing|telling|explaining|breaking|walking)\b|\bI can(?:'t|not) show\b|\bI don'?t know if (?:any of )?you\b|\blet me show\b/i

/** Self-introduction — "I'm Nathan Espinoza". ⚠️ CASE-SENSITIVE ON PURPOSE:
 *  written as `[A-Z]` under an `i` flag it matched any letter, and swallowed
 *  "I'm shocked", "I'm glad", "I'm not terrified" as narration. */
const SELF_INTRO = /\bI'm [A-Z][a-z]+/

/**
 * How strong is this sentence's claim about the creator?
 *
 * ⚖️ HISTORY IS CHECKED FIRST because "I used to think I needed every camera
 * accessory" matches both patterns, and it is a history: it asserts a past
 * state of the creator's life, not merely a present opinion.
 */
export function claimStrength(line: string): ClaimStrength {
  const s = String(line ?? '')
  if (HISTORY.test(s)) return 'history'
  // Narration only wins where no stance is also present: "I'm going to tell you
  // why I'd never buy one" is still a position wearing an announcement.
  if ((NARRATION.test(s) || SELF_INTRO.test(s)) && !POSITION.test(s)) return 'discussion'
  if (POSITION.test(s)) return 'position'
  return 'discussion'
}

/** The strongest level the supplied knowledge actually reaches. `null` when
 *  nothing was supplied — which is NOT the same as coverage, and must not be
 *  rounded up to it. */
export function bestAvailableLevel(supplied: readonly KnowledgeItem[]): EvidenceLevel | null {
  let best: EvidenceLevel | null = null
  for (const i of supplied) {
    const l = evidenceLevel(i)
    if (best === null || RANK[l] > RANK[best]) best = l
  }
  return best
}

export interface EntitlementVerdict {
  strength: ClaimStrength
  requires: EvidenceLevel
  available: EvidenceLevel | null
  entitled: boolean
  /** What the REGENERATOR must be told so this beat comes back honest. `null`
   *  when the beat is already entitled. Never a rewritten sentence — see the
   *  note above `repairFor`. */
  repair: string | null
  /** What to ask the CREATOR when only they can supply the missing substance.
   *  Present alongside `repair`: regenerate now, and offer the question too,
   *  because their real answer beats any reframing. */
  ask: string | null
}

// ⚠️ THERE IS NO REGEX THAT REWRITES A SENTENCE HONESTLY, AND I TRIED.
//
// The first version of this file did find-and-replace repairs. Run against the
// 11 real fabrications it "repaired" 11 of 11, and the output was unspeakable:
//
//   "I used to struggle with distractions"  ->  "I've looked at to struggle…"
//   "I used to think I needed every one"    ->  "people tend to swear by I needed…"
//
// A false sentence turned into an unreadable one is not a repair; it is the
// same beat failing in a way that is harder to notice. Rewriting prose requires
// the thing that wrote it, so this module DECIDES and INSTRUCTS, and the caller
// regenerates. What follows is the instruction, never a rewritten string.

/** What a regenerator must be told so the beat comes back honest. */
function repairFor(strength: ClaimStrength, available: EvidenceLevel | null): string {
  if (available === null) {
    return 'Nothing is on record for this creator. Rewrite this beat to carry no claim'
      + ' about them at all — describe the subject, not the person.'
  }
  if (strength === 'history') {
    return available === 'opinion'
      ? 'Rewrite WITHOUT any personal history. The creator is on record holding a view'
        + ' about this, so state the view ("I still think…") — never an action they took,'
        + ' owned, bought, tried or stopped.'
      : 'Rewrite WITHOUT any first-person claim. Only the subject is on record, not the'
        + ' creator\'s experience of it. Say what is true of the thing, not what they did with it.'
  }
  return 'Rewrite WITHOUT stating this as the creator\'s own position. It is a subject they'
    + ' have covered, not a view they are on record holding. Attribute it, or state it neutrally.'
}

/**
 * May this line be spoken by this creator, given this evidence?
 *
 * `supplied` must be the knowledge the writer was ACTUALLY GIVEN — checking
 * against a fuller store would license claims the writer could not have known,
 * which is the same mistake `substanceIssues` is careful to avoid.
 */
export function checkEntitlement(
  line: string,
  supplied: readonly KnowledgeItem[],
): EntitlementVerdict {
  const strength = claimStrength(line)
  const requires = REQUIRED_FOR[strength]
  const available = bestAvailableLevel(supplied)
  const entitled = available !== null && RANK[available] >= RANK[requires]

  if (entitled) return { strength, requires, available, entitled, repair: null, ask: null }

  return {
    strength, requires, available, entitled: false,
    repair: repairFor(strength, available),
    // ⚖️ ONE TARGETED QUESTION BEATS ANY REFRAMING. A creator naming the gadget
    // they actually regret produces a better video than the safest rewrite of a
    // claim they never made — so the question is offered even when a rewrite is
    // possible, rather than only as a last resort.
    ask: strength === 'history'
      ? 'This beat only works as something you have personally done. What is your real example?'
      : available === null
        ? 'Nothing on record supports this beat. What would you actually say here?'
        : null,
  }
}

export interface EnforcedBeat {
  line: string
  /** True when this beat must be regenerated before the script may ship. */
  mustRegenerate: boolean
  verdict: EntitlementVerdict
}

/**
 * ENFORCE, not report. Returns the beats with over-strong claims rewritten
 * down to what the evidence supports, plus the ones that need the creator.
 *
 * ⚖️ THE RULE THAT MAKES THIS SAFE: a beat is never deleted. Deleting leaves a
 * video shorter than its own hook promised, which the count contract exists to
 * prevent. It is rewritten, or it is escalated to a question.
 */
export function enforceEntitlement(
  lines: readonly string[],
  supplied: readonly KnowledgeItem[],
): { beats: EnforcedBeat[]; mustRegenerate: number; questions: string[]; blocked: boolean } {
  const questions: string[] = []
  const beats = lines.map((line) => {
    const verdict = checkEntitlement(line, supplied)
    if (verdict.ask && !questions.includes(verdict.ask)) questions.push(verdict.ask)
    return { line, mustRegenerate: !verdict.entitled, verdict }
  })
  const mustRegenerate = beats.filter((b) => b.mustRegenerate).length
  // ⚖️ BLOCKED MEANS BLOCKED. The script does not leave generation while a beat
  // claims more than the evidence allows. Reporting and shipping anyway is the
  // behaviour that let eleven fabricated histories through.
  return { beats, mustRegenerate, questions, blocked: mustRegenerate > 0 }
}

export { EVIDENCE_LEVELS }
