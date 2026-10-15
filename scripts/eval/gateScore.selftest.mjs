// Self-test for the gate scoring (made-up rows, no text).  node scripts/eval/gateScore.selftest.mjs
import assert from 'node:assert/strict'
import { confusion, ownerMetrics, formatReport, twoJudgeMetrics, formatTwoJudgeReport, scriptLineMetrics, surfaceRows, formatScriptLineReport } from './gateScore.mjs'

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
// Reply 14: script lines only, per batch and combined (made-up rows).
const sl = [
  { batch: 'b2', n: 0, i: 0, surface: 'script', verdict: 'block', label: 'I' },
  { batch: 'b2', n: 0, i: 1, surface: 'script', verdict: 'review', label: 'S' },
  { batch: 'b2', n: 0, i: 2, surface: 'caption', verdict: 'block', label: 'N' },
  { batch: 'b3', n: 0, i: 0, surface: 'script', verdict: 'pass', label: 'I' },
  { batch: 'b3', n: 0, i: 1, surface: 'script', verdict: 'block', label: 'E' },
  { batch: 'b3', n: 1, i: 0, surface: 'script', verdict: 'block', label: 'N' },
]
const slm = scriptLineMetrics(surfaceRows(sl, 'script'))
assert.deepEqual(slm.recall_strict_I, [1, 2])
assert.deepEqual(slm.block_precision_I_or_E, [2, 3])
assert.deepEqual(slm.false_blocks, [1, 3])
assert.deepEqual(slm.false_flags, [2, 4])
assert.deepEqual(slm.scripts_with_review, [1, 3])
const slr = formatScriptLineReport('x', sl, [{ batch: 'b2', n: 0, ms: 100, tokens: 10 }, { batch: 'b3', n: 0, ms: 300, tokens: 30 }, { batch: 'b3', n: 1, ms: 200, tokens: 20 }])
assert.match(slr, /combined: 5 rows with a verdict, 5 labelled, 3 scripts/)
assert.match(slr, /batch b3: 3 rows/)
assert.match(slr, /p90 gate ms 300; tokens per script 20/)
console.log('gateScore selftest: ok')
