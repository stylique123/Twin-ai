// Selftest: the panel export's judge pre-score (Fast Path §5). Fictional lines only.
// Run: node scripts/ops/exportPanel.prescore.selftest.mjs
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { prescoreRow, qcReportRow, QC_REPORT_HEADER } from './exportPanel.mjs'

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
// QC report row (plan v6.8 §33): ids and counts only, same width as the header.
const qc = { profile: 'standard', words_before: 60, words_after: 104, floor: 90, target: 110, beats_met: 3, added: [{ kind: 'proof', id: 'k1', words: 20 }], refused: [{ id: 'k2', reason: 'second_story' }, { id: null, reason: 'second_story' }], removed_repeats: 1, thin: null, label: null, best_of_n: { chosen: 'qc' } }
const qr = qcReportRow('p13#1', qc, 'full_stack')
assert.equal(qr.length, QC_REPORT_HEADER.length)
assert.deepEqual(qr.slice(0, 3), ['p13#1', 'full_stack', 'standard'])
assert.equal(qr[8], 'proof:k1')
assert.equal(qr[9], 'second_story')
assert.equal(qcReportRow('p13#2', null, null).length, QC_REPORT_HEADER.length)
console.log('exportPanel prescore selftest ok')
