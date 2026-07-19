// Editor v2 Phase 2 — DISABLED-gate probe.
//
// Runs BEFORE the workflow sets EDITOR_V2_START_ENABLED=true on staging, i.e.
// against the fail-closed default (env missing). Proves the four gate
// requirements: a missing value means disabled; a disabled gate creates
// nothing; the client cannot override it from the request; and (implicitly,
// via the full matrix that runs after the secret is set) the enabled gate
// operates normally.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = need('STAGING_URL')
const ANON = need('STAGING_ANON_KEY')
const SERVICE = need('STAGING_SERVICE_ROLE_KEY')
function need(k) {
  const v = process.env[k]
  if (!v) { console.error(`missing env ${k}`); process.exit(1) }
  return v
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

let passed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failures.push(name); console.log(`  FAIL  ${name}  ${detail}`) }
}

async function main() {
  const email = `gate-${randomUUID().slice(0, 8)}@staging.test`
  const pw = `It-${randomUUID()}`
  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
  if (uErr) throw new Error(uErr.message)
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: lErr } = await client.auth.signInWithPassword({ email, password: pw })
  if (lErr) throw new Error(lErr.message)
  const { data: { session } } = await client.auth.getSession()

  const { count: projBefore } = await admin.from('edit_projects').select('id', { count: 'exact', head: true })
  const { count: jobsBefore } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('type', 'editor_v2')

  const call = async (body) => {
    const res = await fetch(`${URL}/functions/v1/start-editor-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  // Missing env value → disabled, 503, stable code.
  const r1 = await call({ generation_id: randomUUID(), source_asset_id: randomUUID(), idempotency_key: randomUUID() })
  check('disabled: valid-shaped request → 503 editor_not_available',
    r1.status === 503 && r1.body.code === 'editor_not_available', `status=${r1.status} code=${r1.body.code}`)

  // The client cannot override the gate from the request.
  const r2 = await call({
    generation_id: randomUUID(), source_asset_id: randomUUID(), idempotency_key: randomUUID(),
    editor_v2_start_enabled: true, EDITOR_V2_START_ENABLED: 'true',
  })
  check('disabled: request fields cannot flip the gate (still 503)', r2.status === 503, `status=${r2.status}`)

  const { count: projAfter } = await admin.from('edit_projects').select('id', { count: 'exact', head: true })
  const { count: jobsAfter } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('type', 'editor_v2')
  check('disabled: zero projects created', projAfter === projBefore, `${projBefore}→${projAfter}`)
  check('disabled: zero editor_v2 jobs created', jobsAfter === jobsBefore, `${jobsBefore}→${jobsAfter}`)

  await admin.auth.admin.deleteUser(u.user.id).catch(() => {})

  console.log(`\nDISABLED-GATE PROBE — PASSED: ${passed}  FAILED: ${failures.length}`)
  if (failures.length > 0) process.exit(1)
}

main().catch((e) => { console.error('PROBE ERROR:', e); process.exit(1) })
