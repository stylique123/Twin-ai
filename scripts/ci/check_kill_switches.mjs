// KILL-SWITCH LEDGER GUARD (plan v5.3 item V). Static, dependency-free.
//
// Every env name in the "Kill switch" column of docs/release/wiring-ledger.md
// must still be READ by non-test code: Deno.env.get('X'), env.get('X') or
// process.env.X under supabase/functions, worker/src or packages/shared/src.
// A switch renamed or deleted in code without the ledger moving fails CI.
//
//   node scripts/ci/check_kill_switches.mjs [--selftest]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LEDGER = 'docs/release/wiring-ledger.md'
const ROOTS = ['supabase/functions', 'worker/src', 'packages/shared/src']

/** Env names listed in the ledger's "Kill switch" column. */
export function ledgerKillSwitches(md) {
  const rows = md.split('\n').filter((l) => l.trim().startsWith('|'))
  const header = rows.find((l) => /\|\s*Kill switch\s*\|/i.test(l))
  if (!header) throw new Error('ledger has no "Kill switch" column')
  const col = header.split('|').map((c) => c.trim()).findIndex((c) => /^kill switch$/i.test(c))
  const names = new Set()
  for (const r of rows.slice(rows.indexOf(header) + 1)) {
    if (/^\|\s*-/.test(r)) continue
    const cell = r.split('|')[col] ?? ''
    for (const [, n] of cell.matchAll(/`([A-Z][A-Z0-9_]{2,})`/g)) names.add(n)
  }
  return [...names].sort()
}

/** True when `src` reads env `name`. */
export function readsEnv(src, name) {
  return new RegExp(`env\\.get\\(\\s*['"\`]${name}['"\`]\\s*\\)|process\\.env\\.${name}\\b|process\\.env\\[\\s*['"]${name}['"]\\s*\\]`).test(src)
}

const isTest = (p) => /__tests__|\.test\.|\.spec\.|selftest/.test(p)
function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === 'dist') continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(n) && !isTest(p)) out.push(p)
  }
  return out
}

export function missingSwitches(names, sources) {
  return names.filter((n) => !sources.some((s) => readsEnv(s, n)))
}

function selftest() {
  const md = '| # | X | Kill switch | Y |\n|---|---|---|---|\n| 1 | a | `FOO_KILL`, `BAR` | `NOT_ME` |\n| 2 | b | none (`trial_off`) | - |\n'
  const names = ledgerKillSwitches(md)
  const ok = (c, m) => { if (!c) { console.error('selftest FAIL:', m); process.exit(1) } }
  ok(JSON.stringify(names) === '["BAR","FOO_KILL"]', `parsed ${JSON.stringify(names)}`)
  ok(readsEnv("x = Deno.env.get('FOO_KILL')", 'FOO_KILL'), 'Deno.env.get')
  ok(readsEnv('x = process.env.BAR ?? 1', 'BAR'), 'process.env')
  ok(!readsEnv('// FOO_KILL=1 kills it', 'FOO_KILL'), 'a comment is not a read')
  ok(!readsEnv('process.env.BARX', 'BAR'), 'word boundary')
  ok(JSON.stringify(missingSwitches(names, ["Deno.env.get('BAR')"])) === '["FOO_KILL"]', 'missing')
  console.log('check_kill_switches selftest: ok')
}

if (process.argv.includes('--selftest')) selftest()
else {
  const names = ledgerKillSwitches(readFileSync(join(REPO, LEDGER), 'utf8'))
  if (!names.length) { console.error(`check_kill_switches: no kill switches parsed from ${LEDGER}`); process.exit(1) }
  const sources = ROOTS.flatMap((r) => walk(join(REPO, r))).map((p) => readFileSync(p, 'utf8'))
  const missing = missingSwitches(names, sources)
  if (missing.length) {
    console.error(`check_kill_switches: ${missing.length} kill switch(es) listed in ${LEDGER} are not read by any code:`)
    for (const m of missing) console.error(`  - ${m}`)
    process.exit(1)
  }
  console.log(`check_kill_switches: ok (${names.length} kill switches, all read in code)`)
}
