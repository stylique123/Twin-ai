// THE THREE THINGS POSTGRES WILL NOT LET YOU CREATE TWICE.
//
// Detection only -- no verdict, no exit code. `check_migration_rerunnable.mjs`
// decides what the findings mean; keeping the two apart means the scanner can
// be run to LIST the debt without also failing a build.
//
// ⚠️ CONSTRAINT, TRIGGER AND POLICY ARE THE SAME DEFECT WEARING THREE NAMES.
// None of the three has an IF NOT EXISTS form, so a bare create raises on the
// second application -- and the staging matrix applies every listed migration
// byte-exact on every run. `create type` was measured and has ZERO offenders in
// this repo, so it is not scanned; adding it later is a data change, not a
// redesign.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')

/** ⚖️ A COMMENT IS NOT SQL. Several migrations in this repo explain the very
 * pattern they avoid, and counting that prose as an offence -- or as a rescue --
 * would make the scan report on the documentation rather than the code. */
export function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      let out = ''
      let quote = null
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (quote) { out += c; if (c === quote) quote = null; continue }
        if (c === "'" || c === '"') { quote = c; out += c; continue }
        // ⚠️ Only outside a literal. A check constraint may legitimately
        // contain `--`, and truncating there would swallow the statement.
        if (c === '-' && line[i + 1] === '-') break
        out += c
      }
      return out
    })
    .join('\n')
}

const RE = {
  constraint: /\badd\s+constraint\s+([A-Za-z0-9_]+)/gi,
  trigger: /\bcreate\s+trigger\s+([A-Za-z0-9_]+)/gi,
  policy: /\bcreate\s+policy\s+(?:"([^"]+)"|([A-Za-z0-9_]+))/gi,
}

const RESCUE = {
  constraint: (n) => new RegExp(`\\bdrop\\s+constraint\\s+if\\s+exists\\s+${n}\\b`, 'i'),
  trigger: (n) => new RegExp(`\\bdrop\\s+trigger\\s+if\\s+exists\\s+${n}\\b`, 'i'),
  policy: (n) => new RegExp(`\\bdrop\\s+policy\\s+if\\s+exists\\s+"?${n}"?`, 'i'),
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * ⚠️ A `create or replace trigger` IS re-runnable and must not be reported.
 * The `create\s+trigger` pattern does not match it, which is the intent --
 * written down because it looks like an oversight.
 */

/**
 * ⚖️ THE DO-BLOCK GUARD HAS MORE THAN ONE SPELLING. 0030 writes
 * `pg_constraint where conname = 'x'`; 0138 writes `conrelid = ... and
 * conname = 'x'`. Both are the same check, so the rule is: the file consults
 * pg_constraint AND compares this name against conname. Requiring `where`
 * immediately before `conname` reported 0138 as a defect it does not have.
 */
export function guardedNames(sql) {
  if (!/\bpg_constraint\b/i.test(sql)) return new Set()
  return new Set([...sql.matchAll(/\bconname\s*=\s*'([A-Za-z0-9_]+)'/gi)].map((m) => m[1]))
}

/**
 * ⚠️ ORDER MATTERS AND POSITION IS THE ONLY HONEST TEST. A drop that appears
 * AFTER the create rescues nothing -- the create has already raised. So a
 * rescue counts only when it sits at a lower offset.
 */
export function findingsIn(rawSql) {
  const sql = stripComments(rawSql)
  const guarded = guardedNames(sql)
  const out = []
  for (const [kind, re] of Object.entries(RE)) {
    re.lastIndex = 0
    for (const m of sql.matchAll(re)) {
      const name = m[1] ?? m[2]
      if (kind === 'constraint' && guarded.has(name)) continue
      if (RESCUE[kind](esc(name)).test(sql.slice(0, m.index))) continue
      out.push({ kind, name })
    }
  }
  return out
}

/** Every finding in the repo, as stable `file :: kind :: name` keys. */
export function scanAll(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const findings = []
  for (const file of files) {
    for (const f of findingsIn(readFileSync(join(dir, file), 'utf8'))) {
      findings.push({ file, ...f, key: `${file} :: ${f.kind} :: ${f.name}` })
    }
  }
  return { scanned: files.length, findings }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { scanned, findings } = scanAll()
  console.log(`scanned ${scanned} migrations, ${findings.length} bare creates`)
  for (const f of findings) console.log(f.key)
}
