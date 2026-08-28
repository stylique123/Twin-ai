/**
 * FIX 8b — SEMANTIC REPETITION, THE TRIGGER ONLY.
 *
 * ⚠️ THE PANEL SAW 67% REPETITION. LEXICAL MEASURES SAW 4.9%. `repetition.ts`
 * already names the gap and refuses to close it: either the panel is reading
 * MEANING no word-overlap check can reach, or it is counting the re-hook and
 * the CTA restating on purpose. Closing that gap needs a model — this module
 * is not the model call. It is the one decision that call's output feeds:
 * given the pairs a judge reports, does the repair fire?
 *
 * ⚖️ TWO TRIGGERS WERE BLIND-TESTED (G18/G20, 96 scripts). "2+ substantive
 * soft beats" won 3–0. A branch keyed off the PAYOFF section, measured across
 * counts 1 through 6, lost 1–6 and carries an explicit instruction not to
 * build it. So this module names substance and counts pairs of it — it never
 * asks whether a pair touches the payoff, and payoff/hook/CTA beats (the
 * "craft" sections `craftBeats.ts` already defines) can never themselves
 * satisfy the trigger. A script that only ever restates its own CTA is doing
 * its job, not repeating itself.
 */
import { isCraftSection } from './craftBeats.js'

/** A script beat, as the blueprint stores it — same shape `repetition.ts` reads. */
export interface SemanticRepetitionBeat {
  line?: unknown
  section?: unknown
}

/** One pair the judge reports as covering the same ground, by beat index. */
export interface JudgedRepetitionPair {
  a: number
  b: number
}

/**
 * A "soft beat" carries substance the writer chose, as opposed to a "craft"
 * beat (hook, CTA, payoff) that is writable from goal + offer alone and
 * whose repetition is often the format doing its job on purpose.
 *
 * ⚠️ EMPTY LINES ARE NOT SUBSTANTIVE. A beat the judge cites with no text
 * (an index past the end of the array, or a blank/non-string line) cannot be
 * "restating the same point" — there is no point on that beat to restate.
 */
export function isSubstantiveSoftBeat(beat: SemanticRepetitionBeat | undefined): boolean {
  if (beat === undefined) return false
  if (isCraftSection(beat.section)) return false
  return typeof beat.line === 'string' && beat.line.trim() !== ''
}

export interface SemanticRepetitionTrigger {
  /** ONLY true condition under which auto-repair may fire. */
  trigger: boolean
  /** The judged pairs where BOTH beats are substantive soft beats. */
  substantivePairs: JudgedRepetitionPair[]
}

/**
 * ⚠️ THE ONLY TRIGGER THIS PRODUCT MAY BUILD. `substantivePairs.length >= 2`
 * is "2+ substantive soft beats" verbatim. There is deliberately no branch
 * here that reads `section`, counts occurrences 1 through 6, or singles out
 * the payoff — that is the rejected trigger, and G20 forbids building it.
 */
export function evaluateSemanticRepetitionTrigger(
  beats: readonly SemanticRepetitionBeat[],
  pairs: readonly JudgedRepetitionPair[],
): SemanticRepetitionTrigger {
  const substantivePairs = pairs.filter((p) => (
    Number.isInteger(p.a) && Number.isInteger(p.b) && p.a !== p.b
    && isSubstantiveSoftBeat(beats[p.a]) && isSubstantiveSoftBeat(beats[p.b])
  ))
  return { trigger: substantivePairs.length >= 2, substantivePairs }
}

/** What the UI needs from `generations.beat_audit.semantic_repetition` to
 *  offer the repair — the beat index it targets, and the up-to-3 candidate
 *  rewrites. Never the raw pairs or reasoning; those stay server-side audit. */
export interface SemanticRepetitionRepair {
  repairTarget: number
  repairCandidates: string[]
}

/**
 * Reads `generations.beat_audit` (stored `unknown`) down to the one thing a
 * scene card can act on. Returns null for every shape that is not a landed,
 * candidate-bearing repair — an old row with no `beat_audit`, a run that
 * didn't trigger, a run whose repair call failed (`repair_candidates: null`,
 * see `generate-blueprint/index.ts`) — so a caller never has to duplicate
 * this narrowing to stay safe against a field it does not otherwise touch.
 */
export function readSemanticRepetitionRepair(beatAudit: unknown): SemanticRepetitionRepair | null {
  if (typeof beatAudit !== 'object' || beatAudit === null) return null
  const sr = (beatAudit as { semantic_repetition?: unknown }).semantic_repetition
  if (typeof sr !== 'object' || sr === null) return null
  const { repair_target: target, repair_candidates: candidates } = sr as {
    repair_target?: unknown
    repair_candidates?: unknown
  }
  if (!Number.isInteger(target) || !Array.isArray(candidates)) return null
  const repairCandidates = candidates.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
  if (repairCandidates.length === 0) return null
  return { repairTarget: target as number, repairCandidates }
}
