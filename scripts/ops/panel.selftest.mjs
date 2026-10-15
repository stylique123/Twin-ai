// Self-test for the fictional creator panel scripts (no network, no database).
//   node scripts/ops/panel.selftest.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { panelScenarios, skipAnswers, PANEL_SKIP_ANSWER } from './panelRun.mjs'
import { productKnowledge, resolveExpiry, panelEmail, panelDomain, reusePlan, PANEL_CREDITS, PANEL_DOMAIN, LEGACY_PANEL_DOMAIN, PANEL_TAG } from './seedFictionalPanel.mjs'
import { ledgerWithText, assertOutsideRepo, csvCell, gatePending } from './exportPanel.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))

// The design: 8 creators, 40 requests (coverage is checked in panelFixtures.selftest.mjs).
// The first six creators keep their original four requests (educate, sell/leads, story, thin).
assert.equal(fixture.creators.length, 8)
assert.equal(fixture.requests.length, 40)
for (const c of fixture.creators) {
  const kinds = fixture.requests.slice(0, 24).filter((r) => r.creator === c.key).map((r) => r.kind).sort()
  if (kinds.length) {
    assert.deepEqual(kinds.filter((k) => k !== 'sell' && k !== 'leads'), ['educate', 'story', 'thin'], c.key)
    assert.equal(kinds.length, 4, c.key)
  }
  if (c.key === 'quiet-loom') assert.equal(c.stories.length, 0, 'quiet-loom has no creator truth on purpose')
  else assert.ok(c.stories.length >= 3 && c.stories.length <= 5, `${c.key}: 3-5 stories`)
  assert.ok(c.products.length >= 1 && c.products.length <= 3, `${c.key}: 1-3 products`)
  for (const s of c.stories) assert.ok(s.text.length <= 240, `${c.key}: story fits creator_knowledge`)
  for (const p of c.products) for (const f of p.facts) if (f.field === 'testimonial') {
    assert.ok(f.test_data, 'a testimonial is flagged as test data')
    assert.doesNotMatch(f.value, /made[- ]?up|fictional|testimonial/i, 'the test-data label is a flag, never inside the text')
  }
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
assert.equal(panelEmail('flowdesk'), 'twin-panel+flowdesk@panel.invalid')

// Owner conditions: non-deliverable domain only, zero credits.
assert.equal(PANEL_DOMAIN, 'panel.invalid')
assert.equal(panelDomain('qa.panel.invalid'), 'qa.panel.invalid')
for (const bad of ['example.com', 'gmail.com', 'invalid', 'x.invalid.com', 'a@b.invalid']) assert.throws(() => panelDomain(bad), /\.invalid/, bad)
assert.equal(PANEL_CREDITS, 0)

// Idempotent seeding: reuse the current address, migrate a TAGGED legacy one, else create.
const tagged = { id: 'u-legacy', app_metadata: { twin_test_account: PANEL_TAG } }
assert.equal(reusePlan({ id: 'u-now' }, tagged).action, 'reuse')
assert.equal(reusePlan(null, tagged).action, 'migrate')
assert.equal(reusePlan(null, { id: 'u-real', app_metadata: {} }).action, 'create', 'an untagged legacy address is never adopted')
assert.equal(reusePlan(null, null).action, 'create')
assert.equal(LEGACY_PANEL_DOMAIN, 'example.com')
const seedSrc = readFileSync(new URL('./seedFictionalPanel.mjs', import.meta.url), 'utf8')
assert.match(seedSrc, /updateUserById\(user\.id, \{ email, email_confirm: true \}\)/, 'legacy address migrated in place, no mail')
assert.match(seedSrc, /email_confirm: true,/, 'created confirmed: no mail')
assert.match(seedSrc, /prior\s*\? await admin\.from\('test_run_files'\)\.update\(fileRow\)/, 'accounts row reused by label')
assert.match(seedSrc, /delete\(\)\.eq\('owner_id', owner\)[\s\S]*product_entities'\)\.delete\(\)\.eq\('owner_id', owner\)/, 'knowledge and products replaced, not appended')
// Logs: counts and the private row id only; the password is never printed or stored.
for (const line of seedSrc.split('\n').filter((l) => /console\.(log|error|warn)/.test(l))) {
  assert.ok(!/email|owner|password|user\.id|\.id\b(?!\})/.test(line.replace(/data\.id/, '')), `seed log prints no ids/emails: ${line.trim()}`)
}
assert.ok(!/password[^\n]*(console|content|insert)/.test(seedSrc))


// Scenarios resolve each request to its own account and product.
const accounts = { accounts: fixture.creators.map((c, i) => ({ key: c.key, owner_id: `owner-${i}`, email: panelEmail(c.key), products: Object.fromEntries(c.products.map((p) => [p.key, `pid-${c.key}-${p.key}`])) })) }
const list = panelScenarios(fixture, accounts)
assert.equal(list.length, 40)
assert.equal(list[0].body.target_seconds, 60, 'standard profile is a minute')
assert.equal(list.find((x) => x.profile === 'deep').body.target_seconds, 90)
const sell = list.find((s) => s.creator === 'mayas-coffee' && s.kind === 'sell')
assert.equal(sell.body.selected_product_id, 'pid-mayas-coffee-harbor')
assert.equal(sell.body.door, 'product')
assert.equal(sell.owner_id, 'owner-0')
assert.equal(list.find((s) => s.kind === 'thin').body.selected_product_id, undefined)
assert.throws(() => panelScenarios(fixture, { accounts: [] }), /no seeded account/)
// A limited run resolves only its own creators: accounts seeded before the fixture grew still work.
{
  const firstKeys = new Set(fixture.requests.slice(0, 24).map((r) => r.creator))
  const older = { accounts: accounts.accounts.filter((a) => firstKeys.has(a.key)) }
  assert.equal(panelScenarios(fixture, older, 24).length, 24)
  assert.throws(() => panelScenarios(fixture, older), /no seeded account/)
}

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
// Outside items (niche notes, research, audience) carry their text when the gate job had it.
const ledO = ledgerWithText({ gateLedger: [{ id: 'o0' }, { id: 'o1' }], outside: [{ id: 'o0', kind: 'niche', text: 'made-up niche note' }] })
assert.deepEqual(ledO.map((x) => [x.text, x.text_known]), [['made-up niche note', true], [null, false]])
// A gate still queued on the worker is marked pending, never read as a record.
assert.equal(gatePending({ check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' }, gate_progress: { step: 'queued' } }), true)
assert.equal(gatePending({ check_status: 'unchecked', invention_gate: { outcome: 'measure_only' }, gate_progress: { step: 'done' } }), false)
assert.equal(gatePending({ check_status: 'checked', invention_gate: { outcome: 'final' } }), false)
assert.throws(() => assertOutsideRepo(new URL('./', import.meta.url).pathname + 'x'), /outside the repository/)
assert.ok(assertOutsideRepo('/tmp/panel-out'))
assert.equal(csvCell('a, "b"'), '"a, ""b"""')

// Public repo: no real-looking ids or keys in the fixture.
const raw = JSON.stringify(fixture)
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw), 'no uuids')
assert.ok(!/supabase\.co|eyJ[A-Za-z0-9]/.test(raw), 'no hosts or keys')
console.log('panel selftest: ok')
