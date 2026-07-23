// Compares DB canonical/sha (via psql) to the TS fixtures emitted by
// parity_driver. No shell interpolation: psql receives the intent JSON as a
// -v variable and quotes it with :'v'. Exits non-zero on any mismatch.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ts = JSON.parse(readFileSync(process.argv[2], 'utf8'))
// Dollar-quote the JSON literal ($q$ never occurs in canonical intent JSON).
// execFileSync passes the -c argument verbatim (no shell), so no escaping games.
const psql = (json, fn) => execFileSync('psql', ['-tA', '-c',
  `select public.${fn}($q$${json}$q$::jsonb)`], { encoding: 'utf8' }).trim()

let ok = true
ts.forEach((o, i) => {
  const j = JSON.stringify(o.intent)
  const canon = psql(j, 'editor_capture_intent_canonical')
  const sha = psql(j, 'editor_capture_intent_sha256')
  const cok = canon === o.canonical, sok = sha === o.sha
  console.log(`fixture ${i}: canonical ${cok ? 'OK' : 'MISMATCH'}, sha ${sok ? 'OK' : 'MISMATCH'}`)
  if (!cok) { console.log(' TS:', o.canonical); console.log(' DB:', canon) }
  if (!sok) { console.log(' sha TS:', o.sha, 'DB:', sha) }
  if (!cok || !sok) ok = false
})
process.exit(ok ? 0 : 1)
