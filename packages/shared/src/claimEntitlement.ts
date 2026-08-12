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

/** First-person LIFE EVENTS — STRUCTURAL, not lexical.
 *
 *  ⚠️ THE VERB LIST WAS THE PROBLEM. Tuned against 39 real lines it scored
 *  39/39 and then 14/25 on two creators it had never seen: "I've added a Ryzen
 *  7", "I was looking for a laptop", "I've talked to their representatives" —
 *  all ordinary, all missed. A list cannot close over open-class speech.
 *
 *  ⚖️ THE AUXILIARY CARRIES THE TENSE, NOT THE VERB. `I've <anything>` and
 *  `I was <anything>` are histories whatever fills the slot. Keying on that
 *  took held-out accuracy from 14/25 to 23/25 with ZERO narration false
 *  positives, and moved the escalation blast radius over 223 stored scripts
 *  from 4% of beats to 6% — while the refund bar moved by one script. */
const HISTORY =
  /\bI(?:'ve| have| had| was| were)\s+\w+|\bI\s+\w+ed\b|\bI (?:\w+ly |already |just |recently |finally |once )*(?:bought|owned|used|switched|returned|tested|quit|regret(?:ted)?|stopped|took|got|made|went|saw|thought|began|ran|kept|told|found|woke|paid|built|broke|felt|knew|meant|left|wrote|spent|sold|read|held|gave|came|did|didn'?t|couldn'?t|wasn'?t|never)\b|\bI used to\b|\bmy own\b|\bthat I have\b|\bwhen I (?:got|bought|switched|tried)\b|\bI (?:\w+ly )?(?:haven'?t|hadn'?t|didn'?t|wasn'?t|couldn'?t)\b/i

/** ⚖️ A POSITION IS NOT A HISTORY, and collapsing them would fail every honest
 *  talking-head script. "I think foldables are overrated" asserts a belief; "I
 *  bought a foldable and returned it" asserts an event. The first needs to have
 *  been heard; the second needs to have happened. */
//  ⚠️ THE ADVERB SLOT IS LOAD-BEARING. The first version matched `I think` and
//  missed "I STILL think wired sounds better" — which then fell through to
//  `discussion` and was waved past on coverage-only evidence. A stated position
//  that reads as mere discussion is the same escalation this file exists to
//  stop, running in the other direction.
/** The unambiguous core of HISTORY — a rhetorical wrapper may not hide one of
 *  these. "Let me tell you, I bought three of them" is still a purchase. */
const HISTORY_STRICT =
  /\bI(?:'ve| have)\s+(?:bought|owned|used|switched|returned|tested|tried)\b|\bI used to\b|\bI (?:bought|owned|switched|returned|tested|quit|regret(?:ted)?)\b/i

/** ⚠️ "I told you guys I'd give away three PCs" is a promise they made; "what if
 *  I told you…" is a hook. The SAME two words, opposite meanings — so the
 *  declarative form guards only the NARRATION branch, never the rhetorical one,
 *  where `told you` is the exact string being excluded. */
const DECLARED_PROMISE = /\bI told you (?:guys |all |folks )?(?:I|that|about)\b/i

const POSITION =
  /\bI (?:\w+ly |still |always |usually |often |sometimes )*(?:think|reckon|believe|feel|like|love|hate|prefer|recommend|rate|adore|enjoy|swear by|rely on|care|don'?t care|would argue)\b|\bI(?:'m| am) (?:\w+ly |not |so |a )*(?:shocked|glad|terrified|surprised|impressed|disappointed|excited|worried|sold|convinced|obsessed|sure|not sure|fan)\b|\bI(?:'d| would)?(?:'?m)? (?:never|not)\b|\bI would ?n'?t\b|\bI wouldn't\b|\bI(?:'m| am) (?:staying away|steering clear|skipping|avoiding|passing)\b|\b(?:hard |soft )?pass(?: for me)?\b|\ba pass for me\b|\bI'?d skip\b|\bI'?d\b|\bmy favou?rite\b|\bin my (?:opinion|view|experience)\b|\b(?:is|are) (?:overrated|underrated|a scam|worth it|not worth it|the best|the worst)\b|\bhonestly,? |\bI'?m not going to lie\b|\bno-?brainer\b/i

/** ⚖️ NARRATION COMMITS THE CREATOR TO NOTHING. "I'm going to show you three
 *  things" describes the video, not the person, and escalating it would block
 *  the opening line of most scripts in the corpus — a worse failure than the
 *  gap being closed. Checked AFTER history, so "I told you guys I'd give away
 *  three PCs" stays the promise it is. */
const NARRATION =
  /\bI(?:'m| am)?\s*(?:'ll |will |going to |gonna |about to )|\bI'll\b|\bI(?:'m| am) (?:talking|showing|telling|explaining|breaking|walking)\b|\bI can(?:'t|not) show\b|\bI don'?t know if (?:any of )?you\b|\blet me know\b|\blet me show\b|\bin (?:today'?s|this|the next|our) video\b|\bcurious to hear\b|\bwhat (?:do )?you (?:guys )?think\b|\bin the comments\b|\b(?:items|things|products|ways|tips|gadgets|reasons)\s+(?:that\s+)?I\s+(?:\w+ly\s+|just\s+|recently\s+)*found\b/i

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
/** ⚠️ RHETORICAL FRAMES ADDRESSED TO THE VIEWER, checked BEFORE history.
 *  "What if I told you…" is one of the most common hooks in short-form, and the
 *  widened history pattern read `told you` as a past speech act about the
 *  creator's life. Measuring the widening's blast radius before shipping it is
 *  what caught this — the same crying-wolf failure the sell pattern had. */
const RHETORICAL =
  /\bwhat if I told you\b|\blet me tell you\b|\bI'?ll tell you\b/i

export function claimStrength(line: string): ClaimStrength {
  const s = String(line ?? '')
  // A rhetorical frame recounts nothing — unless it wraps an unambiguous one.
  if (RHETORICAL.test(s) && !HISTORY_STRICT.test(s)) return 'discussion'
  // ⚖️ NARRATION BEFORE HISTORY, because a structural tense rule fires on
  // "in today's video, I wanted to make a review" — an intention about the
  // upload, not an event in a life. It never beats a stance: "I'm going to tell
  // you why I'd never buy one" is a position wearing an announcement.
  if ((NARRATION.test(s) || SELF_INTRO.test(s)) && !POSITION.test(s) && !HISTORY_STRICT.test(s) && !DECLARED_PROMISE.test(s)) return 'discussion'
  if (HISTORY.test(s) && !NARRATION.test(s)) return 'history'
  if (POSITION.test(s)) return 'position'
  if (HISTORY.test(s)) return 'history'
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
