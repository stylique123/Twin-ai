#!/usr/bin/env node
// ONE SOURCE, MECHANICALLY COPIED — NEVER RETYPED.
//
// The edge runtime cannot import scripts/ from inside the functions bundle, and
// this repo has been bitten by the alternative: label-packet.mjs kept its own
// copy of a rate helper, the copy kept the 500%-of-a-different-population bug
// after the original was fixed, and its selftest passed against stale code.
//
// So the Deno copies are GENERATED, and CI regenerates and diffs them. A drifted
// copy is a failing check, not a surprise in production.
//
//   node scripts/ci/generate_shared_pilot_core.mjs          # write
//   node scripts/ci/generate_shared_pilot_core.mjs --check  # fail if stale
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCES = [
  ['scripts/pilot-core.mjs', 'supabase/functions/_shared/pilotCore.ts'],
  ['scripts/pilot-decision.mjs', 'supabase/functions/_shared/pilotDecision.ts'],
  ['scripts/pilot-start.mjs', 'supabase/functions/_shared/pilotStart.ts'],
  // The packet materialiser and the frozen-run reader it depends on. Generated
  // rather than reimplemented so loadPilotRun stays ONE authority: the digest
  // check that refuses a sample changed after freeze must not exist twice.
  ['scripts/pilot-db.mjs', 'supabase/functions/_shared/pilotDb.ts'],
  ['scripts/pilot-collect.mjs', 'supabase/functions/_shared/pilotCollect.ts'],
  ['scripts/d1-core.mjs', 'supabase/functions/_shared/d1Core.ts'],
  ['scripts/watched-session.mjs', 'supabase/functions/_shared/watchedSession.ts'],
]

const render = (from, src) =>
  `// GENERATED FROM ${from} — DO NOT EDIT.\n`
  + `// Run: node scripts/ci/generate_shared_pilot_core.mjs\n`
  + `// Edit the source instead. CI regenerates this file and fails on a diff.\n`
  + `// @ts-nocheck\n`
  + src
    .replace(/from '\.\/pilot-core\.mjs'/g, "from './pilotCore.ts'")
    .replace(/from '\.\/pilot-db\.mjs'/g, "from './pilotDb.ts'")
    .replace(/from '\.\/d1-core\.mjs'/g, "from './d1Core.ts'")

const check = process.argv.includes('--check')
let stale = 0
for (const [from, to] of SOURCES) {
  const want = render(from, readFileSync(from, 'utf8'))
  let have = null
  try { have = readFileSync(to, 'utf8') } catch { /* absent counts as stale */ }
  if (have === want) { console.log(`  fresh: ${to}`); continue }
  if (check) {
    console.error(`::error::${to} has drifted from ${from}. Run `
      + 'node scripts/ci/generate_shared_pilot_core.mjs and commit the result. A hand-edited copy '
      + 'is how the 500% rate bug survived its own fix.')
    stale++
  } else { writeFileSync(to, want); console.log(`  wrote: ${to}`) }
}
process.exit(stale === 0 ? 0 : 1)
