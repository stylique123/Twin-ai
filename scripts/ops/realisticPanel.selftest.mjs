// Self-test for the realistic panel mode, panel side, and the persona calibration harness.
//   node scripts/ops/realisticPanel.selftest.mjs
// No network, no database, no model calls.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { panelScenarios } from './panelRun.mjs'
import { panelEmail } from './seedFictionalPanel.mjs'
import { realisticPlan, planSummary, realisticBody } from './realisticPanelPlan.mjs'
import { loadSets, calibrationBudget, correlate, CALIBRATION_PERSONAS } from './personaCalibration.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))
const accounts = { accounts: fixture.creators.map((c, i) => ({ key: c.key, owner_id: `owner-${i}`, email: panelEmail(c.key), products: Object.fromEntries(c.products.map((p) => [p.key, `pid-${c.key}-${p.key}`])) })) }
const list = panelScenarios(fixture, accounts)
const TODAY = '2026-10-26'

// Default (no COST_MODE): today's panel, unchanged — no extra body fields, extras off.
const plain = realisticPlan({ fixture, list, env: {}, today: TODAY })
assert.equal(plain.decision.mode, 'test')
for (const sc of list) assert.deepEqual(realisticBody(plain, sc), {})

// COST_MODE=full: every extra on, the budget printed and gated, the fictional pain map sent.
const full = realisticPlan({ fixture, list, env: { COST_MODE: 'full', PANEL_BUDGET_USD: '10' }, today: TODAY })
const sum = planSummary(full)
assert.equal(sum.cost_mode, 'full')
assert.equal(sum.budget_gate, 'within_cap')
assert.equal(sum.reddit_scan_v2, 'owner_flag_off')
assert.equal(sum.pain_map.fictional, true)
assert.ok(sum.pain_map.entries > 0)
assert.equal(sum.product_pages.planned, 0, 'no fixture carries a product URL yet, so nothing is read')
const coffee = list.find((sc) => sc.creator === 'mayas-coffee')
const body = realisticBody(full, coffee)
assert.equal(body.cost_mode, 'full')
assert.equal(body.panel_pain_map.fictional, true)
for (const e of body.panel_pain_map.entries) assert.ok(e.thread_count >= 5 && e.community_count >= 2)
const comedy = list.find((sc) => sc.creator === 'pip-sprocket')
assert.equal(realisticBody(full, comedy).panel_pain_map, undefined, 'no map for a niche without one')
// The summary printed before the run is counts and dollars only: no topic text.
assert.doesNotMatch(JSON.stringify(sum), /beans|roast|glaze/i)

// Over the cap: refused.
assert.equal(realisticPlan({ fixture, list, env: { COST_MODE: 'full', PANEL_BUDGET_USD: '0.5' }, today: TODAY }).gate.ok, false)
// One extra off by its own flag.
assert.equal(realisticPlan({ fixture, list, env: { COST_MODE: 'full', REALISTIC_PERSONAS: 'off' }, today: TODAY }).decision.extras.personas, false)

// Persona calibration harness: the advisor sets load, the budget is estimated, correlations are numbers.
const sets = loadSets()
assert.equal(sets.hooks.length, 603)
assert.equal(sets.scripts.length, 109)
const b = calibrationBudget({ hooks: sets.hooks.length, scripts: sets.scripts.length })
assert.equal(b.calls, Math.ceil(603 / 20) * 3 + 109 * 3)
assert.ok(b.est_usd > 0 && b.est_usd < 2)
const perfect = Object.fromEntries([...sets.hooks, ...sets.scripts].map((it) => [it.key, it.label]))
const noise = Object.fromEntries([...sets.hooks, ...sets.scripts].map((it, i) => [it.key, (i * 7) % 5]))
const r = correlate(sets, { [CALIBRATION_PERSONAS[0].id]: perfect, [CALIBRATION_PERSONAS[2].id]: noise })
assert.equal(r[0].may_influence, true)
assert.ok(r[0].hook_r > 0.99 && r[0].craft_r > 0.99)
assert.equal(r[1].may_influence, false)
for (const x of r) for (const v of Object.values(x)) assert.ok(['number', 'boolean', 'string'].includes(typeof v) || v === null)

console.log('realisticPanel selftest: ok')
