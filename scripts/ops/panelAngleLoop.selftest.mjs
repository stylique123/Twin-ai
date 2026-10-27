// Self-test for the panel angle loop (plan v7.1 WP12, PANEL_ANGLE_LOOP=on). No network, no database.
//   node scripts/ops/panelAngleLoop.selftest.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { angleLoopAnswers, panelAngleLoopOn } from './panelRun.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))
const c = fixture.creators[0]

assert.equal(panelAngleLoopOn({}), false)
assert.equal(panelAngleLoopOn({ PANEL_ANGLE_LOOP: 'on' }), true)

// Two engine questions: a pain (kind niche) and a story gap. Both answered from her fixture.
const qs = [
  { key: 'mn:pain:p1', kind: 'niche', piece: 'story', ask_id: 'a1' },
  { key: 'mn:gap:story', kind: 'story', piece: 'story' },
  { key: 'mn:gap:unknown', kind: 'unknown_kind', piece: 'x' },
  { key: 'not-mn', kind: 'story', piece: 'story' },
]
const r = angleLoopAnswers(qs, c.answers)
assert.deepEqual(Object.keys(r.mn_answers), ['mn:pain:p1', 'mn:gap:story'])
assert.equal(r.mn_answers['mn:gap:story'], c.answers.story)
assert.equal(r.sends.length, 3)
assert.deepEqual(r.sends[2], { key: 'mn:gap:unknown', piece: 'x', ask_id: undefined, skip: true })
console.log('panel angle loop selftest: OK')
