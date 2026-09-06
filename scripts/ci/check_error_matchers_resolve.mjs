#!/usr/bin/env node
// A MATCHER GIVEN `undefined` ACCEPTS ANYTHING, AND THE SUITE STAYS GREEN.
//
// ⚠️ MEASURED 2026-09-05, NOT HYPOTHESISED. `OwnedEntityExistsError` was deleted
// from packages/shared/src/api.ts. Two tests still did:
//
//     import { OwnedEntityExistsError } from '../api'
//     await expect(...).rejects.toThrow(OwnedEntityExistsError)
//
// The import resolved to `undefined`, and `.rejects.toThrow(undefined)` accepts
// ANY error — verified directly: an unrelated TypeError satisfies it. The full
// suite reported 5,674 passing while two assertions had quietly stopped
// asserting anything. Nothing failed, so nothing was noticed.
//
// ⚠️ AND THE TYPE CHECKER COULD NOT HAVE SAVED US. packages/shared/tsconfig.json
// excludes `src/**/__tests__/**` and `src/**/*.test.ts`, so tsc never reads a
// test file. Three bad type literals went through the same hole the same day.
//
// ⚖️ THE IMPORT WAS PRESENT; THE EXPORT WAS NOT. So "is the name imported?" is
// the wrong question and would have passed. This guard resolves the module the
// name is imported FROM and asks whether it still exports it.
//
// ⚖️ CLASS-SHAPED NAMES ONLY. `toThrow('some string')` and `toThrow(/regex/)`
// are checked by value and cannot silently widen; a bare Capitalised identifier
// is the shape that can become `undefined` without a word changing.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.test\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** `.toThrow(Name)` / `.toBeInstanceOf(Name)` — bare Capitalised identifier only. */
const MATCHER = /\.(?:toThrow|toBeInstanceOf)\(\s*([A-Z][A-Za-z0-9_]*)\s*\)/g

/** Where a name is imported from in this file, if it is. */
function importSourceOf(src, name) {
  const re = new RegExp(
    `import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]([^'"]+)['"]`, 'g')
  let m
  while ((m = re.exec(src)) !== null) {
    const named = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    if (named.includes(name)) return m[2]
  }
  return null
}

/** Resolve a relative specifier to a real .ts file, or null for packages. */
function resolveModule(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(cand)) return cand
  }
  return null
}

/** ⚠️ WHOLE-LINE COMMENTS ONLY, NEVER EVERYTHING AFTER `//`. Stripping to the
 *  end of a line would delete a real declaration sitting after a string that
 *  contains "//" — a URL — which is how this repo's guards have been blinded
 *  before. A comment that merely NAMES a symbol must not read as exporting it. */
const withoutWholeLineComments = (src) => src
  .split('\n').filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join('\n')

function exportsName(file, name) {
  const src = withoutWholeLineComments(readFileSync(file, 'utf8'))
  if (new RegExp(`export\\s+(?:abstract\\s+)?(?:class|function|const|let|type|interface|enum)\\s+${name}\\b`).test(src)) return true
  if (new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(src)) return true
  // A barrel that re-exports everything cannot be settled by reading it alone.
  if (/export\s+\*\s+from/.test(src)) return 'unknown'
  return false
}

