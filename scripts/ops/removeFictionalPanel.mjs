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
// the other 'delete' entries of RESIDUAL_TABLES, the targets' storage objects,
// and then the auth user (which cascades the 'cascade' entries). It deletes
// nothing else (the private panel row is kept).
// HARD CAP: more than MAX_TARGETS allowlisted ids or matched users → refuse and
// exit non-zero before anything is deleted (dry run and real run alike).
// DRY RUN COUNTS: every RESIDUAL_TABLES entry (delete, cascade and report) is
// counted for the targets and printed (`would clear (delete|cascade)` /
// `would keep`). The dry-run residual is the rows that neither an explicit
// delete nor an ON DELETE CASCADE VERIFIED FROM supabase/migrations would
// clear: report entries plus any unverified cascade.
// STORAGE: objects keyed to a target (first path segment = owner id in any
// bucket, the convention of every storage policy here:
// `(storage.foldername(name))[1] = auth.uid()::text`; plus storage.objects.owner
// = target when the storage schema is readable) are counted in a dry run, and
// in a real run exactly those paths are removed and the rest recounted into the
// residual. If the owner-keyed lookup is unavailable, a real run counts that as
// residual and exits non-zero (fail closed). Counts only in logs.
// RESIDUAL REPORT: one count line per table in RESIDUAL_TABLES for the target
// owner ids, then `residual: <n>`; non-zero residual → exit non-zero.
// REMOVAL LOG: a real run inserts one ops_events row (kind 'panel_removed') with
// per-table counts, residual, timestamp, GITHUB_RUN_ID and actor — no ids/emails.
// ⚠️ PUBLIC REPO: prints counts only.
//
// Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/removeFictionalPanel.mjs [--dry-run=false --confirm=REMOVE_PANEL]
import { createClient } from '@supabase/supabase-js'
import { scanMigrations, readMigrations, cascadeVerified, MIGRATIONS_DIR } from '../ci/check_panel_remove_coverage.mjs'

export const PANEL_TAG = 'fictional_panel'
export const PANEL_EMAIL_SUFFIX = '@panel.invalid'
export const CONFIRM = 'REMOVE_PANEL'
export const ACCOUNTS_LABEL = 'fictional-panel-accounts'

export const MAX_TARGETS = 6

