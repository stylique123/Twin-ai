// Item-5 honesty: the stored capture-intent fields are bounded ASCII
// (uuids / 64-hex / enums / ISO timestamp), so a real intent never carries
// arbitrary Unicode. This still PROVES the canonical serializer's string
// primitive — PostgreSQL to_jsonb(text)::text — escapes byte-identically to
// JS JSON.stringify for hostile strings (quotes, backslash, control chars,
// Unicode, emoji, and the $-delimiter used elsewhere in the harness), so the
// canonicalizer would remain correct even if a string field ever widened.
// (NUL is intentionally excluded: PostgreSQL `text` cannot store it.)
import { execFileSync } from 'node:child_process'

const cases = [
  'plain', 'quo"te', 'back\\slash', 'tab\there', 'new\nline', 'ret\rurn',
  'emoji\u{1F600}', 'é-nfc', '中文', 'slash/fwd', 'dollar$q$tag',
]
// Dollar-quote with a tag that cannot appear in the payloads above.
const TAG = '$ESCX$'
let ok = true
for (const s of cases) {
  const db = execFileSync('psql', ['-tA', '-c', `select to_jsonb(${TAG}${s}${TAG}::text)::text`], { encoding: 'utf8' }).replace(/\n$/, '')
  const js = JSON.stringify(s)
  if (db !== js) { ok = false; console.log('  MISMATCH', JSON.stringify(s), 'js', js, 'db', db) }
}
console.log(ok ? `  escaping parity OK (${cases.length} hostile strings)` : '  ESCAPING PARITY FAIL')
process.exit(ok ? 0 : 1)