// ── SELFTEST ────────────────────────────────────────────────────────────────
// ⚠️ WRITTEN AFTER A BAD VALIDATION, AND THAT IS WHY IT EXISTS. The first attempt
// to prove this guard worked added an import of `OwnedEntityExistsError` to a
// real test on a branch where that class STILL EXISTS — so the guard passed,
// correctly, and it read as the guard failing to catch its own case. A guard
// validated against a case that is not actually broken has been validated
// against nothing. These fixtures are broken by construction.
if (process.argv.includes('--selftest')) {
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const root = mkdtempSync(join(tmpdir(), 'matchers-'))
  mkdirSync(join(root, 'src', '__tests__'), { recursive: true })
  const cases = []
  const put = (rel, body) => { writeFileSync(join(root, rel), body); return join(root, rel) }

  put('src/mod.ts', 'export class RealError extends Error {}\nexport const other = 1\n')

  const ok = put('src/__tests__/ok.test.ts',
    "import { RealError } from '../mod'\nexpect(x).toThrow(RealError)\n")
  const gone = put('src/__tests__/gone.test.ts',
    "import { GoneError } from '../mod'\nexpect(x).toThrow(GoneError)\n")
  const missing = put('src/__tests__/missing.test.ts',
    "expect(x).toThrow(NeverImported)\n")
  const local = put('src/__tests__/local.test.ts',
    "class LocalError extends Error {}\nexpect(x).toThrow(LocalError)\n")
  const stringy = put('src/__tests__/stringy.test.ts',
    "expect(x).toThrow('a message')\nexpect(y).toThrow(/pattern/)\n")

  const check = (file) => {
    const src = readFileSync(file, 'utf8')
    const found = []
    for (const m of src.matchAll(MATCHER)) {
      const name = m[1]
      if (new RegExp(`(?:class|const|let|var|function)\\s+${name}\\b`).test(src)) continue
      const spec = importSourceOf(src, name)
      if (spec === null) { found.push(`unimported:${name}`); continue }
      const mod = resolveModule(file, spec)
      if (mod === null) continue
      if (exportsName(mod, name) === false) found.push(`unexported:${name}`)
    }
    return found
  }

  const expectEq = (label, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    cases.push([label, g === w, `${g} vs ${w}`])
  }
  expectEq('an exported class passes', check(ok), [])
  expectEq('a name the module no longer exports FAILS', check(gone), ['unexported:GoneError'])
  expectEq('a name imported from nowhere FAILS', check(missing), ['unimported:NeverImported'])
  expectEq('a locally declared class passes', check(local), [])
  expectEq('a string or regex matcher is not inspected', check(stringy), [])

  rmSync(root, { recursive: true, force: true })
  let bad = 0
  for (const [label, pass, detail] of cases) {
    console.log(`  ${pass ? 'ok' : 'FAIL'}: ${label}${pass ? '' : ' — ' + detail}`)
    if (!pass) bad++
  }
  if (bad > 0) { console.error(`error-matchers selftest: ${bad} case(s) failed`); process.exit(1) }
  console.log('error-matchers selftest: all cases passed')
  process.exit(0)
}

const files = walk(join(REPO, 'packages'), []).concat(walk(join(REPO, 'apps'), []))
const problems = []
let checked = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(MATCHER)) {
    const name = m[1]
    // Declared right here (a local class or a const) — nothing to resolve.
    if (new RegExp(`(?:class|const|let|var|function)\\s+${name}\\b`).test(src)) { checked++; continue }
    const spec = importSourceOf(src, name)
    if (spec === null) {
      problems.push(`${file.slice(REPO.length + 1)}: \`${name}\` is used as an error matcher but is neither imported nor declared in this file — it will be \`undefined\`, and the matcher will accept ANY error.`)
      continue
    }
    const mod = resolveModule(file, spec)
    if (mod === null) { checked++; continue }   // a package; out of scope
    const has = exportsName(mod, name)
    if (has === false) {
      problems.push(`${file.slice(REPO.length + 1)}: \`${name}\` is imported from '${spec}', which no longer exports it. The matcher receives \`undefined\` and accepts ANY error.`)
      continue
    }
    checked++
  }
}

console.log(`  ${files.length} test files · ${checked} error matchers resolved`)
if (problems.length > 0) {
  console.error('\nERROR MATCHERS THAT WOULD ACCEPT ANYTHING:\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nA matcher given `undefined` passes for every error. Import the symbol, or assert on a message.')
  process.exit(1)
}
console.log('error-matchers guard: OK')
