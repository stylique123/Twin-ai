#!/usr/bin/env node
// DO THE EDGE FUNCTIONS EVEN PARSE?
//
// ── THE RUN THIS EXISTS FOR ───────────────────────────────────────────────
//
// `generate-blueprint/index.ts` builds its instructions inside a TEMPLATE
// LITERAL. Two prompt lines were written referring to output fields the natural
// way — with the field name in backticks:
//
//     * THE VIEWER HEARS ONLY THE `line` FIELD...
//     - Leave `background` as an empty string...
//
// Every one of those backticks CLOSES the literal. The file stopped being
// valid TypeScript, which means the function could not deploy at all — a total
// outage of the product's central call, introduced by editing prose.
//
// Hiding underneath it was a second one of the same family: the tone clamp read
// `brief` from a `const` declared sixty lines further down the same block. A
// temporal dead zone, so every request would have thrown
// `ReferenceError: Cannot access 'brief' before initialization` BEFORE the
// handler's try/catch — an uncaught 500 with no refund path.
//
// ⚖️ NOTHING IN CI LOOKED AT THESE FILES. The shared package typechecks, the web
// app typechecks, 1035 tests pass, `edge-source-parity` compares inlined source
// as STRINGS — and all of it stays green while the function does not compile.
// The gap was never that the bugs were subtle. It was that no step ever asked
// the compiler.
//
// Both defects are things `tsc` reports by name (TS1005/TS1443 for the literal,
// TS2448 for the dead zone), which is the whole argument for this guard: the
// defect was decidable, and a decidable defect belongs to a check rather than to
// whoever reads the diff next.
//
// ── WHY THIS DENIES SPECIFIC CODES RATHER THAN ALLOWING THE REST ──────────
//
// ⚠️ THE FIRST VERSION OF THIS GUARD GOT THIS BACKWARDS, and CI caught it
// immediately: it failed everything except a Deno-structural allowlist, passed
// locally, and then reported thirteen `TS7006`/`TS2339` errors on the runner.
// Those are type-INFERENCE results, and they move with the compiler's settings
// and version — so the guard's verdict depended on which machine ran it.
//
// It was also claiming more than it can prove. These functions deploy through
// esbuild, which ERASES types without checking them. An implicit `any` does not
// stop a deploy; an unparseable file does. So the failing set is exactly the
// two things that genuinely cannot ship, both of which have already happened
// here:
//
//   * TS1xxx — the syntax family. A backtick in prose closing a template
//     literal lands here, and the file is not a program.
//   * TS2448 / TS2454 — a binding read above its own declaration, or before
//     assignment. Erased types do not save this: it throws at runtime.
//
// Everything else is reported as advisory and does not fail the build. That
// keeps the guard's verdict a property of the SOURCE rather than of the
// toolchain that happened to run it.
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'

const FUNCTIONS_DIR = 'supabase/functions'

// Expected structurally, because this is Deno source read by the Node
// toolchain. These are NOT defects — the identifiers and modules genuinely
// exist at deploy, in a runtime this compiler knows nothing about.
const DENO_NOISE = [
  /Cannot find name 'Deno'/,
  /Cannot find module '(jsr|npm|https?):/,
  /import path can only end with a '\.ts' extension/,
]

/**
 * Did this missing name survive TYPE ERASURE?
 *
 * ⚠️ TS2304 IS TWO DIFFERENT BUGS WEARING ONE CODE, and only one of them ships.
 *   `const x: Missing = …`      a TYPE position. esbuild deletes it. Harmless.
 *   `push(...MISSING)`          a VALUE position. It survives, and Deno raises
 *                               ReferenceError the first time the line runs.
 * Failing on both would make this guard reject every Deno file that annotates
 * with a type the Node toolchain cannot see; failing on neither is what let
 * `readMechanism` reach production and refund two paid generations.
 *
 * ⚖️ SO ASK THE TOOL THAT ACTUALLY DECIDES. esbuild is what strips types at
 * deploy: transform the file and look for the identifier in the OUTPUT. If it is
 * still there, the deployed function will evaluate it. This is not a heuristic
 * about colons and angle brackets — it is the same erasure the runtime gets.
 *
 * ⚠️ SHELLED OUT, NOT IMPORTED, AND THAT IS THIS FILE'S EXISTING CONTRACT. The
 * first version did `import { transformSync } from 'esbuild'` and passed
 * locally, where node_modules exists — and failed in CI, where this job checks
 * out the repo and installs nothing. `tsc` above is invoked through `npx` for
 * exactly that reason. A guard that needs an install is a guard that stops
 * running the moment someone adds a cheaper job.
 */
