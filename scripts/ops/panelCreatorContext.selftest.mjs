// Self-test for panelCreatorContext.mjs (no network, no database; fictional data only).
//   node scripts/ops/panelCreatorContext.selftest.mjs
import assert from 'node:assert/strict'
import { buildContext, creatorContext, KEY_HEADER } from './panelCreatorContext.mjs'

const voice = {
  handle: 'moss_ink_fictional',
  profile: { niche: 'ink making', tone: 'slow, careful', samples: ['I grind every pigment by hand.', ' '], secret: 'never copied', fictional: true },
  pre_script_brief: { audience: 'painters who mix their own colours', contentPillars: ['pigment sourcing', '', 'paper tests'], goal: 'sales', background: '  ' },
}
const knowledge = [
  { kind: 'topic', text: 'I talk about foraged pigments and slow ink, not digital art.', source: 'asked' },
  { kind: 'fact', text: 'Read from a caption, not hers to confirm.', source: 'caption' },
  { kind: 'experience', text: 'I ruined my first batch by boiling the oak galls.', source: 'user' },
]
const c = creatorContext({ knowledge, voice })
assert.deepEqual(c.onboarding_answers, [
  { kind: 'topic', source: 'asked', text: 'I talk about foraged pigments and slow ink, not digital art.' },
  { kind: 'experience', source: 'user', text: 'I ruined my first batch by boiling the oak galls.' },
  { kind: 'audience', source: 'onboarding', text: 'painters who mix their own colours' },
])
assert.deepEqual(c.pillars, ['pigment sourcing', 'paper tests'])
assert.deepEqual(c.voice_card, { niche: 'ink making', tone: 'slow, careful', samples: ['I grind every pigment by hand.'] })

const s = buildContext('panel-fixture', [
  { owner_id: 'owner-b', handle: 'moss_ink_fictional', script_ids: ['panel-fixture#0', 'panel-fixture#3'], knowledge, voice },
  { owner_id: 'owner-a', handle: 'quiet_loom_fictional', script_ids: ['panel-fixture#1'], knowledge: [], voice: null },
])
assert.equal(s.creators, 2)
const ids = Object.keys(s.context)
assert.ok(ids.every((id) => /^PC-[0-9a-f]{8}$/.test(id)), 'opaque creator ids')
assert.deepEqual([...ids].sort(), ids, 'sorted by id, not by input order')
const key = s.key.trim().split('\n')
assert.equal(key[0], KEY_HEADER.join(','))
assert.equal(key.length, 3)
assert.ok(!JSON.stringify(s.context).includes('owner-'), 'owner ids only in the key')
assert.deepEqual(s.context[ids.find((id) => s.context[id].pillars.length === 0)].onboarding_answers, [])
console.log('panelCreatorContext selftest: ok')
