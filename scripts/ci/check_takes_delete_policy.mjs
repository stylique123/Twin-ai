// R6-4 / hardened R7-1: migration-derived proof of the `takes` storage-policy
// posture, with SOUND, TABLE-QUALIFIED policy lifecycle handling.
//
// The prod-source-smoke residue accounting depends on ONE fact: a client cannot
// delete its own `takes` object, because `storage.objects` has no DELETE-capable
// policy targeting the `takes` bucket. This module builds a real policy INVENTORY
// keyed by (TABLE, policy name) — not by name alone — and models the full
// lifecycle: CREATE / DROP / ALTER, each qualified by its target table.
//
//   * A DROP removes a policy only on its OWN table (a same-name drop on another
//     table must NOT remove a storage.objects policy).
//   * A same-name CREATE on another table is a SEPARATE policy (must not shadow
//     the storage.objects one).
//   * An ALTER POLICY … ON <table> USING/ WITH CHECK (…) can retarget a policy's
//     bucket. Postgres ALTER POLICY cannot change the FOR command, so command is
//     fixed at CREATE; the bucket target is updated conservatively (a policy is
//     treated as targeting `takes` if EITHER its create clause OR any alter
//     clause references `'takes'` — fail-closed).
//
// DELETE-CAPABLE = command is `delete` OR `all`. A DELETE-capable policy on
// storage.objects targeting `takes` is a hard failure.
//
// IMPORTANT — migration text is SUPPORTING evidence only. The AUTHORITATIVE
// production posture check is a live pg_policies catalog query (see
// scripts/prod-smoke/verify_takes_policy_live.sql), run as part of the sign-off
// sequence before claiming the production posture.
//
//   node scripts/ci/check_takes_delete_policy.mjs            # live: read migrations
//   node scripts/ci/check_takes_delete_policy.mjs --selftest # fixtures incl. adversarial cases
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DELETE_CAPABLE = new Set(['delete', 'all'])
const norm = (t) => t.replace(/"/g, '').toLowerCase()

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

// Parse CREATE / DROP / ALTER policy ops from one SQL source, each qualified by
// its target table. Robust to newlines/formatting/clause order and to policies
// nested inside `do $$ … $$` blocks; returned in positional order.
export function parsePolicyStatements(sql) {
  const clean = stripComments(sql)
  const ops = []
  let m
  const createRe = /create\s+policy\s+("([^"]+)"|[\w]+)\s+on\s+([\w".]+)([\s\S]*?);/gi
  while ((m = createRe.exec(clean))) {
    const name = norm(m[2] || m[1]); const table = norm(m[3]); const rest = m[4]
    const cmd = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(rest)
    const command = cmd ? cmd[1].toLowerCase() : 'all' // Postgres default FOR is ALL
    const targetsTakes = /'takes'/i.test(rest) || /\btakes\b/i.test(name)
    ops.push({ at: m.index, kind: 'create', name, table, command, targetsTakes })
  }
  const dropRe = /drop\s+policy\s+(?:if\s+exists\s+)?("([^"]+)"|[\w]+)\s+on\s+([\w".]+)/gi
  while ((m = dropRe.exec(clean))) {
    ops.push({ at: m.index, kind: 'drop', name: norm(m[2] || m[1]), table: norm(m[3]) })
  }
  const alterRe = /alter\s+policy\s+("([^"]+)"|[\w]+)\s+on\s+([\w".]+)([\s\S]*?);/gi
  while ((m = alterRe.exec(clean))) {
    const rest = m[4]
    // A RENAME TO changes the policy's name; capture the new name so later ops
    // that reference it resolve correctly.
    const rename = /rename\s+to\s+("([^"]+)"|[\w]+)/i.exec(rest)
    ops.push({
      at: m.index, kind: 'alter', name: norm(m[2] || m[1]), table: norm(m[3]),
      renameTo: rename ? norm(rename[2] || rename[1]) : null,
      // Only treat as retargeting when a USING/WITH CHECK clause is present.
      clauseTargetsTakes: /\b(using|with\s+check)\b[\s\S]*'takes'/i.test(rest) ? true
        : (/\b(using|with\s+check)\b/i.test(rest) ? false : null),
    })
  }
  return ops.sort((a, b) => a.at - b.at)
}

// Build the LIVE inventory across an ordered map of {source: sql}. Keys are
// TABLE-qualified: `${table}::${name}`.
export function buildTakesInventory(sqlBySource) {
  const live = new Map()
  const key = (table, name) => `${table}::${name}`
  for (const sql of Object.values(sqlBySource)) {
    for (const op of parsePolicyStatements(sql)) {
      const k = key(op.table, op.name)
      if (op.kind === 'create') {
        live.set(k, { table: op.table, name: op.name, command: op.command, targetsTakes: op.targetsTakes })
      } else if (op.kind === 'drop') {
        live.delete(k) // table-qualified: a same-name drop on another table does nothing here
      } else if (op.kind === 'alter') {
        const cur = live.get(k)
        if (!cur) continue
        if (op.clauseTargetsTakes !== null) cur.targetsTakes = cur.targetsTakes || op.clauseTargetsTakes
        if (op.renameTo && op.renameTo !== op.name) { live.delete(k); cur.name = op.renameTo; live.set(key(op.table, op.renameTo), cur) }
      }
    }
  }
  const takesPolicies = [...live.values()].filter((p) => p.table === 'storage.objects' && p.targetsTakes)
  const deleteCapable = takesPolicies.filter((p) => DELETE_CAPABLE.has(p.command))
  const has = (cmd) => takesPolicies.some((p) => p.command === cmd)
  return {
    takesPolicies,
    deleteCapable,
    insertPresent: has('insert') || has('all'),
    selectPresent: has('select') || has('all'),
    deletePolicyPresent: deleteCapable.length > 0,
  }
}

