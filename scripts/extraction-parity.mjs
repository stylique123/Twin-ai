#!/usr/bin/env node
// DOES THE CHEAP MODEL MAKE THE SAME DECISIONS?
//
// ⚠️ THE COMPARISON IS DEFINED BEFORE THE DATA EXISTS, and that is deliberate.
// A verdict invented after seeing the numbers is a verdict fitted to them. What
// counts as "preserved" is fixed here, in advance, in one place.
//
// ⚖️ AND IT COMPARES WHAT TWIN USES, NOT WHAT READS NICELY. This is extraction,
// not creative writing. A model that writes a lovelier topic sentence and loses
// a content slot is WORSE: the slot is what tells a creator what they must
// supply to recreate the video, and the topic sentence is decoration.
//
// USAGE
//   node scripts/extraction-parity.mjs plan  <modelB> [n]   what it WOULD enqueue
//   node scripts/extraction-parity.mjs go    <modelB> [n]   enqueue the trials
//   node scripts/extraction-parity.mjs report <modelB>      score what came back
//   node scripts/extraction-parity.mjs --selftest           no credentials needed

/** ⚠️ THE FIELDS TWIN ACTUALLY READS DOWNSTREAM. Anything not on this list is
 *  not evidence about the routing decision, however interesting it looks. */
export const DECISION_FIELDS = [
  'topic',
  'likelyGoals',
  'structure.containerType',
  'structure.rehookPosition',
  'structure.payoffType',
  'structure.ctaMechanism',
  'requirements.personalExperienceRequired',
  'requirements.externalFactsRequired',
  'requirements.productsRequired',
  'transfer.structureTransferability',
  'transfer.topicDependence',
  'commercial.posture',
]

/** ⚠️ THESE ARE NOT COMPARED BY EQUALITY. A beat list or a slot list differing
 *  in wording is not a different decision; differing in COUNT or in KIND is. */
export const STRUCTURAL_FIELDS = ['structure.beats', 'requirements.contentSlots']

/** ⚖️ THE ONE FIELD WHERE A DISAGREEMENT IS DISQUALIFYING ON ITS OWN.
 *  commercial.posture decides whether another creator is ALLOWED to recreate a
 *  video. A wrong OWN_PRODUCT hides a good reference; a wrong NONE offers a
 *  creator someone else's sales pitch to copy. */
export const GATING_FIELD = 'commercial.posture'

const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o)

/** An extracted field is `{ value, evidence, ... }` or the NOT_DETERMINED
 *  sentinel. Unwrap to the value, treating "absent" and "refused" as the SAME
 *  answer — both mean the model declined to claim, which is a correct outcome. */
function valueOf(field) {
  if (field == null) return null
  if (typeof field === 'object' && 'value' in field) return field.value ?? null
  return field
}
const norm = (v) => {
  if (v == null) return null
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort())
  return String(v)
}

/** Compare one trial. Returns the per-field verdicts and a summary. */
export function compareTrial(profileA, profileB) {
  const fields = {}
  let agree = 0, disagree = 0, bothRefused = 0, oneRefused = 0
  for (const path of DECISION_FIELDS) {
    const a = norm(valueOf(get(profileA, path)))
    const b = norm(valueOf(get(profileB, path)))
    let verdict
    if (a === null && b === null) { verdict = 'both_refused'; bothRefused++ }
    else if (a === null || b === null) { verdict = 'one_refused'; oneRefused++ }
    else if (a === b) { verdict = 'agree'; agree++ }
    else { verdict = 'disagree'; disagree++ }
    fields[path] = { verdict, a, b }
  }

  // ⚠️ COUNT AND KIND, NOT WORDING. Two models naming the same three slots in
  // different words made the same decision; one finding three and the other
  // finding one did not.
  const structural = {}
  for (const path of STRUCTURAL_FIELDS) {
    const av = valueOf(get(profileA, path)), bv = valueOf(get(profileB, path))
    const an = Array.isArray(av) ? av.length : null
    const bn = Array.isArray(bv) ? bv.length : null
    const kinds = (x) => Array.isArray(x)
      ? JSON.stringify(x.map((i) => String(i?.kind ?? i?.role ?? '')).sort()) : null
    structural[path] = {
      countA: an, countB: bn,
      countMatch: an !== null && an === bn,
      kindsMatch: kinds(av) !== null && kinds(av) === kinds(bv),
    }
  }

  // ⚖️ "one refused" IS NOT COUNTED AS AGREEMENT. A model that answers where the
  // other declines has not reproduced the decision — it has made a different
  // one, and which is right is exactly what a human has to look at.
  const comparable = agree + disagree
  return {
    fields, structural,
    agree, disagree, bothRefused, oneRefused,
    agreementRate: comparable === 0 ? null : agree / comparable,
    gatingDisagreement: fields[GATING_FIELD]?.verdict === 'disagree',
  }
}

