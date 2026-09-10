#!/usr/bin/env node
// Every staging fixture user must be stamped with the run that created it.
//
// WHAT THIS PROTECTS. The matrix purge deletes users by matching the run tag
// inside their email address. A phase that builds its own `@staging.test`
// address without the tag creates a user that NO purge can ever find — not
// the per-run delete, which matches on the tag, and not the age-gated sweep,
// if the literal also drifts from the domain. The row becomes immortal, and
// the only symptom is staging quietly growing again, which is what took six
// weeks to notice the first time: 12,482 users, zero of them real.
//
// ⚠️ THE SECOND ASSERTION EXISTS BECAUSE THE AUTHOR OF THIS FILE MADE THE BUG.
// Rewiring the nine call sites with one sed, four of the nine files imported
// `randomUUID` together with `createHash` and so did not match the pattern
// that inserted the import — they called `fixtureEmail` with nothing
// importing it. That is a ReferenceError in the FIRST line of a phase that
// takes an hour to reach, on a lane that runs one branch at a time. It does
// not show up in a grep for the old literal, which is what I checked: all
// nine read as converted.
//
// ⚠️ NOT CHECKED BY TYPES. These are .mjs scripts with no typecheck — the
// ratchet cannot see them, which is exactly why an undefined import survives
// to runtime here and nowhere else in this repository.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..', 'staging-integration')
const MODULE = 'fixtureIdentity.mjs'

/**
 * Whole-line comments only, and for the reason the symbol-reader guard
 * records: stripping everything after `//` would erase a real call sitting
 * after a string containing `https://`, trading a false positive for a false
 * negative. In a guard that is strictly worse.
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n')
}

const LITERAL = /@staging\.test/
const USES = /\bfixtureEmail\s*\(/
const IMPORTS = /import\s*\{[^}]*\bfixtureEmail\b[^}]*\}\s*from\s*['"][^'"]*fixtureIdentity\.mjs['"]/
// ⚠️ DEFINING IT COUNTS TOO, and this is checked by declaration rather than by
// filename. The module that exports `fixtureEmail` calls it in its own
// selftest, and an import there would be wrong, not missing. Keying the
// exemption on the name of the file would have made the guard blind the day
// the module moves or a second one legitimately owns a builder.
const DEFINES = /(?:export\s+)?(?:async\s+)?function\s+fixtureEmail\b|(?:const|let)\s+fixtureEmail\s*=/

export function inspect(name, src) {
  const code = stripComments(src)
  const problems = []
  if (name !== MODULE && LITERAL.test(code)) {
    problems.push(`builds a '@staging.test' address itself — call fixtureEmail() from ${MODULE} so the run tag lands in it`)
  }
  if (USES.test(code) && !IMPORTS.test(code) && !DEFINES.test(code)) {
    problems.push(`calls fixtureEmail() without importing it from ${MODULE} — a ReferenceError an hour into the lane`)
  }
  return problems
}

function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.endsWith('.selftest.mjs'))
  if (files.length === 0) {
    // An empty sweep is a broken guard, not a clean repository.
    console.error(`FAIL: no .mjs files found under ${DIR} — this guard swept nothing`)
    process.exit(1)
  }
  let bad = 0
  for (const f of files) {
    for (const p of inspect(f, readFileSync(join(DIR, f), 'utf8'))) {
      console.error(`FAIL ${f}: ${p}`)
      bad++
    }
  }
  if (bad > 0) process.exit(1)
  console.log(`fixture identity OK — ${files.length} staging scripts, all fixture users stamped via ${MODULE}`)
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const check = (what, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) { failed++; console.log(`  ✗ ${what} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
    else console.log(`  ✓ ${what}`)
  }
  const IMP = "import { fixtureEmail } from './fixtureIdentity.mjs'\n"

  check('a correctly wired phase passes',
    inspect('phase9.mjs', IMP + 'const e = fixtureEmail(label)').length, 0)

  check('a raw literal is caught',
    inspect('phase9.mjs', IMP + 'const e = `${label}@staging.test`').length, 1)

  // THE BUG THIS GUARD WAS WRITTEN FOR.
  check('fixtureEmail used without the import is caught',
    inspect('phase9.mjs', 'const e = fixtureEmail(label)').length, 1)

  check('the module that DEFINES fixtureEmail needs no import of it',
    inspect(MODULE, 'export function fixtureEmail(l) { return l }\nconst e = fixtureEmail("x")').length, 0)

  // Keyed on the declaration, not the filename — so a renamed or relocated
  // module is still exempt, and a file that merely shares the name is not.
  check('a DIFFERENTLY NAMED file that defines it is also exempt',
    inspect('otherIdentity.mjs', 'export function fixtureEmail(l) { return l }\nconst e = fixtureEmail("x")').length, 0)

  check('the module itself may own the literal',
    inspect(MODULE, "export const FIXTURE_DOMAIN = 'staging.test'\nconst x = '@staging.test'").length, 0)

  // Prose about the defect must not be the defect. Without stripComments the
  // header of this very file would fail it.
  check('a comment mentioning @staging.test does not fail',
    inspect('phase9.mjs', IMP + '// never write @staging.test by hand\nconst e = fixtureEmail(l)').length, 0)

  check('a comment mentioning fixtureEmail() does not demand an import',
    inspect('phase9.mjs', '// call fixtureEmail(label) instead\nconst x = 1').length, 0)

  // The naive strip-to-end-of-line version erases this real call.
  check('a call after a url string still counts as a call',
    inspect('phase9.mjs', 'const u = "https://x.test"; const e = fixtureEmail(l)').length, 1)

  check('an import of something else from the module is not an import of this',
    inspect('phase9.mjs', "import { FIXTURE_DOMAIN } from './fixtureIdentity.mjs'\nconst e = fixtureEmail(l)").length, 1)

  // ⚠️ EVERY CASE ABOVE TESTS THE FUNCTION. None of them tests that the
  // function is WIRED. Deleting `stripComments(src)` from inspect() leaves all
  // of them passing and the real sweep exit 0 — measured, it survived as a
  // mutant — because no phase happens to mention the literal in a comment
  // today. The first one that does gets failed for its prose, and the likely
  // comment to write is one explaining this rule. A function that is correct
  // and uncalled is this repository's dominant defect, so the CALL SITE is the
  // assertion. Read via import.meta.url rather than a module-scope constant:
  // the same assertion on #797 crashed on a temporal dead zone.
  const selfCode = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  check('stripComments is actually applied to the swept source',
    /const code = stripComments\(src\)/.test(selfCode), true)

  console.log(failed === 0 ? 'check_fixture_identity selftest OK' : `check_fixture_identity selftest FAILED (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
