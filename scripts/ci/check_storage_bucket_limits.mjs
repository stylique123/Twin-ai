// A BUCKET THAT NAMES NO LIMITS ACCEPTS ANYTHING THE KEY REACHES.
//
// ⚠️ MEASURED, AND THE NEW BUCKET WAS THE ODD ONE OUT. Production's `takes` and
// `edits` each declare a 600MB ceiling and an explicit allowed_mime_types.
// `reference-frames` (0160) declared neither -- and it holds frames of thousands
// of OTHER creators' videos, which is the corpus most worth fencing and it had
// the least fence. Nothing caught it because nothing was looking at the class.
//
// ⚖️ THE MIME LIST AND THE SIZE REFUSE DIFFERENT THINGS. A ceiling stops a 2GB
// upload; an image-only list stops the bucket from ever holding a script, a
// database dump or an executable, whatever its size. Requiring only one would
// leave the other hole open and look thorough.
//
// ⚠️ IT READS THE WHOLE LEDGER, NOT ONE STATEMENT. A bucket may be created in
// one migration and hardened in a later one -- which is exactly what 0160 and
// 0161 do -- so asserting the create statement alone would refuse a legitimate
// two-step. The question is whether the bucket is left unfenced by the END of
// the migration history, which is the only state production ever sees.
//
//   node scripts/ci/check_storage_bucket_limits.mjs
//   node scripts/ci/check_storage_bucket_limits.mjs --selftest
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

const strip = (sql) => String(sql ?? '').replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

/**
 * Fold the migrations into what each bucket ends up with.
 *
 * ⚠️ ORDER MATTERS AND IT IS FILENAME ORDER, the same order the matrix and every
 * hand-application use. Folding them in any other order would answer a question
 * about a database nobody has.
 */
export function foldBuckets(files) {
  const buckets = new Map()
  for (const { name, sql } of files) {
    const text = strip(sql)

    // create: insert into storage.buckets (cols) values ('id', ...)
    const ins = /insert\s+into\s+storage\.buckets\s*\(([^)]*)\)\s*values([\s\S]*?);/gi
    let m
    while ((m = ins.exec(text)) !== null) {
      const cols = m[1].split(',').map((c) => c.trim().toLowerCase())
      for (const row of m[2].matchAll(/\(\s*'([^']+)'([\s\S]*?)\)/g)) {
        const id = row[1]
        const b = buckets.get(id) ?? { id, size: false, mime: false, createdIn: name }
        if (cols.includes('file_size_limit')) b.size = true
        if (cols.includes('allowed_mime_types')) b.mime = true
        buckets.set(id, b)
      }
    }

    // harden: update storage.buckets set ... where id = 'x'  OR  id in ('x','y')
    //
    // ⚠️ BOTH FORMS, BECAUSE THE REAL LEDGER USES BOTH. The first draft of this
    // guard understood only `id = 'x'` and therefore could not see 0069's
    // `id in ('takes','edits')`. It reported a bucket as unfenced that a
    // migration had fenced four months earlier — a guard confidently inventing
    // a drift finding is worse than no guard, because somebody then "fixes" it.
    const upd = /update\s+storage\.buckets\s+set([\s\S]*?)where([\s\S]*?);/gi
    while ((m = upd.exec(text)) !== null) {
      const set = m[1].toLowerCase()
      const ids = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
      for (const id of ids) {
        const b = buckets.get(id) ?? { id, size: false, mime: false, createdIn: name }
        if (set.includes('file_size_limit')) b.size = true
        if (set.includes('allowed_mime_types')) b.mime = true
        buckets.set(id, b)
      }
    }
  }
  return [...buckets.values()]
}

export function checkBuckets(files) {
  return foldBuckets(files).flatMap((b) => {
    const missing = [!b.size && 'file_size_limit', !b.mime && 'allowed_mime_types'].filter(Boolean)
    if (missing.length === 0) return []
    return [`bucket "${b.id}" (created in ${b.createdIn}) is never given ${missing.join(' or ')}. `
      + 'An unfenced bucket accepts anything the service key reaches, whatever the table '
      + 'grants say. Declare both, in the create or in a later migration.']
  })
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }
  const f = (name, sql) => ({ name, sql })

  ok('a bucket created with both passes', checkBuckets([
    f('0065', "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('t','t',false,1,array['video/mp4']);"),
  ]).length === 0)

  // ⚠️ THE REAL 0160 SHAPE.
  ok('a bucket created with neither FAILS', checkBuckets([
    f('0160', "insert into storage.buckets (id, name, public) values ('rf','rf',false) on conflict (id) do nothing;"),
  ]).length === 1)

  ok('naming only the size still FAILS — the mime list refuses different things', checkBuckets([
    f('0160', "insert into storage.buckets (id, name, public, file_size_limit) values ('rf','rf',false,1);"),
  ]).length === 1)

  // ⚖️ THE TWO-STEP 0160/0161 ACTUALLY DO. Refusing this would refuse the fix.
  ok('hardened by a LATER migration passes', checkBuckets([
    f('0160', "insert into storage.buckets (id, name, public) values ('rf','rf',false);"),
    f('0161', "update storage.buckets set file_size_limit = 1, allowed_mime_types = array['image/jpeg'] where id = 'rf';"),
  ]).length === 0)

  // ⚠️ THE FORM THAT FOOLED THE FIRST DRAFT OF THIS GUARD.
  ok('understands `where id in (...)`, which the real 0069 uses', checkBuckets([
    f('0065', "insert into storage.buckets (id, name, public) values ('takes','takes',false),('edits','edits',false);"),
    f('0069', "update storage.buckets set file_size_limit = 629145600 where id in ('takes', 'edits');"),
    f('0070', "update storage.buckets set allowed_mime_types = array['video/mp4'] where id in ('takes', 'edits');"),
  ]).length === 0)

  ok('hardening a DIFFERENT bucket does not launder this one', checkBuckets([
    f('0160', "insert into storage.buckets (id, name, public) values ('rf','rf',false);"),
    f('0161', "update storage.buckets set file_size_limit = 1, allowed_mime_types = array['image/jpeg'] where id = 'other';"),
  ]).length === 1)

  ok('two buckets in one insert are both checked', checkBuckets([
    f('0065', "insert into storage.buckets (id, name, public) values ('a','a',false),('b','b',false);"),
  ]).length === 2)

  ok('a bucket named only in a comment is not a bucket', checkBuckets([
    f('0100', "-- we could insert into storage.buckets (id) values ('ghost')\nselect 1;"),
  ]).length === 0)

  ok('no migrations at all is not a failure', checkBuckets([]).length === 0)

  if (failed) process.exit(1)
  console.log('storage-bucket-limits selftest: all cases passed')
  process.exit(0)
}

const dir = join(REPO, 'supabase', 'migrations')
const files = readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()
  .map((name) => ({ name: name.slice(0, 4), sql: readFileSync(join(dir, name), 'utf8') }))
const problems = checkBuckets(files)
if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`)
  process.exit(1)
}
console.log(`storage-bucket-limits guard: OK (${foldBuckets(files).length} buckets, all fenced)`)
