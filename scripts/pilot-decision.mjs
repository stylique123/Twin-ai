// THE 332 DECISION, WRITTEN DOWN BEFORE THE LABELS EXIST.
//
// ⚠️ PRE-REGISTERED, AND THAT IS THE WHOLE POINT. #72 was nearly ruined by the
// temptation to pick "the worst three" after seeing the data, and the owner's
// ruling then was unambiguous: choosing after the fact is post-hoc subsetting.
// A verdict rule invented AFTER reading a 62% support rate is not a decision
// procedure, it is a justification. So this file is committed while every label
// is still unmade.
//
// ⚖️ IT DECIDES ONE THING ONLY: is the visual pass trustworthy enough ON
// NO-SPEECH REFERENCES to justify spending the other 332? It says nothing about
// beat-scheduled frames -- that arm is NOT REPRESENTED in a silent-video sample
// and a second small tranche answers it properly.
//
// ⚠️ THE SPEND BEING AUTHORISED IS REAL: roughly 664 downloads and 332 vision
// calls. That is the asymmetry the thresholds encode. A pass that is merely
// promising does not earn it; a pass that is broken in a CHEAP-TO-FIX way
// should be fixed first rather than run at scale over a known defect.

/**
 * ⚠️ EVERY THRESHOLD IS STATED, NOT BURIED, so the rule can be argued with
 * BEFORE the run rather than reinterpreted after it. Change these in a commit
 * that predates the labels, or not at all.
 */
export const RULE = Object.freeze({
  // Enough of the sample must have produced claims at all. Below this the
  // pilot has not measured the visual pass, it has measured the download path.
  min_assessed_of_selected: 0.5,
  // Enough claims must have been judged for a rate to mean anything. Six
  // references' worth of fields is the floor; fewer and one reference's
  // peculiarity moves every number.
  min_claims_labelled: 60,
  // Of what the model ANSWERED, this much must be supported. Set at two thirds
  // because the frames pass exists to describe references the transcript pass
  // cannot read at all -- the alternative is nothing, not a better answer.
  min_supported_of_answered: 0.667,
  // ⚠️ THE CITATION MACHINERY IS A SEPARATE, CHEAPER DEFECT. Above this, the
  // model may be seeing correctly and citing wrongly, and 332 downloads would
  // buy claims nobody can check. Fix the citation first.
  max_wrong_evidence: 0.15,
  // Frames that cannot settle a question will not settle it 332 more times.
  // A high indeterminate rate is a statement about the EVIDENCE, not the model.
  max_indeterminate: 0.4,
})

export const VERDICTS = Object.freeze({
  AUTHORIZE_VISUAL_BACKLOG: 'the pass earned the spend on this population',
  HOLD_VISUAL_BACKLOG: 'a named threshold was not met',
  INSUFFICIENT_EVIDENCE: 'the pilot did not measure enough to decide either way',
})

/**
 * Apply the rule. Returns the verdict, every threshold with its measured value,
 * and the reasons in the order they were checked.
 *
 * ⚖️ INSUFFICIENT_EVIDENCE IS NOT A HOLD. A hold says the pass failed; this says
 * the pilot did. They lead to different next actions -- fix the pass, or run a
 * bigger tranche -- and collapsing them would send somebody to fix code that was
 * never shown to be wrong.
 */
export function decide332(run) {
  const a = run?.aggregate ?? {}
  const at = run?.attrition ?? {}
  const r = run?.rates ?? {}
  const checks = []
  const add = (name, ok, measured, threshold, why) =>
    checks.push({ name, ok, measured, threshold, why })

  const assessed = at.assessed_of_selected
  const labelled = a.claims_labelled ?? 0

  // ── did the pilot measure anything? ──
  add('sample assessed', assessed !== null && assessed !== undefined
    && assessed >= RULE.min_assessed_of_selected, assessed, RULE.min_assessed_of_selected,
    'below this the pilot measured the download path, not the visual pass')
  add('claims labelled', labelled >= RULE.min_claims_labelled, labelled, RULE.min_claims_labelled,
    'fewer and one reference\'s peculiarity moves every number')

  const measuredEnough = checks.every((c) => c.ok)
  if (!measuredEnough) {
    return {
      verdict: 'INSUFFICIENT_EVIDENCE',
      because: VERDICTS.INSUFFICIENT_EVIDENCE,
      failed: checks.filter((c) => !c.ok).map((c) => c.name),
      checks,
      // ⚠️ NAMED SO NOBODY FIXES THE WRONG THING. The pass was not judged here.
      next: 'Run a further tranche. Nothing here says the visual pass is bad — it says it was not measured.',
    }
  }

  // ── did the pass earn it? ──
  add('supported of answered', (a.supported_of_answered ?? 0) >= RULE.min_supported_of_answered,
    a.supported_of_answered, RULE.min_supported_of_answered,
    'the alternative for these references is NOTHING, not a better answer')
  add('wrong evidence', (r.wrong_evidence ?? 0) <= RULE.max_wrong_evidence,
    r.wrong_evidence, RULE.max_wrong_evidence,
    'the citation machinery is a separate and cheaper defect — fix it before spending 332')
  add('indeterminate', (r.indeterminate ?? 0) <= RULE.max_indeterminate,
    r.indeterminate, RULE.max_indeterminate,
    'frames that cannot settle a question will not settle it 332 more times')

  const failed = checks.filter((c) => !c.ok)
  return failed.length === 0
    ? { verdict: 'AUTHORIZE_VISUAL_BACKLOG', because: VERDICTS.AUTHORIZE_VISUAL_BACKLOG,
        failed: [], checks,
        next: 'Run the 332 in BOUNDED BATCHES, not one sweep, and re-read the same rates after '
          + 'the first batch — a pilot of 8 does not license an unmonitored 332.' }
    : { verdict: 'HOLD_VISUAL_BACKLOG', because: VERDICTS.HOLD_VISUAL_BACKLOG,
        failed: failed.map((c) => c.name), checks,
        next: failed.map((c) => `${c.name}: ${c.why}`).join(' · ') }
}

/** ⚠️ THE VERDICT IS PRINTED WITH EVERY THRESHOLD AND ITS MEASURED VALUE, pass
 *  or fail. A verdict that showed only the failures would let a marginal
 *  authorisation look decisive. */
export function renderDecision(d) {
  const pct = (x) => (x === null || x === undefined ? '—'
    : (x <= 1 && x >= 0 ? `${Math.round(x * 100)}%` : String(x)))
  const L = ['\n  332 DECISION — rule pre-registered before any label existed']
  L.push(`  ${d.verdict}`)
  L.push(`  ${d.because}`)
  L.push('')
  for (const c of d.checks) {
    L.push(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(22)} `
      + `measured ${String(pct(c.measured)).padStart(6)}  threshold ${pct(c.threshold)}`)
  }
  L.push('')
  L.push(`  NEXT: ${d.next}`)
  return L.join('\n')
}
