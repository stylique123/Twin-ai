// THE EDGE COPIES OF THE SUBSTANCE RULES MUST BE THE SHARED ONES.
//
// ⚠️ THESE RULES DECIDE WHETHER A BEAT IS GROUNDED. `generate-blueprint` used to
// carry FIVE hand-inlined copies of them, each with its own ad-hoc parity test,
// and the cost of that arrangement is measured rather than theoretical: a stale
// copy of the first-person detector saw 2 history beats where `claimStrength`
// saw 22 — the check its own comment calls "THE MOST EXPENSIVE ERROR" running at
// a tenth of its sensitivity, for months, with a passing test suite.
//
// ⚖️ SO THERE IS ONE COPY PER MODULE AND ONE GUARD OVER BOTH. Drift here is
// silent: nothing errors, the prompt is simply graded by different rules than
// the ones every test in `packages/shared` proves.
//
// ── THE ALLOWED DIFFERENCES ───────────────────────────────────────────────
//
// `claimStrength` imports nothing: byte-for-byte below its marker.
// `knowledgeResolver` imports five modules — two resolve in `_shared`, three are
// type-only and inlined above its marker. Below the marker, character for
// character.
//
//   node scripts/ci/check_resolver_parity.mjs
//   node scripts/ci/check_resolver_parity.mjs --selftest
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

const PAIRS = [
  {
    name: 'claimStrength',
    source: join(REPO, 'packages', 'shared', 'src', 'claimStrength.ts'),
    copy: join(REPO, 'supabase', 'functions', '_shared', 'claimStrength.ts'),
    marker: 'export const CLAIM_STRENGTHS = [',
  },
  {
    name: 'knowledgeResolver',
    source: join(REPO, 'packages', 'shared', 'src', 'knowledgeResolver.ts'),
    copy: join(REPO, 'supabase', 'functions', '_shared', 'knowledgeResolver.ts'),
    marker: 'export const EVIDENCE_LEVELS = [',
  },
]

export function comparable(text, marker) {
  const i = text.indexOf(marker)
  return i < 0 ? null : text.slice(i)
}

export function check(sourceText, copyText, marker) {
  const want = comparable(sourceText, marker)
  if (want === null) return 'the SHARED file has lost its marker — cannot compare'
  const got = comparable(copyText, marker)
  if (got === null) return 'the edge copy has lost its marker — cannot compare'
  if (got === want) return null
  const a = want.split('\n'), b = got.split('\n')
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    if (a[k] !== b[k]) {
      return `line ${k + 1} differs:\n  shared: ${a[k] ?? '(missing)'}\n  edge:   ${b[k] ?? '(missing)'}`
    }
  }
  return 'copies differ'
}

if (process.argv.includes('--selftest')) {
  const M = 'export const X = ['
  const src = `${M}\n  'a',\n] as const\n`
  const good = `// DERIVED\nimport y from './y.ts'\ntype Z = string\n\n${M}\n  'a',\n] as const\n`
  // ⚠️ THE DRIFT THAT ACTUALLY HAPPENED ONCE: a detector quietly narrowed.
  const drifted = good.replace("'a',", "'a', 'b',")
  let failed = 0
  for (const [name, source, copy, expectFail] of [
    ['an identical copy passes', src, good, false],
    ['a widened rule FAILS', src, drifted, true],
    ['a copy with no marker FAILS', src, 'export const Q = 1\n', true],
    ['a SOURCE with no marker FAILS', 'export const Q = 1\n', good, true],
  ]) {
    const got = check(source, copy, M) !== null
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('resolver-parity selftest: all cases passed')
  process.exit(0)
}

let bad = 0
for (const p of PAIRS) {
  const problem = check(readFileSync(p.source, 'utf8'), readFileSync(p.copy, 'utf8'), p.marker)
  if (problem) {
    console.error(`::error::${p.name} parity FAILED: ${problem}`)
    bad++
  } else {
    console.log(`  ${p.name} parity: OK`)
  }
}
if (bad) {
  console.error('Fix the SHARED file, then re-derive the edge copy — never edit the copy alone.')
  process.exit(1)
}
console.log('resolver parity: OK')
