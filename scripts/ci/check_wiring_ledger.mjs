#!/usr/bin/env node
// PLAN PART 0 — THE DISCONNECT GATE. Every wired feature in
// scripts/ci/wiring-ledger.json must still be imported AND called in its
// consumer, carry any required argument, and emit its event. Unplug one and
// this fails. Orphan rows are counted and may only shrink (ceiling below).
import { readFileSync } from 'node:fs'

const ORPHAN_CEILING = 3

export function checkRow(row, src) {
  const errs = []
  const esc = row.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`import[^;]*\\b${esc}\\b`).test(src)) errs.push(`${row.id}: ${row.symbol} is not imported in ${row.consumer}`)
  const calls = src.match(new RegExp(`\\b${esc}\\(`, 'g')) ?? []
  if (calls.length === 0) errs.push(`${row.id}: ${row.symbol} is never called in ${row.consumer}`)
  for (const m of row.mustContain ?? []) if (!src.includes(m)) errs.push(`${row.id}: ${row.consumer} no longer contains "${m}"`)
  if (row.event && !new RegExp(`event:\\s*'${row.event}'`).test(src)) errs.push(`${row.id}: event '${row.event}' is not emitted in ${row.consumer}`)
  return errs
}

function selftest() {
  const row = { id: 't', symbol: 'fooBar', consumer: 'x.ts', mustContain: ['on: true'], event: 'foo_fired' }
  const good = "import { fooBar } from './a.ts'\nfooBar(x, { on: true })\nconsole.log(JSON.stringify({ event: 'foo_fired' }))"
  const cases = [
    [good, 0],
    [good.replace("import { fooBar } from './a.ts'", ''), 1],
    [good.replace('fooBar(x', 'void (x'), 1],
    [good.replace('on: true', 'on: false'), 1],
    [good.replace("event: 'foo_fired'", "event: 'other'"), 1],
  ]
  for (const [src, n] of cases) {
    const got = checkRow(row, src).length
    if (got !== n) { console.error(`selftest: expected ${n} errors, got ${got}`); process.exit(1) }
  }
  console.log('wiring-ledger selftest: OK (5 cases)')
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0) }

const ledger = JSON.parse(readFileSync(new URL('./wiring-ledger.json', import.meta.url), 'utf8'))
const cache = new Map()
const read = (f) => { if (!cache.has(f)) cache.set(f, readFileSync(f, 'utf8')); return cache.get(f) }
const errs = []
let wired = 0, orphan = 0
for (const row of ledger.rows) {
  if (row.status === 'orphan') { orphan += 1; continue }
  wired += 1
  errs.push(...checkRow(row, read(row.consumer)))
}
console.log(`wiring-ledger: ${wired} wired rows checked, ${orphan} orphan rows (ceiling ${ORPHAN_CEILING})`)
if (orphan > ORPHAN_CEILING) errs.push(`orphan rows ${orphan} > ceiling ${ORPHAN_CEILING}: wire one before adding another`)
for (const e of errs) console.error(`::error::${e}`)
process.exit(errs.length ? 1 : 0)
