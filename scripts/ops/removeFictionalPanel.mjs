// REMOVE THE FICTIONAL CREATOR PANEL (owner, panel conditions). Run ONLY on the
// owner's OK, through .github/workflows/panel-remove.yml.
//
// ⚖️ A USER IS A TARGET ONLY IF ALL THREE HOLD:
//   1. app_metadata.twin_test_account === 'fictional_panel' (service-set; a user
//      cannot write app_metadata);
//   2. its email ends with '@panel.invalid';
//   3. its id is in the allowlist read from the PRIVATE test_run_files panel row
//      (label 'fictional-panel-accounts', kind 'other', written by
//      seedFictionalPanel.mjs). The ids are never committed.
// Anything failing one test is left alone and only counted.
//
// ⚠️ creator_knowledge: this is the one ops script that deletes knowledge rows,
// and only for owners passing all three tests. Batch scripts never write or
// delete creator_knowledge for real accounts.
//
// DRY RUN BY DEFAULT: it prints counts and changes nothing. Real deletion needs
// --dry-run=false AND --confirm=REMOVE_PANEL. Per target, it deletes
// script_batch_results for the target's generations, then generations,
// creator_knowledge, product_entities, brand_voices, brands and profiles, and
// then the auth user. It deletes nothing else (the private panel row is kept).
// HARD CAP: more than MAX_TARGETS allowlisted ids or matched users → refuse and
// exit non-zero before anything is deleted (dry run and real run alike).
// RESIDUAL REPORT: one count line per table in RESIDUAL_TABLES for the target
// owner ids, then `residual: <n>`; non-zero residual → exit non-zero. In a dry
// run the residual is what would survive (rows in tables neither deleted here
// nor cascaded from auth.users).
// REMOVAL LOG: a real run inserts one ops_events row (kind 'panel_removed') with
// per-table counts, residual, timestamp, GITHUB_RUN_ID and actor — no ids/emails.
// ⚠️ PUBLIC REPO: prints counts only.
//
// Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/removeFictionalPanel.mjs [--dry-run=false --confirm=REMOVE_PANEL]
import { createClient } from '@supabase/supabase-js'

export const PANEL_TAG = 'fictional_panel'
export const PANEL_EMAIL_SUFFIX = '@panel.invalid'
export const CONFIRM = 'REMOVE_PANEL'
export const ACCOUNTS_LABEL = 'fictional-panel-accounts'

export const MAX_TARGETS = 6

// Every table that references a target owner (from supabase/migrations).
// cleanup: 'delete' = deleted explicitly here; 'cascade' = FK on delete cascade
// from auth.users; via 'generation' = keyed by the target's generation ids.
export const RESIDUAL_TABLES = [
  { table: 'script_batch_results', col: 'generation_id', via: 'generation', cleanup: 'delete' },
  { table: 'generations', col: 'user_id', cleanup: 'delete' },
  { table: 'creator_knowledge', col: 'owner_id', cleanup: 'delete' },
  { table: 'product_entities', col: 'owner_id', cleanup: 'delete' },
  { table: 'brand_voices', col: 'owner_id', cleanup: 'delete' },
  { table: 'brands', col: 'owner_id', cleanup: 'delete' },
  { table: 'jobs', col: 'owner_id', cleanup: 'delete' },
  { table: 'ai_usage_ledger', col: 'owner_id', cleanup: 'delete' },
  { table: 'credit_events', col: 'user_id', cleanup: 'delete' },
  { table: 'analytics_events', col: 'user_id', cleanup: 'delete' },
  { table: 'referrals', col: 'referrer_id', cleanup: 'delete' },
  { table: 'referrals', col: 'invitee_id', cleanup: 'delete' },
  { table: 'posts', col: 'owner_id', cleanup: 'delete' },
  { table: 'platform_connections', col: 'owner_id', cleanup: 'delete' },
  { table: 'media_assets', col: 'owner_id', cleanup: 'cascade' },
  { table: 'notifications', col: 'user_id', cleanup: 'cascade' },
  { table: 'subscriptions', col: 'user_id', cleanup: 'cascade' },
  { table: 'profiles', col: 'id', cleanup: 'delete' },
]
export const tableKey = (t) => `${t.table}.${t.col}`

/** Refuse (throw) when the allowlist or the matched set exceeds the cap. */
export function assertCap(allowCount, targetCount) {
  if (allowCount > MAX_TARGETS || targetCount > MAX_TARGETS) {
    throw new Error(`refusing: cap is ${MAX_TARGETS} targets (allowlisted ${allowCount}, matched ${targetCount}); nothing deleted`)
  }
}

/** Residual report lines: one per table, then `residual: <n>`. Counts only. */
export function residualReport(counts) {
  const lines = Object.entries(counts).map(([k, v]) => `remaining ${k}: ${v}`)
  const residual = Object.values(counts).reduce((a, b) => a + b, 0)
  lines.push(`residual: ${residual}`)
  return { lines, residual }
}

/** The single ops_events row a real removal writes. No ids, no emails. */
export function removalLogRow({ deleted, remaining, residual, runId, actor, at }) {
  return {
    kind: 'panel_removed',
    severity: 'info',
    detail: { deleted, remaining, residual, at, run_id: runId ?? null, actor: actor ?? null },
  }
}

const flag = (argv, k) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a === undefined ? undefined : a.slice(k.length + 3) }

