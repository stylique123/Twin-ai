// AN EDGE FUNCTION'S DEPENDENCIES MUST BE PINNED TO AN EXACT VERSION.
//
// Every function imported `jsr:@supabase/supabase-js@2` — a FLOATING MAJOR. The
// version that actually shipped was decided by whatever was newest at the
// moment the bundler ran, which means:
//
//   * a deploy could pick up a different library than the one that passed CI,
//     with no commit and no review between them;
//   * an upstream publish could break all 17 bundles at once with nothing
//     changing in this repository.
//
// The second is not hypothetical. On 2026-08-06 a staging matrix died bundling
// `source-asset` with "Could not find npm package '@supabase/auth-js' matching
// '2.112.2'" — a publish-propagation race between npm and JSR. The package was
// fine minutes later. The cost was a 50-minute run, and the same race during a
// PRODUCTION deploy would have taken the functions down instead.
//
// A pin does not make upstream more reliable. It makes the failure DELIBERATE:
// the version changes when someone changes it, in a diff, with the tests that
// ran against it. That is the whole claim.
//
// ── WHY A GUARD AND NOT JUST THE EDIT ─────────────────────────────────────
//
// Seventeen files were pinned by hand. The eighteenth function will be written
// by copying the seventeenth, or by copying an example from the Supabase docs —
// which use the floating form, because docs optimise for the reader's first
// five minutes rather than for a deploy in eight months. This is not a thing a
// person can be relied on to remember, so it is not left to them.
//
//   node scripts/ci/check_edge_dependency_pins.mjs            # live
//   node scripts/ci/check_edge_dependency_pins.mjs --selftest # fixtures
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const ROOT = join(REPO, 'supabase', 'functions')

// A remote specifier and the version it names, for the registries this tree
// actually imports from. `node:` and relative imports are not versioned and are
// not the subject of this rule.
const SPECIFIER = /from\s+['"](jsr:|npm:|https:\/\/esm\.sh\/|https:\/\/deno\.land\/)([^'"]+)['"]/g

/** EXACT means every number is present: 1.2.3, not 1, 1.2, ^1.2.3 or ~1.2.3. */
const EXACT = /@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/

export function findFloating(src) {
  const out = []
  // Strip comments so a documented example cannot be reported.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ')
  for (const m of code.matchAll(SPECIFIER)) {
    const [, scheme, rest] = m
    // deno.land paths carry their version as `std@0.1.2/path`; take the segment
    // that holds the `@`.
    const head = scheme.includes('deno.land') ? rest.split('/').find((s) => s.includes('@')) ?? rest : rest
    // A bare module with no `@` at all is the most floating form there is.
    const at = head.lastIndexOf('@')
    if (at <= 0) { out.push({ spec: scheme + rest, why: 'no version at all' }); continue }
    if (!EXACT.test(head)) {
      out.push({ spec: scheme + rest, why: `not an exact version (${head.slice(at)})` })
    }
  }
  return out
}

function sourceFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (e.endsWith('.ts') || e.endsWith('.mjs')) out.push(p)
    }
  }
  walk(dir)
  return out
}

function evaluate() {
  const problems = []
  for (const f of sourceFiles(ROOT)) {
    for (const hit of findFloating(readFileSync(f, 'utf8'))) {
      problems.push(
        `${relative(REPO, f)}: '${hit.spec}' is ${hit.why} — an edge deploy would resolve `
        + `whatever is newest at bundle time, so the code that ships is not the code CI ran. `
        + `Pin the exact version.`)
    }
  }
  return problems
}

function selftest() {
  const cases = [
    ['a floating major is caught', "import { createClient } from 'jsr:@supabase/supabase-js@2'", 1],
    ['an exact pin passes', "import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'", 0],
    ['a caret range is caught', "import x from 'npm:zod@^3.22.0'", 1],
    ['a tilde range is caught', "import x from 'npm:zod@~3.22.0'", 1],
    ['major.minor is caught', "import x from 'jsr:@std/encoding@1.0'", 1],
    ['no version at all is caught', "import x from 'npm:leftpad'", 1],
    ['a prerelease pin passes', "import x from 'npm:zod@3.22.0-beta.1'", 0],
    ['deno.land std with an exact version passes', "import x from 'https://deno.land/std@0.208.0/path/mod.ts'", 0],
    ['node: builtins are not versioned and are ignored', "import { join } from 'node:path'", 0],
    ['relative imports are ignored', "import x from './shared.ts'", 0],
    ['a commented-out example is not a finding', "// import x from 'jsr:@supabase/supabase-js@2'", 0],
    ['a block-commented example is not a finding', "/* from 'jsr:@supabase/supabase-js@2' */", 0],
  ]
  let failed = 0
  for (const [name, src, expected] of cases) {
    const got = findFloating(src).length
    if (got !== expected) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${expected}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`edge-dependency-pins selftest: ${failed} failed`); process.exit(1) }
  console.log('edge-dependency-pins selftest: all cases passed'); process.exit(0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const problems = evaluate()
    if (problems.length) { for (const p of problems) console.error(`::error::${p}`); process.exit(1) }
    console.log('edge-dependency-pins guard: OK (every edge import names an exact version)')
  }
}
