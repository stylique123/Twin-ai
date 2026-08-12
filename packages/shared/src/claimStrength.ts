// WHAT A SENTENCE COMMITS THE CREATOR TO.
//
// ⚠️ EXTRACTED SO THERE IS EXACTLY ONE OF IT. `substanceIssues` in
// `knowledgeResolver.ts` carried its OWN first-person detector — a narrow verb
// list predating this file's structural rewrite. Over the last matrix that
// stale copy saw 2 history beats where `claimStrength` saw 22, so the check its
// own comment calls "THE MOST EXPENSIVE ERROR, CHECKED SEPARATELY" ran at about
// a tenth of its sensitivity.
//
// It could not simply import this: `claimEntitlement` imports `evidenceLevel`
// from `knowledgeResolver`, so the arrow back would have been a cycle. The
// alternatives were a second copy of the regex — the exact failure that let 16
// purchase CTAs ship while three copies of the CTA rule agreed with each other
// — or leaning on ES module cycle hoisting across both vitest and Deno. So the
// rule moved DOWN to a module with NO imports at all, which both can depend on.
//
// ⚖️ THE PATTERNS ARE UNCHANGED, BYTE FOR BYTE. This moves code; it does not
// tune it. Every fixture in `__tests__/claimStrengthRealSpeech.test.ts` still
// applies, and the edge parity test still lifts these same literals.

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

/** ⚠️ A TYPOGRAPHIC APOSTROPHE SILENTLY DEFEATED EVERY PATTERN BELOW.
 *
 * Every rule here spells contractions with U+0027 — `I've`, `I'll`, `don't`.
 * The writer emits U+2019 whenever it feels like prose, and 29 of 705 beats in
 * the last matrix contain one. The two are different characters, so:
 *
 *     "I've been using this for months."  -> history
 *     "I’ve been using this for months."  -> discussion
 *
 * The same sentence, the same claim, and the most expensive check in the system
 * waved the second one through. Nothing in the corpus made this visible because
 * the fixtures were typed with straight quotes — a detector measured only
 * against text we wrote is the exact failure `realSpeech.ts` exists to prevent,
 * reappearing one layer down as an encoding assumption.
 *
 * ⚖️ NORMALISED AT THE ENTRY POINT, NOT PATTERN BY PATTERN. Adding `['’]` to
 * every contraction across five regexes is five chances to miss one, and the
 * next pattern added would start the cycle again. */
const straighten = (s: string): string => s.replace(/[’ʼ‘´`]/g, "'")

export function claimStrength(line: string): ClaimStrength {
  const s = straighten(String(line ?? ''))
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
