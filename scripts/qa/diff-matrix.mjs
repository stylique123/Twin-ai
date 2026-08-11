#!/usr/bin/env node
// TWO RUNS OF THE SAME CASES, AND WHAT CHANGED BETWEEN THEM.
//
//   node scripts/qa/diff-matrix.mjs before.json after.json [--cut goal|creator|variant]
//
// ⚠️ IT REFUSES TO COMPARE RUNS THAT ARE NOT THE SAME EXPERIMENT. If the case
// lists differ in length, order, or content, the diff exits non-zero. A "before
// and after" across two different designs is the most persuasive wrong number
// this project can produce: every metric moves, and none of the movement is
// attributable to the change under test.
//
// ⚖️ AND IT DOES NOT SCORE. `scoreRun` is imported from score-matrix.mjs, so
// the diff and the table it is compared against cannot disagree — a second
// scorer would measure the difference between two scorers.
import { readFileSync } from 'node:fs'
import { scoreRun, add, SELL, knowledgeFor, relationshipFor } from './score-matrix.mjs'

const [beforeFile, afterFile, ...rest] = process.argv.slice(2)
if (!beforeFile || !afterFile) {
  console.error('usage: diff-matrix.mjs before.json after.json [--cut goal|creator|variant]')
  process.exit(1)
}
const cutIdx = rest.indexOf('--cut')
const CUT = cutIdx >= 0 ? rest[cutIdx + 1] : 'goal'

const A = JSON.parse(readFileSync(beforeFile, 'utf8'))
const B = JSON.parse(readFileSync(afterFile, 'utf8'))

const key = (r) => JSON.stringify(r.case)
if (A.length !== B.length) {
  console.error(`REFUSING: ${A.length} runs vs ${B.length}. Not the same experiment.`)
  process.exit(1)
}
for (let i = 0; i < A.length; i++) {
  if (key(A[i]) !== key(B[i])) {
    console.error(`REFUSING: case ${i} differs between the two runs.`)
    console.error(`  before: ${key(A[i]).slice(0, 160)}`)
    console.error(`  after:  ${key(B[i]).slice(0, 160)}`)
    console.error('A diff across two designs attributes design changes to the fix.')
    process.exit(1)
  }
}

const score = (r) => scoreRun(r, knowledgeFor, relationshipFor)
const ZERO = Object.fromEntries(Object.keys(score(A[0])).map((k) => [k, 0]))
const totals = (runs) => runs.map(score).reduce(add, { ...ZERO })

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '—')
const arrow = (a, b, lowerIsBetter = true) => {
  if (a === b) return '  ='
  const better = lowerIsBetter ? b < a : b > a
  return better ? ' ✅' : ' ⚠️'
}

const ta = totals(A), tb = totals(B)
console.log(`\n${A.length} identical cases — ${beforeFile} → ${afterFile}\n`)
const ROWS = [
  ['runs failed', (t) => t.failed, true],
  ['beats written', (t) => t.beats, false],
  ['substance declared', (t) => pct(t.declared, t.beats), null],
  ['  from creator knowledge', (t) => pct(t.fromCreator, t.beats), null],
  ['  from general knowledge', (t) => pct(t.fromGeneral, t.beats), null],
  ['  escalated to needs_user', (t) => pct(t.needsUser, t.beats), null],
  ['UNSUPPORTED citations', (t) => t.unsupportedCreatorClaim, true],
  ['unearned first-person', (t) => t.unearnedFirstPerson, true],
  ['placeholder beats', (t) => t.placeholderBeats, true],
  ['specific beats', (t) => pct(t.specificBeats, t.beats), null],
  ['money claims', (t) => t.moneyClaims, true],
  ['product_dna, none supplied', (t) => t.impossibleProduct, true],
  ['SELL CTA, no commercial tie', (t) => t.sellInCta, true],
  ['SELL in a spoken line', (t) => t.sellInBody, true],
]
for (const [label, get, lower] of ROWS) {
  const a = get(ta), b = get(tb)
  const mark = lower === null || typeof a === 'string' ? '' : arrow(a, b, lower)
  console.log(`${label.padEnd(30)} ${String(a).padStart(7)} → ${String(b).padStart(7)}${mark}`)
}

// THE CUT THAT MATTERS: a total can hide a redistribution.
const cutOf = (r) => String(r.case?.[CUT] ?? '?')
const cuts = [...new Set(A.map(cutOf))].sort()
console.log(`\nby ${CUT} — sellCTA / sellBODY / unsupported / unearned1P\n`)
console.log('group'.padEnd(16) + 'before'.padEnd(24) + 'after')
for (const c of cuts) {
  const ia = A.filter((r) => cutOf(r) === c), ib = B.filter((r) => cutOf(r) === c)
  const x = totals(ia), y = totals(ib)
  const f = (t) => `${t.sellInCta} / ${t.sellInBody} / ${t.unsupportedCreatorClaim} / ${t.unearnedFirstPerson}`
  console.log(c.padEnd(16) + f(x).padEnd(24) + f(y))
}

// ⚖️ EVERY SURVIVING LEAK, QUOTED. A count says how many; only the text says
// whether the rule was ignored or whether the scorer is wrong about it.
console.log('\nSURVIVING SELL LEAKS (after run) — creator has no commercial tie\n')
let n = 0
for (const r of B) {
  const rel = relationshipFor(r.case?.creator)
  if (rel === 'OWN_PRODUCT' || rel === 'OWN_SERVICE' || rel === 'AFFILIATE' || rel === 'SPONSOR') continue
  const cta = String(r.blueprint?.cta ?? '')
  const lines = (r.blueprint?.script ?? []).map((b) => String(b?.line ?? '')).filter((l) => SELL.test(l))
  if (!SELL.test(cta) && !lines.length) continue
  n++
  console.log(`  ${r.case.creator} / ${r.case.goal} / ${r.case.label}`)
  if (SELL.test(cta)) console.log(`    CTA:  ${cta}`)
  for (const l of lines) console.log(`    LINE: ${l}`)
}
if (!n) console.log('  none.')
