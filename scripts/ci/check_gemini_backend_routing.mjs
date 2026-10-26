#!/usr/bin/env node
// EVERY GEMINI CALL GOES THROUGH THE BACKEND HELPER.
//
// GEMINI_BACKEND=vertex moves every Gemini call to Vertex AI only if no call
// site spells a Google model endpoint itself. A new direct
// `https://generativelanguage.googleapis.com/...` (or a hand-built
// `aiplatform.googleapis.com` URL) would silently keep using the Developer API
// (or skip the ledger/quota handling), so this fails on one.
//
// Allowed: the helper itself (one source, its generated mirrors, and the scripts'
// JS twin) and tests/selftests, which pin URLs on purpose.
//
//   node scripts/ci/check_gemini_backend_routing.mjs
//
// Enforced in CI by packages/shared/src/__tests__/geminiBackendRouting.test.ts
// (unit-tests job), so no workflow edit is needed.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ROOTS = ['worker', 'supabase/functions', 'packages', 'scripts', 'discovery', 'apps', 'eval']
const ALLOWED = new Set([
  'packages/shared/src/geminiBackend.ts',
  'supabase/functions/_shared/geminiBackend.ts',
  'worker/src/generated/geminiBackend.ts',
  'scripts/lib/geminiBackend.mjs',
  'scripts/ci/check_gemini_backend_routing.mjs',
])
const isTest = (p) => /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /\.selftest\.mjs$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p)
const SOURCE = /\.(?:[cm]?[jt]sx?|py)$/
const DIRECT = /https:\/\/(?:generativelanguage\.googleapis\.com|(?:[a-z0-9-]+-)?aiplatform\.googleapis\.com)/

export function findDirectCalls(root = process.cwd()) {
  const files = execFileSync('git', ['ls-files', '-z', '--', ...ROOTS], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((p) => p && SOURCE.test(p) && !ALLOWED.has(p) && !isTest(p) && !p.includes('node_modules/'))
  const hits = []
  for (const p of files) {
    let text
    try { text = readFileSync(`${root}/${p}`, 'utf8') } catch { continue }
    text.split('\n').forEach((line, i) => { if (DIRECT.test(line)) hits.push(`${p}:${i + 1}`) })
  }
  return hits
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = findDirectCalls()
  if (hits.length) {
    for (const h of hits) {
      console.error(`::error::${h} calls a Google model endpoint directly. Route it through the Gemini backend helper `
        + '(worker: src/geminiEndpoint.ts, edge: _shared/geminiEndpoint.ts, scripts: scripts/lib/geminiBackend.mjs) '
        + 'so GEMINI_BACKEND=vertex reaches it.')
    }
    process.exit(1)
  }
  console.log('gemini backend routing: every Gemini call goes through the helper')
}
