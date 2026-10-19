// Self-test for repairAuditSheet.mjs (no network, no database; fictional data only).
//   node scripts/ops/repairAuditSheet.selftest.mjs
import assert from 'node:assert/strict'
import { buildSheets, firstPartyItems, BLIND_HEADER, KEY_HEADER } from './repairAuditSheet.mjs'
import { assertOutsideRepo } from './exportPanel.mjs'

const items = firstPartyItems({
  knowledge: [{ id: 'k1', text: 'I dry every batch of Moss Ink pigment on a cedar rack.' }, { id: 'k2', text: '  ' }],
  products: [{ id: 'p1', name: 'Moss Ink', knowledge: [{ field: 'price', value: '12 dollars a jar' }] }, { id: 'p2', name: 'Other', knowledge: [{ value: 'not this one' }] }],
  productId: 'p1',
})
assert.deepEqual(items, ['I dry every batch of Moss Ink pigment on a cedar rack.', 'Moss Ink: 12 dollars a jar'])

const audit = [
  { round: 1, i: 2, surface: 'script', text: 'Moss Ink won a national award last year.', action: 'dropped', class: 'I', fast_class: 'I', strong_class: 'I', verdict: 'block', reason: 'judge', item_ids: [] },
  { round: 1, i: 4, surface: 'script', text: 'Thousands of painters swear by it.', action: 'replaced', replacement: 'I dry every batch on a cedar rack.', class: 'I', fast_class: 'I', strong_class: 'E', verdict: 'block', reason: 'judge', item_ids: ['k1'] },
  { round: 1, i: 5, surface: 'script', text: 'My best customer told me it changed her work.', action: 'asked', replacement: '[Your answer: …]', class: 'I', verdict: 'block', reason: 'judge', item_ids: [] },
  { round: 0, i: 1, surface: 'script', text: 'A kept review line.', action: 'kept', class: 'G', verdict: 'review', reason: 'judge', item_ids: [] },
  { round: 1, i: 6, surface: 'script', text: 'A refilled line.', action: 'refilled', replacement: 'x', class: 'I', reason: 'judge', item_ids: [] },
]
const gens = [
  { id: 'gen-moss-1', script_id: 'panel-fixture#0', blueprint: { invention_gate: { repair_audit: audit } }, items },
  { id: 'gen-moss-2', script_id: 'panel-fixture#1', blueprint: { invention_gate: {} }, items },
]
const s = buildSheets('panel-fixture', gens)
assert.equal(s.rows, 3, 'only dropped, replaced and asked lines are labeled')
const blind = s.blind.trim().split('\n')
const key = s.key.trim().split('\n')
assert.equal(blind[0], BLIND_HEADER.join(','))
assert.equal(key[0], KEY_HEADER.join(','))
assert.equal(blind.length, 4)
assert.equal(key.length, 4)
// Blind: no verdicts, actions or replacements.
for (const l of blind.slice(1)) {
  assert.doesNotMatch(l, /dropped|replaced|asked|block|review|cedar rack\.,|\[Your answer/)
  assert.match(l, /,,,,$/, 'four empty label columns')
  assert.match(l, /Moss Ink: 12 dollars a jar/)
}
assert.ok(!s.blind.includes('A kept review line') && !s.blind.includes('A refilled line'))
// Key maps every blind id to the generation, line, action and verdicts.
const ids = blind.slice(1).map((l) => l.split(',')[0])
assert.deepEqual(new Set(ids), new Set(key.slice(1).map((l) => l.split(',')[0])))
assert.ok(key.some((l) => /gen-moss-1,panel-fixture#0,1,4,script,replaced,I dry every batch on a cedar rack\.,I,I,E,block,judge,k1/.test(l)))
// Deterministic.
assert.equal(buildSheets('panel-fixture', gens).key, s.key)
// Output must be outside the repository.
assert.throws(() => assertOutsideRepo(new URL('.', import.meta.url).pathname), /outside the repository/)
console.log('repairAuditSheet selftest ok')
