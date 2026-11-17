// THE OLDER READINESS CHECK, NARROWED WHILE FACTS_ONLY_WRITER IS ON (Panel 14
// follow-up, owner 17 Nov). With the facts-only writer on, the gap layer asks
// for the material a request needs (a story, a number, a product fact). The
// older readiness check kept asking its own story, angle and goal questions on
// top, generic and sometimes wrong for the creator ("What was missing that made
// you build it?" to a creator with no build story). Those three stand down;
// audience, CTA and offer stay. Every other readiness field is left as it was.
//
// "goal" here is the goal-keyed product question (one sentence per objective,
// asked under the `claims` field). The generic claims question is not touched.

export type ReadinessAsk = { field: string; question: string }

/** Readiness fields that stand down while the facts-only writer is on. */
export const READINESS_OFF_UNDER_FACTS_ONLY: ReadonlySet<string> = new Set(['story', 'angle', 'goal'])

/** Which readiness question this is: its field, or `goal` for the goal-keyed claims question. */
export function readinessKind(ask: ReadinessAsk, objectiveQuestions: readonly string[]): string {
  if (ask.field === 'claims' && objectiveQuestions.includes(ask.question)) return 'goal'
  return ask.field
}

/** The readiness questions still asked: all of them when the facts-only writer is off. */
export function readinessAsksUnderFactsOnly<T extends ReadinessAsk>(
  missing: readonly T[], factsOnly: boolean, objectiveQuestions: readonly string[],
): T[] {
  if (!factsOnly) return missing.slice()
  return missing.filter((m) => !READINESS_OFF_UNDER_FACTS_ONLY.has(readinessKind(m, objectiveQuestions)))
}