/** ⚠️ THE BAR, WRITTEN DOWN BEFORE THE NUMBERS. */
export const PASS = {
  minAgreementRate: 0.90,
  maxGatingDisagreements: 0,
  maxOneRefusedRate: 0.15,
  maxSlotCountMismatchRate: 0.10,
}

export function verdict(trials) {
  const n = trials.length
  if (n === 0) return { ok: false, why: 'no trials' }
  const rates = trials.map((t) => t.agreementRate).filter((r) => r !== null)
  const agreement = rates.reduce((a, b) => a + b, 0) / (rates.length || 1)
  const gating = trials.filter((t) => t.gatingDisagreement).length
  const oneRef = trials.reduce((a, t) => a + t.oneRefused, 0)
    / (n * DECISION_FIELDS.length)
  const slotMiss = trials.filter((t) => !t.structural['requirements.contentSlots']?.countMatch).length / n
  const reasons = []
  if (agreement < PASS.minAgreementRate) reasons.push(`agreement ${(agreement * 100).toFixed(1)}% < ${PASS.minAgreementRate * 100}%`)
  if (gating > PASS.maxGatingDisagreements) reasons.push(`${gating} commercial.posture disagreement(s) — each one mis-gates who may recreate a video`)
  if (oneRef > PASS.maxOneRefusedRate) reasons.push(`one-refused ${(oneRef * 100).toFixed(1)}% > ${PASS.maxOneRefusedRate * 100}%`)
  if (slotMiss > PASS.maxSlotCountMismatchRate) reasons.push(`content-slot count mismatch ${(slotMiss * 100).toFixed(1)}% > ${PASS.maxSlotCountMismatchRate * 100}%`)
  return { ok: reasons.length === 0, agreement, gating, oneRef, slotMiss, reasons }
}

// ── selftest ────────────────────────────────────────────────────────────────
if (process.argv.includes('--selftest')) {
  let bad = 0
  const ok = (name, cond) => { if (cond) console.log(`  ok: ${name}`); else { console.error(`FAIL: ${name}`); bad++ } }
  const f = (v) => ({ value: v, evidence: 'x' })

  const A = { topic: f('a'), commercial: { posture: f('NONE') },
    requirements: { contentSlots: f([{ kind: 'product' }, { kind: 'claim' }]) } }
  const same = compareTrial(A, A)
  ok('a profile agrees with itself', same.agreementRate === 1 && same.disagree === 0)
  ok('and its slot count matches itself', same.structural['requirements.contentSlots'].countMatch)

  const B = { ...A, commercial: { posture: f('OWN_PRODUCT') } }
  const g = compareTrial(A, B)
  ok('a posture disagreement is flagged as gating', g.gatingDisagreement === true)
  ok('and one gating disagreement fails the run', verdict([g]).ok === false)

  // ⚠️ THE CASE THAT MATTERS MOST: refusing where the other answered must NOT
  // score as agreement, or a model that declines everything looks perfect.
  const silent = { topic: null, commercial: { posture: null }, requirements: { contentSlots: null } }
  const r = compareTrial(A, silent)
  ok('one-refused is not counted as agreement', r.agree === 0 && r.oneRefused > 0)
  ok('a model that refuses everything does not pass', verdict([r]).ok === false)

  // Slot wording may differ; slot COUNT may not.
  const worded = { ...A, requirements: { contentSlots: f([{ kind: 'product' }, { kind: 'claim' }]) } }
  ok('same slot kinds in a different order still match',
    compareTrial(A, worded).structural['requirements.contentSlots'].kindsMatch)
  const fewer = { ...A, requirements: { contentSlots: f([{ kind: 'product' }]) } }
  ok('a lost content slot is a mismatch',
    compareTrial(A, fewer).structural['requirements.contentSlots'].countMatch === false)

  console.log(bad ? 'extraction-parity selftest: FAILURES' : 'extraction-parity selftest: all cases passed')
  process.exit(bad ? 1 : 0)
}
