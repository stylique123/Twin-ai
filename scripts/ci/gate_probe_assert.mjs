// Offline, hostile-tested decision logic for the production editor-gate probe
// (.github/workflows/verify-prod-gate.yml). The workflow performs the read-only
// HTTP probes (bodies captured to files, statuses captured separately via
// curl -o/-w) and pipes the observed status/body into THIS module for every
// pass/fail decision — so the offline selftest proves the exact predicates the
// workflow runs, not a copy.
//
// Predicates (fail-closed, STRICT):
//   * unauthenticated probe passes ONLY on an exact HTTP 401 (platform JWT wall).
//   * the login request itself must return exactly HTTP 200 BEFORE its token is
//     consumed — a non-200 login response is never parsed for a token.
//   * authenticated gate probe passes ONLY on exact HTTP 503 whose body PARSES
//     as a JSON object with top-level `code === "editor_not_available"`
//     (the exact shape start-editor-v2 returns:
//     `{ error: '…', code: 'editor_not_available' }`). A matching substring in
//     any other field, malformed JSON, HTML, an empty body, an array/string
//     body, a nested code, a similar-but-different code, or a valid-looking
//     body on a non-503 status ALL FAIL.
//   * required secrets must all be present; a missing secret FAILS (the
//     authenticated leg can never be silently skipped).
//
//   node scripts/ci/gate_probe_assert.mjs --selftest
//   GATE_STATUS=401 node scripts/ci/gate_probe_assert.mjs --check unauth
//   GATE_STATUS=200 node scripts/ci/gate_probe_assert.mjs --check login
//   GATE_STATUS=503 GATE_BODY_FILE=/path node scripts/ci/gate_probe_assert.mjs --check auth
//   GATE_EMAIL=.. GATE_PASSWORD=.. node scripts/ci/gate_probe_assert.mjs --check secrets
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function assertUnauth(status) {
  const s = String(status ?? '').trim()
  return s === '401'
    ? { ok: true, reason: 'unauthenticated: exact 401 platform wall confirmed' }
    : { ok: false, reason: `unauthenticated: expected exactly 401, got "${s}"` }
}

// The auth token endpoint returns 200 on success. Any other status means the
// login response must NOT be consumed for a token (its body is never printed —
// it can carry an access_token on success and account detail on failure).
export function assertLoginStatus(status) {
  const s = String(status ?? '').trim()
  return s === '200'
    ? { ok: true, reason: 'login: exact 200 — token may be consumed' }
    : { ok: false, reason: `login: expected exactly 200 before consuming a token, got "${s}"` }
}