// Every public table.column that references a target owner, derived from
// supabase/migrations and enforced by scripts/ci/check_panel_remove_coverage.mjs
// (a new owner column fails CI until it is listed here or allowlisted there).
// cleanup:
//   'delete'  = deleted explicitly here, before the auth user;
//   'cascade' = cleared by ON DELETE CASCADE from auth.users when the auth user
//               is deleted. Verified at runtime from the migrations (and in CI);
//               an unverified 'cascade' counts as residual even in a dry run;
//   'report'  = never deleted here (the row belongs to someone else); any row
//               for a target is residual and stops the run.
// via 'generation' = keyed by the target's generation ids.
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
  { table: 'billing_events', col: 'user_id', cleanup: 'delete' },
  { table: 'rate_events', col: 'user_id', cleanup: 'delete' },
  { table: 'source_script_snapshots', col: 'owner_id', cleanup: 'delete' },
  { table: 'own_post_reads', col: 'owner_id', cleanup: 'delete' },
  { table: 'brain_note_uses', col: 'owner_id', cleanup: 'delete' },
  { table: 'referrals', col: 'referrer_id', cleanup: 'delete' },
  { table: 'referrals', col: 'invitee_id', cleanup: 'delete' },
  { table: 'platform_connections', col: 'owner_id', cleanup: 'delete' },
  { table: 'transcripts', col: 'owner_id', cleanup: 'cascade' },
  { table: 'posts', col: 'owner_id', cleanup: 'delete' },
  { table: 'gallery_items', col: 'owner_id', cleanup: 'cascade' },
  { table: 'subscriptions', col: 'user_id', cleanup: 'cascade' },
  { table: 'notifications', col: 'user_id', cleanup: 'cascade' },
  { table: 'templates', col: 'owner_id', cleanup: 'cascade' },
  { table: 'workspace_members', col: 'owner_id', cleanup: 'cascade' },
  { table: 'workspace_members', col: 'member_id', cleanup: 'cascade' },
  { table: 'workspace_invites', col: 'owner_id', cleanup: 'cascade' },
  { table: 'oauth_nonce', col: 'owner_id', cleanup: 'cascade' },
  { table: 'media_assets', col: 'owner_id', cleanup: 'cascade' },
  { table: 'edit_projects', col: 'owner_id', cleanup: 'cascade' },
  { table: 'media_analyses', col: 'owner_id', cleanup: 'cascade' },
  { table: 'edit_plans', col: 'owner_id', cleanup: 'cascade' },
  { table: 'edit_director_calls', col: 'owner_id', cleanup: 'cascade' },
  { table: 'edit_director_decisions', col: 'owner_id', cleanup: 'cascade' },
  { table: 'source_capture_intents', col: 'owner_id', cleanup: 'cascade' },
  { table: 'source_capture_manifests', col: 'owner_id', cleanup: 'cascade' },
  { table: 'edit_outputs', col: 'owner_id', cleanup: 'cascade' },
  { table: 'brand_truth_snapshots', col: 'owner_id', cleanup: 'cascade' },
  { table: 'campaign_intents', col: 'owner_id', cleanup: 'cascade' },
  { table: 'reference_evidence_sets', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creative_transfer_plans', col: 'owner_id', cleanup: 'cascade' },
  { table: 'edit_review_overlays', col: 'owner_id', cleanup: 'cascade' },
  { table: 'brand_glossary_terms', col: 'owner_id', cleanup: 'cascade' },
  { table: 'post_outcome_observations', col: 'owner_id', cleanup: 'cascade' },
  { table: 'dna_claims', col: 'owner_id', cleanup: 'cascade' },
  { table: 'post_attributions', col: 'owner_id', cleanup: 'cascade' },
  { table: 'audience_questions', col: 'owner_id', cleanup: 'cascade' },
  { table: 'script_edits', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creator_questions_put', col: 'owner_id', cleanup: 'cascade' },
  { table: 'script_attempts', col: 'owner_id', cleanup: 'cascade' },
  { table: 'generation_choices', col: 'owner_id', cleanup: 'cascade' },
  { table: 'publish_intents', col: 'owner_id', cleanup: 'cascade' },
  { table: 'media_upload_attempts', col: 'owner_id', cleanup: 'cascade' },
  { table: 'talking_head_overrides', col: 'owner_id', cleanup: 'cascade' },
  { table: 'scan_events', col: 'user_id', cleanup: 'cascade' },
  { table: 'entry_impressions', col: 'owner_id', cleanup: 'cascade' },
  { table: 'scraped_posts', col: 'owner_id', cleanup: 'cascade' },
  { table: 'generation_outcomes', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creator_knowledge_uses', col: 'owner_id', cleanup: 'cascade' },
  { table: 'brain_notes', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creator_ideas', col: 'owner_id', cleanup: 'cascade' },
  { table: 'script_ratings', col: 'owner_id', cleanup: 'cascade' },
  { table: 'audience_tests', col: 'owner_id', cleanup: 'cascade' },
  { table: 'audience_panels', col: 'owner_id', cleanup: 'cascade' },
  { table: 'post_questions', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creator_mentions', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creator_shifts', col: 'owner_id', cleanup: 'cascade' },
  { table: 'shift_searches', col: 'owner_id', cleanup: 'cascade' },
  { table: 'post_stat_snapshots', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creator_seasonal_ideas', col: 'owner_id', cleanup: 'cascade' },
  { table: 'creator_lessons', col: 'owner_id', cleanup: 'cascade' },
  { table: 'comment_candidates', col: 'owner_id', cleanup: 'cascade' },
  { table: 'lesson_misses', col: 'owner_id', cleanup: 'cascade' },
  { table: 'fact_purpose_votes', col: 'owner_id', cleanup: 'cascade' },
  { table: 'question_asks', col: 'owner_id', cleanup: 'cascade' },
  { table: 'story_passages', col: 'owner_id', cleanup: 'cascade' },
  { table: 'platform_admins', col: 'user_id', cleanup: 'cascade' },
  { table: 'workspace_invites', col: 'accepted_by', cleanup: 'report' },
  { table: 'visual_pilot_events', col: 'reviewer', cleanup: 'report' },
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

/** Keys of RESIDUAL_TABLES 'cascade' entries whose cascade the migrations declare. */
export function verifiedCascades(cols, entries = RESIDUAL_TABLES) {
  return new Set(entries.filter((t) => t.cleanup === 'cascade' && cascadeVerified(cols, tableKey(t))).map(tableKey))
}

/** Dry-run residual: rows that neither an explicit delete nor a verified cascade would clear. */
export function dryRunResidualCounts(counts, verified, entries = RESIDUAL_TABLES) {
  const out = {}
  for (const t of entries) {
    const k = tableKey(t), n = counts[k] ?? 0
    out[k] = t.cleanup === 'delete' || (t.cleanup === 'cascade' && verified.has(k)) ? 0 : n
  }
  return out
}

/** A storage path belongs to a target when its first segment is the target id. */
export function isTargetPath(name, targets) {
  return targets.includes(String(name ?? '').split('/')[0])
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

async function listUnder(admin, bucket, prefix, out) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`storage list (${bucket}): ${error.message}`)
    for (const it of data ?? []) {
      const path = `${prefix}/${it.name}`
      if (it.id == null) await listUnder(admin, bucket, path, out)
      else out.push(path)
    }
    if ((data ?? []).length < 1000) break
  }
}

/** { byBucket: {bucket: [paths]}, total, ownerCheck: 'ok' | 'unavailable' } for the targets only. */
async function storageObjects(admin, targets) {
  const byBucket = {}
  let ownerCheck = 'ok'
  if (!targets.length) return { byBucket, total: 0, ownerCheck }
  const { data: buckets, error } = await admin.storage.listBuckets()
  if (error) throw new Error(`storage buckets: ${error.message}`)
  for (const b of buckets ?? []) {
    const paths = []
    for (const id of targets) await listUnder(admin, b.id, id, paths)
    byBucket[b.id] = paths.filter((p) => isTargetPath(p, targets))
  }
  // Owner-keyed objects outside the id-prefix convention (needs the storage schema exposed).
  const { data: owned, error: oErr } = await admin.schema('storage').from('objects').select('bucket_id,name').in('owner', targets)
  if (oErr) ownerCheck = 'unavailable'
  else for (const o of owned ?? []) {
    const list = (byBucket[o.bucket_id] ??= [])
    if (!list.includes(o.name)) list.push(o.name)
  }
  const total = Object.values(byBucket).reduce((a, l) => a + l.length, 0)
  return { byBucket, total, ownerCheck }
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

  // Cascades are verified from supabase/migrations, not assumed.
  const verified = verifiedCascades(scanMigrations(readMigrations(MIGRATIONS_DIR)))
  const unverified = RESIDUAL_TABLES.filter((t) => t.cleanup === 'cascade' && !verified.has(tableKey(t))).length
  console.log(`cascade entries verified from migrations: ${verified.size}; unverified: ${unverified}`)

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

  // Real per-table counts for EVERY entry (cascade and report included), before anything goes.
  const before = {}
  for (const t of RESIDUAL_TABLES) before[tableKey(t)] = await countIn(t)
  const storageBefore = await storageObjects(admin, targets)

  const deleted = {}
  let storageDeleted = 0, deletedUsers = 0
  if (!dryRun) {
    for (const t of RESIDUAL_TABLES) {
      if (t.cleanup !== 'delete') continue
      const ids = idsFor(t)
      if (!ids.length) { deleted[tableKey(t)] = 0; continue }
      const { count, error } = await admin.from(t.table).delete({ count: 'exact' }).in(t.col, ids)
      if (error) throw new Error(`${tableKey(t)}: ${error.message}`)
      deleted[tableKey(t)] = count ?? 0
    }
    // Storage: only the paths found for the targets above.
    for (const [bucket, paths] of Object.entries(storageBefore.byBucket)) {
      for (let i = 0; i < paths.length; i += 100) {
        const { data, error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
        if (error) throw new Error(`storage remove (${bucket}): ${error.message}`)
        storageDeleted += (data ?? []).length
      }
    }
    for (const id of targets) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw new Error(`auth user delete failed after ${deletedUsers}: ${error.message}`)
      deletedUsers++
    }
  }

  for (const t of RESIDUAL_TABLES) {
    const k = tableKey(t)
    if (dryRun) {
      const how = t.cleanup === 'report' ? 'would keep (report)'
        : t.cleanup === 'cascade' ? (verified.has(k) ? 'would clear (cascade)' : 'would keep (UNVERIFIED cascade)')
        : 'would clear (delete)'
      console.log(`${how} ${k}: ${before[k]}`)
    } else if (t.cleanup === 'delete') console.log(`deleted ${k}: ${deleted[k] ?? 0}`)
    else console.log(`before ${t.cleanup} ${k}: ${before[k]}`)
  }
  for (const [bucket, paths] of Object.entries(storageBefore.byBucket)) console.log(`${dryRun ? 'would remove' : 'found'} storage ${bucket}: ${paths.length}`)
  console.log(`storage owner-keyed lookup: ${storageBefore.ownerCheck}`)
  if (!dryRun) console.log(`removed storage objects: ${storageDeleted}`)
  console.log(`${dryRun ? 'would delete' : 'deleted'} auth users: ${dryRun ? targets.length : deletedUsers}`)

  // Residual: after a real run, recounted everywhere; in a dry run, what would survive.
  let remaining
  if (dryRun) {
    remaining = dryRunResidualCounts(before, verified)
    remaining['storage.objects'] = 0 // every counted target object would be removed
  } else {
    remaining = {}
    for (const t of RESIDUAL_TABLES) remaining[tableKey(t)] = await countIn(t)
    remaining['storage.objects'] = (await storageObjects(admin, targets)).total
    remaining['auth.users'] = removalTargets(await listAllUsers(admin), allow).length
    // Fail closed: owner-keyed storage that could not be looked up is not known to be clear.
    if (storageBefore.ownerCheck !== 'ok') remaining['storage.objects.owner_unverified'] = 1
  }
  const { lines, residual } = residualReport(remaining)
  for (const l of lines) console.log(l)

  if (!dryRun) {
    const row = removalLogRow({
      deleted: { ...deleted, 'storage.objects': storageDeleted, 'auth.users': deletedUsers }, remaining, residual,
      runId: process.env.GITHUB_RUN_ID, actor: process.env.GITHUB_ACTOR, at: new Date().toISOString(),
    })
    const { error } = await admin.from('ops_events').insert(row)
    if (error) throw new Error(`removal log row not written: ${error.message}`)
    console.log('removal log row written: ops_events panel_removed')
  }
  if (residual !== 0) { console.error(`residual rows remain: ${residual}`); process.exit(1) }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
