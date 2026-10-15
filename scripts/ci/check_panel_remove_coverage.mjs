// PANEL-REMOVE DRIFT GUARD (schema-derived). Dependency-free.
//
// Parses supabase/migrations and finds every public table.column that either
//   - has a foreign key to auth.users(id) or profiles(id) (inline `references`,
//     table-level `foreign key (...) references`, or `alter table ... add
//     constraint ... foreign key`), or
//   - is an owner-style uuid column (OWNER_COLS) with no key at all.
// Every such column must appear in RESIDUAL_TABLES of
// scripts/ops/removeFictionalPanel.mjs, or in NOT_TARGET_OWNED below (each with
// a reason). Every RESIDUAL_TABLES entry marked cleanup 'cascade' must have an
// ON DELETE CASCADE to auth.users (or to profiles, which itself cascades)
// declared in migrations — verified here, not assumed.
//
//   node scripts/ci/check_panel_remove_coverage.mjs [--selftest]
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const OWNER_COLS = ['owner_id', 'user_id', 'referrer_id', 'invitee_id', 'member_id']

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')

function balanced(s, open) {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') { depth--; if (depth === 0) return s.slice(open + 1, i) }
  }
  return s.slice(open + 1)
}
function splitTop(body) {
  const out = []; let depth = 0, cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim())
}
const TBL = String.raw`(?:"?public"?\.)?"?(\w+)"?`
const REF = String.raw`references\s+(?:"?(auth|public)"?\.)?"?(users|profiles)"?\s*(?:\(\s*"?id"?\s*\))?([^,]*)`
function refInfo(text) {
  const m = new RegExp(REF, 'i').exec(text)
  if (!m) return null
  const target = m[2].toLowerCase() === 'users' ? (m[1]?.toLowerCase() === 'auth' ? 'auth.users' : null) : 'profiles'
  if (!target) return null
  const od = /on\s+delete\s+(cascade|set\s+null|set\s+default|restrict|no\s+action)/i.exec(m[3] ?? '')
  return { target, onDelete: od ? od[1].toLowerCase().replace(/\s+/g, ' ') : 'no action' }
}

