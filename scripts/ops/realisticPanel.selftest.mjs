// Self-test for the realistic panel mode, panel side, and the persona calibration harness.
//   node scripts/ops/realisticPanel.selftest.mjs
// No network, no database, no model calls.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
// Product path, offline end to end: fixture product_url -> policy -> saved FICTIONAL snapshot -> facts -> trust.
const withUrl = fixture.creators.flatMap((c) => c.products.filter((p) => p.product_url))
assert.equal(withUrl.length, 4)
for (const p of withUrl) assert.match(p.product_url, /^https:\/\/example\.com\/fictional\/audit-set-v2\/fictional-[a-z-]+$/)
const snapDir = mkdtempSync(join(tmpdir(), 'rp-snap-'))
const page = (t) => `<!doctype html><html data-fictional="true"><head><title>${t} (fictional)</title><meta name="description" content="Invented page."></head><body><h1>Made by hand</h1><p data-price>$20</p><a href="https://x.example/" data-cta>Buy now</a></body></html>`
for (const p of withUrl) writeFileSync(join(snapDir, `${p.audit_snapshot}.html`), page(p.audit_snapshot))
writeFileSync(join(snapDir, 'fictional-planner-templates.html'), '<html><title>unmarked</title></html>')
const prod = realisticPlan({ fixture, list, env: { COST_MODE: 'full', PANEL_BUDGET_USD: '10', REALISTIC_SNAPSHOT_DIR: snapDir }, today: TODAY }).pages
assert.equal(prod.planned, 4)
assert.equal(prod.read, 3, 'the page not marked fictional is refused')
assert.equal(prod.refused.not_marked_fictional, 1)
assert.deepEqual(prod.facts, { speakable: 12, held_back: 3 }, 'every price is held back')
// Without saved snapshots, offline: nothing is read and nothing falls back.
const none = realisticPlan({ fixture, list, env: { COST_MODE: 'full', PANEL_BUDGET_USD: '10', REALISTIC_SNAPSHOT_DIR: join(snapDir, 'missing') }, today: TODAY }).pages
assert.equal(none.read, 0)
assert.equal(none.refused.no_snapshot_offline, 4)
const coffee = list.find((sc) => sc.creator === 'mayas-coffee')
const body = realisticBody(full, coffee)
assert.equal(body.cost_mode, 'full')
assert.equal(body.panel_pain_map.fictional, true)
for (const e of body.panel_pain_map.entries) assert.ok(e.thread_count >= 5 && e.community_count >= 2)
const comedy = list.find((sc) => sc.creator === 'pip-sprocket')
assert.equal(realisticBody(full, comedy).panel_pain_map, undefined, 'no map for a niche without one')
assert.deepEqual(Object.keys(body.panel_extras).sort(), ['audience_comments', 'niche_notes', 'outside_knowledge'])
const noNotes = realisticPlan({ fixture, list, env: { COST_MODE: 'full', PANEL_BUDGET_USD: '10', REALISTIC_NICHE_NOTES: 'off' }, today: TODAY })
assert.equal(realisticBody(noNotes, coffee).panel_extras.niche_notes, undefined, 'an extra off by its flag is not sent')
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
