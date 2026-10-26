// Selftest for the private leak-pattern loader (fictional pattern only; no network).
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadLeakPattern, LEAK_PATTERN_ENV } from './batchAuditLeakPattern.mjs'

const FICTIONAL = String.raw`\b(purple llama|seventeen kazoos)\b`
const missing = join(tmpdir(), 'no-such-dir', 'leak-pattern.txt')

// Env wins.
{
  const r = loadLeakPattern({ env: { [LEAK_PATTERN_ENV]: FICTIONAL }, file: missing })
  assert.equal(r.status, 'run')
  assert.ok(r.regex.test('We met a Purple Llama at the market'))
  assert.ok(!r.regex.test('an ordinary coffee line'))
}
// Private file (comments and blank lines skipped).
{
  const dir = mkdtempSync(join(tmpdir(), 'leak-'))
  const f = join(dir, 'leak-pattern.txt')
  writeFileSync(f, `# fictional\n\n${FICTIONAL}\n`)
  const r = loadLeakPattern({ env: {}, file: f })
  assert.equal(r.status, 'run')
  assert.equal(r.source, 'private file')
  assert.ok(r.regex.test('seventeen kazoos'))
}
// Neither: not run, never clean.
{
  const r = loadLeakPattern({ env: {}, file: missing })
  assert.equal(r.status, 'not run')
  assert.equal(r.regex, null)
  assert.match(r.reason, /BATCH_AUDIT_LEAK_PATTERN/)
}
// Invalid pattern: not run, reason does not echo the pattern.
{
  const r = loadLeakPattern({ env: { [LEAK_PATTERN_ENV]: '(unclosed kazoo' }, file: missing })
  assert.equal(r.status, 'not run')
  assert.ok(!r.reason.includes('kazoo'))
}
console.log('batchAuditLeakPattern selftest: ok')
