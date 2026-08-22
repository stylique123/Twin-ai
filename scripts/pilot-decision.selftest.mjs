#!/usr/bin/env node
// The 332 rule, checked against shapes chosen to be awkward.
import { decide332, renderDecision, RULE } from './pilot-decision.mjs'

let failed = 0
const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }

const run = (o = {}) => ({
  attrition: { assessed_of_selected: 0.75, ...(o.attrition ?? {}) },
  aggregate: { claims_labelled: 90, supported_of_answered: 0.8, ...(o.aggregate ?? {}) },
  rates: { wrong_evidence: 0.05, indeterminate: 0.2, ...(o.rates ?? {}) },
})

ok('a clean pilot authorises', decide332(run()).verdict === 'AUTHORIZE_VISUAL_BACKLOG')
// ⚠️ AND EVEN THEN IT DOES NOT LICENSE ONE SWEEP.
ok('authorisation still demands bounded batches', decide332(run()).next.includes('BOUNDED BATCHES'))

// ── the pass failed ──
ok('a low support rate holds',
  decide332(run({ aggregate: { supported_of_answered: 0.5 } })).verdict === 'HOLD_VISUAL_BACKLOG')
// ⚖️ THE CITATION MACHINERY IS A DIFFERENT, CHEAPER DEFECT.
const we = decide332(run({ rates: { wrong_evidence: 0.4 } }))
ok('high wrong-evidence holds', we.verdict === 'HOLD_VISUAL_BACKLOG')
ok('and it says to fix the citation before spending', we.next.includes('citation'))
const ind = decide332(run({ rates: { indeterminate: 0.9 } }))
ok('high indeterminate holds', ind.verdict === 'HOLD_VISUAL_BACKLOG')
ok('and it says more downloads will not help', ind.next.includes('will not settle it 332 more times'))

// ── the PILOT failed, which is not the same thing ──
const thin = decide332(run({ aggregate: { claims_labelled: 10 } }))
ok('too few claims is INSUFFICIENT_EVIDENCE, not a hold', thin.verdict === 'INSUFFICIENT_EVIDENCE')
// ⚠️ COLLAPSING THESE WOULD SEND SOMEBODY TO FIX CODE NEVER SHOWN TO BE WRONG.
ok('and it says the pass was not judged', thin.next.includes('not measured'))
ok('heavy attrition is also INSUFFICIENT_EVIDENCE',
  decide332(run({ attrition: { assessed_of_selected: 0.25 } })).verdict === 'INSUFFICIENT_EVIDENCE')
ok('a missing attrition figure does not silently pass',
  decide332({ aggregate: { claims_labelled: 90 }, rates: {} }).verdict === 'INSUFFICIENT_EVIDENCE')

// ── boundaries are inclusive where the comment says they are ──
ok('exactly at the support threshold authorises',
  decide332(run({ aggregate: { supported_of_answered: RULE.min_supported_of_answered } })).verdict
    === 'AUTHORIZE_VISUAL_BACKLOG')
ok('exactly at the wrong-evidence ceiling authorises',
  decide332(run({ rates: { wrong_evidence: RULE.max_wrong_evidence } })).verdict
    === 'AUTHORIZE_VISUAL_BACKLOG')
ok('a hair over the ceiling holds',
  decide332(run({ rates: { wrong_evidence: RULE.max_wrong_evidence + 0.001 } })).verdict
    === 'HOLD_VISUAL_BACKLOG')

// ── the verdict shows its working ──
const d = decide332(run())
ok('every threshold is reported, passing ones included', d.checks.length === 5)
// ⚠️ A VERDICT SHOWING ONLY FAILURES WOULD LET A MARGINAL PASS LOOK DECISIVE.
const text = renderDecision(d)
ok('the render shows measured value AND threshold for each check',
  text.includes('measured') && text.includes('threshold'))
ok('the render names the verdict', text.includes('AUTHORIZE_VISUAL_BACKLOG'))
ok('the render says the rule was pre-registered', text.includes('pre-registered before any label'))
// ⚖️ MULTIPLE FAILURES ARE ALL NAMED, not just the first.
const many = decide332(run({ aggregate: { supported_of_answered: 0.1 }, rates: { wrong_evidence: 0.9, indeterminate: 0.9 } }))
ok('all failing checks are named', many.failed.length === 3)

if (failed) process.exit(1)
console.log('pilot-decision selftest: all cases passed')
