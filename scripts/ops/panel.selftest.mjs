// Self-test for the fictional creator panel scripts (no network, no database).
//   node scripts/ops/panel.selftest.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { panelScenarios, skipAnswers, PANEL_SKIP_ANSWER, panelArm, armBody } from './panelRun.mjs'
import { productKnowledge, resolveExpiry, panelEmail, panelDomain, reusePlan, PANEL_CREDITS, PANEL_DOMAIN, LEGACY_PANEL_DOMAIN, PANEL_TAG } from './seedFictionalPanel.mjs'
import { ledgerWithText, assertOutsideRepo, csvCell, gatePending } from './exportPanel.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))

// The design: 8 creators, 40 requests plus coverage additions appended at the END (plan v5.1 item I;
// coverage is checked in panelFixtures.selftest.mjs and templateCoverage.test.ts).
// The first six creators keep their original four requests (educate, sell/leads, story, thin).
assert.equal(fixture.creators.length, 8)
assert.ok(fixture.requests.length >= 40)
// Wrong-product check stays meaningful: Harbor Blend and Night Owl share size and label facts,
// but each keeps facts the other must not carry.
{
  const maya = fixture.creators.find((c) => c.key === 'mayas-coffee')
  const facts = (k) => maya.products.find((p) => p.key === k).facts.map((f) => f.value).join(' | ')
  assert.match(facts('harbor'), /Tuesdays/); assert.doesNotMatch(facts('nightowl'), /Tuesdays|\$17/)
  assert.match(facts('nightowl'), /second crack/); assert.doesNotMatch(facts('harbor'), /second crack|\$19/)
}
for (const c of fixture.creators) {
  const kinds = fixture.requests.slice(0, 24).filter((r) => r.creator === c.key).map((r) => r.kind).sort()
  if (kinds.length) {
    assert.deepEqual(kinds.filter((k) => k !== 'sell' && k !== 'leads'), ['educate', 'story', 'thin'], c.key)
    assert.equal(kinds.length, 4, c.key)
  }
  if (c.key === 'quiet-loom') assert.equal(c.stories.length, 0, 'quiet-loom has no creator truth on purpose')
  // Richer fixtures: originals (3-4), up to five appended on-topic items, plus up to four
  // "messy" spoken-style items (coach-ana, flowdesk only). Every appended item is marked fictional.
  else assert.ok(c.stories.length >= 3 && c.stories.length <= 13, `${c.key}: 3-13 stories`)
  for (const s of c.stories.slice(5)) assert.equal(s.fictional, true, `${c.key}: appended story marked fictional`)
  const messy = c.stories.filter((s) => s.messy)
  if (messy.length) assert.ok(['coach-ana', 'flowdesk'].includes(c.key) && messy.length <= 4, `${c.key}: messy set is small and scoped`)
  for (const s of messy) assert.equal(s.fictional, true, `${c.key}: messy story marked fictional`)
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
assert.equal(list.length, fixture.requests.length)
assert.deepEqual(list.find((x) => x.id === 'panel-42')?.body.angle, { kind: 'curiosity', gist: fixture.requests.find((r) => r.id === 'panel-42').note }, 'an angle-named request carries its angle')
assert.equal(list[0].body.angle, undefined, 'the first requests carry no angle')
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

// THE SECOND ARM (plan v5.4 §20): per-request arm from the private panel row.
{
  const noEnv = {}
  assert.deepEqual(armBody({ accounts: [] }, 3, noEnv), {})
  const listed = { accounts: [], arms: { plan_b: [1, 4] } }
  assert.deepEqual(armBody(listed, 1, noEnv), { plan_b: true, panel_arm: 'plan_b' })
  assert.deepEqual(armBody(listed, 2, noEnv), { panel_arm: 'writer' })
  const alt = { accounts: [], ab_split: 'alternate' }
  assert.equal(panelArm(alt, 0, noEnv), 'writer')
  assert.equal(panelArm(alt, 1, noEnv), 'plan_b')
  assert.equal(panelArm({ ...alt, arms: { plan_b: [0] } }, 0, noEnv), 'plan_b')
  assert.equal(panelArm({ accounts: [] }, 0, { PANEL_PLAN_B: 'on' }), 'plan_b')
}
console.log('panel arms selftest ok')

// The modes harness self-test rides this one so the existing CI step runs it.
await import('./panelModes.selftest.mjs')
