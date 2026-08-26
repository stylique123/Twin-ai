#!/usr/bin/env node
// THE WILDCARD IS SAFE BECAUSE OF A PREMISE. THIS GUARD IS THE PREMISE.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// Every edge function sends `Access-Control-Allow-Origin: *`. SECURITY.md
// row 9 accepts that, and the acceptance rests on one specific premise:
//
//   every endpoint authenticates from an explicit `Authorization: Bearer`
//   header that a cross-origin page cannot read, and NEVER from anything the
//   browser attaches on its own.
//
// While that holds, `*` grants an attacker page nothing it could not already
// do with curl -- CORS is not the boundary, the bearer token is. The moment it
// stops holding, `*` becomes a live CSRF hole in 24 functions at once, and the
// change that breaks it is a one-line change in one file that reads as
// perfectly reasonable on its own.
//
// So the premise is not left as a sentence in a document that nobody diffs.
// It is checked.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// ⚠️ IT DOES NOT REQUIRE AN ORIGIN ALLOWLIST, and adding one is not what
// closing this looks like. An allowlist here would protect nothing (an
// attacker with a token calls from a server, where CORS does not exist) while
// adding a real availability failure mode: an origin nobody remembered --
// a preview deployment, a native shell, localhost -- silently breaks. The
// tightening that pays is the one that fires when the premise dies.
//
// ⚠️ IT CANNOT PROVE A FUNCTION AUTHENTICATES CORRECTLY. It proves only that
// no wildcard function has started depending on ambient credentials. A
// function that gets its authorization logic wrong passes this guard.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'supabase/functions'

// ⚠️ EACH PATTERN IS A WAY THE BROWSER ATTACHES CREDENTIALS BY ITSELF. That
// is the whole list -- not "things that look risky", but specifically the
// things that make `*` mean something different than it means today.
const AMBIENT = [
  [/Access-Control-Allow-Credentials/i, 'sets Access-Control-Allow-Credentials -- with `*` this is the exact combination browsers refuse, and with an allowlist it hands a cross-origin page the session'],
  [/headers\s*\.\s*get\s*\(\s*['"`]cookie['"`]\s*\)/i, 'reads the Cookie request header -- a cookie is attached by the browser, not by our client, so the bearer-only premise no longer holds'],
  [/['"`]Set-Cookie['"`]/i, 'sets a cookie on the response -- whatever is in it will be sent back automatically on every later cross-origin call'],
]

function tsFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsFiles(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

export function check(files) {
  const problems = []
  let wildcards = 0
  for (const { path, src } of files) {
    if (!/['"`]Access-Control-Allow-Origin['"`]\s*:\s*['"`]\*['"`]/.test(src)) continue
    wildcards++
    for (const [re, why] of AMBIENT) {
      if (re.test(src)) problems.push(`${path}: serves Access-Control-Allow-Origin: * and ${why}`)
    }
  }
  return { problems, wildcards }
}

// ── SELFTEST ──────────────────────────────────────────────────────────────
// ⚠️ VALIDATED ON KNOWN-FAILING CASES. A guard whose zero has never been shown
// to be able to be non-zero is not evidence of anything.
if (process.argv.includes('--selftest')) {
  const wild = "const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization' }\nconst { data } = await admin.auth.getUser(jwt)\n"
  const ok = [
    ['wildcard with bearer only', [{ path: 'a.ts', src: wild }]],
    // A function that DOES use cookies is fine as long as it is not also
    // wildcarded -- the guard fires on the combination, not on either half.
    ['cookies without a wildcard', [{ path: 'b.ts', src: "const c = req.headers.get('cookie')\n" }]],
  ]
  const bad = [
    ['wildcard + credentials', [{ path: 'c.ts', src: `${wild}'Access-Control-Allow-Credentials': 'true',\n` }]],
    ['wildcard + cookie read', [{ path: 'd.ts', src: `${wild}const c = req.headers.get('cookie')\n` }]],
    ['wildcard + Set-Cookie', [{ path: 'e.ts', src: `${wild}h.set('Set-Cookie', 'sid=' + id)\n` }]],
  ]
  let failures = 0
  for (const [name, files] of ok) {
    const r = check(files)
    if (r.problems.length !== 0) { console.error(`selftest: "${name}" was rejected and must not be: ${r.problems[0]}`); failures++ }
  }
  for (const [name, files] of bad) {
    if (check(files).problems.length === 0) { console.error(`selftest: "${name}" was accepted and must not be`); failures++ }
  }
  if (failures > 0) { console.error(`cors-assumption guard selftest: ${failures} FAILED`); process.exit(1) }
  console.log(`cors-assumption guard selftest: OK (${ok.length} accepted, ${bad.length} rejected)`)
  process.exit(0)
}

const files = tsFiles(ROOT).map((path) => ({ path, src: readFileSync(path, 'utf8') }))
const { problems, wildcards } = check(files)
console.log(`  ${files.length} edge-function sources · ${wildcards} serve Access-Control-Allow-Origin: *`)
if (problems.length > 0) {
  for (const p of problems) console.log(`::error::CORS premise broken: ${p}`)
  console.log('::error::SECURITY.md row 9 accepts the wildcard ONLY because auth is bearer-only. Either keep it bearer-only, or change row 9 and this guard together -- deliberately, in the same PR.')
  process.exit(1)
}
console.log('cors-assumption guard: OK -- the wildcard premise still holds')
