// Self-test for the panel 13 viewer arms (PANEL_VIEWER_ARMS=on). No network, no database.
//   node scripts/ops/panelViewerArms.selftest.mjs
import assert from 'node:assert/strict'
import { awaitViewers, panelViewerArmsOn } from './panelRun.mjs'

assert.equal(panelViewerArmsOn({}), false)
assert.equal(panelViewerArmsOn({ PANEL_VIEWER_ARMS: 'on' }), true)
assert.equal(panelViewerArmsOn({ PANEL_VIEWER_ARMS: 'true' }), false)

// A fake clock: each sleep advances it, so nothing really waits.
const clock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms } } }

{ // pending, pending, done
  const seq = [null, 'pending', 'done']; const c = clock()
  const r = await awaitViewers(async () => seq.shift(), 'g1', { timeoutMs: 60_000, pollMs: 10_000, ...c })
  assert.equal(r.status, 'done'); assert.equal(r.waited_ms, 20_000)
}
{ // the viewers failed: stop at once
  const c = clock()
  assert.equal((await awaitViewers(async () => 'failed', 'g2', { ...c })).status, 'failed')
}
{ // never finishes: timeout, and a load error is treated as not yet
  const c = clock()
  const r = await awaitViewers(async () => { throw new Error('db') }, 'g3', { timeoutMs: 30_000, pollMs: 10_000, ...c })
  assert.equal(r.status, 'timeout'); assert.equal(r.waited_ms, 30_000)
}
console.log('panel viewer arms selftest: ok')

// Panel 13 (advisor): the OFF arm is captured only once the check is FINAL.
{
  const { awaitChecked, checkUnsettled, backgroundPending } = await import('./awaitChecked.mjs')
  for (const cs of ['checked', 'general', 'needs_answers', 'not_fully_checked']) assert.equal(checkUnsettled({ check_status: cs }), false)
  assert.equal(checkUnsettled({}), false)
  assert.equal(checkUnsettled({ check_status: 'unchecked' }), true)
  // A failed ATTEMPT (worker retrying) is still pending here, though backgroundPending lets it through.
  const retrying = { check_status: 'unchecked', gate_progress: { step: 'failed' } }
  assert.equal(checkUnsettled(retrying), true)
  assert.equal(backgroundPending(retrying), false)
  const seq = [retrying, { check_status: 'unchecked', gate_progress: { step: 'judging' } }, { check_status: 'checked', script: [{ line: 'final' }] }]
  const c = clock()
  const w = await awaitChecked(async () => seq.shift(), 'g', { initial: { check_status: 'unchecked' }, pending: checkUnsettled, pollMs: 5_000, timeoutMs: 60_000, ...c })
  assert.equal(w.blueprint.check_status, 'checked'); assert.equal(w.timed_out, false)
  const never = await awaitChecked(async () => retrying, 'g', { initial: retrying, pending: checkUnsettled, pollMs: 5_000, timeoutMs: 20_000, ...clock() })
  assert.equal(never.timed_out, true)
  console.log('panel check-final selftest: ok')
}
await import('./panelArmsBlind.selftest.mjs')