/** Mode from argv: dry run unless --dry-run=false; deleting needs the exact confirmation too. */
export function runMode(argv) {
  const dry = flag(argv, 'dry-run') !== 'false'
  if (dry) return { dryRun: true }
  if (flag(argv, 'confirm') !== CONFIRM) throw new Error(`refusing: a real removal needs --dry-run=false and --confirm=${CONFIRM}`)
  return { dryRun: false }
}

/** Allowlisted owner ids from the private panel row's content. */
export function allowlistFrom(content) {
  const parsed = typeof content === 'string' ? JSON.parse(content) : content
  if (parsed?.tag !== PANEL_TAG || !Array.isArray(parsed.accounts)) throw new Error('panel row is not a fictional_panel accounts record')
  return new Set(parsed.accounts.map((a) => a?.owner_id).filter((v) => typeof v === 'string' && v))
}

/** Users passing ALL three tests (tag, @panel.invalid, allowlisted id). */
export function removalTargets(users, allow) {
  return (users ?? []).filter((u) =>
    u?.app_metadata && typeof u.app_metadata === 'object' && u.app_metadata.twin_test_account === PANEL_TAG &&
    typeof u.email === 'string' && u.email.toLowerCase().endsWith(PANEL_EMAIL_SUFFIX) &&
    allow.has(u.id))
}

async function listAllUsers(admin) {
  const out = []
  for (let page = 1; page < 200; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    out.push(...data.users)
    if (data.users.length < 200) break
  }
  return out
}

async function main() {
  const { dryRun } = runMode(process.argv)
  const URL_ = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL_ || !SERVICE) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

  const { data: rows, error: rErr } = await admin.from('test_run_files').select('content').eq('label', ACCOUNTS_LABEL).eq('kind', 'other')
  if (rErr) throw new Error(`panel row read failed: ${rErr.message}`)
  if (!rows?.length) throw new Error('no private panel row found: nothing is allowlisted')
  const allow = new Set()
  for (const r of rows) for (const id of allowlistFrom(r.content)) allow.add(id)

  const users = await listAllUsers(admin)
  const tagged = users.filter((u) => u?.app_metadata?.twin_test_account === PANEL_TAG).length
  const targets = removalTargets(users, allow).map((u) => u.id)
  console.log(`mode: ${dryRun ? 'dry run (nothing deleted)' : 'REMOVE'}; allowlisted ${allow.size}, tagged ${tagged}, targets ${targets.length}`)
  assertCap(allow.size, targets.length)

  // Generation ids are collected up front (they vanish once generations go).
  const genIds = []
  for (const id of targets) {
    const { data, error } = await admin.from('generations').select('id').eq('user_id', id)
    if (error) throw new Error(`generations read: ${error.message}`)
    genIds.push(...(data ?? []).map((g) => g.id))
  }
  const idsFor = (t) => (t.via === 'generation' ? genIds : targets)
  const countIn = async (t) => {
    const ids = idsFor(t)
    if (!ids.length) return 0
    const { count, error } = await admin.from(t.table).select('*', { count: 'exact', head: true }).in(t.col, ids)
    if (error) throw new Error(`${tableKey(t)} count: ${error.message}`)
    return count ?? 0
  }

  const deleted = {}
  for (const t of RESIDUAL_TABLES) {
    if (t.cleanup !== 'delete') continue
    const ids = idsFor(t)
    if (!ids.length) { deleted[tableKey(t)] = 0; continue }
    const q = dryRun
      ? admin.from(t.table).select('*', { count: 'exact', head: true }).in(t.col, ids)
      : admin.from(t.table).delete({ count: 'exact' }).in(t.col, ids)
    const { count, error } = await q
    if (error) throw new Error(`${tableKey(t)}: ${error.message}`)
    deleted[tableKey(t)] = count ?? 0
  }
  let deletedUsers = 0
  if (!dryRun) {
    for (const id of targets) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw new Error(`auth user delete failed after ${deletedUsers}: ${error.message}`)
      deletedUsers++
    }
  }
  const verb = dryRun ? 'would delete' : 'deleted'
  for (const [k, v] of Object.entries(deleted)) console.log(`${verb} ${k}: ${v}`)
  console.log(`${verb} auth users: ${dryRun ? targets.length : deletedUsers}`)

  // Residual: after a real run, every table; in a dry run, what would survive
  // (only tables neither deleted here nor cascaded can survive).
  const remaining = {}
  for (const t of RESIDUAL_TABLES) {
    if (dryRun && (t.cleanup === 'delete' || t.cleanup === 'cascade')) { remaining[tableKey(t)] = 0; continue }
    remaining[tableKey(t)] = await countIn(t)
  }
  if (!dryRun) {
    const still = removalTargets(await listAllUsers(admin), allow).length
    remaining['auth.users'] = still
  }
  const { lines, residual } = residualReport(remaining)
  for (const l of lines) console.log(l)

  if (!dryRun) {
    const row = removalLogRow({
      deleted: { ...deleted, 'auth.users': deletedUsers }, remaining, residual,
      runId: process.env.GITHUB_RUN_ID, actor: process.env.GITHUB_ACTOR, at: new Date().toISOString(),
    })
    const { error } = await admin.from('ops_events').insert(row)
    if (error) throw new Error(`removal log row not written: ${error.message}`)
    console.log('removal log row written: ops_events panel_removed')
  }
  if (residual !== 0) { console.error(`residual rows remain: ${residual}`); process.exit(1) }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
