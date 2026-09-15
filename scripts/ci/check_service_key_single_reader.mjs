#!/usr/bin/env node
// ONE MODULE MAY READ THE LEGACY SERVICE-ROLE VARIABLE. THE OTHER 25 MAY NOT.
//
// ⚠️ WHY THIS GUARD EXISTS AT ALL. `SUPABASE_SERVICE_ROLE_KEY` is injected by
// the platform and CANNOT be set by an operator — the `SUPABASE_` prefix is
// reserved, so a rotated credential can never arrive through it. Every function
// that reads it directly is therefore pinned to the OLD key, and the exposed one
// cannot be disabled until none of them do. That migration is only finished
// while it STAYS finished: without a guard, function 26 reintroduces the read by
// copy-paste from function 3 and nothing notices until a rotation breaks live
// script generation.
//
// ⚖️ WHAT IT ASSERTS, AND WHY EACH HALF IS NEEDED.
//   1. NO raw read outside the resolver. That is the rule.
//   2. At least MIN_CALL_SITES functions actually call `serviceKeyFrom`. Rule 1
//      alone passes vacuously if the directory is renamed, emptied, or the call
//      is deleted along with the client it fed. A guard that cannot tell
//      "migrated" from "gone" is measuring nothing.
//   3. Every file that calls `serviceKeyFrom` imports it. A call with no import
//      is a reference error at deploy, not at review.
//
// ⚠️ WHOLE-LINE COMMENTS ARE STRIPPED, TRAILING ONES ARE NOT. `ci-bootstrap`
// documents the whole migration in prose and names the variable while doing so;
// prose must not fail the build. But a real read with an excuse appended to it
// (`...get('SUPABASE_SERVICE_ROLE_KEY')! // legacy, fine for now`) is exactly
// the thing this catches, so trailing comments are left in place.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../../supabase/functions/', import.meta.url).pathname
// The one file whose whole job is reading it. Everything else goes through it.
const RESOLVER = '_shared/serviceKey.ts'
const RAW = /\b(?:Deno\.env\.get|env)\s*\(\s*['"`]SUPABASE_SERVICE_ROLE_KEY['"`]\s*\)/
// 25 call sites at the time of the migration. A floor, not a ceiling: adding a
// function is fine, quietly losing them all is not.
const MIN_CALL_SITES = 25

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|mts|mjs)$/.test(name)) out.push(p)
  }
  return out
}

/** Drop lines that are ENTIRELY a comment. Trailing comments survive. */
export function stripWholeLineComments(source) {
  return source
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line))
    .join('\n')
}

export function auditSource(rel, source) {
  const problems = []
  const code = stripWholeLineComments(source)
  const lines = code.split('\n')
  const isResolver = rel === RESOLVER
  let callSite = false

  lines.forEach((line, i) => {
    if (RAW.test(line) && !isResolver) {
      problems.push(`${rel}:${i + 1} reads SUPABASE_SERVICE_ROLE_KEY directly — use serviceKeyFrom(Deno.env)`)
    }
    if (/\bserviceKeyFrom\s*\(/.test(line)) callSite = true
  })

  if (callSite && !isResolver && !/from\s+['"][^'"]*_shared\/serviceKey\.ts['"]/.test(code)) {
    problems.push(`${rel} calls serviceKeyFrom but never imports it`)
  }
  return { problems, callSite: callSite && !isResolver }
}

if (process.argv.includes('--selftest')) {
  let bad = 0
  const expect = (name, cond) => {
    if (cond) console.log(`ok   ${name}`)
    else { bad++; console.error(`FAIL ${name}`) }
  }
  const imp = "import { serviceKeyFrom } from '../_shared/serviceKey.ts'\n"

  // A genuinely broken case must FAIL — this is the mutation the guard exists for.
  expect('raw Deno.env.get read is caught',
    auditSource('x/index.ts', "const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!").problems.length === 1)
  expect('raw env() read is caught',
    auditSource('x/index.ts', "const k = env('SUPABASE_SERVICE_ROLE_KEY')!").problems.length === 1)
  expect('read with a trailing excuse is still caught',
    auditSource('x/index.ts', "const k = env('SUPABASE_SERVICE_ROLE_KEY')! // legacy, fine for now").problems.length === 1)
  expect('double-quoted read is caught',
    auditSource('x/index.ts', 'const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")').problems.length === 1)
  expect('spaced call is caught',
    auditSource('x/index.ts', "const k = Deno.env.get( 'SUPABASE_SERVICE_ROLE_KEY' )").problems.length === 1)

  // Prose naming the variable must PASS, or ci-bootstrap's own documentation breaks the build.
  expect('whole-line comment naming the variable passes',
    auditSource('ci-bootstrap/index.ts', "// JWT (SUPABASE_SERVICE_ROLE_KEY) is REJECTED by GoTrue\n").problems.length === 0)
  expect('block-comment continuation passes',
    auditSource('x/index.ts', " * Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') was the old way\n").problems.length === 0)

  // The resolver itself is allowed to read it.
  expect('resolver may read it',
    auditSource(RESOLVER, "const legacy = env.get('SUPABASE_SERVICE_ROLE_KEY')").problems.length === 0)

  // A migrated call site passes, and is counted.
  const good = auditSource('x/index.ts', imp + 'const k = serviceKeyFrom(Deno.env)')
  expect('migrated call site passes', good.problems.length === 0)
  expect('migrated call site is counted', good.callSite === true)

  // A call with no import is a deploy-time reference error.
  expect('call without import is caught',
    auditSource('x/index.ts', 'const k = serviceKeyFrom(Deno.env)').problems.length === 1)

  // A file with neither is inert and must not be counted toward the floor.
  const inert = auditSource('x/index.ts', 'const k = 1')
  expect('inert file has no problems', inert.problems.length === 0)
  expect('inert file is not counted', inert.callSite === false)

  if (bad) { console.error(`\n${bad} selftest failure(s)`); process.exit(1) }
  console.log('\nAll service-key single-reader selftests passed.')
  process.exit(0)
}

const problems = []
let callSites = 0
for (const abs of walk(ROOT)) {
  const rel = abs.slice(ROOT.length)
  const r = auditSource(rel, readFileSync(abs, 'utf8'))
  problems.push(...r.problems)
  if (r.callSite) callSites++
}

if (callSites < MIN_CALL_SITES) {
  problems.push(
    `only ${callSites} file(s) call serviceKeyFrom, expected at least ${MIN_CALL_SITES} — ` +
    `either the migration was reverted or this guard is now checking nothing`,
  )
}

if (problems.length) {
  console.error('SERVICE-KEY SINGLE-READER VIOLATIONS:\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error(`\n${problems.length} violation(s). The legacy variable is injected and unrotatable;`)
  console.error('read the credential through supabase/functions/_shared/serviceKey.ts instead.')
  process.exit(1)
}
console.log(`ok   no raw SUPABASE_SERVICE_ROLE_KEY reads outside ${RESOLVER}`)
console.log(`ok   ${callSites} edge function(s) resolve the credential through serviceKeyFrom`)
