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
// ── WHY THE ERROR ALLOWLIST IS A LIST OF CODES, NOT A LIST OF FILES ───────
//
// These are Deno modules typechecked by the Node toolchain, so three complaints
// are structural and expected: the `Deno` global, `jsr:`/`https:` specifiers,
// and `.ts` import extensions. They are ignored BY CODE, so a new file cannot
// opt itself out and a genuine error in an ignored file is still caught.
// Anything else fails the build.
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'

const FUNCTIONS_DIR = 'supabase/functions'

// Structural noise from typechecking Deno source with the Node toolchain.
// Deliberately narrow: every one of these is about MODULE RESOLUTION or the
// Deno global, and none of them can mask a syntax error or a dead-zone read.
// Matched against the WHOLE diagnostic — headline plus its indented detail
// lines — because tsc puts the identifying sentence in the detail. Matching the
// headline alone would have meant allowlisting all of TS2769, which is a real
// error code that can hide real bugs.
const IGNORED = [
  { code: 'TS2304', match: /Cannot find name 'Deno'/ },
  { code: 'TS2307', match: /Cannot find module '(jsr|npm|https?):/ },
  { code: 'TS5097', match: /import path can only end with a '\.ts' extension/ },
  // TypeScript 5.7 made `Uint8Array` generic over its buffer, so `BufferSource`
  // parameters reject a plain `Uint8Array` under Node's lib. Deno's own types
  // do not, and this code runs on Deno. Pinned to the SharedArrayBuffer
  // sentence, which only this lib mismatch produces.
  { code: 'TS2769', match: /Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'/ },
]

const entries = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => `${FUNCTIONS_DIR}/${e.name}/index.ts`)
  .filter((p) => existsSync(p))

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

// Group each diagnostic with its indented continuation lines, so the allowlist
// can match on the detail rather than on the bare code.
const diagnostics = []
for (const line of out.split('\n')) {
  if (/error TS\d+:/.test(line) && !/^\s/.test(line)) diagnostics.push([line])
  else if (diagnostics.length > 0 && /^\s+/.test(line) && line.trim() !== '') {
    diagnostics[diagnostics.length - 1].push(line)
  }
}

const real = diagnostics
  .map((lines) => lines.join('\n'))
  .filter((d) => !IGNORED.some((i) => d.includes(`error ${i.code}:`) && i.match.test(d)))

if (real.length > 0) {
  console.error(`edge-functions-parse guard: FAILED — ${real.length} error(s) the Deno allowlist does not cover.\n`)
  for (const l of real) console.error(`  ${l}`)
  console.error('\nA syntax error here means the function CANNOT DEPLOY. Two of the most')
  console.error('common causes, both of which have already happened in this file:')
  console.error('  * a backtick in prose inside a template literal — write "field", not `field`')
  console.error('  * TS2448: a const read above its own declaration in the same block')
  process.exit(1)
}

console.log(`edge-functions-parse guard: OK (${entries.length} functions compile)`)
