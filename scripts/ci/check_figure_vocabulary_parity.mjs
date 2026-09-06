#!/usr/bin/env node
// THE FIGURE VOCABULARY LIVES TWICE AND NOTHING WAS HOLDING THE COPIES TOGETHER.
//
// ⚠️ THE EDGE FUNCTION CANNOT IMPORT FROM THE WORKSPACE, so `claimEntailment`'s
// matcher is duplicated into `generate-blueprint/index.ts`. `resolver`,
// `script_validator` and `speech_polish` each have a parity guard for exactly
// this reason. This one did not — the two copies were held identical by
// convention, which is the thing that drifts.
//
// ⚠️ AND DRIFT HERE IS SILENT IN THE WORST WAY. The shared copy has NO
// production reader; only the edge copy runs. So the tests would keep passing
// against a file nobody executes while the counter in production went on
// reading zero — the same shape as the defect this guard was written alongside.
//
// ⚖️ IT COMPARES THE BLOCK, NOT THE FILE. Everything from the banner to the end
// of `spelledOutValues` must match modulo the `export` keyword, which the edge
// copy cannot carry.

import { readFileSync } from 'node:fs'

const SHARED = 'packages/shared/src/claimEntailment.ts'
const EDGE = 'supabase/functions/generate-blueprint/index.ts'
const START = '// ── A FIGURE SPELLED OUT IS STILL A FIGURE'
const END_OF = 'function spelledOutValues'

/** ⚠️ RETURNS null WHEN THE BLOCK IS ABSENT, and the caller treats that as a
 *  failure. A guard that reports "identical" because it found nothing on both
 *  sides is a guard that passes hardest when it has been deleted. */
export function extractBlock(src) {
  const a = src.indexOf(START)
  if (a === -1) return null
  const b = src.indexOf(END_OF, a)
  if (b === -1) return null
  // Close on the brace that ends spelledOutValues: the first line that is
  // exactly `}` at column zero after the declaration.
  const rest = src.slice(b)
  const m = rest.match(/\n\}\n/)
  if (!m) return null
  return src.slice(a, b + m.index + m[0].length)
}

export function normalise(block) {
  return block
    .replace(/\bexport\s+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

function main() {
  const shared = extractBlock(readFileSync(SHARED, 'utf8'))
  const edge = extractBlock(readFileSync(EDGE, 'utf8'))
  const missing = []
  if (shared === null) missing.push(SHARED)
  if (edge === null) missing.push(EDGE)
  if (missing.length > 0) {
    console.error('FAIL the spelled-out figure block is missing from:')
    for (const f of missing) console.error(`  ${f}`)
    console.error('Both copies must carry it. See the banner in ' + SHARED + '.')
    process.exit(1)
  }
  if (normalise(shared) !== normalise(edge)) {
    console.error('FAIL the figure vocabulary has drifted between:')
    console.error(`  ${SHARED}`)
    console.error(`  ${EDGE}`)
    console.error('Only the edge copy runs in production. Make them identical.')
    const a = normalise(shared).split('\n')
    const b = normalise(edge).split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i]) {
        console.error(`  first difference at block line ${i + 1}:`)
        console.error(`    shared: ${a[i] ?? '(end of block)'}`)
        console.error(`    edge  : ${b[i] ?? '(end of block)'}`)
        break
      }
    }
    process.exit(1)
  }
  console.log('ok figure vocabulary identical in both copies')
}

if (process.argv.includes('--selftest')) {
  const good = `${START} x\nconst A = 1\n${END_OF}(t) {\n  return []\n}\n`
  const checks = [
    ['finds a well-formed block', extractBlock(good) !== null],
    ['absent banner is null, not empty', extractBlock('const A = 1\n') === null],
    ['absent function is null', extractBlock(`${START}\nconst A = 1\n`) === null],
    ['export keyword is ignored', normalise('export function f') === normalise('function f')],
    ['a real difference is NOT ignored', normalise('const A = 1') !== normalise('const A = 2')],
    ['whitespace only is ignored', normalise('const  A =  1') === normalise('const A = 1')],
  ]
  let bad = 0
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
    if (!ok) bad += 1
  }
  console.log(`${checks.length - bad}/${checks.length}`)
  process.exit(bad === 0 ? 0 : 1)
}

if (!process.argv.includes('--selftest')) main()
