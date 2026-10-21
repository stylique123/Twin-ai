// DELETE ONE CREATOR'S DATA (data deletion path; DRAFT for counsel review).
// Design: docs/customer/takedown-and-deletion.md. Run only after the owner has
// verified the request and counsel's retention rules (billing records, legal
// holds) have been applied.
//
// DRY RUN BY DEFAULT: prints per-table counts and changes nothing.
// A real deletion needs ALL of:
//   1. --creator=<uuid>
//   2. --confirm            (explicit flag; without it nothing is ever deleted)
//   3. the operator TYPES the same creator id again at the prompt (or passes
//      --typed-id=<uuid> in a non-interactive run). A mismatch refuses.
//
// WHAT IT CLEARS: the table list is RESIDUAL_TABLES from removeFictionalPanel.mjs,
// which CI (scripts/ci/check_panel_remove_coverage.mjs) keeps complete against
// supabase/migrations. Order: 'delete' entries in list order (children such as
// script_batch_results before generations; profiles last), then the creator's
// storage objects (first path segment = creator id, in every bucket), then the
// auth user, which clears every 'cascade' entry. 'report' entries (rows owned by
// someone else that name the creator) are never deleted: any such row stops a
// real run BEFORE anything is deleted, for a human decision.
//
// PUBLIC REPO: prints counts only, never content.
//
// Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/deleteCreator.mjs --creator=<uuid> [--confirm]
import { RESIDUAL_TABLES, tableKey, isTargetPath } from './removeFictionalPanel.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const flag = (argv, k) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a === undefined ? undefined : a.slice(k.length + 3) }

/** Parse argv. Dry run unless --confirm is present. Throws on a missing or malformed id. */
export function parseArgs(argv) {
  const creatorId = flag(argv, 'creator')
  if (!creatorId || !UUID.test(creatorId)) throw new Error('refusing: --creator=<uuid> is required')
  const confirm = argv.includes('--confirm')
  return { creatorId: creatorId.toLowerCase(), dryRun: !confirm, typedId: flag(argv, 'typed-id') }
}

/** The typed id must equal the creator id (case-insensitive, trimmed). */
export function typedIdMatches(creatorId, typed) {
  return typeof typed === 'string' && typed.trim().toLowerCase() === creatorId.toLowerCase()
}

/** Deletion plan: ordered explicit deletes, cascades, and report-only entries. */
export function deletionPlan(entries = RESIDUAL_TABLES) {
  return {
    deletes: entries.filter((t) => t.cleanup === 'delete'),
    cascades: entries.filter((t) => t.cleanup === 'cascade'),
    reports: entries.filter((t) => t.cleanup === 'report'),
  }
}

/**
 * Core run against an injected client (mocked in tests).
 * admin: supabase-js-shaped client. ask(question) -> Promise<string> for the typed id.
 * Returns { dryRun, counts, deleted, storage, refused?, log }.
 */
export async function runDeletion({ admin, creatorId, dryRun, typedId, ask }) {
  const log = []
  const out = { dryRun, counts: {}, deleted: {}, storage: 0, log }
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(creatorId)
  if (uErr || !u?.user) { out.refused = 'creator not found'; log.push('refused: creator not found'); return out }

  const { data: gens, error: gErr } = await admin.from('generations').select('id').eq('user_id', creatorId)
  if (gErr) throw new Error(`generations read: ${gErr.message}`)
  const genIds = (gens ?? []).map((g) => g.id)
  const idsFor = (t) => (t.via === 'generation' ? genIds : [creatorId])

  for (const t of RESIDUAL_TABLES) {
    const ids = idsFor(t)
    if (!ids.length) { out.counts[tableKey(t)] = 0; continue }
    const { count, error } = await admin.from(t.table).select('*', { count: 'exact', head: true }).in(t.col, ids)
    if (error) throw new Error(`${tableKey(t)} count: ${error.message}`)
    out.counts[tableKey(t)] = count ?? 0
  }

  const paths = {}
  const { data: buckets, error: bErr } = await admin.storage.listBuckets()
  if (bErr) throw new Error(`storage buckets: ${bErr.message}`)
  for (const b of buckets ?? []) {
    const { data, error } = await admin.storage.from(b.id).list(creatorId, { limit: 1000 })
    if (error) throw new Error(`storage list (${b.id}): ${error.message}`)
    paths[b.id] = (data ?? []).map((it) => `${creatorId}/${it.name}`).filter((p) => isTargetPath(p, [creatorId]))
  }
  const storageCount = Object.values(paths).reduce((a, l) => a + l.length, 0)

  const { deletes, cascades, reports } = deletionPlan()
  for (const t of deletes) log.push(`${dryRun ? 'would delete' : 'delete'} ${tableKey(t)}: ${out.counts[tableKey(t)]}`)
  for (const t of cascades) log.push(`${dryRun ? 'would cascade' : 'cascade'} ${tableKey(t)}: ${out.counts[tableKey(t)]}`)
  for (const t of reports) log.push(`report-only ${tableKey(t)}: ${out.counts[tableKey(t)]}`)
  log.push(`${dryRun ? 'would remove' : 'remove'} storage objects: ${storageCount}`)

  if (dryRun) { log.push('dry run: nothing deleted'); return out }

  const blocking = reports.reduce((a, t) => a + (out.counts[tableKey(t)] ?? 0), 0)
  if (blocking > 0) { out.refused = 'report-only rows reference this creator'; log.push(`refused: ${blocking} report-only rows need a human decision; nothing deleted`); return out }
  const typed = typedId ?? (ask ? await ask(`Type the creator id to delete (${creatorId}): `) : undefined)
  if (!typedIdMatches(creatorId, typed)) { out.refused = 'typed id mismatch'; log.push('refused: typed id does not match; nothing deleted'); return out }

  for (const t of deletes) {
    const ids = idsFor(t)
    if (!ids.length) { out.deleted[tableKey(t)] = 0; continue }
    const { count, error } = await admin.from(t.table).delete({ count: 'exact' }).in(t.col, ids)
    if (error) throw new Error(`${tableKey(t)}: ${error.message}`)
    out.deleted[tableKey(t)] = count ?? 0
  }
  for (const [bucket, list] of Object.entries(paths)) {
    for (let i = 0; i < list.length; i += 100) {
      const { data, error } = await admin.storage.from(bucket).remove(list.slice(i, i + 100))
      if (error) throw new Error(`storage remove (${bucket}): ${error.message}`)
      out.storage += (data ?? []).length
    }
  }
  const { error: dErr } = await admin.auth.admin.deleteUser(creatorId)
  if (dErr) throw new Error(`auth user delete: ${dErr.message}`)
  log.push(`deleted: ${Object.values(out.deleted).reduce((a, b) => a + b, 0)} rows, ${out.storage} storage objects, 1 auth user`)
  return out
}

async function main() {
  const { creatorId, dryRun, typedId } = parseArgs(process.argv)
  const URL_ = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL_ || !SERVICE) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const ask = async (q) => {
    const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout })
    try { return await rl.question(q) } finally { rl.close() }
  }
  const res = await runDeletion({ admin, creatorId, dryRun, typedId, ask })
  for (const l of res.log) console.log(l)
  if (res.refused) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
