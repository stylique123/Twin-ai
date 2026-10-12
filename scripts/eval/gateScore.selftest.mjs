// Self-test for the gate scoring (made-up rows, no text).  node scripts/eval/gateScore.selftest.mjs
import assert from 'node:assert/strict'
import { confusion, ownerMetrics, formatReport, twoJudgeMetrics, formatTwoJudgeReport } from './gateScore.mjs'

const rows = [
  { n: 0, i: 0, surface: 'script', cls: 'I', label: 'I' },
  { n: 0, i: 1, surface: 'caption', cls: 'N', label: 'I' },
  { n: 0, i: 2, surface: 'title', cls: 'I', label: 'N' },
  { n: 1, i: 0, surface: 'script', cls: 'I', label: 'S' },
  { n: 1, i: 1, surface: 'hook_option', cls: 'G', label: 'E' },
  { n: 1, i: 2, surface: 'script', cls: 'X', label: 'S' },
  { n: 2, i: 0, surface: 'script', cls: 'S', label: null },
  { n: 13, i: 0, surface: 'script', cls: 'I', label: 'I' },
]
const tune = rows.filter((r) => r.n <= 11)
const m = ownerMetrics(tune)
assert.deepEqual(m.recall_strict_I, [1, 2])
assert.deepEqual(m.false_flag, [2, 3])
assert.deepEqual(m.false_I_on_S, [1, 2])
assert.deepEqual(m.flagged_scripts_gate, [2, 3])
assert.deepEqual(m.flagged_scripts_advisor, [1, 3])
assert.deepEqual(m.n_hidden_I, [1, 2])
assert.deepEqual(m.recall_misses_by_surface, { caption: 1 })
assert.equal(m.unclassified, 1)
assert.equal(confusion(tune).G.E, 1)
const rep = formatReport('x', rows)
assert.match(rep, /tune half/)
assert.match(rep, /validation half .* 1 scripts/)
// Two judges: made-up rows with fast class, strong class and verdict.
const tj = [
  { n: 0, i: 0, surface: 'script', fc: 'I', sc: 'I', verdict: 'block', label: 'I' },
  { n: 0, i: 1, surface: 'script', fc: 'I', sc: 'S', verdict: 'review', label: 'I' },
  { n: 0, i: 2, surface: 'title', fc: 'G', sc: 'S', verdict: 'review', label: 'N' },
  { n: 1, i: 0, surface: 'script', fc: 'S', sc: 'S', verdict: 'pass', label: 'I' },
  { n: 1, i: 1, surface: 'script', fc: 'I', sc: 'I', verdict: 'block', label: 'S' },
  { n: 1, i: 2, surface: 'script', fc: 'E', sc: 'E', verdict: 'pass', label: null },
  { n: 2, i: 0, surface: 'script', cls: 'S', label: 'S' },
  { n: 14, i: 0, surface: 'script', fc: 'I', sc: 'S', verdict: 'review', label: 'S' },
]
const t = twoJudgeMetrics(tj.filter((r) => r.n <= 11))
assert.deepEqual(t.review_recall_strict_I, [2, 3])
assert.deepEqual(t.review_false_flags, [2, 4])
assert.deepEqual(t.block_precision_I_or_E, [1, 2])
assert.deepEqual(t.block_false_blocks, [1, 2])
assert.deepEqual(t.scripts_with_review, [1, 2])
const tr = formatTwoJudgeReport('x', tj)
assert.match(tr, /validation half \(n 12-23\): 1 rows with a verdict/)
assert.match(tr, /combined \(n 0-23\): 7 rows with a verdict/)
console.log('gateScore selftest: ok')
