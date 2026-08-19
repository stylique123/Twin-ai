// THE EDGE COPY OF `containerTemplates.ts` MUST BE THE SHARED ONE.
//
// ⚠️ THE TEMPLATES DECIDE WHAT A SCRIPT IS ASKED TO CONTAIN. A round-up needs
// three DISTINCT things in a deliberate order — recognisable, surprising,
// strongest — and the re-hook sits before the last item because that is the beat
// that buys the second half. If the two copies drift, the writer is given one
// shape and every test in `packages/shared` proves a different one.
//
// ⚖️ AND DRIFT HERE IS SILENT. Nothing errors: the script is simply built to a
// stale plan, which reads perfectly well and is a different video from the one
// the reference was assessed as.
//
// ── THE ONE ALLOWED DIFFERENCE ────────────────────────────────────────────
//
// The shared file imports three string unions from `referenceContentProfile`.
// The edge bundler resolves imports from the function directory, so that import
// is exactly what makes the file undeployable — the copy inlines the unions
// instead. This check knows about that substitution and compares EVERYTHING
// ELSE character for character.
//
//   node scripts/ci/check_container_templates_parity.mjs
//   node scripts/ci/check_container_templates_parity.mjs --selftest
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const SOURCE = join(REPO, 'packages', 'shared', 'src', 'containerTemplates.ts')
const COPY = join(REPO, 'supabase', 'functions', '_shared', 'containerTemplates.ts')

const IMPORT_LINE =
  "import type { BeatRole, ContainerType, ContentSlotKind } from './referenceContentProfile'\n"

/** The copy, reduced to what must match: banner and inlined types removed. */
export function comparable(copyText) {
  const marker = '// THE SHAPE, WITH ITS HOLES NAMED.'
  const i = copyText.indexOf(marker)
  if (i < 0) return null
  return copyText.slice(i)
}

/** The source, reduced the same way: its type import is the allowed difference. */
export function comparableSource(sourceText) {
  return sourceText.replace(IMPORT_LINE, '')
}

function check(sourceText, copyText) {
  const want = comparableSource(sourceText)
  const got = comparable(copyText)
  if (got === null) return 'the edge copy has lost its marker comment — cannot compare'
  if (got !== want) {
    // Name the first differing line, so a fix does not start with a diff hunt.
    const a = want.split('\n'), b = got.split('\n')
    const n = Math.max(a.length, b.length)
    for (let k = 0; k < n; k++) {
      if (a[k] !== b[k]) {
        return `line ${k + 1} differs:\n  shared: ${a[k] ?? '(missing)'}\n  edge:   ${b[k] ?? '(missing)'}`
      }
    }
    return 'copies differ'
  }
  return null
}

if (process.argv.includes('--selftest')) {
  const src = 'import type { BeatRole, ContainerType, ContentSlotKind } from \'./referenceContentProfile\'\n'
    + '// THE SHAPE, WITH ITS HOLES NAMED.\nexport const A = 1\n'
  const good = '// GENERATED\ntype BeatRole = never\n// THE SHAPE, WITH ITS HOLES NAMED.\nexport const A = 1\n'
  const drifted = good.replace('A = 1', 'A = 2')
  let failed = 0
  for (const [name, copy, expectFail] of [
    ['an identical copy passes', good, false],
    ['a drifted copy FAILS', drifted, true],
    ['a copy with no marker FAILS', 'export const A = 1\n', true],
  ]) {
    const got = check(src, copy) !== null
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('container-templates-parity selftest: all cases passed')
  process.exit(0)
}

const problem = check(readFileSync(SOURCE, 'utf8'), readFileSync(COPY, 'utf8'))
if (problem) {
  console.error(`container-templates parity FAILED: ${problem}`)
  console.error('Fix the SHARED file, then re-derive the edge copy — never edit the copy alone.')
  process.exit(1)
}
console.log('container-templates parity: OK')
