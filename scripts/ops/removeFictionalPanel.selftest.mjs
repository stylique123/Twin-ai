// Self-test for removeFictionalPanel.mjs (no network, no database; made-up ids only).
//   node scripts/ops/removeFictionalPanel.selftest.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runMode, allowlistFrom, removalTargets, assertCap, residualReport, removalLogRow, RESIDUAL_TABLES, MAX_TARGETS, CONFIRM, PANEL_TAG, verifiedCascades, dryRunResidualCounts, isTargetPath } from './removeFictionalPanel.mjs'
import { scanMigrations, readMigrations, coverageProblems, MIGRATIONS_DIR } from '../ci/check_panel_remove_coverage.mjs'

// Dry run by default; deletion needs both flags.
assert.deepEqual(runMode(['node', 'x']), { dryRun: true })
assert.deepEqual(runMode(['--dry-run=true', `--confirm=${CONFIRM}`]), { dryRun: true })
assert.throws(() => runMode(['--dry-run=false']), /REMOVE_PANEL/)
assert.throws(() => runMode(['--dry-run=false', '--confirm=yes']), /REMOVE_PANEL/)
assert.deepEqual(runMode(['--dry-run=false', `--confirm=${CONFIRM}`]), { dryRun: false })

// Allowlist comes only from a fictional_panel accounts record.
const allow = allowlistFrom(JSON.stringify({ tag: PANEL_TAG, accounts: [{ owner_id: 'fake-a' }, { owner_id: 'fake-b' }, {}] }))
assert.deepEqual([...allow], ['fake-a', 'fake-b'])
assert.throws(() => allowlistFrom({ tag: 'other', accounts: [] }), /not a fictional_panel/)

// ALL three tests must hold.
const tag = { twin_test_account: PANEL_TAG }
const users = [
  { id: 'fake-a', email: 'twin-panel+a@panel.invalid', app_metadata: tag },        // target
  { id: 'fake-b', email: 'twin-panel+b@example.com', app_metadata: tag },          // wrong domain
  { id: 'fake-c', email: 'twin-panel+c@panel.invalid', app_metadata: tag },        // not allowlisted
  { id: 'fake-a2', email: 'x@panel.invalid', app_metadata: {} },                   // untagged
  { id: 'fake-b', email: 'twin-panel+b@panel.invalid', user_metadata: tag },       // user_metadata does not count
]
assert.deepEqual(removalTargets(users, new Set(['fake-a', 'fake-b', 'fake-a2'])).map((u) => u.id), ['fake-a'])
assert.deepEqual(removalTargets(users, new Set()), [])

// Hard cap: 6 ok, 7 refused (allowlist or matched set); cap check precedes any delete.
assert.equal(MAX_TARGETS, 6)
assert.doesNotThrow(() => assertCap(6, 6))
assert.throws(() => assertCap(7, 6), /cap is 6/)
assert.throws(() => assertCap(6, 7), /cap is 6/)
const seven = Array.from({ length: 7 }, (_, i) => ({ id: `fake-${i}`, email: `p${i}@panel.invalid`, app_metadata: tag }))
assert.throws(() => assertCap(7, removalTargets(seven, new Set(seven.map((u) => u.id))).length), /refusing/)

// Residual report: one line per table, final line exactly `residual: <n>`.
const zero = residualReport({ 'generations.user_id': 0, 'profiles.id': 0 })
assert.deepEqual(zero.lines, ['remaining generations.user_id: 0', 'remaining profiles.id: 0', 'residual: 0'])
assert.equal(zero.residual, 0)
const some = residualReport({ 'generations.user_id': 2, 'jobs.owner_id': 1 })
assert.equal(some.lines.at(-1), 'residual: 3')
for (const t of ['generations', 'script_batch_results', 'creator_knowledge', 'product_entities', 'brands', 'brand_voices', 'profiles', 'jobs', 'ai_usage_ledger', 'analytics_events', 'referrals', 'posts', 'platform_connections']) {
  assert.ok(RESIDUAL_TABLES.some((r) => r.table === t), `residual check covers ${t}`)
}

