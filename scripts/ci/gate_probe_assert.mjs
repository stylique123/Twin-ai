// Offline, hostile-tested decision logic for the production editor-gate probe
// (.github/workflows/verify-prod-gate.yml). The workflow performs the read-only
// HTTP probes, then pipes the observed status/body into THIS module for the
// pass/fail decision — so the offline selftest proves the exact predicates the
// workflow runs, not a copy.
//
// Predicates (fail-closed):
//   * unauthenticated probe passes ONLY on an exact HTTP 401 (platform JWT wall).
//   * authenticated probe passes ONLY on HTTP 503 whose body contains
//     `editor_not_available` (the in-function gate). Any other status, or 503
//     without that marker, or a malformed/empty body, FAILS.
//   * required secrets must all be present; a missing secret FAILS (the
//     authenticated leg can never be silently skipped).
//
//   node scripts/ci/gate_probe_assert.mjs --selftest
//   GATE_STATUS=401 node scripts/ci/gate_probe_assert.mjs --check unauth
//   GATE_STATUS=503 GATE_BODY_FILE=/tmp/b node scripts/ci/gate_probe_assert.mjs --check auth
//   GATE_EMAIL=.. GATE_PASSWORD=.. node scripts/ci/gate_probe_assert.mjs --check secrets
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function assertUnauth(status) {
  const s = String(status ?? '').trim()
  return s === '401'
    ? { ok: true, reason: 'unauthenticated: exact 401 platform wall confirmed' }
    : { ok: false, reason: `unauthenticated: expected exactly 401, got "${s}"` }
}

export function assertAuthGate(status, body) {
  const s = String(status ?? '').trim()
  const b = String(body ?? '')
  if (s !== '503') return { ok: false, reason: `authenticated: expected exactly 503, got "${s}"` }
  if (!/editor_not_available/.test(b)) return { ok: false, reason: 'authenticated: 503 but body missing editor_not_available (malformed / wrong error)' }
  return { ok: true, reason: 'authenticated: 503 editor_not_available fail-closed gate confirmed' }
}

export function assertSecretsPresent(map) {
  const missing = Object.entries(map).filter(([, v]) => v === undefined || v === null || String(v).trim() === '').map(([k]) => k)
  return missing.length === 0
    ? { ok: true, reason: 'all required secrets present' }
    : { ok: false, reason: `missing required secret(s): ${missing.join(', ')}` }
}

function selftest() {
  let failed = 0
  const ok = (cond, msg) => { if (!cond) { console.error(`SELFTEST FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }

  // unauth: exact 401 passes; everything else fails.
  ok(assertUnauth('401').ok, 'unauth 401 → pass')
  for (const bad of ['200', '400', '404', '500', '403', '', undefined, 'null', '4010'])
    ok(!assertUnauth(bad).ok, `unauth ${JSON.stringify(bad)} → fail`)

  // auth: exactly 503 + editor_not_available passes.
  ok(assertAuthGate('503', '{"error":"editor_not_available"}').ok, 'auth 503 + editor_not_available → pass')
  ok(!assertAuthGate('503', '{"error":"something_else"}').ok, 'auth 503 without marker → fail')
  ok(!assertAuthGate('503', '').ok, 'auth 503 + empty body → fail (malformed)')
  ok(!assertAuthGate('503', '<html>502 bad gateway</html>').ok, 'auth 503 + malformed html body → fail')
  for (const bad of ['200', '400', '404', '500'])
    ok(!assertAuthGate(bad, '{"error":"editor_not_available"}').ok, `auth ${bad} even with marker body → fail (status must be 503)`)
  ok(!assertAuthGate(undefined, undefined).ok, 'auth with no status/body (skipped execution) → fail')

  // secrets: all present passes; any missing fails.
  ok(assertSecretsPresent({ PROD_PROBE_EMAIL: 'a@twinai.internal', PROD_PROBE_PASSWORD: 'x' }).ok, 'secrets both present → pass')
  ok(!assertSecretsPresent({ PROD_PROBE_EMAIL: '', PROD_PROBE_PASSWORD: 'x' }).ok, 'secrets missing email → fail')
  ok(!assertSecretsPresent({ PROD_PROBE_EMAIL: 'a', PROD_PROBE_PASSWORD: '' }).ok, 'secrets missing password → fail')
  ok(!assertSecretsPresent({ SUPABASE_ACCESS_TOKEN: undefined }).ok, 'secrets missing token → fail')

  if (failed) { console.error(`gate-probe-assert selftest: ${failed} failed`); process.exit(1) }
  console.log('gate-probe-assert selftest: all hostile cases passed'); process.exit(0)
}

function argVal(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const check = argVal('--check')
    let r
    if (check === 'unauth') r = assertUnauth(process.env.GATE_STATUS)
    else if (check === 'auth') {
      let body = ''
      try { if (process.env.GATE_BODY_FILE) body = readFileSync(process.env.GATE_BODY_FILE, 'utf8') } catch {}
      r = assertAuthGate(process.env.GATE_STATUS, body)
    } else if (check === 'secrets') r = assertSecretsPresent({ PROD_PROBE_EMAIL: process.env.GATE_EMAIL, PROD_PROBE_PASSWORD: process.env.GATE_PASSWORD })
    else { console.error('::error::unknown --check (expected unauth|auth|secrets)'); process.exit(2) }
    if (r.ok) console.log(r.reason)
    else console.error(`::error::${r.reason}`)
    process.exit(r.ok ? 0 : 1)
  }
}