export function evaluate(sqlBySource) {
  const inv = buildTakesInventory(sqlBySource)
  const reasons = []
  if (inv.deletePolicyPresent) for (const p of inv.deleteCapable) reasons.push(`DELETE-capable takes policy present: "${p.name}" on ${p.table} (for ${p.command})`)
  if (!inv.insertPresent) reasons.push('expected takes INSERT policy is missing')
  if (!inv.selectPresent) reasons.push('expected takes SELECT policy is missing')
  return { ok: reasons.length === 0, reasons, inventory: inv }
}

function readMigrations(dir = 'supabase/migrations') {
  const map = {}
  for (const f of readdirSync(dir).sort()) if (f.endsWith('.sql')) map[f] = readFileSync(`${dir}/${f}`, 'utf8')
  return map
}

function selftest() {
  const INSERT = `create policy "twinai takes insert" on storage.objects for insert to authenticated with check (bucket_id = 'takes');`
  const SELECT = `create policy "twinai takes read" on storage.objects for select to authenticated using (bucket_id = 'takes');`
  const DELETE_TAKES = `create policy "twinai takes delete" on storage.objects for delete to authenticated using (bucket_id = 'takes');`
  const cases = [
    ['insert+select only → ok', { a: INSERT + '\n' + SELECT }, true],
    ['planted FOR DELETE → fail', { a: INSERT + '\n' + SELECT + '\n' + DELETE_TAKES }, false],
    ['planted FOR ALL → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "takes all" on storage.objects for all to authenticated using (bucket_id = 'takes');` }, false],
    ['alt-format multiline DELETE → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "weird"\n  on storage.objects\n  as permissive\n  for   delete\n  to authenticated\n  using ( bucket_id = 'takes' );` }, false],
    ['FOR omitted defaults ALL → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "implicit all takes" on storage.objects to authenticated using (bucket_id = 'takes');` }, false],
    ['created-then-dropped DELETE (same table) → ok', { a: INSERT + '\n' + SELECT + '\n' + DELETE_TAKES, b: `drop policy if exists "twinai takes delete" on storage.objects;` }, true],
    ['delete on another bucket → ok', { a: INSERT + '\n' + SELECT + `\ncreate policy "edits delete" on storage.objects for delete to authenticated using (bucket_id = 'edits');` }, true],
    ['missing insert → fail', { a: SELECT }, false],
    // R7-1 adversarial fixtures — all THREE must FAIL (previously passed):
    ['storage DELETE + same-name DROP on ANOTHER table → fail', { a: DELETE_TAKES + '\n' + INSERT + '\n' + SELECT, b: `drop policy if exists "twinai takes delete" on public.generations;` }, false],
    ['storage DELETE + same-name CREATE on ANOTHER table → fail', { a: DELETE_TAKES + '\n' + INSERT + '\n' + SELECT, b: `create policy "twinai takes delete" on public.generations for select to authenticated using (true);` }, false],
    ['storage DELETE altered from another bucket to takes → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "twinai takes delete" on storage.objects for delete to authenticated using (bucket_id = 'edits');`, b: `alter policy "twinai takes delete" on storage.objects using (bucket_id = 'takes');` }, false],
    // ALTER that retargets AWAY from takes stays fail-closed (conservative) — documents the posture:
    ['ALTER add rename keeps takes delete tracked → fail', { a: INSERT + '\n' + SELECT + '\n' + DELETE_TAKES, b: `alter policy "twinai takes delete" on storage.objects rename to "renamed del";` }, false],
  ]
  let failed = 0
  for (const [name, sqlBySource, expOk] of cases) {
    const { ok } = evaluate(sqlBySource)
    if (ok !== expOk) { console.error(`SELFTEST FAIL: ${name} => ok=${ok}, expected ${expOk}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`takes-delete-policy selftest: ${failed} failed`); process.exit(1) }
  console.log('takes-delete-policy selftest: all cases passed'); process.exit(0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const { ok, reasons, inventory } = evaluate(readMigrations())
    console.log('takes storage policy inventory:', JSON.stringify(inventory.takesPolicies))
    console.log(`insert=${inventory.insertPresent} select=${inventory.selectPresent} deleteCapable=${inventory.deletePolicyPresent}`)
    console.log('NOTE: migration-derived; authoritative posture = live pg_policies (scripts/prod-smoke/verify_takes_policy_live.sql)')
    if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
    console.log('takes-delete-policy guard: OK (no client DELETE-capable takes policy; insert+select present)')
  }
}
