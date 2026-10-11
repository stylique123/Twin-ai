// Self-test for removeFictionalPanel.mjs (no network, no database; made-up ids only).
//   node scripts/ops/removeFictionalPanel.selftest.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runMode, allowlistFrom, removalTargets, CONFIRM, PANEL_TAG } from './removeFictionalPanel.mjs'

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
assert.ok(!/set -x|printenv|toJSON\(secrets\)/.test(wf))
console.log('remove panel selftest: ok')