const erasedCache = new Map()
function survivesTypeErasure(line) {
  const m = /^(.+?)\(\d+,\d+\): error TS2304: Cannot find name '([^']+)'/.exec(line)
  if (!m) return true // unparseable — fail closed, a missing name is the dangerous default
  const [, file, name] = m
  try {
    if (!erasedCache.has(file)) {
      erasedCache.set(file, execFileSync('npx', ['--yes', 'esbuild', file], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }))
    }
    return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      .test(erasedCache.get(file))
  } catch {
    // esbuild unavailable or the file will not transform. Fail closed: a missing
    // VALUE is the failure that cost two paid generations, and a guard that
    // waves it through because a tool was missing is not a guard.
    return true
  }
}

/** Does this diagnostic mean the file cannot ship? Syntax, a dead-zone read, or
 *  an identifier that does not exist. */
const isFatal = (line) => {
  const m = /error TS(\d+):/.exec(line)
  if (!m) return false
  // A Deno-only name or module is not a missing identifier; it is this compiler
  // reading source written for another runtime.
  if (DENO_NOISE.some((r) => r.test(line))) return false
  const code = Number(m[1])
  // TS1000-1999 is the syntactic family: the file is not a program.
  if (code >= 1000 && code < 2000) return true
  // ⚠️ TS2304 — "Cannot find name". THIS SHIPPED, AND IT COST TWO PAID SCRIPTS.
  //
  // `readMechanism` was called twice in generate-blueprint and defined nowhere:
  // it lives in @twinai/shared, which an edge function cannot import. tsc said
  // so, on both call sites, and this guard printed it as advisory and passed —
  // on the reasoning that types are erased at deploy and failing on type errors
  // would make the verdict a property of the runner.
  //
  // ⚖️ THAT REASONING IS RIGHT FOR TYPE ERRORS AND WRONG FOR THIS ONE. TS2304 is
  // not a type error. It says the IDENTIFIER DOES NOT EXIST, and erasing types
  // does not bring one into being — the deployed function raises
  // `ReferenceError` the first time that line runs. It belongs with TS2448 and
  // TS2454, which are already fatal for exactly the same reason: a compile-time
  // diagnostic that is really a runtime crash.
  //
  // Measured cost: two generations on 2026-08-16 with a SUCCEEDED writer, no
  // generation row, and a refunded credit against a script that existed.
  if (code === 2304) return survivesTypeErasure(line)
  // Block-scoped binding used before declaration / before assignment. Types are
  // erased at deploy; these still throw at runtime.
  return code === 2448 || code === 2454
}

const entries = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => `${FUNCTIONS_DIR}/${e.name}/index.ts`)
  .filter((p) => existsSync(p))

// ⚠️ THE WORKER'S PROMPT FILES BELONG HERE TOO, and did not until a backtick in
// `worker/src/voice.ts` closed a template literal for the THIRD time on this
// branch. The guard was scoped to edge functions because that is where the first
// two happened, which is scoping a rule to its last instance rather than to the
// defect. Any file holding a long prompt in a template literal is exposed; the
// worker typechecks in CI, so this is belt-and-braces there, but it makes the
// failure message name the real cause instead of a bare TS1005.
for (const p of ['worker/src/voice.ts', 'worker/src/jobs/voice.ts']) {
  if (existsSync(p)) entries.push(p)
}

if (entries.length === 0) {
  console.error('edge-functions-parse guard: found no functions to check — the layout moved.')
  process.exit(1)
}

let out = ''
try {
  execFileSync('npx', [
    'tsc', '--noEmit', '--skipLibCheck',
    '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler',
    ...entries,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`
}

const headlines = out.split('\n').filter((l) => /error TS\d+:/.test(l) && !/^\s/.test(l))
const fatal = headlines.filter(isFatal)
const advisory = headlines
  .filter((l) => !isFatal(l))
  .filter((l) => !DENO_NOISE.some((r) => r.test(l)))

if (fatal.length > 0) {
  console.error(`edge-functions-parse guard: FAILED — ${fatal.length} error(s) that stop a deploy.\n`)
  for (const l of fatal) console.error(`  ${l}`)
  console.error('\nThe three causes that have already happened in this repo:')
  console.error('  * a backtick in prose inside a template literal closes it — write "field", not a backticked field')
  console.error('  * TS2448/TS2454: a binding read above its own declaration in the same block')
  console.error('  * TS2304: a name that does not exist here — usually a helper that lives in')
  console.error('    @twinai/shared, which an edge function CANNOT import. Inline it and add a')
  console.error('    parity test. This shipped once and refunded two paid generations.')
  process.exit(1)
}

// Reported, never fatal. These move with the compiler version and settings, and
// esbuild erases types at deploy — failing on them would make the guard's
// verdict a property of the runner rather than of the source.
if (advisory.length > 0) {
  console.log(`edge-functions-parse guard: ${advisory.length} type note(s), not deploy-blocking:`)
  for (const l of advisory.slice(0, 20)) console.log(`  ${l}`)
}

console.log(`edge-functions-parse guard: OK (${entries.length} functions parse; no dead-zone reads)`)
