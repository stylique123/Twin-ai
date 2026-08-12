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

// ⚖️ MOVED to ./claimStrength so `knowledgeResolver` can use the SAME rule
// without an import cycle. Re-exported here because this is where every caller
// already looks for it, and a move that breaks every import is a move nobody
// makes — which is how a stale second copy survives in the first place.
export { CLAIM_STRENGTHS, claimStrength, type ClaimStrength } from './claimStrength'
import { claimStrength, type ClaimStrength } from './claimStrength'


/** The evidence level each claim strength requires. Deliberately 1:1 with the
 *  ladder — a stronger sentence needs a stronger source, with no exceptions and
 *  no "usually". */
export const REQUIRED_FOR: Record<ClaimStrength, EvidenceLevel> = {
  discussion: 'coverage',
  position: 'opinion',
  history: 'experience',
}

const RANK: Record<EvidenceLevel, number> = { coverage: 0, opinion: 1, experience: 2 }


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
