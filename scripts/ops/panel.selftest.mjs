// Self-test for the fictional creator panel scripts (no network, no database).
//   node scripts/ops/panel.selftest.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { panelScenarios, skipAnswers, PANEL_SKIP_ANSWER } from './panelRun.mjs'
import { productKnowledge, resolveExpiry, panelEmail } from './seedFictionalPanel.mjs'
import { ledgerWithText, assertOutsideRepo, csvCell } from './exportPanel.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))

// The design: 6 creators, 4 requests each (educate, sell/leads, story, thin) = 24.
assert.equal(fixture.creators.length, 6)
assert.equal(fixture.requests.length, 24)
for (const c of fixture.creators) {
  const kinds = fixture.requests.filter((r) => r.creator === c.key).map((r) => r.kind).sort()
  assert.deepEqual(kinds.filter((k) => k !== 'sell' && k !== 'leads'), ['educate', 'story', 'thin'], c.key)
  assert.equal(kinds.length, 4, c.key)
  assert.ok(c.stories.length >= 3 && c.stories.length <= 5, `${c.key}: 3-5 stories`)
  assert.ok(c.products.length >= 1 && c.products.length <= 3, `${c.key}: 1-3 products`)
  for (const s of c.stories) assert.ok(s.text.length <= 240, `${c.key}: story fits creator_knowledge`)
  for (const p of c.products) for (const f of p.facts) if (f.field === 'testimonial') assert.match(f.value, /MADE-UP/, 'a testimonial is marked made-up')
}
// Glow Lab carries the one live urgency fact, with a source.
const glow = fixture.creators.find((c) => c.key === 'glow-lab')
const urg = glow.products.flatMap((p) => p.facts).filter((f) => f.field === 'urgency')
assert.equal(urg.length, 1)
assert.ok(urg[0].source)
const now = Date.parse('2026-10-13T00:00:00Z')
assert.ok(Date.parse(resolveExpiry(urg[0].expires_at, now)) > now, 'urgency stays live at run time')
const pk = productKnowledge('glow-lab', glow.products[0], now)
assert.ok(pk.every((f) => f.id.startsWith('panel:glow-lab:calm-cream:') && f.trust === 'usable'))
assert.ok(pk.find((f) => f.field === 'urgency').expires_at)
assert.equal(panelEmail('flowdesk'), 'twin-panel+flowdesk@example.com')

// Scenarios resolve each request to its own account and product.
const accounts = { accounts: fixture.creators.map((c, i) => ({ key: c.key, owner_id: `owner-${i}`, email: panelEmail(c.key), products: Object.fromEntries(c.products.map((p) => [p.key, `pid-${c.key}-${p.key}`])) })) }
const list = panelScenarios(fixture, accounts)
assert.equal(list.length, 24)
const sell = list.find((s) => s.creator === 'mayas-coffee' && s.kind === 'sell')
assert.equal(sell.body.selected_product_id, 'pid-mayas-coffee-harbor')
assert.equal(sell.body.door, 'product')
assert.equal(sell.owner_id, 'owner-0')
assert.equal(list.find((s) => s.kind === 'thin').body.selected_product_id, undefined)
assert.throws(() => panelScenarios(fixture, { accounts: [] }), /no seeded account/)

// A stand-in that is asked, skips; it keeps its own product pick.
const ans = skipAnswers([{ field: 'claims', question: 'q' }, { field: 'selected_product', options: [{ value: 'pid-x' }, { value: 'brand:b' }, { value: 'none' }] }], { selected_product_id: 'pid-x' })
assert.equal(ans.readiness_answers.claims, PANEL_SKIP_ANSWER)
assert.equal(ans.selected_product_id, 'pid-x')
assert.equal(skipAnswers([{ field: 'selected_product', options: [{ value: 'a' }, { value: 'none' }] }], {}).selected_product_id, 'none')

// Export: ledger items carry their text; the output never lands in the repo.
const led = ledgerWithText({
  gateLedger: [{ id: 'k1' }, { id: 'panel:m:h:0' }, { id: 'answer:claims' }, { id: 'note' }, { id: 'offer' }, { id: 'o0' }],
  knowledge: [{ id: 'k1', text: 'story' }], products: [{ name: 'H', knowledge: [{ id: 'panel:m:h:0', value: '$17' }] }],
  answers: { claims: 'skip' }, note: 'n', offer: 'off',
})
assert.deepEqual(led.map((x) => x.text), ['story', '$17', 'skip', 'n', 'off', null])
assert.throws(() => assertOutsideRepo(new URL('./', import.meta.url).pathname + 'x'), /outside the repository/)
assert.ok(assertOutsideRepo('/tmp/panel-out'))
assert.equal(csvCell('a, "b"'), '"a, ""b"""')

// Public repo: no real-looking ids or keys in the fixture.
const raw = JSON.stringify(fixture)
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw), 'no uuids')
assert.ok(!/supabase\.co|eyJ[A-Za-z0-9]/.test(raw), 'no hosts or keys')
console.log('panel selftest: ok')
