// Self-test for the single-arm panel blind pack. No network, no database.
import assert from 'node:assert/strict'
import { buildBlindPack, outcomeOf, buildTrace, lineOrigin } from './panelBlindPack.mjs'

let seed = 7
const rand = (n) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) & 0xff); return b }
const row = (n, extra = {}) => ({ n, status: 200, code: null, generation_id: `g${n}`, script_text: `1. Line one for ${n}\n2. Line two`, hooks: ['h'], scenario: { group: 'panel', label: `panel-${n}`, creator: 'clay-kiln', body: { goal: 'sell', reference_note: `request ${n}` } }, ...extra })
const rows = [
  row(1), row(2), row(3),
  row(4, { status: 409, code: 'NEEDS_STORY', script_text: null }),
  row(5, { status: 500, script_text: null }),
  { n: 9, status: 200, script_text: 'x', scenario: { group: 'paired' } }, // not panel: ignored
]
const bps = { g1: { invention_gate: { after: { I: 2 } }, check_status: 'checked', panel_final_pass: { pressure: 1, filler: 1 } }, g2: { invention_gate: { before: { I: 0 } }, check_status: 'checked' }, g3: {} }
const p = buildBlindPack(rows, bps, (lines) => lines.length + 2, rand)

assert.equal(outcomeOf(rows[3]), 'asked')
assert.equal(p.report.rows, 5)
assert.equal(p.report.scripts, 3)
assert.equal(p.report.asked, 1)
assert.deepEqual(p.report.failures, [{ reason: 'http_500' }])
assert.equal(p.report.invented_lines, 2)
assert.equal(p.report.scripts_with_invented, 1)
assert.equal(p.report.invented_unknown, 1)
assert.equal(p.report.craft_prescore_mean, 4)
assert.deepEqual(p.report.final_pass, { pressure: 1, filler: 1 })
assert.equal(p.report.headline.requests, 5)
assert.equal(p.report.headline.asked, 1)
assert.match(p.report.headline.invented, /^1 of 3 scripts \(2 lines/)
// Blind: the creator slug is shown above each script (to check facts against
// her material); label, n and generation id are not. All of them are in the key.
assert.equal((p.blind.match(/\*\*Creator:\*\* clay-kiln · \*\*Goal:\*\* sell · \*\*Request:\*\* request \d/g) ?? []).length, 3)
assert.doesNotMatch(p.blind, /panel-\d|#\d|\bg\d\b/)
assert.ok(Object.keys(p.key).every((id) => /^S-[0-9A-F]{6}$/.test(id) && p.blind.includes(`## ${id}`)))
assert.equal(Object.keys(p.key).length, 3)
assert.ok(Object.values(p.key).every((k) => k.creator === 'clay-kiln' && /^panel-\d$/.test(k.label)))
// The report carries no ids that map back to the key.
assert.doesNotMatch(JSON.stringify(p.report), /S-[0-9A-F]{6}|g\d|clay-kiln/)
// Trace (read-only): where each shipped line came from, and what was handed.
assert.equal(lineOrigin('I sold 400 mugs.', null), 'no_draft')
assert.equal(lineOrigin('Hand-thrown and fired twice.', ['Hand-thrown and fired twice.']), 'first_draft')
assert.equal(lineOrigin('I pulled a hamstring sprinting for a bus.', ['Warm up first.', 'Then lift.']), 'added_later')
const tr = buildTrace([row(1)], { g1: { script: [{ line: 'Line one for 1' }, { line: 'A brand new line' }], writer_raw: { lines: [{ line: 'Line one for 1' }] }, writer_supply: { knowledge_ids: ['k1', 'k2'], product_fact_ids: ['p1'], answer_keys: [] }, word_budget: { action: 'lengthened', added: ['k9'] } } }, { g1: 'u1' }, { u1: { total: 9 } })
assert.equal(tr.length, 1)
assert.deepEqual(tr[0].lines.map((l) => l.origin), ['first_draft', 'added_later'])
assert.deepEqual(tr[0].handed, { knowledge: 2, product_facts: 1, answers: 0, note: false })
assert.equal(tr[0].stored.total, 9)
assert.equal(tr[0].word_budget.action, 'lengthened')
console.log('panelBlindPack selftest: ok')
