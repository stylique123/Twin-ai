#!/usr/bin/env node
// A COUNTER READ INTO AN OBJECT LITERAL BEFORE ITS VALUE IS COMPUTED STORES
// NOTHING.
//
// MEASURED IN PRODUCTION before this guard existed: `shot_list_resync`,
// `retention_map_resync` and `setup_label_resync` were null in 30 of 30 stored
// `beat_audit` rows. Not because no resync ran — the resync passes were wired,
// unconditional, and working — but because the `beat_audit` object literal is
// built around line 7123 and those three locals are not assigned until around
// line 8100. The literal captured their initialisers. No resync was ever
// observable.
//
// `check_counter_durability` could not see this: it asks whether a counter is
// emitted and stored, not whether the value existed yet when it was read. A
// check that cannot see the thing it exists for is the defect, not the cure.
//
// This guard reads the shipped source. For every `key: local,` entry in the
// `beat_audit` literal, it asks: is `local` ever assigned a value AFTER the
// literal closes, and never before it? If so, the stored value can only ever be
// the initialiser, and the entry is a lie.
//
// Usage: node scripts/ci/check_counter_written_before_read.mjs [--selftest]
import { readFileSync } from 'node:fs'

const EDGE = new URL('../../supabase/functions/generate-blueprint/index.ts', import.meta.url)

/** @returns {{ start: number, end: number } | null} null when the literal is
 *  absent — NOT "no violations". The caller must tell those apart. */
export function literalSpan(src, opener = 'beatAudit = {') {
  const start = src.indexOf(opener)
  if (start < 0) return null
  // Brace-match from the `{` of the opener.
  let i = start + opener.length - 1
  let depth = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { start, end: i }
    }
  }
  return null
}

/** Entries of the shape `some_key: someLocal,` — a bare identifier read, which
 *  is the only shape that can capture a stale initialiser. Calls, literals and
 *  expressions are evaluated at literal-build time on purpose and are none of
 *  this guard's business. */
export function bareIdentifierEntries(block) {
  const out = []
  for (const m of block.matchAll(/^\s*([a-z0-9_]+):\s*([A-Za-z_$][\w$]*),\s*$/gm)) {
    out.push({ key: m[1], local: m[2] })
  }
  return out
}

export function violations(src, opener = 'beatAudit = {') {
  const span = literalSpan(src, opener)
  if (!span) return null
  const before = src.slice(0, span.start)
  const after = src.slice(span.end)
  const bad = []
  for (const { key, local } of bareIdentifierEntries(src.slice(span.start, span.end))) {
    // An assignment, not a declaration-with-initialiser: `local = ` where the
    // preceding token is not `let`/`const`/`var` and it is not `==`/`=>`/`>=`.
    const assign = new RegExp(`(^|[^.\\w$])(?<!let )(?<!const )(?<!var )${local}\\s*=(?!=|>)`, 'm')
    if (assign.test(after) && !assign.test(before)) bad.push({ key, local })
  }
  return bad
}

function selftest() {
  const cases = [
    // [name, source, expected violation keys or null]
    ['catches the real defect shape', `
      let counter = null
      const o = {
        a_key: counter,
      }
      counter = { n: 1 }
    `, ['a_key']],
    ['allows a counter assigned before the literal', `
      let counter = null
      counter = { n: 1 }
      const o = {
        a_key: counter,
      }
    `, []],
    ['allows a mutation after the literal', `
      let counter = null
      const o = {
        b_key: 1,
      }
      counter = { n: 1 }
      o.a_key = counter
    `, []],
    ['ignores an equality comparison after the literal', `
      let counter = null
      const o = { a_key: counter, }
      if (counter == 1) {}
    `, []],
    ['ignores a property assignment on another object', `
      let counter = null
      const o = { a_key: counter, }
      x.counter = 2
    `, []],
    ['reports absence as null, not as clean', 'const nothing = 1', null],
  ]
  let pass = 0
  for (const [name, src, want] of cases) {
    const got = violations(src, 'o = {')
    const gotKeys = got === null ? null : got.map((v) => v.key)
    const ok = JSON.stringify(gotKeys) === JSON.stringify(want)
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} — got ${JSON.stringify(gotKeys)}`)
    if (ok) pass++
  }
  console.log(`${pass}/${cases.length}`)
  return pass === cases.length ? 0 : 1
}

if (process.argv.includes('--selftest')) process.exit(selftest())

const src = readFileSync(EDGE, 'utf8')
const bad = violations(src)
if (bad === null) {
  console.error('counter-write-order guard: the `beatAudit = {` literal was not found. That is a FAILURE, not a pass — the guard cannot see what it exists to check.')
  process.exit(1)
}
if (bad.length > 0) {
  console.error('counter-write-order guard: FAIL')
  for (const { key, local } of bad) {
    console.error(`  ${key}: ${local} — read into the beat_audit literal, but \`${local}\` is only assigned after the literal closes. The stored value can only ever be the initialiser.`)
  }
  console.error('Write the counter onto `beatAudit` at its computation site instead, the way `semantic_repetition` and `cta_fallbacks` do.')
  process.exit(1)
}
console.log('counter-write-order guard: OK')
