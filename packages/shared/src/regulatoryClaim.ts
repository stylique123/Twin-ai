// A SCRIPT MAY NOT TELL A CREATOR WHAT THE LAW ALLOWS.
//
// ⚠️ MEASURED IN PRODUCTION, IDEA-MODE RUN I2, 2026-09-06 19:57. A cottage
// sourdough baker typed "why cottage food laws are the reason most home bakers
// never scale". Twin wrote, into her script:
//
//   "When you lock in a four-loaf rotation, you max out your cottage license
//    limits without needing commercial gear."        substance: none
//   "Most people think cottage food laws hold you back because of kitchen size
//    limits."                                        cited: "you don't need a
//                                                    perfect setup to begin..."
//
// Florida cottage food law has an annual GROSS SALES cap. There is no per-batch
// loaf limit and no kitchen size limit. Both sentences describe a rule that does
// not work that way, and a creator filming this explains food-safety licensing,
// incorrectly, on camera.
//
// ⚖️ WHAT IS NOT WRONG HERE, BECAUSE THE DIFFERENCE IS THE WHOLE RULE. A third
// line said "our Florida cottage food setup" and cited "Starting and launching a
// cottage sourdough microbakery in Florida" — she really did supply that. Naming
// her own situation is hers to name. This module does not touch it.
//
// ── THE LINE THIS DRAWS ───────────────────────────────────────────────────
//
// ⚠️ CONTEXT IS NOT A RULE. Measured on her store: of 8 knowledge rows, ONE
// mentions a regulatory noun ("cottage ... in Florida") and ZERO state a rule —
// no limit, no cap, no requirement, no permission. So a script asserting what
// the licence PERMITS or LIMITS is asserting something nobody supplied, even
// though the words "cottage" and "Florida" are genuinely hers.
//
// ⚖️ SO A BEAT IS FLAGGED ONLY WHEN IT STATES A RULE, and cleared when anything
// the creator supplied also states a rule. Both halves are required on both
// sides. A regulatory NOUN alone is a subject; a rule WORD alone is ordinary
// English ("you must try this"). Together they are a claim about what is
// permitted, and that is the thing a creator must not read aloud unverified.
//
// ⚠️ SUBSTANCE-BLIND, FOR THE REASON `comparativeClaim` ALREADY RECORDS: an
// INVENTED claim is never tagged with the substance that would gate it. I2's
// worst line carried `substance: 'none'` and cited "Standard sign-off and
// procedural conclusion". Gating on the tag would exempt exactly the dangerous
// case.

/** Words naming a rule-making body or instrument. A SUBJECT, not yet a claim. */
const REG_NOUN =
  /\b(licen[cs]e|licensing|permit|permitted|cottage food|health department|food safety|food hygiene|inspection|inspector|regulations?|regulatory|ordinance|statute|zoning|liability insurance|certification|certified kitchen|commercial kitchen licen|compliance|the law|legally|legal requirement)\b/i

/** Words asserting what that instrument REQUIRES, PERMITS or LIMITS. */
const REG_RULE =
  /\b(limits?|limited|max(?:es|ed)? out|maximum|cap(?:s|ped)?|allowed|not allowed|disallow|permits? you|requires?|required|mandatory|must|cannot|can't|up to|no more than|at most|restricts?|restricted|exempt|threshold|per (?:batch|loaf|year|month|week|day)|annual(?:ly)?)\b/i

/** Does this text state a regulatory RULE — both halves, not just one? */
export function statesARegulatoryRule(text: unknown): boolean {
  const s = String(text ?? '')
  return REG_NOUN.test(s) && REG_RULE.test(s)
}

export interface RegulatoryFailure {
  index: number
  line: string
  /** Handed to the repair model verbatim. */
  repair: string
}

/**
 * Beats stating what a licence or regulation permits, when nothing the creator
 * supplied states any rule at all.
 *
 * @param script   the final beats
 * @param supplied every piece of evidence the creator actually gave — their
 *                 knowledge rows, answers and transcript excerpts
 *
 * ⚠️ AND IT CLEARS THE WHOLE SCRIPT AS SOON AS ONE SUPPLIED ITEM STATES A RULE.
 * A creator who told Twin "my licence caps me at 50k a year" has supplied
 * regulatory ground, and second-guessing every later sentence against a string
 * match would refuse them their own subject. This module exists for the case
 * where nobody supplied any rule and the writer produced one anyway.
 */
export function regulatoryFailures(
  script: readonly { line?: unknown }[] | null | undefined,
  supplied: readonly unknown[] | null | undefined,
): RegulatoryFailure[] {
  const beats = Array.isArray(script) ? script : []
  const evidence = Array.isArray(supplied) ? supplied : []
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION: an absent evidence list is "we
  // supplied nothing", which is exactly when this must fire, not a reason to
  // skip. It is `[]`, never a pass.
  if (evidence.some((e) => statesARegulatoryRule(typeof e === 'string' ? e : (e as { text?: unknown })?.text))) {
    return []
  }
  const out: RegulatoryFailure[] = []
  beats.forEach((b, i) => {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (line.trim() === '' || !statesARegulatoryRule(line)) return
    out.push({
      index: i,
      line,
      repair: 'Remove the claim about what a licence, permit or regulation allows, limits or requires.'
        + ' Nothing the creator supplied states any such rule, so this sentence is inventing one.'
        + ' Say what THEY do in their own setup, without describing what the rules permit.',
    })
  })
  return out
}