/** Map "table.col" -> { table, col, fks: [{target,onDelete}], uuid } from migration SQL texts (in order). */
export function scanMigrations(sqlTexts) {
  const cols = new Map()
  const note = (table, col, fk, uuid) => {
    table = table.toLowerCase(); col = col.toLowerCase()
    const k = `${table}.${col}`
    const e = cols.get(k) ?? { table, col, fks: [], uuid: false }
    if (fk) e.fks.push(fk)
    if (uuid) e.uuid = true
    cols.set(k, e)
  }
  const column = (table, def) => {
    const m = /^"?(\w+)"?\s+(\w+)/.exec(def)
    if (!m || /^(constraint|primary|unique|check|foreign|exclude|like)$/i.test(m[1])) return
    const fk = refInfo(def)
    const isOwner = OWNER_COLS.includes(m[1].toLowerCase()) && /^uuid$/i.test(m[2])
    if (fk || isOwner) note(table, m[1], fk, /^uuid$/i.test(m[2]))
  }
  const tableFk = (table, def) => {
    const m = /foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*([\s\S]*)/i.exec(def)
    if (!m) return
    const fk = refInfo(m[2])
    if (fk) note(table, m[1], fk, false)
  }
  for (const raw of sqlTexts) {
    const sql = stripComments(raw)
    const re = new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?\s+([^;]*)|drop\s+table\s+(?:if\s+exists\s+)?${TBL}`, 'gi')
    let m
    while ((m = re.exec(sql))) {
      if (m[2]) {
        if (m[1] && m[1].toLowerCase() !== 'public') continue
        const body = balanced(sql, m.index + m[0].length - 1)
        for (const item of splitTop(body)) {
          if (/^(constraint\s+\w+\s+)?foreign\s+key/i.test(item)) tableFk(m[2], item)
          else column(m[2], item)
        }
      } else if (m[4]) {
        if (m[3] && m[3].toLowerCase() !== 'public') continue
        for (const item of splitTop(m[5])) {
          const add = /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([\s\S]*)$/i.exec(item)
          if (!add) continue
          if (/^(constraint\s+\w+\s+)?foreign\s+key/i.test(add[1])) tableFk(m[4], add[1])
          else if (!/^(constraint|primary|unique|check)\b/i.test(add[1])) column(m[4], add[1])
        }
      } else if (m[6]) {
        for (const k of [...cols.keys()]) if (k.startsWith(`${m[6].toLowerCase()}.`)) cols.delete(k)
      }
    }
  }
  return cols
}

/** True when deleting the auth user is declared to delete this column's rows. */
export function cascadeVerified(cols, key) {
  const e = cols.get(key)
  if (!e) return false
  return e.fks.some((f) => f.onDelete === 'cascade' && (f.target === 'auth.users' || (f.target === 'profiles' && cascadeVerified(cols, 'profiles.id'))))
}

export function readMigrations(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8'))
}

// Owner-referencing columns that are NOT cleared for a removed panel account,
// each with the reason. Keep this list short and every entry justified.
export const NOT_TARGET_OWNED = {
  // Admin audit/grant columns record the ACTING admin; a fictional panel
  // account is never an admin, so these never hold a target id. If one ever
  // did, the auth delete would fail on the no-action key and the run stops.
  'platform_admins.granted_by': 'admin grantor, never a panel account',
  'admin_audit_log.admin_id': 'acting admin, never a panel account',
  'admin_audit_log.target_user': 'audit history of admin actions, kept by policy',
  // ops_events is the operations log; the removal writes its own row there.
  'ops_events.user_id': 'operations log, no key; kept as audit trail',
  // Release S1 shadow runs (0289): test and panel accounts are served the new
  // path (stageFor returns new), never shadowed, so no row holds a panel id.
  'shadow_runs.owner_id': 'shadow runs are for real creators only; panel accounts are never shadowed',
}

/** Problems (strings) comparing scanned columns with the residual list. */
export function coverageProblems(cols, residualTables, allow = NOT_TARGET_OWNED) {
  const problems = []
  const listed = new Set(residualTables.map((t) => `${t.table}.${t.col}`))
  for (const [k, e] of cols) {
    const ownerish = e.fks.length > 0 || (e.uuid && OWNER_COLS.includes(e.col))
    if (!ownerish) continue
    if (!listed.has(k) && !(k in allow)) problems.push(`not covered: ${k} (add to RESIDUAL_TABLES or NOT_TARGET_OWNED)`)
  }
  for (const t of residualTables) {
    const k = `${t.table}.${t.col}`
    if (t.via) continue
    if (!cols.has(k)) problems.push(`stale: ${k} is in RESIDUAL_TABLES but no migration declares it as an owner column`)
    if (t.cleanup === 'cascade' && !cascadeVerified(cols, k)) problems.push(`unverified cascade: ${k} has no ON DELETE CASCADE to auth.users in migrations`)
  }
  for (const k of Object.keys(allow)) if (!cols.has(k)) problems.push(`stale allowlist: ${k}`)
  return problems
}

function selftest() {
  const sql = [
    `create table if not exists public.a (id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade, x text);`,
    `create table b ( user_id uuid, -- no key\n note text );`,
    `create table c (id uuid, who uuid references auth.users (id) on delete set null, constraint c_fk foreign key (id) references public.profiles (id) on delete cascade);`,
    `create table public.profiles (id uuid primary key references auth.users (id) on delete cascade);`,
    `create table d (id uuid, owner_id uuid); alter table public.d add constraint d_fk foreign key (owner_id) references auth.users (id) on delete cascade;`,
    `create table gone (owner_id uuid references auth.users(id)); drop table if exists gone;`,
    `alter table e add column if not exists member_id uuid references auth.users(id);`,
    `create table storage.objects2 (owner uuid references auth.users(id));`,
    `create table f (created_by text, user_ref uuid);`,
  ]
  const cols = scanMigrations(sql)
  const keys = [...cols.keys()].sort()
  const want = ['a.owner_id', 'b.user_id', 'c.id', 'c.who', 'd.owner_id', 'e.member_id', 'profiles.id']
  if (JSON.stringify(keys) !== JSON.stringify(want)) throw new Error(`scan: ${keys}`)
  const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
  expect(cascadeVerified(cols, 'a.owner_id'), 'inline cascade')
  expect(cascadeVerified(cols, 'd.owner_id'), 'alter-table cascade')
  expect(cascadeVerified(cols, 'c.id'), 'cascade via profiles')
  expect(!cascadeVerified(cols, 'c.who'), 'set null is not cascade')
  expect(!cascadeVerified(cols, 'e.member_id'), 'no action is not cascade')
  expect(!cascadeVerified(cols, 'b.user_id'), 'no key is not cascade')
  const full = want.map((k) => ({ table: k.split('.')[0], col: k.split('.')[1], cleanup: cascadeVerified(cols, k) ? 'cascade' : 'delete' }))
  expect(coverageProblems(cols, full, {}).length === 0, 'full coverage passes')
  const missing = coverageProblems(cols, full.filter((t) => t.table !== 'b'), {})
  expect(missing.length === 1 && /not covered: b\.user_id/.test(missing[0]), 'missing table fails')
  expect(coverageProblems(cols, full.filter((t) => t.table !== 'b'), { 'b.user_id': 'why' }).length === 0, 'allowlist covers')
  const lying = full.map((t) => (t.table === 'c' && t.col === 'who' ? { ...t, cleanup: 'cascade' } : t))
  expect(coverageProblems(cols, lying, {}).some((p) => /unverified cascade: c\.who/.test(p)), 'claimed cascade is verified')
  expect(coverageProblems(cols, [...full, { table: 'zz', col: 'owner_id', cleanup: 'delete' }], {}).some((p) => /stale: zz/.test(p)), 'stale entry fails')
  expect(coverageProblems(cols, [...full, { table: 'g', col: 'generation_id', via: 'generation', cleanup: 'delete' }], {}).length === 0, 'via entries exempt')
  console.log('panel-remove coverage selftest: ok')
}

const HERE = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = join(HERE, '../../supabase/migrations')

async function main() {
  if (process.argv.includes('--selftest')) return selftest()
  // Imported lazily only for the residual list. The removal script imports
  // supabase-js at top level, so read the list from its source text instead to
  // keep this check dependency-free.
  const src = readFileSync(join(HERE, '../ops/removeFictionalPanel.mjs'), 'utf8')
  const block = /export const RESIDUAL_TABLES = \[([\s\S]*?)\n\]/.exec(src)
  if (!block) throw new Error('RESIDUAL_TABLES not found in removeFictionalPanel.mjs')
  const residual = [...block[1].matchAll(/\{\s*table:\s*'(\w+)',\s*col:\s*'(\w+)'(?:,\s*via:\s*'(\w+)')?,\s*cleanup:\s*'(\w+)'/g)]
    .map((m) => ({ table: m[1], col: m[2], via: m[3], cleanup: m[4] }))
  const cols = scanMigrations(readMigrations(MIGRATIONS_DIR))
  const problems = coverageProblems(cols, residual)
  if (problems.length) { for (const p of problems) console.error(p); process.exit(1) }
  console.log(`panel-remove coverage: ok (${cols.size} owner columns; ${residual.length} residual entries; ${Object.keys(NOT_TARGET_OWNED).length} allowlisted)`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
