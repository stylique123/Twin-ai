// Selftest: the panel export's judge pre-score (Fast Path §5). Fictional lines only.
// Run: node scripts/ops/exportPanel.prescore.selftest.mjs
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { prescoreRow } from './exportPanel.mjs'

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const out = join(mkdtempSync(join(tmpdir(), 'prescore-')), 'craftJudge.mjs')
buildSync({ entryPoints: [join(REPO, 'packages/shared/src/script/craftJudge.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { scoreCraft } = await import(out)

const clean = ['I burned my first batch of candles in a cold garage.', 'That is why every tin now cures for two weeks.', 'Grab one from the link in my bio.']
const row = prescoreRow('p12#1', clean, scoreCraft)
assert.equal(row[0], 'p12#1')
assert.ok(Number.isInteger(row[1]) && row[1] >= 1 && row[1] <= 7, 'craft is an integer 1..7')
const ph = prescoreRow('p12#2', ['[Your answer: what happened]', 'Grab one from the link in my bio.'], scoreCraft)
assert.equal(ph[1], 1, 'a spoken placeholder caps craft at 1')
assert.match(ph[3], /placeholder/)
assert.deepEqual(prescoreRow('p12#3', ['', null, 'Only line.'], scoreCraft).length, 4, 'empty and non-string lines are ignored')
console.log('exportPanel prescore selftest ok')
