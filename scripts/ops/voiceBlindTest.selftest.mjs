// Self-test for the blind voice test harness, on the six fictional voice samples.
//   node scripts/ops/voiceBlindTest.selftest.mjs
// No network, no database, no model calls. Writes only to the OS temp dir.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPanelBlindTest, fixtureRealLines, writePanelBlindTest, PANEL_KEY_FILE, buildBlindTest, fixtureBlindTests, parseMarks, scoreBlindTest, writeBlindTest, assertOutsideRepo, KEY_FILE, SHEET_FILE } from './voiceBlindTest.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))
const tests = fixtureBlindTests(fixture, { n: 3, seed: 5 })
assert.equal(tests.length, 6, 'six fictional creators')

for (const t of tests) {
  const c = fixture.creators.find((x) => x.key === t.label)
  // 2N items, N of each, numbered 1..2N.
  assert.equal(t.key.items.length, 6)
  assert.equal(t.key.items.filter((i) => i.source === 'real').length, 3)
  assert.deepEqual(t.key.items.map((i) => i.item), [1, 2, 3, 4, 5, 6])
  // The sheet is blind: no source words, no creator key, no display name.
  assert.equal(t.sheet.split('\n')[0], 'item,text,sounds_like_her (y/n)', `${t.label}: sheet has no source column`)
  for (const row of t.sheet.trim().split('\n').slice(1)) assert.ok(/,$/.test(row) && !/,(?:generated|real),?$/i.test(row), `${t.label}: row leaks the source`)
  assert.ok(!t.sheet.includes(t.label) && !t.sheet.includes(c.display_name), `${t.label}: sheet leaks the creator`)
  // Every real item on the sheet is one of her samples, verbatim.
  const rows = t.sheet.trim().split('\n').slice(1)
  for (const k of t.key.items.filter((i) => i.source === 'real')) {
    assert.ok(rows[k.item - 1].includes(c.voice.samples[k.ref].slice(0, 30).replace(/"/g, '""')), `${t.label}: item ${k.item} is her line`)
  }
}

// Deterministic for a seed; a different seed shuffles differently.
assert.deepEqual(fixtureBlindTests(fixture, { n: 3, seed: 5 }), tests)
assert.notDeepEqual(fixtureBlindTests(fixture, { n: 3, seed: 6 })[0].key.items, tests[0].key.items)

// Too few items is refused.
assert.throws(() => buildBlindTest({ generated: ['a'], real: ['b', 'c'], n: 2 }), /need 2/)

// Scoring: a perfect reader, and a reader who calls everything hers.
const key = tests[0].key
const perfect = [['item', 'text', 'm'], ...key.items.map((i) => [i.item, 'x', i.source === 'real' ? 'y' : 'n'])].map((r) => r.join(',')).join('\n')
assert.deepEqual(scoreBlindTest(key, parseMarks(perfect)), { marked: 6, of: 6, accuracy: 1, fooled: 0, fooled_rate: 0, missed: 0 })
const allHer = [['item', 'text', 'm'], ...key.items.map((i) => [i.item, '"a, b"', 'yes'])].map((r) => r.join(',')).join('\n')
assert.deepEqual(scoreBlindTest(key, parseMarks(allHer)), { marked: 6, of: 6, accuracy: 0.5, fooled: 3, fooled_rate: 1, missed: 0 })

// Output only outside the repository.
assert.throws(() => assertOutsideRepo(new URL('./', import.meta.url).pathname), /outside the repository/)
const dir = mkdtempSync(join(tmpdir(), 'voice-blind-'))
try {
  const w = writeBlindTest(join(dir, 'x'), tests[0])
  assert.ok(w.key.endsWith(KEY_FILE) && w.sheet.endsWith(SHEET_FILE))
  assert.equal(JSON.parse(readFileSync(w.key, 'utf8')).items.length, 6)
} finally { rmSync(dir, { recursive: true, force: true }) }

// Panel mode: N panel lines per creator + N of her fixture samples, one sheet.
{
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))
  const panel = [
    { creator: 'coach-ana', script: [{ line: 'Grab a chair and start slow today.' }, { line: 'Ten sit-to-stands, nice and steady.' }, { line: 'Rest, then go again with me.' }] },
    { creator: 'flowdesk', lines: ['Your inbox needs one rule today.', 'Saved replies take two minutes to set.', 'Try it on Monday morning first.'] },
    { creator: 'quiet-loom', lines: ['Too short.'] },
  ]
  const t = buildPanelBlindTest({ panel, real: fixtureRealLines(fx), n: 3, seed: 5 })
  assert.equal(t.key.items.length, 12)
  assert.deepEqual(t.key.creators, ['coach-ana', 'flowdesk'])
  assert.equal(t.key.skipped[0].creator, 'quiet-loom')
  for (const c of ['coach-ana', 'flowdesk']) for (const s of ['generated', 'real']) assert.equal(t.key.items.filter((i) => i.creator === c && i.source === s).length, 3)
  assert.ok(!/generated|real/.test(t.sheet.split('\n').slice(1).join('\n').replace(/[^,]*$/gm, '')), 'the sheet never names the source')
  assert.deepEqual(buildPanelBlindTest({ panel, real: fixtureRealLines(fx), n: 3, seed: 5 }), t, 'deterministic')
  const marks = [['item', 'creator', 'text', 'm'], ...t.key.items.map((i) => [i.item, i.creator, 'x', i.source === 'real' ? 'y' : 'n'])].map((r) => r.join(',')).join('\n')
  assert.equal(scoreBlindTest(t.key, parseMarks(marks)).accuracy, 1)
  const d2 = mkdtempSync(join(tmpdir(), 'voice-blind-panel-'))
  try { assert.ok(writePanelBlindTest(join(d2, 'p'), t).key.endsWith(PANEL_KEY_FILE)) } finally { rmSync(d2, { recursive: true, force: true }) }
  assert.throws(() => writePanelBlindTest(new URL('./', import.meta.url).pathname, t), /outside the repository/)
}

console.log('voice blind test selftest: ok')
