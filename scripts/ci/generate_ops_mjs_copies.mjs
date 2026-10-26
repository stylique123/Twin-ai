#!/usr/bin/env node
// PLAIN .mjs COPIES OF SELF-CONTAINED SHARED MODULES, FOR scripts/ops.
//
// CI runs the ops self-tests under Node 20, which cannot import .ts. These
// copies are GENERATED from the shared source (types stripped by esbuild, no
// other change) and never edited by hand; `--check` fails on drift, and
// packages/shared/src/script/__tests__/ops-mjs-parity.test.ts checks it too.
//
//   node scripts/ci/generate_ops_mjs_copies.mjs          # write
//   node scripts/ci/generate_ops_mjs_copies.mjs --check  # fail if stale
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { transformSync } from 'esbuild'

export const COPIES = [
  ['packages/shared/src/script/realisticPanel.ts', 'scripts/lib/realisticPanel.mjs'],
  ['packages/shared/src/script/painMap.ts', 'scripts/lib/painMap.mjs'],
]

export function render(src, from) {
  if (/^\s*import\s/m.test(src)) throw new Error(`${from}: must be self-contained (no imports) to be copied`)
  const { code } = transformSync(src, { loader: 'ts', format: 'esm', target: 'node20' })
  return `// GENERATED from ${from} by scripts/ci/generate_ops_mjs_copies.mjs. Do not edit.\n${code}`
}

const check = process.argv.includes('--check')
let stale = 0
for (const [from, to] of COPIES) {
  const want = render(readFileSync(from, 'utf8'), from)
  const have = existsSync(to) ? readFileSync(to, 'utf8') : null
  if (have === want) continue
  if (check) { console.error(`stale: ${to} (run node scripts/ci/generate_ops_mjs_copies.mjs)`); stale++ }
  else { writeFileSync(to, want); console.log(`wrote ${to}`) }
}
if (stale) process.exit(1)
if (check) console.log('ops .mjs copies: fresh')
