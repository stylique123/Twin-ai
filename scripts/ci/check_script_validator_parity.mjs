// THE EDGE COPY OF `scriptValidator.ts` MUST BE THE SHARED ONE.
//
// ⚠️ THIS FILE DECIDES WHETHER A SHIPPED SCRIPT IS RECORDED AS SOUND. Nine
// checks, and two of them cannot run in the edge caller — which is exactly why
// the copy matters: if the edge drifts to a version where `not_run` silently
// became `pass`, production would report a coverage it never had, and every test
// in `packages/shared` would keep proving the honest version.
//
// ⚖️ AND THE DRIFT IS SILENT. Nothing errors. The report simply describes a
// different script from the one that shipped.
//
// ── THE ONE ALLOWED DIFFERENCE ────────────────────────────────────────────
//
// The shared file imports `CreativeDecisionPlan`, `WriterInput`,
// `mayStateAsFact` and the speech helpers. The edge bundler resolves imports
// from the function directory, so the copy inlines the first three and imports
// the fourth from `_shared/speechPolish.ts`. Everything from the marker down is
// compared character for character.
//
//   node scripts/ci/check_script_validator_parity.mjs
//   node scripts/ci/check_script_validator_parity.mjs --selftest
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const SOURCE = join(REPO, 'packages', 'shared', 'src', 'scriptValidator.ts')
const COPY = join(REPO, 'supabase', 'functions', '_shared', 'scriptValidator.ts')

const MARKER = 'export const SCRIPT_CHECKS = ['

export function comparable(text) {
  const i = text.indexOf(MARKER)
  return i < 0 ? null : text.slice(i)
}

export function check(sourceText, copyText) {
  const want = comparable(sourceText)
  if (want === null) return 'the SHARED file has lost its marker — cannot compare'
  const got = comparable(copyText)
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
  const src = `${MARKER}\n  'goal_visible',\n] as const\n`
  const good = `// DERIVED\nimport x from './y.ts'\n\n${MARKER}\n  'goal_visible',\n] as const\n`
  // ⚠️ THE EXACT DRIFT THIS GUARD EXISTS FOR: a `not_run` quietly become a pass.
  const drifted = good.replace("'goal_visible',", "'goal_visible', 'all_slots_filled',")
  let failed = 0
  for (const [name, source, copy, expectFail] of [
    ['an identical copy passes', src, good, false],
    ['a changed check list FAILS', src, drifted, true],
    ['a copy with no marker FAILS', src, 'export const X = 1\n', true],
    ['a SOURCE with no marker FAILS', 'export const X = 1\n', good, true],
  ]) {
    const got = check(source, copy) !== null
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('script-validator-parity selftest: all cases passed')
  process.exit(0)
}

const problem = check(readFileSync(SOURCE, 'utf8'), readFileSync(COPY, 'utf8'))
if (problem) {
  console.error(`script-validator parity FAILED: ${problem}`)
  console.error('Fix the SHARED file, then re-derive the edge copy — never edit the copy alone.')
  process.exit(1)
}
console.log('script-validator parity: OK')
