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
// ⚠️ PUBLIC REPO: prints counts only.
//
// Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/removeFictionalPanel.mjs [--dry-run=false --confirm=REMOVE_PANEL]
import { createClient } from '@supabase/supabase-js'

export const PANEL_TAG = 'fictional_panel'
export const PANEL_EMAIL_SUFFIX = '@panel.invalid'
export const CONFIRM = 'REMOVE_PANEL'
export const ACCOUNTS_LABEL = 'fictional-panel-accounts'

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

  const counts = {}
  const run = async (label, table, col, ids) => {
    if (!ids.length) { counts[label] = counts[label] ?? 0; return }
    const q = dryRun
      ? admin.from(table).select('*', { count: 'exact', head: true }).in(col, ids)
      : admin.from(table).delete({ count: 'exact' }).in(col, ids)
    const { count, error } = await q
    if (error) throw new Error(`${label}: ${error.message}`)
    counts[label] = (counts[label] ?? 0) + (count ?? 0)
  }

  for (const id of targets) {
    const { data: gens, error } = await admin.from('generations').select('id').eq('user_id', id)
    if (error) throw new Error(`generations read: ${error.message}`)
    await run('script_batch_results', 'script_batch_results', 'generation_id', (gens ?? []).map((g) => g.id))
    await run('generations', 'generations', 'user_id', [id])
    await run('creator_knowledge', 'creator_knowledge', 'owner_id', [id])
    await run('product_entities', 'product_entities', 'owner_id', [id])
    await run('brand_voices', 'brand_voices', 'owner_id', [id])
    await run('brands', 'brands', 'owner_id', [id])
    await run('profiles', 'profiles', 'id', [id])
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
  for (const [k, v] of Object.entries(counts)) console.log(`${verb} ${k}: ${v}`)
  console.log(`${verb} auth users: ${dryRun ? targets.length : deletedUsers}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