// Cascade entries are verified from the migrations; the CI coverage guard passes on the real list.
const cols = scanMigrations(readMigrations(MIGRATIONS_DIR))
const verified = verifiedCascades(cols)
for (const t of ['media_assets.owner_id', 'notifications.user_id', 'subscriptions.user_id']) {
  assert.ok(RESIDUAL_TABLES.some((r) => `${r.table}.${r.col}` === t && r.cleanup === 'cascade'), `${t} is a cascade entry`)
  assert.ok(verified.has(t), `${t} cascade verified from migrations`)
}
assert.deepEqual(coverageProblems(cols, RESIDUAL_TABLES), [])
for (const r of RESIDUAL_TABLES) assert.ok(['delete', 'cascade', 'report'].includes(r.cleanup), `${r.table}: known cleanup`)

// Dry-run residual: delete and verified cascade clear; report and unverified cascade survive.
const entries = [
  { table: 'a', col: 'owner_id', cleanup: 'delete' },
  { table: 'b', col: 'owner_id', cleanup: 'cascade' },
  { table: 'c', col: 'owner_id', cleanup: 'cascade' },
  { table: 'd', col: 'accepted_by', cleanup: 'report' },
]
const dry = dryRunResidualCounts({ 'a.owner_id': 4, 'b.owner_id': 3, 'c.owner_id': 2, 'd.accepted_by': 1 }, new Set(['b.owner_id']), entries)
assert.deepEqual(dry, { 'a.owner_id': 0, 'b.owner_id': 0, 'c.owner_id': 2, 'd.accepted_by': 1 })
assert.equal(residualReport(dry).residual, 3)
assert.equal(residualReport(dryRunResidualCounts({ 'b.owner_id': 5 }, new Set(), entries)).residual, 5, 'unverified cascade is residual')

// Storage: only paths whose first segment is a target id.
assert.ok(isTargetPath('fake-a/take.webm', ['fake-a']))
assert.ok(isTargetPath('fake-a/x/y.png', ['fake-a']))
assert.ok(!isTargetPath('other/fake-a/y.png', ['fake-a']))
assert.ok(!isTargetPath('fake-ab/y.png', ['fake-a']))
assert.ok(!isTargetPath('', ['fake-a']))
assert.match(readFileSync(new URL('./removeFictionalPanel.mjs', import.meta.url), 'utf8'), /storage\.from\(bucket\)\.remove\(paths\.slice/, 'storage removal is scoped to the listed target paths')
assert.match(readFileSync(new URL('./removeFictionalPanel.mjs', import.meta.url), 'utf8'), /storage\.objects\.owner_unverified/, 'unavailable owner lookup fails closed on a real run')

// Removal log row: ops_events panel_removed, counts only, no ids or emails.
const row = removalLogRow({ deleted: { 'generations.user_id': 3 }, remaining: { 'generations.user_id': 0 }, residual: 0, runId: '123', actor: 'someone', at: '2026-01-01T00:00:00.000Z' })
assert.equal(row.kind, 'panel_removed')
assert.deepEqual(Object.keys(row.detail).sort(), ['actor', 'at', 'deleted', 'remaining', 'residual', 'run_id'])
assert.ok(!('user_id' in row))
assert.ok(!/fake-|@|owner_id"|"id"/.test(JSON.stringify(row)), 'log row carries no ids or emails')
// Logs: counts only (no email or id interpolated).
const src = readFileSync(new URL('./removeFictionalPanel.mjs', import.meta.url), 'utf8')
for (const line of src.split('\n').filter((l) => /console\.log/.test(l))) assert.ok(!/email|\$\{id\}|\$\{u\./.test(line), line.trim())
assert.ok(!/from\('test_run_files'\)\.delete/.test(src), 'the private panel row is never deleted')

// Workflow: manual, main-only, owner-only, dry run by default, confirm required.
const wf = readFileSync(new URL('../../.github/workflows/panel-remove.yml', import.meta.url), 'utf8')
assert.match(wf, /^on:\n {2}workflow_dispatch:/m)
assert.ok(!/^\s*(pull_request|pull_request_target|push|schedule):/m.test(wf))
assert.match(wf, /\[ "\$REF" != "refs\/heads\/main" \]/)
assert.match(wf, /\[ "\$ACTOR" != "\$OWNER" \]/)
assert.match(wf, /dry_run:[\s\S]*?default: true/)
assert.match(wf, /\[ "\$CONFIRM" != "REMOVE_PANEL" \]/)
assert.match(wf, /concurrency:\n {2}group: panel-remove\n {2}cancel-in-progress: false/)
assert.match(wf, /environment: panel-remove/)
assert.ok(!/set -x|printenv|toJSON\(secrets\)/.test(wf))
console.log('remove panel selftest: ok')
