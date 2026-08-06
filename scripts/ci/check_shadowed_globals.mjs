// A MODULE THAT SHADOWS A GLOBAL CONSTRUCTOR MUST NOT THEN CALL IT.
//
// Matrix run #223 reached Phase 8 assertion A18 — the real render passed, bytes
// in storage, h264/aac, duration within the frozen ±250 ms — and then died on:
//
//     phase8 fatal: TypeError: URL is not a constructor
//
// `scripts/staging-integration/phase8.mjs` line 46 is `const URL =
// need('STAGING_URL')`. That is the house pattern across all nine staging
// scripts, and it shadows the global `URL` for the whole module. A line added
// later used `new URL('…', import.meta.url)` to locate a file beside the repo —
// the ordinary ESM idiom, correct in every other file in this tree — and it
// became `new` applied to a string.
//
// WHAT MAKES THIS WORTH A GUARD rather than a fix at the one call site:
//
//   * It costs a FULL MATRIX RUN to discover. ~50 minutes, and only after the
//     expensive phases have already passed. The failure is at the end because
//     that is where new assertions get appended.
//   * It is invisible to typecheck, to every unit test, and to review. The line
//     is idiomatic. The trap is 300 lines above it, in a variable named for an
//     environment variable, doing something completely unrelated.
//   * The shadow is the HOUSE PATTERN, so it is not one file's mistake to
//     correct — it is a property of the directory, and the next assertion
//     appended to any of those nine scripts walks into it exactly the same way.
//
// So this refuses the COMBINATION, not the shadow. Naming a local `URL` is
// legal and the nine scripts keep doing it; what fails is a module that shadows
// a global constructor and then calls that constructor with `new`. That is
// always a bug — the author meant the global and cannot reach it.
//
//   node scripts/ci/check_shadowed_globals.mjs            # live: scan the tree
//   node scripts/ci/check_shadowed_globals.mjs --selftest # fixtures
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

// Globals that are BOTH commonly shadowed by a domain name and constructed with
// `new`. Deliberately short: a long list would flag names nobody constructs and
// train people to ignore the check.
const GUARDED = ['URL', 'Response', 'Request', 'Headers', 'Blob', 'File', 'Event']

const SCAN_DIRS = ['scripts', 'worker/src', 'supabase/functions', 'packages/shared/src', 'apps/web/src']
const EXT = /\.(mjs|cjs|js|ts|tsx)$/

function sourceFiles(dir) {
  const out = []
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d) } catch { return }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'dist' || e === '.git') continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (EXT.test(e)) out.push(p)
    }
  }
  walk(join(REPO, dir))
  return out
}

// Comments and strings are stripped first. Without this, the very comment
// explaining the trap in phase8.mjs would trip the check that exists because of
// it — a guard that cannot be documented is a guard people delete.
export function strip(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      i++
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      i++
      out += ' '
      continue
    }
    out += c
    i++
  }
  return out
}

/** Findings for one file's source text. Exported for the selftest. */
export function inspect(src) {
  const code = strip(src)
  const found = []
  for (const g of GUARDED) {
    // A module-scope binding: `const URL = …` / `let URL` / `var URL`, at column
    // zero. Indented ones are inside a function, where the shadow is scoped and
    // the author can still see both in one screenful.
    const shadowed = new RegExp(`^(?:const|let|var)\\s+${g}\\s*[=;]`, 'm').test(code)
    if (!shadowed) continue
    const constructed = new RegExp(`\\bnew\\s+${g}\\s*\\(`).test(code)
    if (constructed) found.push(g)
  }
  return found
}

function evaluate() {
  const problems = []
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(dir)) {
      const found = inspect(readFileSync(file, 'utf8'))
      for (const g of found) {
        problems.push(`${relative(REPO, file)} shadows the global \`${g}\` at module scope and then calls \`new ${g}(…)\` — that is \`new\` applied to the shadow, and throws "${g} is not a constructor" at runtime`)
      }
    }
  }
  return problems
}

function selftest() {
  const cases = [
    ['shadow + new => caught', "const URL = process.env.X\nconst p = new URL('./a', import.meta.url)\n", ['URL']],
    ['shadow, no new => allowed (the nine staging scripts)', "const URL = process.env.X\nfetch(`${URL}/functions/v1/x`)\n", []],
    ['new, no shadow => allowed (every other file)', "const p = new URL('./a', import.meta.url)\n", []],
    ['the shadow inside a function is not module scope', "function f() {\n  const URL = 'x'\n}\n", []],
    // The exact regression, reduced.
    ['phase8 reduced', "const URL = need('STAGING_URL')\nconst policy = JSON.parse(await readFile(new URL('../../worker/p.json', import.meta.url)))\n", ['URL']],
    // The guard must survive being documented, or the first person to explain
    // it deletes it instead.
    ['a comment mentioning both is not a finding', "// line 46 does `const URL = need('X')`, so never write new URL(…) here\nconst x = 1\n", []],
    ['a string mentioning both is not a finding', "const msg = \"const URL = x; new URL(y)\"\n", []],
    ['another guarded global', "const Response = mkResponse()\nreturn new Response('ok')\n", ['Response']],
    ['both at once', "const URL = a\nconst Headers = b\nnew URL(x); new Headers(y)\n", ['URL', 'Headers']],
  ]
  let failed = 0
  for (const [name, src, expected] of cases) {
    const got = inspect(src)
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`)
      failed++
    } else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`shadowed-globals selftest: ${failed} failed`); process.exit(1) }
  console.log('shadowed-globals selftest: all cases passed'); process.exit(0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const problems = evaluate()
    if (problems.length) { for (const p of problems) console.error(`::error::${p}`); process.exit(1) }
    console.log(`shadowed-globals guard: OK (no module shadows ${GUARDED.join('/')} and then constructs it)`)
  }
}
