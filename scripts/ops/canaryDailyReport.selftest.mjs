// Selftest for canaryDailyReport.mjs (pure part). Fictional ids only. Run: node scripts/ops/canaryDailyReport.selftest.mjs
import assert from 'node:assert/strict'
import { summarize, spike, pct } from './canaryDailyReport.mjs'

const t = (s) => new Date(Date.UTC(2026, 9, 29, 10, 0, s)).toISOString()
const gens = [
  { id: 'g1', blueprint: { canary: true, check_lines: [{}, {}] } },
  { id: 'g2', blueprint: { canary: true } },
  { id: 'g3', blueprint: {} }, // the old flow (kill switch on): not counted as canary
]
const attempts = [
  { run_id: 'r1', generation_id: 'g1', outcome: 'succeeded', started_at: t(0), settled_at: t(60) },
  { run_id: 'r2', generation_id: null, outcome: 'failed', started_at: t(0), settled_at: t(30) },
  { run_id: 'r2', generation_id: 'g2', outcome: 'succeeded', started_at: t(30), settled_at: t(90) }, // recovered retry = one run
  { run_id: 'r3', generation_id: null, outcome: 'failed', started_at: t(0), settled_at: t(10) },
]
const s = summarize({
  attempts, gens,
  costs: [{ generation_id: 'g1', est_usd: 0.02 }, { generation_id: 'g2', est_usd: 0.04 }, { generation_id: 'g3', est_usd: 9 }],
  feedback: [{ generation_id: 'g1', rating: 8, edited: true }, { generation_id: 'g2', rating: 6, edited: false }],
  posts: [{ generation_id: 'g1' }, { generation_id: 'g1' }],
})
assert.equal(s.runs, 3)
assert.equal(s.failed, 1, 'a recovered retry is not a failure; a run with no script is')
assert.equal(s.scripts, 2, 'only canary-tagged generations')
assert.equal(s.spend_usd, 0.06, 'non-canary cost excluded')
assert.equal(s.usd_per_script, 0.03)
assert.equal(s.flagged_scripts, 1); assert.equal(s.flagged_lines, 2)
assert.equal(s.avg_rating, 7); assert.equal(s.edited, 1); assert.equal(s.posted, 1, 'two post rows for one script count once')
assert.equal(s.p90_s, 90)
assert.equal(spike(s), true, '1 failure in 3 runs is above 1 in 24')
assert.equal(spike({ runs: 24, failure_rate: 1 / 24, p90_s: 125 }), false, 'exactly at the limits is not a spike')
assert.equal(pct([], 90), null)
console.log('canaryDailyReport selftest ok')
