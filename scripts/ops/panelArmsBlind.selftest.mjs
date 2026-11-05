// Self-test for the panel 13 blind pack. No network, no database.
import assert from 'node:assert/strict'
import { buildArmsPack, failureOf } from './panelArmsBlind.mjs'

let seed = 0
const rand = (n) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) & 0xff); return b }
const m = (o) => [{ k: 'arm_metrics', d: JSON.stringify(o) }]
const row = (n, arm, extra = {}, metrics = { invented_after: 0, hook_copied: 0, check_status: 'checked' }) =>
  ({ n, status: 200, generation_id: `g${n}`, script_text: `1. line ${n} ${arm}`, hooks: ['h'], findings: m(metrics), scenario: { viewer_arm: arm, label: `panel-${n}`, creator: 'c', body: { goal: 'educate' }, ...(arm === 'on' ? { viewers: 'done', viewers_changed: true } : {}), ...extra } })

const rows = [
  row(64, 'off', {}, { invented_after: 2, hook_copied: 1, check_status: 'checked' }), row(64, 'on'),
  row(65, 'off'), row(65, 'on', { viewers: 'timeout' }),
  { ...row(66, 'off'), status: 500 },
  row(67, 'off', { failure: 'check_not_final' }),
  { n: 1, status: 200, script_text: 'x', scenario: {} }, // not an arm row: ignored
]
const p = buildArmsPack(rows, rand)
assert.equal(p.report.off.scripts, 2); assert.equal(p.report.on.scripts, 1)
assert.equal(p.report.off.invented_lines, 2); assert.equal(p.report.off.scripts_with_invented, 1)
assert.equal(p.report.off.hook_copied, 1)
assert.deepEqual(p.report.off.failures.map((f) => f.reason).sort(), ['check_not_final', 'http_500'])
assert.deepEqual(p.report.on.failures.map((f) => f.reason), ['viewers_timeout'])
// Blind: no arm, n, creator or generation id; the key has them all.
assert.equal(Object.keys(p.key).length, 3)
assert.ok(!/\b(off|on)\b arm|viewer_arm|panel-6\d|g6\d/.test(p.blind.replace(/line 6\d (off|on)/g, '')), 'blind file carries no arm key')
for (const [id, k] of Object.entries(p.key)) { assert.match(id, /^S-[0-9A-F]{6}$/); assert.ok(['off', 'on'].includes(k.arm)) }
assert.equal(failureOf({ status: 200, script_text: '', scenario: { viewer_arm: 'off' } }), 'no_script')
console.log('panel arms blind selftest: ok')
