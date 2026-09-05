#!/usr/bin/env node
// TEST FILES WERE NEVER TYPECHECKED, AND THAT IS HOW ASSERTIONS GO QUIET.
//
// ⚠️ MEASURED 2026-09-05. `packages/shared/tsconfig.json` excluded
// `src/**/__tests__/**` and `src/**/*.test.ts`, so tsc had never read a test file
// in this package. Three consequences found in one day:
//
//   · a deleted export left two tests importing `undefined`, and
//     `.rejects.toThrow(undefined)` accepts ANY error — the suite reported 5,674
//     passing while two assertions had stopped asserting anything;
//   · three invented type literals in a new fixture ran green under vitest;
//   · `four-creators-diverge-once-assessed` gave three of its four creators
//     goals the enum does not contain — 'growth', 'education', 'entertainment'
//     against followers|authority|educate|leads|sell|entertain|personal_brand.
//     A test about how four creators DIVERGE was diverging fictional inputs.
//
// ⚖️ A RATCHET, NOT A BIG-BANG FIX. 384 of 412 test files typecheck cleanly
// today; 28 do not, almost all fixture shapes rather than real defects. Fixing
// all 28 in one pass means editing tests at scale, which is exactly how an
// assertion gets weakened by accident — the failure mode this whole exercise
// exists to end. So they are listed, the rest are checked from now on, and the
// list may only ever SHRINK.
//
// ⚖️ THE VALUE IS IMMEDIATE AND IT IS THE HOLE THAT ACTUALLY BIT. Every NEW test
// file is typechecked from the day it is written — and the three bad literals
// were in a new file.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONFIG = join(REPO, 'packages/shared/tsconfig.test.json')

/** ⚠️ THE CEILING IS A NUMBER IN THIS FILE, NOT IN THE CONFIG IT MEASURES. A
 *  ratchet whose limit lives in the thing being ratcheted can be raised in the
 *  same edit that breaks it, which is not a ratchet. */
const MAX_EXCLUDED = 16

const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'))
const excluded = cfg.exclude ?? []

console.log(`  ${excluded.length} test files excluded from typechecking (ceiling ${MAX_EXCLUDED})`)

if (excluded.length > MAX_EXCLUDED) {
  console.error(`\nThe exclude list GREW: ${excluded.length} > ${MAX_EXCLUDED}.`)
  console.error('A test file that does not typecheck is a test whose assertions may not mean what they read.')
  console.error('Fix the file rather than listing it — and never lower an assertion to make tsc quiet.')
  process.exit(1)
}

// ⚠️ AND THE CONFIG MUST ACTUALLY PASS. A shrinking list proves nothing if the
// files still on it are not being checked, or if a NEW error appeared in a file
// nobody listed.
try {
  execFileSync('npx', ['tsc', '-p', CONFIG, '--noEmit'], { cwd: REPO, stdio: 'pipe' })
} catch (e) {
  console.error('\nTypecheck FAILED on the non-excluded test files:\n')
  console.error(String(e.stdout ?? '') + String(e.stderr ?? ''))
  process.exit(1)
}

if (excluded.length < MAX_EXCLUDED) {
  console.log(`  ${MAX_EXCLUDED - excluded.length} fewer than the ceiling — lower MAX_EXCLUDED to ${excluded.length} to keep the ratchet tight.`)
}
console.log('test-typecheck ratchet: OK')
