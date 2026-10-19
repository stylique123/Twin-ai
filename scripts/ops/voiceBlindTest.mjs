// BLIND VOICE TEST (Twin plan v5.1 item L). No network, no database, no model.
//
// Mixes N generated scripts with N of her REAL lines into one blind sheet, in a
// seeded shuffle, and writes the answer key to a separate file. A reader marks
// each item "her" or "not her" on the sheet without seeing the key; `--score`
// then reads the marks back against the key.
//
//   node scripts/ops/voiceBlindTest.mjs --generated=gen.json --real=real.json --n=6 --seed=7 --out=/private/dir
//   node scripts/ops/voiceBlindTest.mjs --score --key=/private/dir/voice-blind-key.json --marks=/private/dir/marks.csv
//   node scripts/ops/voiceBlindTest.mjs --selftest-fixture --out=/private/dir   (the six fictional voice samples)
//
// ⚖️ OUTSIDE THE REPO. The repository is public, and a real sheet holds a real
// creator's lines, so --out must resolve outside it (refused otherwise). The
// sheet carries item numbers and text only: no source, no creator, no id.
// gen.json / real.json: a JSON array of strings, or of { text } / { lines: [...] }.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, isAbsolute, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SHEET_FILE = 'voice-blind-sheet.csv'
export const KEY_FILE = 'voice-blind-key.json'

export function assertOutsideRepo(out) {
  const abs = resolve(out)
  const rel = relative(REPO, abs)
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error(`--out must be outside the repository (public): ${abs}`)
  return abs
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A script or a line as one passage of text. */
export function asText(x) {
  if (typeof x === 'string') return x.trim()
  if (x && Array.isArray(x.lines)) return x.lines.map((l) => (typeof l === 'string' ? l : String(l?.line ?? ''))).join(' ').trim()
  if (x && Array.isArray(x.script)) return x.script.map((b) => String(b?.line ?? '')).join(' ').trim()
  if (x && typeof x.text === 'string') return x.text.trim()
  return ''
}

export function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * The blind sheet and its key. Takes the first N of each (both must have N),
 * shuffles with the seed, numbers the items 1..2N.
 */
export function buildBlindTest({ generated, real, n, seed = 1, label = 'creator' }) {
  const gen = (generated ?? []).map(asText).filter(Boolean)
  const her = (real ?? []).map(asText).filter(Boolean)
  const N = Number.isInteger(n) && n > 0 ? n : Math.min(gen.length, her.length)
  if (gen.length < N || her.length < N) throw new Error(`need ${N} generated and ${N} real items (have ${gen.length} and ${her.length})`)
  const items = [
    ...gen.slice(0, N).map((text, i) => ({ text, source: 'generated', ref: i })),
    ...her.slice(0, N).map((text, i) => ({ text, source: 'real', ref: i })),
  ]
  const r = rng(seed)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  const sheet = [['item', 'text', 'sounds_like_her (y/n)'], ...items.map((it, i) => [i + 1, it.text, ''])]
    .map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
  const key = { version: 'voice-blind-v1', label, n: N, seed, items: items.map((it, i) => ({ item: i + 1, source: it.source, ref: it.ref })) }
  return { sheet, key }
}

/** Parse a marked sheet (CSV: item, ..., last column y/n). */
export function parseMarks(csv) {
  const out = new Map()
  for (const line of String(csv).split(/\r?\n/).slice(1)) {
    const m = /^(\d+),.*,\s*([yYnN])[a-zA-Z]*\s*$/.exec(line)
    if (m) out.set(Number(m[1]), /^y/i.test(m[2]))
  }
  return out
}

/**
 * Score the reader's marks against the key. `fooled` = generated items marked
 * as hers; `missed` = her real lines marked as not hers. Accuracy near 0.5
 * means the reader cannot tell them apart (the goal).
 */
export function scoreBlindTest(key, marks) {
  let right = 0; let marked = 0; let fooled = 0; let missed = 0
  for (const it of key.items) {
    if (!marks.has(it.item)) continue
    marked++
    const saidHer = marks.get(it.item)
    if (saidHer === (it.source === 'real')) right++
    else if (it.source === 'generated') fooled++
    else missed++
  }
  const generated = key.items.filter((i) => i.source === 'generated' && marks.has(i.item)).length
  return { marked, of: key.items.length, accuracy: marked ? Math.round((right / marked) * 1000) / 1000 : null, fooled, fooled_rate: generated ? Math.round((fooled / generated) * 1000) / 1000 : null, missed }
}

export function writeBlindTest(outDir, { sheet, key }) {
  const abs = assertOutsideRepo(outDir)
  mkdirSync(abs, { recursive: true })
  writeFileSync(join(abs, SHEET_FILE), sheet)
  writeFileSync(join(abs, KEY_FILE), `${JSON.stringify(key, null, 1)}\n`)
  return { sheet: join(abs, SHEET_FILE), key: join(abs, KEY_FILE) }
}

/** The six fictional voice samples (scripts/ops/fixtures), with deterministic generic stand-ins as "generated". */
export function fixtureBlindTests(fixture, { n = 3, seed = 1 } = {}) {
  const STAND_IN = [
    "In today's fast-paced world, here is a quick tip that will elevate your routine.",
    'This simple change is a game-changer, and you will wonder how you lived without it.',
    "Let's dive in and unlock the secret that most people never talk about.",
    'Whether you are a beginner or a pro, this is the ultimate guide you need.',
    'Say goodbye to stress and hello to a seamless new way of doing things.',
  ]
  return fixture.creators
    .filter((c) => Array.isArray(c.voice?.samples) && c.voice.samples.length >= n)
    .slice(0, 6)
    .map((c, i) => ({ label: c.key, ...buildBlindTest({ generated: STAND_IN, real: c.voice.samples, n, seed: seed + i, label: c.key }) }))
}

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : null
}

async function main() {
  if (process.argv.includes('--score')) {
    const key = JSON.parse(readFileSync(arg('key'), 'utf8'))
    console.log(JSON.stringify(scoreBlindTest(key, parseMarks(readFileSync(arg('marks'), 'utf8')))))
    return
  }
  const out = arg('out')
  if (!out) throw new Error('usage: voiceBlindTest.mjs --generated=gen.json --real=real.json --n=6 --out=/private/dir [--seed=1]')
  if (process.argv.includes('--selftest-fixture')) {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))
    for (const t of fixtureBlindTests(fixture)) writeBlindTest(join(out, t.label), t)
    console.log('voice blind test: fictional sheets written (counts only)')
    return
  }
  const t = buildBlindTest({
    generated: JSON.parse(readFileSync(arg('generated'), 'utf8')),
    real: JSON.parse(readFileSync(arg('real'), 'utf8')),
    n: Number(arg('n') ?? 0) || undefined,
    seed: Number(arg('seed') ?? 1),
  })
  writeBlindTest(out, t)
  console.log(JSON.stringify({ event: 'voice_blind_test', items: t.key.items.length }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
