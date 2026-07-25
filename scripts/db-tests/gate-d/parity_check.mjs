// Compares DB canonical/sha (via psql) to the TS fixtures from parity_driver.
// Covers the stored canonical + sha, the input-projection canonical, and the
// numeric-normalization case (integral floats on the wire). Dollar-quoted so
// there is no shell interpolation. Exits non-zero on any mismatch.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ts = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const psql = (json, fn) => execFileSync('psql', ['-tA', '-c',
  `select public.${fn}($q$${json}$q$::jsonb)`], { encoding: 'utf8' }).trim()

let ok = true
const fail = (m) => { ok = false; console.log('  ' + m) }
// Script-snapshot canonical/sha via the 3-arg DB fn (gen uuid, scene_timeline
// jsonb, selected_hook text). scene_timeline may be null; selected_hook may be null.
const psqlScript = (o, fn) => {
  const tlArg = o.sceneTimeline == null ? 'null::jsonb' : `$q$${JSON.stringify(o.sceneTimeline)}$q$::jsonb`
  const hookArg = o.selectedHook == null ? 'null::text' : `$h$${o.selectedHook}$h$::text`
  return execFileSync('psql', ['-tA', '-c',
    `select public.${fn}('${o.generationId}'::uuid, ${tlArg}, ${hookArg})`], { encoding: 'utf8' }).trim()
}

ts.forEach((o, i) => {
  if (o.numericNorm) {
    const db = psql(o.dbStoredRaw, 'editor_capture_intent_canonical')
    if (db !== o.canonical) fail(`numericNorm MISMATCH\n   TS: ${o.canonical}\n   DB: ${db}`)
    else console.log('  numeric-normalization (integral floats) parity OK')
    return
  }
  if (o.scriptSnap) {
    const canon = psqlScript(o, 'editor_recording_script_canonical')
    const sha = psqlScript(o, 'editor_recording_script_sha256')
    const cok = canon === o.canonical, sok = sha === o.sha
    console.log(`  script[${o.label}]: canonical ${cok ? 'OK' : 'MISMATCH'}, sha ${sok ? 'OK' : 'MISMATCH'}`)
    if (!cok) fail(`   script TS ${o.canonical}\n   script DB ${canon}`)
    if (!sok) fail(`   script sha TS ${o.sha} DB ${sha}`)
    return
  }
  const canon = psql(JSON.stringify(o.stored), 'editor_capture_intent_canonical')
  const sha = psql(JSON.stringify(o.stored), 'editor_capture_intent_sha256')
  const inCanon = psql(JSON.stringify(o.input), 'editor_capture_intent_input_canonical')
  const cok = canon === o.canonical, sok = sha === o.sha, iok = inCanon === o.inputCanonical
  console.log(`  fixture ${i}: stored ${cok ? 'OK' : 'MISMATCH'}, sha ${sok ? 'OK' : 'MISMATCH'}, input ${iok ? 'OK' : 'MISMATCH'}`)
  if (!cok) fail(`   stored TS ${o.canonical}\n   stored DB ${canon}`)
  if (!sok) fail(`   sha TS ${o.sha} DB ${sha}`)
  if (!iok) fail(`   input TS ${o.inputCanonical}\n   input DB ${inCanon}`)
})
process.exit(ok ? 0 : 1)
