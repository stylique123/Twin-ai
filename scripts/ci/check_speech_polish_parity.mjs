// THE EDGE COPY OF `speechPolish.ts` MUST BE THE SHARED ONE.
//
// ⚠️ THESE THRESHOLDS ARE DERIVED, NOT PICKED. `SPOKEN_WORDS_HARD_MAX = 22` is
// half again the top of the spoken band, and it exists to catch the 25-word
// essay sentence the whole file is named after — a limit of 28 would have let
// that sentence through. If the edge copy drifts to a looser number, production
// stops measuring the defect while every test in `packages/shared` keeps
// proving it is measured.
//
// ⚖️ AND DRIFT HERE IS SILENT. Nothing errors: the speakability counter simply
// reports a healthier script than we shipped.
//
// ── NO ALLOWED DIFFERENCE ─────────────────────────────────────────────────
//
// Unlike the container-template copy, the shared module imports NOTHING, so
// there is nothing to substitute. Everything below the marker must match
// character for character.
//
//   node scripts/ci/check_speech_polish_parity.mjs
//   node scripts/ci/check_speech_polish_parity.mjs --selftest
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const SOURCE = join(REPO, 'packages', 'shared', 'src', 'speechPolish.ts')
const COPY = join(REPO, 'supabase', 'functions', '_shared', 'speechPolish.ts')

const MARKER = '// WRITTEN TO BE SAID, NOT TO BE READ.'

/** The copy, reduced to what must match: the derived-file banner removed. */
export function comparable(copyText) {
  const i = copyText.indexOf(MARKER)
  return i < 0 ? null : copyText.slice(i)
}

export function check(sourceText, copyText) {
  const want = comparable(sourceText)
  if (want === null) return 'the SHARED file has lost its marker comment — cannot compare'
  const got = comparable(copyText)
  if (got === null) return 'the edge copy has lost its marker comment — cannot compare'
  if (got === want) return null
  // Name the first differing line, so a fix does not start with a diff hunt.
  const a = want.split('\n'), b = got.split('\n')
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    if (a[k] !== b[k]) {
      return `line ${k + 1} differs:\n  shared: ${a[k] ?? '(missing)'}\n  edge:   ${b[k] ?? '(missing)'}`
    }
  }
  return 'copies differ'
}

if (process.argv.includes('--selftest')) {
  const src = `${MARKER}\nexport const SPOKEN_WORDS_HARD_MAX = 22\n`
  const good = `// DERIVED FILE\n\n${MARKER}\nexport const SPOKEN_WORDS_HARD_MAX = 22\n`
  const drifted = good.replace('= 22', '= 28')
  let failed = 0
  for (const [name, source, copy, expectFail] of [
    ['an identical copy passes', src, good, false],
    ['a loosened threshold FAILS', src, drifted, true],
    ['a copy with no marker FAILS', src, 'export const X = 1\n', true],
    ['a SOURCE with no marker FAILS', 'export const X = 1\n', good, true],
  ]) {
    const got = check(source, copy) !== null
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('speech-polish-parity selftest: all cases passed')
  process.exit(0)
}

const problem = check(readFileSync(SOURCE, 'utf8'), readFileSync(COPY, 'utf8'))
if (problem) {
  console.error(`speech-polish parity FAILED: ${problem}`)
  console.error('Fix the SHARED file, then re-derive the edge copy — never edit the copy alone.')
  process.exit(1)
}
console.log('speech-polish parity: OK')
