// Selftest for awaitChecked (fake clock, fake rows; no network, no paid calls).
import assert from 'node:assert/strict'
import { awaitChecked, backgroundPending } from './awaitChecked.mjs'

const fakeClock = () => {
  let t = 0
  return { now: () => t, sleep: async (ms) => { t += ms } }
}

assert.equal(backgroundPending(null), false)
assert.equal(backgroundPending({ check_status: 'checked' }), false)
assert.equal(backgroundPending({ check_status: 'unchecked', polish_pending: {}, gate_progress: { step: 'polishing' } }), true)
assert.equal(backgroundPending({ check_status: 'unchecked', gate_progress: { step: 'done' } }), false)
assert.equal(backgroundPending({ check_status: 'unchecked', gate_progress: { step: 'failed' } }), false)

// Polished and checked after ~40 s of fake time: the final script is returned.
{
  const c = fakeClock()
  const draft = { check_status: 'unchecked', polish_pending: {}, script: [{ line: 'draft' }] }
  const load = async () => (c.now() >= 40_000 ? { check_status: 'checked', script: [{ line: 'polished' }] } : draft)
  const r = await awaitChecked(load, 'gen-fixture', { now: c.now, sleep: c.sleep, pollMs: 5_000, initial: draft })
  assert.equal(r.timed_out, false)
  assert.equal(r.blueprint.script[0].line, 'polished')
  assert.equal(r.waited_ms, 40_000)
}

// Never finishes: gives up at the timeout with the last row read.
{
  const c = fakeClock()
  const draft = { check_status: 'unchecked', gate_progress: { step: 'judging' } }
  const r = await awaitChecked(async () => draft, 'gen-fixture', { now: c.now, sleep: c.sleep, pollMs: 10_000, timeoutMs: 60_000 })
  assert.equal(r.timed_out, true)
  assert.equal(r.waited_ms, 60_000)
}

// Already checked: no poll at all.
{
  let calls = 0
  const r = await awaitChecked(async () => { calls++; return null }, 'x', { initial: { check_status: 'checked' } })
  assert.equal(calls, 0)
  assert.equal(r.polls, 0)
}
console.log('awaitChecked selftest: OK')