export function assertAuthGate(status, body) {
  const s = String(status ?? '').trim()
  const b = String(body ?? '')
  if (s !== '503') return { ok: false, reason: `authenticated: expected exactly 503, got "${s}" (a valid-looking body on a wrong status never passes)` }
  let parsed
  try { parsed = JSON.parse(b) } catch {
    return { ok: false, reason: 'authenticated: 503 but body is not valid JSON (malformed/HTML/empty — fail closed)' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'authenticated: 503 but JSON body is not an object (fail closed)' }
  }
  if (parsed.code !== 'editor_not_available') {
    return { ok: false, reason: `authenticated: 503 but top-level code !== "editor_not_available" (got ${JSON.stringify(parsed.code)}) — substrings in other fields do not count` }
  }
  return { ok: true, reason: 'authenticated: 503 + JSON code === editor_not_available — fail-closed gate confirmed' }
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
  const MARKER_BODY = '{"error":"AI editing is not available yet.","code":"editor_not_available"}'

  // unauth: exact 401 passes; everything else fails.
  ok(assertUnauth('401').ok, 'unauth 401 → pass')
  for (const bad of ['200', '400', '404', '500', '403', '', undefined, 'null', '4010'])
    ok(!assertUnauth(bad).ok, `unauth ${JSON.stringify(bad)} → fail`)

  // login: exact 200 passes; token never consumed otherwise.
  ok(assertLoginStatus('200').ok, 'login 200 → pass (token may be consumed)')
  for (const bad of ['201', '204', '301', '400', '401', '403', '429', '500', '', undefined])
    ok(!assertLoginStatus(bad).ok, `login ${JSON.stringify(bad)} → fail (token must not be consumed)`)

  // auth happy path: exact 503 + JSON object with code === editor_not_available.
  ok(assertAuthGate('503', MARKER_BODY).ok, 'auth 503 + exact JSON code → pass')
  ok(assertAuthGate('503', '{\n  "error": "AI editing is not available yet.",\n  "code": "editor_not_available"\n}').ok,
    'auth 503 + MULTILINE valid JSON with exact code → pass (file capture, no head/tail mangling)')

  // hostile: misleading substrings / wrong fields — marker present but NOT as code.
  ok(!assertAuthGate('503', '{"error":"editor_not_available"}').ok, 'auth 503 marker in error field (not code) → fail')
  ok(!assertAuthGate('503', '{"message":"try later: editor_not_available"}').ok, 'auth 503 marker substring in message → fail')
  ok(!assertAuthGate('503', '{"code":"editor_not_available_v2"}').ok, 'auth 503 similar code editor_not_available_v2 → fail')
  ok(!assertAuthGate('503', '{"code":"not_editor_not_available"}').ok, 'auth 503 code with marker substring → fail')
  ok(!assertAuthGate('503', '{"data":{"code":"editor_not_available"}}').ok, 'auth 503 nested code (not top-level) → fail')
  ok(!assertAuthGate('503', '{"CODE":"editor_not_available"}').ok, 'auth 503 wrong-case field name → fail')

  // hostile: malformed / non-object bodies.
  ok(!assertAuthGate('503', '{"code":"editor_not_available"').ok, 'auth 503 truncated JSON → fail')
  ok(!assertAuthGate('503', 'code: editor_not_available').ok, 'auth 503 non-JSON text with marker → fail')
  ok(!assertAuthGate('503', '<html><body>editor_not_available</body></html>').ok, 'auth 503 HTML with marker → fail')
  ok(!assertAuthGate('503', '').ok, 'auth 503 empty body → fail')
  ok(!assertAuthGate('503', '["editor_not_available"]').ok, 'auth 503 JSON array body → fail')
  ok(!assertAuthGate('503', '"editor_not_available"').ok, 'auth 503 JSON string body → fail')
  ok(!assertAuthGate('503', 'null').ok, 'auth 503 JSON null body → fail')
  ok(!assertAuthGate('503', '{\n  "error": "x",\n  "code": "wrong"\n}').ok, 'auth 503 multiline JSON with wrong code → fail')

  // hostile: valid-looking body on incorrect HTTP statuses.
  for (const bad of ['200', '400', '404', '500', '502', ''])
    ok(!assertAuthGate(bad, MARKER_BODY).ok, `auth ${JSON.stringify(bad)} with perfect marker body → fail (status must be exactly 503)`)
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
    else if (check === 'login') r = assertLoginStatus(process.env.GATE_STATUS)
    else if (check === 'auth') {
      let body = ''
      try { if (process.env.GATE_BODY_FILE) body = readFileSync(process.env.GATE_BODY_FILE, 'utf8') } catch {}
      r = assertAuthGate(process.env.GATE_STATUS, body)
    } else if (check === 'secrets') r = assertSecretsPresent({ PROD_PROBE_EMAIL: process.env.GATE_EMAIL, PROD_PROBE_PASSWORD: process.env.GATE_PASSWORD })
    else { console.error('::error::unknown --check (expected unauth|login|auth|secrets)'); process.exit(2) }
    if (r.ok) console.log(r.reason)
    else console.error(`::error::${r.reason}`)
    process.exit(r.ok ? 0 : 1)
  }
}
