#!/usr/bin/env node
// EVERY READER OF THE CORPUS EXCLUDES THE HEARTBEAT.
//
// ⚠️ THE FLAG IS THE EASY HALF. `generations.is_heartbeat` is worth nothing on
// its own — a column nobody filters on is the defect class this repository
// keeps paying for. Two synthetic generations an hour is 48 rows a day against
// samples that reach 2000 rows deep, so within weeks the heartbeat's own voice
// would be a visible fraction of what Twin learns from.
//
// ⚖️ IT WOULD BE FOUND IN THE OUTPUTS, MONTHS LATER, WHICH IS THE MOST
// EXPENSIVE PLACE TO FIND IT. Nobody would be looking for a synthetic account
// in a style drift; they would be looking at the writer.
//
// The criterion is not a file list. It is: any script that SELECTS FROM
// `generations` for measurement must filter the flag. A new corpus reader
// added tomorrow fails this until it does.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['scripts/qa', 'scripts/director-eval', 'eval']
const REPO = process.cwd()

// The staging-integration harness reads `generations` to assert orchestration
// behaviour, not to learn from them. It is not a corpus reader, and there is
// nothing for the flag to protect there.
const NOT_A_CORPUS_READER = /staging-integration|\.selftest\./

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.mjs') || name.endsWith('.js')) out.push(full)
  }
  return out
}

const offenders = []
for (const root of ROOTS) {
  for (const file of walk(join(REPO, root))) {
    if (NOT_A_CORPUS_READER.test(file)) continue
    const src = readFileSync(file, 'utf8')
    if (!/\.from\(\s*['"]generations['"]\s*\)/.test(src)) continue
    if (!/\.eq\(\s*['"]is_heartbeat['"]\s*,\s*false\s*\)/.test(src)) {
      offenders.push(relative(REPO, file))
    }
  }
}

if (process.argv.includes('--selftest')) {
  // The guard must detect a reader that does NOT filter. Proven on a string,
  // because proving it by deleting the line from a real file and putting it
  // back is a test that passes when the file is already broken.
  const unfiltered = `const x = db.from('generations').select('id')`
  const filtered = `const x = db.from('generations').select('id').eq('is_heartbeat', false)`
  const reads = (s) => /\.from\(\s*['"]generations['"]\s*\)/.test(s)
  const filters = (s) => /\.eq\(\s*['"]is_heartbeat['"]\s*,\s*false\s*\)/.test(s)
  if (!(reads(unfiltered) && !filters(unfiltered))) {
    console.error('selftest FAILED: an unfiltered corpus read was not detected')
    process.exit(1)
  }
  if (!(reads(filtered) && filters(filtered))) {
    console.error('selftest FAILED: a filtered corpus read was not recognised')
    process.exit(1)
  }
  console.log('heartbeat-corpus guard selftest: OK')
}

if (offenders.length > 0) {
  console.error('heartbeat-corpus guard: FAILED — corpus reader(s) that do not exclude the heartbeat:\n')
  for (const f of offenders) console.error(`  ${f}`)
  console.error('\nAdd `.eq(\'is_heartbeat\', false)`. Two synthetic generations an hour is 48')
  console.error('rows a day; a 2000-row sample becomes measurably synthetic within weeks, and')
  console.error('it would be found in the outputs months later rather than here.')
  process.exit(1)
}
console.log('heartbeat-corpus guard: OK (every corpus reader excludes the heartbeat)')
